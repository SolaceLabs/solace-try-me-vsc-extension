import { useEffect, useState } from "react";
import solace from "solclientjs";
import {
  Accordion,
  AccordionItem,
  Button,
  Chip,
  Input,
  RadioGroup,
  Radio,
  Divider,
  ScrollShadow,
} from "@nextui-org/react";
import { SquareX, Trash2 } from "lucide-react";

import {
  Configs,
  Message,
  SubscribeConfigs,
  SubscribeStats,
} from "../Shared/interfaces";
import ConfigStore from "../Shared/components/ConfigStore";
import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager from "../Shared/SolaceManager";
import { MAX_DISPLAY_MESSAGES } from "../Shared/constants";
import SolaceMessage from "./SolaceMessage";
import ErrorMessage from "../Shared/components/ErrorMessage";

const SubscribeView = () => {
  const [solaceConnection, setSolaceConnection] =
    useState<SolaceManager | null>(null);

  const [queueConsumer, setQueueConsumer] =
    useState<solace.MessageConsumer | null>(null);

  const [topics, setTopics] = useState<string[]>([]);
  const [queueType, setQueueType] = useState<solace.QueueType>();
  const [queueName, setQueueName] = useState<string>();
  const [queueTopic, setQueueTopic] = useState<string>();

  const [messages, setMessages] = useState<Message[]>([]);

  const [topicInputField, setTopicInputField] = useState<string>("");
  const [openBindSettings, setOpenBindSettings] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [stats, setStats] = useState<SubscribeStats>({
    direct: 0,
    persistent: 0,
    nonPersistent: 0,
  });

  useEffect(() => {
    setTopics([]);
    if (solaceConnection) {
      solaceConnection.onMessage = (message: Message) => {
        addMessage(message);
      };
    }
  }, [solaceConnection]);

  const addMessage = (message: Message) => {
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
      if (prevMessages.length >= MAX_DISPLAY_MESSAGES) {
        prevMessages.pop();
      }
      return [message, ...prevMessages];
    });
  };

  const subscribeTopic = (topic: string) => {
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
    queueType,
    queueName,
    queueTopic,
  };

  const onLoadConfig = (config: Configs) => {
    const {
      topics: newTopics,
      queueType,
      queueName,
      queueTopic,
    } = config as SubscribeConfigs;

    topics.forEach((topic) => {
      unsubscribeTopic(topic);
    });
    newTopics.forEach((topic) => {
      subscribeTopic(topic);
    });

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
        />
        <Button
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
            <h2>Messages (Most Recent {MAX_DISPLAY_MESSAGES})</h2>
            <div className="flex gap-2 align-center flex-wrap">
              <small>Direct: {stats.direct}</small>
              <small>Persistent: {stats.persistent}</small>
              <small>Non-Persistent: {stats.nonPersistent}</small>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Button
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
        {messages.length !== 0 && (
          <ScrollShadow className="h-[500px] w-full">
            {messages.map((message) => (
              <SolaceMessage key={message._extension_uid} message={message} />
            ))}
          </ScrollShadow>
        )}
        {messages.length === 0 && (
          <p className="text-gray-500 text-center">No messages received yet.</p>
        )}
      </div>
    </div>
  );
};

export default SubscribeView;
