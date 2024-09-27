import { useState } from "react";
import {
  RadioGroup,
  Radio,
  Input,
  Textarea,
  Button,
  Accordion,
  AccordionItem,
  Switch,
  Slider,
} from "@nextui-org/react";

import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager from "../Shared/SolaceManager";
import { DestinationType, MessageDeliveryModeType } from "solclientjs";
import { PublishConfigs, PublishOptions } from "../Shared/interfaces";
import ConfigStore from "../Shared/components/ConfigStore";

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
  const [advancedSettings, setAdvancedSettings] = useState<
    Partial<PublishOptions>
  >({});

  const [openAdvancedSettings, setOpenAdvancedSettings] = useState(false);

  const disablePublish = !solaceConnection || !publishTo || !content;

  const configs: PublishConfigs = {
    publishTo,
    content,
    deliveryMode,
    destinationType,
    ...advancedSettings,
  };

  const onLoadConfig = (config: PublishConfigs) => {
    const {
      publishTo,
      content,
      deliveryMode,
      destinationType,
      ...advancedSettings
    } = config;
    setPublishTo(publishTo);
    setContent(content);
    if (deliveryMode !== undefined) setDeliveryMode(deliveryMode);
    if (destinationType !== undefined) setDestinationType(destinationType);
    if (Object.keys(advancedSettings).length) {
      setAdvancedSettings(advancedSettings);
      setOpenAdvancedSettings(true);
    } else {
      setAdvancedSettings({});
      setOpenAdvancedSettings(false);
    }
  };

  return (
    <div>
      <ConfigStore
        storeKey="publishConfig"
        currentConfig={configs}
        onLoadConfig={onLoadConfig}
      />
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
        <Accordion
          isCompact
          selectedKeys={openAdvancedSettings ? ["advanced-settings"] : []}
          onSelectionChange={(selectedKeys) => {
            if (Array.from(selectedKeys).length) {
              setOpenAdvancedSettings(true);
              setAdvancedSettings({
                ...advancedSettings,
                dmqEligible: advancedSettings.dmqEligible ?? false,
                priority: advancedSettings.priority ?? 0,
              });
            } else {
              setAdvancedSettings({});
              setOpenAdvancedSettings(false);
            }
          }}
        >
          <AccordionItem
            key="advanced-settings"
            aria-label="advanced settings"
            subtitle="Advanced Settings"
          >
            <div className="flex flex-col gap-4 pl-2">
              <Switch
                isSelected={advancedSettings.dmqEligible}
                onValueChange={(dmqEligible) =>
                  setAdvancedSettings((prev) => ({ ...prev, dmqEligible }))
                }
              >
                DMQ Eligible
              </Switch>
              <Slider
                size="sm"
                step={1}
                label="Message Priority"
                showSteps={true}
                maxValue={9}
                minValue={0}
                defaultValue={1}
                showTooltip={true}
                value={advancedSettings.priority}
                getValue={() => "Highest"}
                onChange={(priority) =>
                  setAdvancedSettings((prev) => ({
                    ...prev,
                    priority: Array.isArray(priority) ? priority[0] : priority,
                  }))
                }
              />
              <Input
                label="Time to Live (sec)"
                type="number"
                min={0}
                value={(advancedSettings.timeToLive || "") as unknown as string}
                onValueChange={(timeToLive) =>
                  setAdvancedSettings((prev) => ({
                    ...prev,
                    timeToLive: Number(timeToLive),
                  }))
                }
              />
              <Input
                label="Reply To Topic"
                value={advancedSettings.replyToTopic || ""}
                onValueChange={(replyToTopic) =>
                  setAdvancedSettings((prev) => ({ ...prev, replyToTopic }))
                }
              />
              <Input
                label="Correlation ID"
                value={advancedSettings.correlationId || ""}
                onValueChange={(correlationId) =>
                  setAdvancedSettings((prev) => ({ ...prev, correlationId }))
                }
              />
            </div>
          </AccordionItem>
        </Accordion>
        <Button
          color="success"
          isDisabled={disablePublish}
          onClick={() => {
            const options: PublishOptions = {
              deliveryMode,
              destinationType,
              ...advancedSettings,
            };
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
