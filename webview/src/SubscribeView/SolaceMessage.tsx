import { memo } from "react";
import { Card, CardHeader, CardBody, Chip, Divider, Tooltip, Button } from "@nextui-org/react";
import solace, { MessageDeliveryModeType } from "solclientjs";
import { Copy, ExternalLink, Forward, Repeat, Trash2 } from "lucide-react";

import { Message } from "../Shared/interfaces";
import {
  convertTypeToString,
  copyToClipboard,
  escapeRegExp,
  formatDate,
  formatPropertyValue,
  openFileInNewTab,
} from "../Shared/utils";
import { toExportable } from "../Shared/messageCodec";

export interface MessageActions {
  onCopyToPublish?: (message: Message) => void;
  onResend?: (message: Message) => void;
  onRemoveFromQueue?: (message: Message) => void;
  canRemoveFromQueue?: (message: Message) => boolean;
}

interface SolaceMessageProps {
  message: Message;
  compactMode: boolean;
  maxPayloadLength: number;
  maxPropertyLength: number;
  highlight: string;
  actions?: MessageActions;
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

const getHighlightedContent = (content: string, highlight: string | null): JSX.Element | string => {
  if (!highlight) return content;
  // Escaped and wrapped in a group: matches are kept with their original casing.
  const parts = content.split(new RegExp(`(${escapeRegExp(highlight)})`, "i"));
  if (parts.length === 1) return content;
  return (
    <>
      {parts.map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part))}
    </>
  );
};

const getContent = (content: string, maxLength: number, highlight: string | null) => {
  return content.length > maxLength ? (
    <>
      {getHighlightedContent(content.slice(0, maxLength), highlight)}
      <Tooltip content={`Content truncated to ${maxLength} characters. Open the message in VS Code to view the full content.`}>
        <span className="text-default">...</span>
      </Tooltip>
    </>
  ) : (
    getHighlightedContent(content, highlight)
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

const SolaceMessage = ({
  message,
  maxPayloadLength,
  maxPropertyLength,
  highlight,
  compactMode,
  actions,
}: SolaceMessageProps) => {
  const dateStr = formatDate(
    message.metadata.senderTimestamp ?? message.metadata.receiverTimestamp,
    compactMode
  );
  const isBinary = message.payloadEncoding === "base64";
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
      <Tooltip content="Open message in VS Code">
        <Button radius="sm" size="sm" className={compactMode ? "min-w-10" : ""} aria-label="Open message in VS Code" onPress={openInEditor}>
          <ExternalLink size={16} />
        </Button>
      </Tooltip>
      <div className="flex flex-col flex-grow min-w-0">
        <p className="text-md text-nowrap">
          {message.destinationType === solace.DestinationType.QUEUE ? "Queue" : "Topic"}:{" "}
          <span className="text-small text-default-500">{getHighlightedContent(message.topic, highlight)}</span>
        </p>
        <p className="text-small text-default-500">{subheader}</p>
        <div className="flex gap-1 flex-wrap">
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

  if (compactMode) {
    return <Card className="mb-2 mr-2">{cardHeader}</Card>;
  }

  const metadata = Object.entries(message.metadata)
    .filter(([key, value]) => value !== null && value !== undefined && !HIDDEN_METADATA.has(key))
    .filter(([key, value]) => key !== "redelivered" || value === true)
    .map(([key, value]) => [
      keyNameMap[key] ?? key,
      valueTransformMap[key]?.(value, message) ?? formatPropertyValue(value),
    ]);

  const userProperties = Object.entries(message.userProperties);

  return (
    <Card className="mb-3 mr-2">
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
                  {getHighlightedContent(key, highlight)} ({convertTypeToString(value.type)}):
                </p>
                <p className="text-sm text-default-500 break-all">
                  {getContent(formatPropertyValue(value.value), maxPropertyLength, highlight)}
                </p>
              </div>
            ))}
          </CardBody>
        </>
      )}
      <Divider />
      <CardBody>
        <p className="text-md pb-2">Payload{isBinary ? " (binary, shown as base64)" : ""}:</p>
        <pre className="text-sm text-default-500 whitespace-pre-wrap break-all">
          {getContent(message.payload, maxPayloadLength, highlight)}
        </pre>
      </CardBody>
    </Card>
  );
};

export default memo(SolaceMessage);
