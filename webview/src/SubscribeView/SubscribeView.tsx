import { useEffect, useState } from "react";
import solace from "solclientjs";
import {
  Button,
  Chip,
  Input,
  RadioGroup,
  Radio,
  Divider,
} from "@nextui-org/react";
import { Plus, SquareX, Trash2 } from "lucide-react";

import {
  Configs,
  Message,
  SubscribeConfigs,
  SubscribeStats,
} from "../Shared/interfaces";
import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import ConfigStore from "../Shared/components/ConfigStore";
import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager from "../Shared/SolaceManager";
import ErrorMessage from "../Shared/components/ErrorMessage";
import { useSettings } from "../Shared/components/SettingsContext";
import MessagesView from "./MessagesView";

const SubscribeView = () => {
  const { settings } = useSettings();

  const [solaceConnection, setSolaceConnection] =
    useState<SolaceManager | null>(null);

  const [queueConsumer, setQueueConsumer] =
    useState<solace.MessageConsumer | null>(null);

  const [topics, setTopics] = useState<string[]>([]);
  const [ignoreTopics, setIgnoreTopics] = useState<string[]>([]);
  const [queueType, setQueueType] = useState<solace.QueueType>();
  const [queueName, setQueueName] = useState<string>();
  const [queueTopic, setQueueTopic] = useState<string>();

  const [messages, setMessages] = useState<Message[]>([]);

  const [topicInputField, setTopicInputField] = useState<string>("");
  const [ignoreTopicInputField, setIgnoreTopicInputField] =
    useState<string>("");
  const [openBindSettings, setOpenBindSettings] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [stats, setStats] = useState<SubscribeStats>({
    direct: 0,
    persistent: 0,
    nonPersistent: 0,
  });

  useEffect(() => {
    if (solaceConnection) {
      solaceConnection.setOnMessage((message: Message) => {
        addMessage(message, settings.maxDisplayMessages);
      });
      for (const topic of topics) {
        solaceConnection.subscribe(topic);
      }
    }
    // Topics should not trigger this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.maxDisplayMessages, solaceConnection]);

  const addMessage = (message: Message, maxDisplayMessages: number) => {
    setStats((prevStats) => {
      const newStats = { ...prevStats };
      switch (message.metadata.deliveryMode) {
        case solace.MessageDeliveryModeType.DIRECT:
          newStats.direct += 1;
          break;
        case solace.MessageDeliveryModeType.PERSISTENT:
          newStats.persistent += 1;
          break;
        case solace.MessageDeliveryModeType.NON_PERSISTENT:
          newStats.nonPersistent += 1;
          break;
      }
      return newStats;
    });

    setMessages((prevMessages) => {
      if (prevMessages.length >= maxDisplayMessages) {
        prevMessages.pop();
      }
      return [message, ...prevMessages];
    });
  };

  const subscribeTopic = (topic: string) => {
    if (ignoreTopics.includes(topic)) {
      return;
    }
    solaceConnection?.subscribe(topic);
    setTopics([...topics, topic]);
  };

  const unsubscribeTopic = (topic: string) => {
    solaceConnection?.unsubscribe(topic);
    setTopics(topics.filter((t) => t !== topic));
  };

  const startQueueConsumer = () => {
    if (!solaceConnection || !queueName || !queueType) {
      return;
    }
    const consumer = solaceConnection?.consumeQueue(
      queueName,
      queueType,
      queueTopic,
      (error) => {
        setQueueError(error.message);
        setQueueConsumer(null);
      }
    );
    if (consumer) {
      setQueueConsumer(consumer);
    }
  };

  const configs: SubscribeConfigs = {
    topics,
    ignoreTopics,
    queueType,
    queueName,
    queueTopic,
  };

  const onLoadConfig = (config: Configs) => {
    const {
      topics: newTopics,
      ignoreTopics,
      queueType,
      queueName,
      queueTopic,
    } = config as SubscribeConfigs;

    topics.forEach((topic) => {
      solaceConnection?.unsubscribe(topic);
    });
    newTopics.forEach((topic) => {
      solaceConnection?.subscribe(topic);
    });
    setTopics(newTopics);
    setIgnoreTopics(ignoreTopics || []);

    setQueueType(queueType);
    setQueueName(queueName);
    setQueueTopic(queueTopic);
    if (queueType) {
      setOpenBindSettings(true);
    } else {
      setOpenBindSettings(false);
    }
  };

  const disabledSubscribe = !solaceConnection || !topicInputField.trim();

  useEffect(() => {
    if (solaceConnection) {
      solaceConnection.setIgnoreTopics(ignoreTopics);
    }
  }, [ignoreTopics, solaceConnection]);

  return (
    <div className="pb-3">
      <ConfigStore
        storeKey="subscribeConfig"
        currentConfig={configs}
        onLoadConfig={onLoadConfig}
        isDisabled={!solaceConnection}
      />
      <div className="flex flex-col gap-4">
        <ConnectionManager onSetConnection={setSolaceConnection} />
        <Input
          label="Topic Subscriber"
          placeholder="Enter topic to subscribe to"
          variant="bordered"
          value={topicInputField}
          isRequired
          isDisabled={!solaceConnection}
          onValueChange={setTopicInputField}
          onKeyDown={(e) => {
            if (e.key === "Enter" && topicInputField.trim()) {
              subscribeTopic(topicInputField.trim());
              setTopicInputField("");
            }
          }}
        />
        <Button
          radius="sm"
          color="primary"
          onPress={() => {
            if (topicInputField.trim()) {
              subscribeTopic(topicInputField.trim());
              setTopicInputField("");
            }
          }}
          isDisabled={disabledSubscribe}
        >
          Subscribe
        </Button>
        <div>
          <p>Subscribed Topics</p>
          <div className="flex gap-2 flex-wrap overflow-auto py-3 px-1">
            {topics.map((topic, index) => (
              <Chip key={index} onClose={() => unsubscribeTopic(topic)}>
                {topic}
              </Chip>
            ))}
            {topics.length === 0 && (
              <p className="text-gray-500 text-center">
                No topics subscribed yet.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-col">
          <Input
            label="Ignore Topics"
            placeholder="Enter a topic to ignore"
            variant="bordered"
            value={ignoreTopicInputField}
            isRequired
            isDisabled={!solaceConnection}
            onValueChange={setIgnoreTopicInputField}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ignoreTopicInputField.trim()) {
                setIgnoreTopics(
                  Array.from(new Set([...ignoreTopics, ignoreTopicInputField]))
                );
                setIgnoreTopicInputField("");
              }
            }}
            endContent={
              <Button
                radius="lg"
                variant="bordered"
                isIconOnly
                onPress={() => {
                  if (ignoreTopicInputField.trim()) {
                    setIgnoreTopics(
                      Array.from(
                        new Set([...ignoreTopics, ignoreTopicInputField])
                      )
                    );
                    setIgnoreTopicInputField("");
                  }
                }}
              >
                <Plus />
              </Button>
            }
          />
          <div>
            <div className="flex gap-2 flex-wrap overflow-auto pb-3 px-1">
              {ignoreTopics.map((topic) => (
                <Chip
                  key={topic}
                  onClose={() =>
                    setIgnoreTopics(ignoreTopics.filter((t) => t !== topic))
                  }
                >
                  {topic}
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <Accordion
          isCompact
          selectedKeys={openBindSettings ? ["bind-settings"] : []}
          onSelectionChange={(selectedKeys) => {
            if (Array.from(selectedKeys).length) {
              setQueueType(solace.QueueType.QUEUE);
              setOpenBindSettings(true);
            } else {
              setQueueType(undefined);
              setQueueName(undefined);
              setQueueTopic(undefined);
              setOpenBindSettings(false);
            }
          }}
        >
          <AccordionItem
            key="bind-settings"
            aria-label="guaranteed messages"
            subtitle="Bind to an endpoint to receive guaranteed messages"
          >
            <div className="flex flex-col gap-4 pl-2">
              <RadioGroup
                orientation="horizontal"
                value={queueType}
                isDisabled={!solaceConnection}
                onValueChange={(value) => {
                  console.log(value);
                  setQueueType(value as solace.QueueType);
                }}
              >
                <Radio className="capitalize" value={solace.QueueType.QUEUE}>
                  Queue
                </Radio>
                <Radio
                  className="capitalize"
                  value={solace.QueueType.TOPIC_ENDPOINT}
                >
                  Topic Endpoint
                </Radio>
              </RadioGroup>
              <Input
                label={
                  queueType === solace.QueueType.QUEUE
                    ? "Queue Name"
                    : "Topic Endpoint Name"
                }
                isRequired
                value={queueName || ""}
                onValueChange={setQueueName}
                isDisabled={!solaceConnection}
              />
              {queueType === solace.QueueType.TOPIC_ENDPOINT && (
                <Input
                  label="Topic"
                  value={queueTopic || ""}
                  isRequired
                  onValueChange={setQueueTopic}
                  isDisabled={!solaceConnection}
                />
              )}
              <Button
                radius="sm"
                color="primary"
                variant={queueConsumer ? "bordered" : "solid"}
                onPress={() => {
                  setQueueError(null);
                  if (queueConsumer) {
                    queueConsumer.disconnect();
                    setQueueConsumer(null);
                  } else {
                    startQueueConsumer();
                  }
                }}
                isDisabled={
                  !solaceConnection ||
                  !queueName ||
                  (queueType === solace.QueueType.TOPIC_ENDPOINT && !queueTopic)
                }
              >
                {queueConsumer ? "Stop Consume" : "Start Consume"}
              </Button>
              {queueError && <ErrorMessage>{queueError}</ErrorMessage>}
            </div>
          </AccordionItem>
        </Accordion>
      </div>
      <Divider className="my-3" />
      <div>
        <div className="flex justify-between pb-3 mb-3 flex-wrap">
          <div className="flex-grow flex flex-col justify-between h-auto">
            <h2>Messages (Most Recent {settings.maxDisplayMessages})</h2>
            <div className="flex gap-2 align-center flex-wrap mb-2">
              <small>Direct: {stats.direct}</small>
              <small>Persistent: {stats.persistent}</small>
              <small>Non-Persistent: {stats.nonPersistent}</small>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Button
              radius="sm"
              size="sm"
              variant="bordered"
              className="w-full"
              startContent={<SquareX size={12} />}
              onClick={() => {
                setMessages([]);
              }}
            >
              Clear Messages
            </Button>
            <Button
              radius="sm"
              size="sm"
              variant="bordered"
              className="w-full"
              startContent={<Trash2 size={12} />}
              onClick={() => {
                setStats({ direct: 0, persistent: 0, nonPersistent: 0 });
              }}
            >
              Clear Stats
            </Button>
          </div>
        </div>
        <MessagesView
          messages={messages}
          maxPayloadLength={settings.maxPayloadLength}
          maxPropertyLength={settings.maxPropertyLength}
          baseFilePath={
            settings.savePayloads ? settings.payloadBasePath : undefined
          }
        />
      </div>
    </div>
  );
};

export default SubscribeView;
