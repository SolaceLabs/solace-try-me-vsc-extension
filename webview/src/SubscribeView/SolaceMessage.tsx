import {
  Card,
  CardHeader,
  CardBody,
  Divider,
  Tooltip,
  Button,
} from "@nextui-org/react";

import { Message } from "../Shared/interfaces";
import { formatDate, openFileInNewTab } from "../Shared/utils";
import { ExternalLink } from "lucide-react";
import { MessageDeliveryModeType } from "solclientjs";
import { MAC_PAYLOAD_LENGTH } from "../Shared/constants";

interface SolaceMessageProps {
  message: Message;
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

const getPayload = (payload: string) => {
  return payload.length > MAC_PAYLOAD_LENGTH
    ? `${payload.slice(0, MAC_PAYLOAD_LENGTH)}...`
    : payload;
};

const SolaceMessage = ({ message }: SolaceMessageProps) => {
  const dataStr = formatDate(
    message.metadata.senderTimestamp ?? message.metadata.receiverTimestamp
  );

  const metadata = Object.entries(message.metadata)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(transformMetaItem);

  const userProperties = Object.entries(message.userProperties)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [key, value?.toString() ?? ""]);

  const payload = getPayload(message.payload);

  return (
    <Card className="max-w-[400px] mb-3">
      <CardHeader className="flex gap-3 overflow-x-auto">
        <Tooltip content="Open message in VSC">
          <Button
            size="sm"
            onClick={() => openFileInNewTab(JSON.stringify(message, null, 2))}
          >
            <ExternalLink size={16} />
          </Button>
        </Tooltip>
        <div className="flex flex-col">
          <p className="text-md text-nowrap">
            Topic:{" "}
            <span className="text-small text-default-500">{message.topic}</span>{" "}
          </p>
          <p className="text-small text-default-500">{dataStr}</p>
        </div>
      </CardHeader>
      <Divider />
      <CardBody>
        <div className="flex gap-1 flex-col text-sm">
          {metadata.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <p className="text-sm capitalize">{key}:</p>
              <p className="text-sm text-default-500">{value}</p>
            </div>
          ))}
        </div>
      </CardBody>
      {!!userProperties.length && (
        <>
          <Divider />
          <CardBody>
            {userProperties.map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <p className="text-sm capitalize">{key}:</p>
                <p className="text-sm text-default-500">{value}</p>
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
