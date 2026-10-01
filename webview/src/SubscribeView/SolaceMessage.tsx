import { memo, useReducer } from "react";
import { Card, CardHeader, CardBody, Checkbox, Chip, Divider, Tooltip, Button } from "@nextui-org/react";
import solace, { MessageDeliveryModeType } from "solclientjs";
import { BellPlus, ClipboardCopy, Copy, ExternalLink, EyeOff, Forward, ListFilter, Repeat, Trash2 } from "lucide-react";

import { Message } from "../Shared/interfaces";
import {
  convertTypeToString,
  copyToClipboard,
  formatDate,
  formatPropertyValue,
  openFileInNewTab,
} from "../Shared/utils";
import { toExportable } from "../Shared/messageCodec";
import { Highlight, splitHighlights } from "./messageFilter";
import {
  bytesUnavailableReason,
  defaultPayloadView,
  hexDump,
  isBinaryPayload,
  PAYLOAD_VIEWS,
  PayloadView,
  payloadBase64,
  payloadBytes,
  prettyJson,
  rawUnavailableReason,
} from "./payloadView";

export interface MessageActions {
  onCopyToPublish?: (message: Message) => void;
  onResend?: (message: Message) => void;
  onRemoveFromQueue?: (message: Message) => void;
  canRemoveFromQueue?: (message: Message) => boolean;
  /** Show only messages with this exact topic. */
  onFilterTopic?: (topic: string) => void;
  /** Add the exact topic to the Ignore Topics list. */
  onIgnoreTopic?: (topic: string) => void;
  /** Add the topic to the subscriptions. */
  onSubscribeTopic?: (topic: string) => void;
}

interface SolaceMessageProps {
  message: Message;
  compactMode: boolean;
  maxPayloadLength: number;
  maxPropertyLength: number;
  highlight?: Highlight | null;
  actions?: MessageActions;
  /** Selection mode: shows a checkbox on the card. */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (message: Message, selected: boolean) => void;
}

const keyNameMap: { [k: string]: string } = {
  messageType: "Message Type",
  ttl: "Time to Live",
  isDMQEligible: "DMQ Eligible",
  correlationId: "Correlation ID",
  applicationMessageId: "Application Message ID",
  applicationMessageType: "Application Message Type",
  httpContentType: "HTTP Content Type",
  httpContentEncoding: "HTTP Content Encoding",
  senderId: "Sender ID",
  replyTo: "Reply To",
  senderTimestamp: "Sender Timestamp",
  receiverTimestamp: "Receiver Timestamp",
  deliveryMode: "Delivery Mode",
  sequenceNumber: "Sequence Number",
  deliveryCount: "Delivery Count",
  rgmid: "Replication Group Message ID",
  redelivered: "Redelivered",
  priority: "Priority",
};

const MESSAGE_TYPE_NAMES: Record<number, string> = {
  [solace.MessageType.BINARY]: "Binary (BytesMessage)",
  [solace.MessageType.TEXT]: "Text (TextMessage)",
  [solace.MessageType.MAP]: "Map",
  [solace.MessageType.STREAM]: "Stream",
};

const replyToLabel = (message: Message) => {
  const type = message.metadata.replyToType;
  const label =
    type === solace.DestinationType.QUEUE
      ? "Queue"
      : type === solace.DestinationType.TEMPORARY_QUEUE
      ? "Temporary Queue"
      : "Topic";
  return `[${label} ${message.metadata.replyTo}]`;
};

const valueTransformMap: { [k: string]: (value: unknown, message: Message) => string } = {
  messageType: (value) => MESSAGE_TYPE_NAMES[value as number] ?? String(value),
  isDMQEligible: (value) => (value ? "Yes" : "No"),
  redelivered: (value) => (value ? "Yes" : "No"),
  ttl: (value) => `${Number(value) / 1000} sec`,
  replyTo: (_value, message) => replyToLabel(message),
  receiverTimestamp: (value) => formatDate(value as number),
  senderTimestamp: (value) => formatDate(value as number),
  deliveryMode: (value) =>
    value === MessageDeliveryModeType.PERSISTENT
      ? "Persistent"
      : value === MessageDeliveryModeType.NON_PERSISTENT
      ? "Non-Persistent"
      : "Direct",
};

// Shown elsewhere on the card, or only meaningful when set.
const HIDDEN_METADATA = new Set(["replyToType", "isDiscardIndication"]);

// The payload view chosen on each card. Kept outside the component so it survives the
// virtualized list unmounting cards that scroll out of view.
const payloadViews = new WeakMap<Message, PayloadView>();

const getHighlightedContent = (content: string, pattern: RegExp | null): JSX.Element | string => {
  if (!pattern) return content;
  // Rendered as text nodes: matches keep their original casing and are never parsed as HTML.
  const parts = splitHighlights(content, pattern);
  if (!parts) return content;
  return <>{parts.map((part, index) => (part.match ? <mark key={index}>{part.text}</mark> : part.text))}</>;
};

const TruncatedMarker = ({ text }: { text: string }) => (
  <Tooltip content={text}>
    <span className="text-default">...</span>
  </Tooltip>
);

const truncatedText = (maxLength: number, unit = "characters") =>
  `Content truncated to ${maxLength} ${unit}. Open the message in VS Code to view the full content.`;

const getContent = (content: string, maxLength: number, pattern: RegExp | null) => {
  return content.length > maxLength ? (
    <>
      {getHighlightedContent(content.slice(0, maxLength), pattern)}
      <TruncatedMarker text={truncatedText(maxLength)} />
    </>
  ) : (
    getHighlightedContent(content, pattern)
  );
};

const ActionButton = ({
  label,
  onPress,
  children,
  compact,
  color,
}: {
  label: string;
  onPress: () => void;
  children: JSX.Element;
  compact: boolean;
  color?: "danger";
}) => (
  <Tooltip content={label}>
    <Button
      radius="sm"
      size="sm"
      isIconOnly
      variant={color ? "flat" : "light"}
      color={color}
      aria-label={label}
      className={compact ? "min-w-8" : ""}
      onPress={onPress}
    >
      {children}
    </Button>
  </Tooltip>
);

const TopicButton = ({ label, onPress, children }: { label: string; onPress: () => void; children: JSX.Element }) => (
  <Tooltip content={label}>
    <Button radius="sm" size="sm" isIconOnly variant="light" aria-label={label} className="h-6 w-6 min-w-6" onPress={onPress}>
      {children}
    </Button>
  </Tooltip>
);

const PayloadBody = ({
  message,
  view,
  maxLength,
  pattern,
}: {
  message: Message;
  view: PayloadView;
  maxLength: number;
  pattern: RegExp | null;
}) => {
  const className = "text-sm text-default-500 whitespace-pre-wrap break-all";
  if (view === "hex") {
    const { bytes, truncated } = payloadBytes(message, maxLength);
    return (
      <pre className="text-sm text-default-500 whitespace-pre overflow-x-auto font-mono">
        {bytes.length ? hexDump(bytes) : "(empty)"}
        {truncated && <TruncatedMarker text={truncatedText(maxLength, "bytes")} />}
      </pre>
    );
  }
  if (view === "base64") {
    const { text, truncated } = payloadBase64(message, maxLength);
    return (
      <pre className={className}>
        {/* Matches are searched in the payload text, which is base64 only for binary payloads. */}
        {getHighlightedContent(text, isBinaryPayload(message) ? pattern : null)}
        {truncated && <TruncatedMarker text={truncatedText(maxLength)} />}
      </pre>
    );
  }
  const pretty = view === "pretty" ? prettyJson(message) : null;
  const content = pretty && "text" in pretty ? pretty.text : message.payload;
  return <pre className={className}>{getContent(content, maxLength, pattern)}</pre>;
};

const SolaceMessage = ({
  message,
  maxPayloadLength,
  maxPropertyLength,
  highlight,
  compactMode,
  actions,
  selectable,
  selected,
  onSelectedChange,
}: SolaceMessageProps) => {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const dateStr = formatDate(
    message.metadata.senderTimestamp ?? message.metadata.receiverTimestamp,
    compactMode
  );
  const isBinary = isBinaryPayload(message);
  const isQueueDestination = message.destinationType === solace.DestinationType.QUEUE;
  const destinationLabel = isQueueDestination ? "queue" : "topic";
  const sourceLabel =
    message.source === "queue"
      ? "Queue"
      : message.source === "browse"
      ? "Browsed"
      : message.source === "reply"
      ? "Reply"
      : null;

  let subheader: string | JSX.Element = dateStr;
  if (compactMode) {
    const userPropCount = Object.keys(message.userProperties).length;
    subheader = (
      <>
        {subheader}
        <span className="text-foreground"> | </span>
        Payload size: {message.payload.length}
        {isBinary ? " (base64)" : ""}
        <span className="text-foreground"> | </span>
        {userPropCount} User Props
      </>
    );
  }

  const openInEditor = () => {
    const exportable = toExportable(message);
    openFileInNewTab(JSON.stringify(exportable, null, 2), { id: message._extension_uid, language: "json" });
  };

  const cardHeader = (
    <CardHeader className="flex gap-3 overflow-x-auto p-2 items-start">
      {selectable && (
        <Checkbox
          className="mt-0.5"
          isSelected={!!selected}
          onValueChange={(value) => onSelectedChange?.(message, value)}
          aria-label={`Select message on ${destinationLabel} ${message.topic}`}
        />
      )}
      <Tooltip content="Open message in VS Code">
        <Button radius="sm" size="sm" className={compactMode ? "min-w-10" : ""} aria-label="Open message in VS Code" onPress={openInEditor}>
          <ExternalLink size={16} />
        </Button>
      </Tooltip>
      <div className="flex flex-col flex-grow min-w-0">
        <p className="text-md text-nowrap">
          {isQueueDestination ? "Queue" : "Topic"}:{" "}
          <span className="text-small text-default-500">
            {getHighlightedContent(message.topic, highlight?.topic ? highlight.pattern : null)}
          </span>
        </p>
        <p className="text-small text-default-500">{subheader}</p>
        <div className="flex gap-1 flex-wrap items-center">
          {sourceLabel && (
            <Chip size="sm" variant="flat">
              {sourceLabel}
            </Chip>
          )}
          {message.metadata.isDiscardIndication && (
            <Tooltip content="The broker discarded one or more messages before this one (slow consumer).">
              <Chip size="sm" color="danger" variant="flat">
                Messages discarded before this one
              </Chip>
            </Tooltip>
          )}
          {message.metadata.redelivered && (
            <Chip size="sm" color="warning" variant="flat">
              Redelivered
            </Chip>
          )}
          <div className="flex gap-0.5" role="group" aria-label={`${destinationLabel} actions`}>
            {actions?.onFilterTopic && (
              <TopicButton label={`Filter to this ${destinationLabel}`} onPress={() => actions.onFilterTopic!(message.topic)}>
                <ListFilter size={14} />
              </TopicButton>
            )}
            {actions?.onIgnoreTopic && !isQueueDestination && (
              <TopicButton label="Ignore this topic" onPress={() => actions.onIgnoreTopic!(message.topic)}>
                <EyeOff size={14} />
              </TopicButton>
            )}
            {actions?.onSubscribeTopic && !isQueueDestination && (
              <TopicButton label="Subscribe to this topic" onPress={() => actions.onSubscribeTopic!(message.topic)}>
                <BellPlus size={14} />
              </TopicButton>
            )}
            <TopicButton
              label={isQueueDestination ? "Copy queue name" : "Copy topic"}
              onPress={() => copyToClipboard(message.topic).catch(() => undefined)}
            >
              <ClipboardCopy size={14} />
            </TopicButton>
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        {actions?.onCopyToPublish && (
          <ActionButton label="Copy to Publish" compact={compactMode} onPress={() => actions.onCopyToPublish!(message)}>
            <Forward size={16} />
          </ActionButton>
        )}
        {actions?.onResend && (
          <ActionButton label="Resend as-is" compact={compactMode} onPress={() => actions.onResend!(message)}>
            <Repeat size={16} />
          </ActionButton>
        )}
        {!compactMode && (
          <ActionButton label="Copy payload" compact={compactMode} onPress={() => copyToClipboard(message.payload)}>
            <Copy size={16} />
          </ActionButton>
        )}
        {actions?.onRemoveFromQueue && actions.canRemoveFromQueue?.(message) && (
          <ActionButton
            label="Delete this message from the queue"
            compact={compactMode}
            color="danger"
            onPress={() => actions.onRemoveFromQueue!(message)}
          >
            <Trash2 size={16} />
          </ActionButton>
        )}
      </div>
    </CardHeader>
  );

  // Outlines do not change the card size, so the virtualized list keeps its measurements.
  const selectedClass = selectable && selected ? " outline outline-2 outline-primary -outline-offset-2" : "";

  if (compactMode) {
    return <Card className={`mb-2 mr-2${selectedClass}`}>{cardHeader}</Card>;
  }

  const prettyResult = prettyJson(message);
  const unavailable: Record<PayloadView, string | null> = {
    raw: rawUnavailableReason(message),
    pretty: "reason" in prettyResult ? prettyResult.reason : null,
    hex: bytesUnavailableReason(message),
    base64: bytesUnavailableReason(message),
  };
  const remembered = payloadViews.get(message);
  const view = remembered && !unavailable[remembered] ? remembered : defaultPayloadView(message);
  const setView = (next: PayloadView) => {
    payloadViews.set(message, next);
    rerender();
  };

  const metadata = Object.entries(message.metadata)
    .filter(([key, value]) => value !== null && value !== undefined && !HIDDEN_METADATA.has(key))
    .filter(([key, value]) => key !== "redelivered" || value === true)
    .map(([key, value]) => [
      keyNameMap[key] ?? key,
      valueTransformMap[key]?.(value, message) ?? formatPropertyValue(value),
    ]);

  const userProperties = Object.entries(message.userProperties);
  const propertyPattern = highlight?.userProperties ? highlight.pattern : null;

  return (
    <Card className={`mb-3 mr-2${selectedClass}`}>
      {cardHeader}
      <Divider />
      <CardBody>
        <div className="flex gap-1 flex-col text-sm">
          {metadata.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <p className="text-sm">{key}</p>
              <p className="text-sm text-default-500 break-all">{getContent(value, maxPropertyLength, null)}</p>
            </div>
          ))}
        </div>
      </CardBody>
      {!!userProperties.length && (
        <>
          <Divider />
          <CardBody>
            <p className="text-md pb-2">User Properties:</p>
            {userProperties.map(([key, value]) => (
              <div key={key} className="flex gap-2 flex-wrap">
                <p className="text-sm">
                  {getHighlightedContent(key, propertyPattern)} ({convertTypeToString(value.type)}):
                </p>
                <p className="text-sm text-default-500 break-all">
                  {getContent(formatPropertyValue(value.value), maxPropertyLength, propertyPattern)}
                </p>
              </div>
            ))}
          </CardBody>
        </>
      )}
      <Divider />
      <CardBody>
        <div className="flex gap-2 pb-2 items-center justify-between flex-wrap">
          <p className="text-md">Payload{isBinary ? " (binary)" : ""}:</p>
          <div className="flex gap-1 flex-wrap" role="group" aria-label="Payload view">
            {PAYLOAD_VIEWS.map(({ key, label }) => {
              const reason = unavailable[key];
              const button = (
                <Button
                  key={key}
                  size="sm"
                  radius="sm"
                  variant={view === key ? "solid" : "light"}
                  color={view === key ? "primary" : "default"}
                  className="h-6 min-w-0 px-2"
                  aria-pressed={view === key}
                  aria-label={reason ? `${label} (unavailable: ${reason})` : `Show payload as ${label}`}
                  isDisabled={!!reason}
                  onPress={() => setView(key)}
                >
                  {label}
                </Button>
              );
              // Disabled buttons get no pointer events, so the tooltip goes on a wrapper.
              return reason ? (
                <Tooltip key={key} content={<p className="max-w-xs">{reason}</p>}>
                  <span className="inline-flex">{button}</span>
                </Tooltip>
              ) : (
                button
              );
            })}
          </div>
        </div>
        <PayloadBody
          message={message}
          view={view}
          maxLength={maxPayloadLength}
          pattern={highlight?.payload && view !== "hex" ? highlight.pattern : null}
        />
      </CardBody>
    </Card>
  );
};

export default memo(SolaceMessage);
