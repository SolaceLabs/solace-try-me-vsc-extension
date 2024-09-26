import { useState } from "react";
import { RadioGroup, Radio, Input, Textarea, Button } from "@nextui-org/react";

import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager from "../Shared/SolaceManager";
import { DestinationType, MessageDeliveryModeType } from "solclientjs";
import { PublishOptions } from "../Shared/interfaces";


const PublishView = () => {
  const [solaceConnection, setSolaceConnection] =
    useState<SolaceManager | null>(null);

  const [destinationType, setDestinationType] = useState<DestinationType>(
    DestinationType.TOPIC
  );
  const [publishTo, setPublishTo] = useState<string>("");
  const [deliveryMode, setDeliveryMode] = useState<MessageDeliveryModeType>(
    MessageDeliveryModeType.DIRECT
  );
  const [content, setContent] = useState<string>("");

  const disablePublish = !solaceConnection || !publishTo || !content;

  return (
    <div>
      <h2 className="mb-2">Publish</h2>
      <div className="flex flex-col gap-4">
        <ConnectionManager onSetConnection={setSolaceConnection} />
        <RadioGroup
          label="Select a topic or queue to publish to"
          orientation="horizontal"
          value={destinationType}
          onValueChange={(value) =>
            setDestinationType(value as DestinationType)
          }
        >
          <Radio className="capitalize" value={DestinationType.TOPIC}>
            Topic
          </Radio>
          <Radio className="capitalize" value={DestinationType.QUEUE}>
            Queue
          </Radio>
        </RadioGroup>
        <Input
          label={`Publish to ${destinationType}`}
          value={publishTo}
          onValueChange={setPublishTo}
        />
        <RadioGroup
          label="Delivery Mode"
          orientation="horizontal"
          value={deliveryMode.toString()}
          onValueChange={(value) =>
            setDeliveryMode(Number(value) as MessageDeliveryModeType)
          }
        >
          <Radio
            className="capitalize"
            value={MessageDeliveryModeType.DIRECT.toString()}
          >
            Direct
          </Radio>
          <Radio
            className="capitalize"
            value={MessageDeliveryModeType.PERSISTENT.toString()}
          >
            Persistent
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
            const options: PublishOptions = { deliveryMode, destinationType };
            solaceConnection?.publish(publishTo, content, options);
          }}
        >
          Publish
        </Button>
      </div>
    </div>
  );
};

export default PublishView;
