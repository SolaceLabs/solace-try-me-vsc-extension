import { useEffect, useState } from "react";
import { RadioGroup, Radio, Input, Textarea, Button } from "@nextui-org/react";

import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager from "../Shared/SolaceManager";

enum PublishType {
  TOPIC = "topic",
  QUEUE = "queue",
}

enum DeliveryMode {
  DIRECT = "direct",
  PERSISTENT = "persistent",
}

const PublishView = () => {
  const [solaceConnection, setSolaceConnection] =
    useState<SolaceManager | null>(null);

  const [publishToType, setPublishToType] = useState<PublishType>(
    PublishType.TOPIC
  );
  const [publishTo, setPublishTo] = useState<string>("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    DeliveryMode.DIRECT
  );
  const [content, setContent] = useState<string>("");

  useEffect(() => {
    console.log("Current broker:", solaceConnection);
  }, [solaceConnection]);

  const disablePublish = !solaceConnection || !publishTo || !content;

  return (
    <div>
      <h2 className="mb-2">Publish</h2>
      <div className="flex flex-col gap-4">
        <ConnectionManager onSetConnection={setSolaceConnection} />
        <RadioGroup
          label="Select a topic or queue to publish to"
          orientation="horizontal"
          value={publishToType}
          onValueChange={(value) => setPublishToType(value as PublishType)}
        >
          <Radio className="capitalize" value={PublishType.TOPIC}>
            {PublishType.TOPIC}
          </Radio>
          <Radio className="capitalize" value={PublishType.QUEUE}>
            {PublishType.QUEUE}
          </Radio>
        </RadioGroup>
        <Input
          label={`Publish to ${publishToType}`}
          value={publishTo}
          onValueChange={setPublishTo}
        />
        <RadioGroup
          label="Delivery Mode"
          orientation="horizontal"
          value={deliveryMode}
          onValueChange={(value) => setDeliveryMode(value as DeliveryMode)}
        >
          <Radio className="capitalize" value={DeliveryMode.DIRECT}>
            {DeliveryMode.DIRECT}
          </Radio>
          <Radio className="capitalize" value={DeliveryMode.PERSISTENT}>
            {DeliveryMode.PERSISTENT}
          </Radio>
        </RadioGroup>
        <Textarea
          label="Message Content"
          value={content}
          onValueChange={setContent}
        />
        <Button
          color="success"
          isDisabled={disablePublish}
          onClick={() => {
            solaceConnection?.publish(publishTo, content);
          }}
        >
          Publish
        </Button>
      </div>
    </div>
  );
};

export default PublishView;
