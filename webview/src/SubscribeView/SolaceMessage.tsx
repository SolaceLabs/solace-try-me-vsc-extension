import {
  Card,
  CardHeader,
  CardBody,
  Divider,
  Tooltip,
  Button,
} from "@nextui-org/react";

import { Message } from "../Shared/interfaces";
import {
  convertTypeToString,
  formatDate,
  openFileInNewTab,
} from "../Shared/utils";
import { ExternalLink } from "lucide-react";
import { MessageDeliveryModeType } from "solclientjs";

interface SolaceMessageProps {
  message: Message;
  compactMode: boolean;
  maxPayloadLength: number;
  maxPropertyLength: number;
  baseFilePath?: string;
  highlight: string;
}

const keyNameMap: { [k: string]: string } = {
  ttl: "Time to Live",
  isDMQEligible: "DMQ Eligible",
  correlationId: "Correlation ID",
  senderId: "Sender ID",
  replyTo: "Reply To",
  senderTimestamp: "Sender Timestamp",
  receiverTimestamp: "Receiver Timestamp",
  deliveryMode: "Delivery Mode",
};

const valueTransformMap: { [k: string]: (value: unknown) => string } = {
  isDMQEligible: (value: unknown) => (value ? "Yes" : "No"),
  ttl: (value: unknown) => `${Number(value) / 1000} sec`,
  replyTo: (value: unknown) => `[Topic ${value}]`,
  receiverTimestamp: (value: unknown) => formatDate(value as number),
  senderTimestamp: (value: unknown) => formatDate(value as number),
  deliveryMode: (value: unknown) =>
    value === MessageDeliveryModeType.PERSISTENT
      ? "Persistent"
      : value === MessageDeliveryModeType.NON_PERSISTENT
      ? "Non-Persistent"
      : "Direct",
};

const getKey = (key: string): string => {
  return keyNameMap[key] ?? key;
};

const transformMetaItem = ([key, value]: [string, unknown]) => {
  const newKey = getKey(key);
  const newValue = valueTransformMap[key]?.(value) ?? value?.toString() ?? "";
  return [newKey, newValue];
};

const getHighlightedContent = (
  content: string,
  highlight: string | null
): JSX.Element | string => {
  if (!highlight) return content;
  // Check if content has highlight (case insensitive)
  // split and add <mark> tag if so
  const parts = content.split(new RegExp(highlight, "i"));
  if (parts.length === 1) return content;
  return parts.reduce<JSX.Element | string>((acc, part, index) => {
    if (index === 0) return part;
    return (
      <>
        {acc}
        <mark>{highlight}</mark>
        {part}
      </>
    );
  }, "");
};

const getContent = (
  content: string,
  maxLength: number,
  highlight: string | null
) => {
  return content.length > maxLength ? (
    <>
      {getHighlightedContent(content.slice(0, maxLength), highlight)}
      <Tooltip
        content={`Content truncated to ${maxLength} character. Open message in VSC to view full content.`}
      >
        <span className="text-default">...</span>
      </Tooltip>
    </>
  ) : (
    getHighlightedContent(content, highlight)
  );
};

const SolaceMessage = ({
  message,
  maxPayloadLength,
  maxPropertyLength,
  baseFilePath,
  highlight,
  compactMode,
}: SolaceMessageProps) => {
  const dataStr = formatDate(
    message.metadata.senderTimestamp ?? message.metadata.receiverTimestamp,
    compactMode
  );

  const payload = getContent(message.payload, maxPayloadLength, highlight);

  let subheader: string | JSX.Element = dataStr;

  if (compactMode) {
    const userPropCount = Object.keys(message.userProperties).length;
    const payloadLength = message.payload.length;
    subheader = (
      <>
        {subheader}
        <span className="text-foreground"> | </span>
        Payload size: {payloadLength}
        <span className="text-foreground"> | </span>
        {userPropCount} User Props
      </>
    );
  }

  const cardHeader = (
    <CardHeader className="flex gap-3 overflow-x-auto p-2">
      <Tooltip content="Open message in VSC">
        <Button
          radius="sm"
          size="sm"
          className={compactMode ? "min-w-10" : ""}
          onClick={() => {
            let parsedPayload = message.payload;
            try {
              parsedPayload = JSON.parse(message.payload);
            } catch {
              // Payload not JSON - Do nothing
            }
            openFileInNewTab(
              JSON.stringify(
                {
                  ...message,
                  payload: parsedPayload,
                },
                null,
                2
              ),
              baseFilePath,
              message._extension_uid
            );
          }}
        >
          <ExternalLink size={16} />
        </Button>
      </Tooltip>
      <div className="flex flex-col">
        <p className="text-md text-nowrap">
          Topic:{" "}
          <span className="text-small text-default-500">
            {getHighlightedContent(message.topic, highlight)}
          </span>
        </p>
        <p className="text-small text-default-500">{subheader}</p>
      </div>
    </CardHeader>
  );

  if (compactMode) {
    return <Card className="mb-2 mr-2">{cardHeader}</Card>;
  }

  const metadata = Object.entries(message.metadata)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(transformMetaItem);

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
              <p className="text-sm text-default-500">
                {getContent(value, maxPropertyLength, null)}
              </p>
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
                  {getHighlightedContent(key, highlight)} (
                  {convertTypeToString((value as { type: number }).type)}
                  ):
                </p>
                <p className="text-sm text-default-500">
                  {getContent(
                    String((value as { value: string }).value),
                    maxPropertyLength,
                    highlight
                  )}
                </p>
              </div>
            ))}
          </CardBody>
        </>
      )}
      <Divider />
      <CardBody>
        <p className="text-md pb-2">Payload:</p>
        <pre className="text-sm text-default-500">{payload}</pre>
      </CardBody>
    </Card>
  );
};

export default SolaceMessage;
