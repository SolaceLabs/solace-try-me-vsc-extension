import { useState } from "react";
import {
  RadioGroup,
  Radio,
  Input,
  Textarea,
  Button,
  Switch,
  Slider,
} from "@nextui-org/react";

import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager from "../Shared/SolaceManager";
import {
  DestinationType,
  MessageDeliveryModeType,
  MessageType,
} from "solclientjs";
import {
  Configs,
  PublishConfigs,
  PublishOptions,
  PublishStats,
  UserPropertiesMap,
} from "../Shared/interfaces";
import ConfigStore from "../Shared/components/ConfigStore";
import { Delete, Trash2 } from "lucide-react";
import ErrorMessage from "../Shared/components/ErrorMessage";
import UserProperties from "./UserProperties";

const DEFAULT_PRIORITY = 4;
const DEFAULT_DMQ_ELIGIBLE = true;

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
  const [messageType, setMessageType] = useState<MessageType>(MessageType.TEXT);
  const [content, setContent] = useState<string>("");
  const [userProperties, setUserProperties] = useState<UserPropertiesMap>({});
  const [advancedSettings, setAdvancedSettings] = useState<
    Partial<PublishOptions>
  >({});

  const [stats, setStats] = useState<PublishStats>({
    direct: 0,
    persistent: 0,
  });

  const [openAdvancedSettings, setOpenAdvancedSettings] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const disablePublish = !solaceConnection || !publishTo || !content;

  const configs: PublishConfigs = {
    publishTo,
    content,
    deliveryMode,
    destinationType,
    messageType,
    userProperties,
    ...advancedSettings,
  };

  const onLoadConfig = (config: Configs) => {
    const {
      publishTo,
      content,
      deliveryMode,
      destinationType,
      messageType,
      userProperties,
      ...advancedSettings
    } = config as PublishConfigs;
    setPublishTo(publishTo);
    setContent(content);
    setUserProperties(userProperties ?? {});
    if (deliveryMode !== undefined) setDeliveryMode(deliveryMode);
    if (destinationType !== undefined) setDestinationType(destinationType);
    if (messageType !== undefined) setMessageType(messageType);
    if (Object.keys(advancedSettings).length) {
      setAdvancedSettings(advancedSettings);
      setOpenAdvancedSettings(true);
    } else {
      setAdvancedSettings({});
      setOpenAdvancedSettings(false);
    }
  };

  return (
    <div className="pb-3">
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
          isDisabled={!solaceConnection}
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
          isRequired
          isDisabled={!solaceConnection}
          onValueChange={setPublishTo}
        />
        <div className="flex flex-row flex-wrap gap-4 justify-between">
          <RadioGroup
            label="Delivery Mode"
            orientation="horizontal"
            isDisabled={!solaceConnection}
            value={deliveryMode.toString()}
            onValueChange={(value) =>
              setDeliveryMode(Number(value) as MessageDeliveryModeType)
            }
          >
            <Radio
              className="capitalize"
              value={MessageDeliveryModeType.DIRECT.toString()}
              size="sm"
            >
              Direct
            </Radio>
            <Radio
              className="capitalize"
              size="sm"
              value={MessageDeliveryModeType.PERSISTENT.toString()}
            >
              Persistent
            </Radio>
          </RadioGroup>
          <UserProperties
            userProperties={userProperties}
            setUserProperties={setUserProperties}
          />
          <RadioGroup
            label="Message Type"
            orientation="horizontal"
            isDisabled={!solaceConnection}
            value={messageType.toString()}
            onValueChange={(value) =>
              setMessageType(Number(value) as MessageType)
            }
          >
            <Radio
              className="capitalize"
              size="sm"
              value={MessageType.TEXT.toString()}
            >
              TextMessage
            </Radio>
            <Radio
              className="capitalize"
              size="sm"
              value={MessageType.BINARY.toString()}
            >
              ByteMessage
            </Radio>
          </RadioGroup>
        </div>
        <Textarea
          label="Message Content"
          isDisabled={!solaceConnection}
          value={content}
          onValueChange={setContent}
          isRequired
        />
        <Accordion
          isCompact
          selectedKeys={openAdvancedSettings ? ["advanced-settings"] : []}
          onSelectionChange={(selectedKeys) => {
            if (Array.from(selectedKeys).length) {
              setOpenAdvancedSettings(true);
              setAdvancedSettings({
                ...advancedSettings,
                dmqEligible:
                  advancedSettings.dmqEligible ?? DEFAULT_DMQ_ELIGIBLE,
                priority: advancedSettings.priority ?? DEFAULT_PRIORITY,
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
                isDisabled={!solaceConnection}
                isSelected={advancedSettings.dmqEligible}
                onValueChange={(dmqEligible) =>
                  setAdvancedSettings((prev) => ({ ...prev, dmqEligible }))
                }
              >
                DMQ Eligible
              </Switch>
              <Slider
                size="sm"
                isDisabled={!solaceConnection}
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
                isDisabled={!solaceConnection}
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
                isDisabled={!solaceConnection}
                value={advancedSettings.replyToTopic || ""}
                onValueChange={(replyToTopic) =>
                  setAdvancedSettings((prev) => ({ ...prev, replyToTopic }))
                }
              />
              <Input
                label="Correlation ID"
                isDisabled={!solaceConnection}
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
              messageType,
              userProperties,
              ...advancedSettings,
            };
            const error = solaceConnection?.publish(
              publishTo,
              content,
              options
            );

            if (!error) {
              setStats((prev) => {
                const newStats = { ...prev };
                if (deliveryMode === MessageDeliveryModeType.DIRECT) {
                  newStats.direct++;
                } else {
                  newStats.persistent++;
                }
                return newStats;
              });
            }
            setErrorMessage(error?.message ?? null);
          }}
        >
          Publish
        </Button>
      </div>
      <div className="flex justify-between items-end gap-4 mt-4">
        <div>
          <small>Messages Published</small>
          <div className="flex gap-4 flex-wrap">
            <small>Direct: {stats.direct}</small>
            <small>Persistent: {stats.persistent}</small>
          </div>
        </div>
        <div className="fle flex-wrap justify-between items-end gap-1 mt-3">
          <Button
            size="sm"
            variant="bordered"
            startContent={<Trash2 size={12} />}
            onClick={() => {
              setStats({ direct: 0, persistent: 0 });
            }}
          >
            Clear Stats
          </Button>
          <Button
            size="sm"
            variant="bordered"
            startContent={<Delete size={12} />}
            onClick={() => {
              setPublishTo("");
              setContent("");
              setDeliveryMode(MessageDeliveryModeType.DIRECT);
              setDestinationType(DestinationType.TOPIC);
              setAdvancedSettings({});
              setOpenAdvancedSettings(false);
              setErrorMessage(null);
            }}
          >
            Clear Fields
          </Button>
        </div>
      </div>
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
    </div>
  );
};

export default PublishView;
