import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import solace from "solclientjs";
import { Button, Chip, Input, Divider, Tooltip } from "@nextui-org/react";
import { Delete, Plus, SquareX, Trash2 } from "lucide-react";

import { Configs, Message, SubscribeConfigs, SubscribeStats } from "../Shared/interfaces";
import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import ConfigStore from "../Shared/components/ConfigStore";
import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager, {
  BindingStatus,
  ConnectionState,
  ConnectionStatus,
  EndpointBinding,
  SubscriptionError,
} from "../Shared/SolaceManager";
import ErrorMessage from "../Shared/components/ErrorMessage";
import { wrappingTopicChip } from "../Shared/components/chipStyles";
import { usePreferences } from "../Shared/components/SettingsContext";
import { usePublishDraft } from "../Shared/components/PublishDraftContext";
import { usePersistentState } from "../Shared/usePersistentState";
import { validateTopic } from "../Shared/topics";
import { messageToPublishOptions } from "../Shared/messageCodec";
import { reportMilestone } from "../Shared/utils";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "../Shared/components/Modal";
import MessagesView from "./MessagesView";
import EndpointSection from "./EndpointSection";
import { DEFAULT_ENDPOINT_SETTINGS, EndpointSettings } from "./endpointSettings";

type TopicState = { state: "pending" | "ok" | "error"; error?: string };

const EMPTY_STATS: SubscribeStats = { direct: 0, persistent: 0, nonPersistent: 0, ignored: 0 };
const FLUSH_INTERVAL = 150;

const SubscribeView = () => {
  const { settings, preferences, update } = usePreferences();
  const { sendToPublish } = usePublishDraft();

  const [solaceConnection, setSolaceConnection] = useState<SolaceManager | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>();
  const isConnected = !!solaceConnection && connectionState?.status === ConnectionStatus.CONNECTED;

  const [topics, setTopics] = usePersistentState<string[]>("subscribe.topics", []);
  const [ignoreTopics, setIgnoreTopics] = usePersistentState<string[]>("subscribe.ignoreTopics", []);
  const [endpoint, setEndpoint] = usePersistentState<EndpointSettings>(
    "subscribe.endpoint",
    DEFAULT_ENDPOINT_SETTINGS
  );
  const [teTopics, setTeTopics] = usePersistentState<Record<string, string>>("subscribe.teTopics", {});

  const [topicStatus, setTopicStatus] = useState<Record<string, TopicState>>({});
  const [topicInputField, setTopicInputField] = useState("");
  const [ignoreTopicInputField, setIgnoreTopicInputField] = useState("");
  const [topicError, setTopicError] = useState<string | null>(null);
  const [ignoreError, setIgnoreError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const [binding, setBinding] = useState<EndpointBinding | null>(null);
  const [bindingStatus, setBindingStatus] = useState<BindingStatus | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [confirmTe, setConfirmTe] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<SubscribeStats>(EMPTY_STATS);
  const [paused, setPaused] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Incoming messages are buffered and committed in batches to keep high rates smooth.
  const incoming = useRef<Message[]>([]);
  const statsDelta = useRef<SubscribeStats>({ ...EMPTY_STATS });
  const pausedRef = useRef(paused);
  const maxRef = useRef(settings.maxDisplayMessages);
  const topicsRef = useRef(topics);
  const topicStatusRef = useRef(topicStatus);
  const endpointRef = useRef(endpoint);
  // Topics requested on the current session (solclientjs re-applies these after a reconnect).
  const sessionTopics = useRef(new Set<string>());
  const previousStatus = useRef<ConnectionStatus | undefined>(undefined);
  useEffect(() => {
    pausedRef.current = paused;
    maxRef.current = settings.maxDisplayMessages;
    topicsRef.current = topics;
    topicStatusRef.current = topicStatus;
    endpointRef.current = endpoint;
  });

  const isRejection = (error: unknown) => error instanceof SubscriptionError && error.reason === "rejected";

  const setStatus = (topic: string, state: TopicState | null) =>
    setTopicStatus((prev) => {
      const next = { ...prev };
      if (state) next[topic] = state;
      else delete next[topic];
      return next;
    });

  const onMessage = useCallback((message: Message) => {
    const delta = statsDelta.current;
    switch (message.metadata.deliveryMode) {
      case solace.MessageDeliveryModeType.PERSISTENT:
        delta.persistent++;
        break;
      case solace.MessageDeliveryModeType.NON_PERSISTENT:
        delta.nonPersistent++;
        break;
      default:
        delta.direct++;
    }
    incoming.current.push(message);
    if (incoming.current.length > maxRef.current) {
      incoming.current.splice(0, incoming.current.length - maxRef.current);
    }
  }, []);

  const onIgnored = useCallback(() => {
    statsDelta.current.ignored = (statsDelta.current.ignored ?? 0) + 1;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const delta = statsDelta.current;
      if (delta.direct || delta.persistent || delta.nonPersistent || delta.ignored) {
        statsDelta.current = { ...EMPTY_STATS };
        setStats((prev) => ({
          direct: prev.direct + delta.direct,
          persistent: prev.persistent + delta.persistent,
          nonPersistent: prev.nonPersistent + delta.nonPersistent,
          ignored: (prev.ignored ?? 0) + (delta.ignored ?? 0),
        }));
      }
      if (pausedRef.current) {
        setPendingCount(incoming.current.length);
        return;
      }
      if (incoming.current.length) {
        const batch = incoming.current.reverse();
        incoming.current = [];
        setPendingCount(0);
        setMessages((prev) => [...batch, ...prev].slice(0, maxRef.current));
      }
    }, FLUSH_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Lowering the limit trims the list right away.
  useEffect(() => {
    setMessages((prev) => (prev.length > settings.maxDisplayMessages ? prev.slice(0, settings.maxDisplayMessages) : prev));
  }, [settings.maxDisplayMessages]);

  const subscribeExisting = useCallback((connection: SolaceManager, topic: string) => {
    setStatus(topic, { state: "pending" });
    sessionTopics.current.add(topic);
    connection
      .subscribe(topic)
      .then(() => setStatus(topic, { state: "ok" }))
      .catch((error: Error) => {
        if (isRejection(error)) sessionTopics.current.delete(topic);
        setStatus(topic, { state: "error", error: error.message });
      });
  }, []);

  /** Removes a subscription from the session, or leaves it for the reconnect reconciliation. */
  const dropSubscription = useCallback((connection: SolaceManager | null, topic: string) => {
    if (!connection || !sessionTopics.current.has(topic)) return Promise.resolve();
    return connection.unsubscribe(topic).then(() => {
      sessionTopics.current.delete(topic);
    });
  }, []);

  // A new connection: route messages and subscribe the current topics.
  useEffect(() => {
    setTopicStatus({});
    setTopicError(null);
    setQueueError(null);
    setActionMessage(null);
    sessionTopics.current = new Set();
    if (!solaceConnection) return;
    solaceConnection.setOnMessage(onMessage, onIgnored);
    solaceConnection.setOnPublishResult((result) => {
      if (!result.ok) setActionMessage({ text: `Resend rejected: ${result.error}`, isError: true });
    });
    for (const topic of topicsRef.current) {
      subscribeExisting(solaceConnection, topic);
    }
  }, [solaceConnection, onMessage, onIgnored, subscribeExisting]);

  // After an automatic reconnect, bring the session in line with the topic list: topics added
  // or removed while reconnecting, and failed requests (or all topics, if re-apply is off).
  useEffect(() => {
    const status = connectionState?.status;
    const previous = previousStatus.current;
    previousStatus.current = status;
    if (!solaceConnection || previous !== ConnectionStatus.RECONNECTING || status !== ConnectionStatus.CONNECTED) {
      return;
    }
    const reapplied = solaceConnection.getBroker()?.sessionOptions?.reapplySubscriptions !== false;
    for (const topic of topicsRef.current) {
      if (!reapplied || !sessionTopics.current.has(topic) || topicStatusRef.current[topic]?.state !== "ok") {
        subscribeExisting(solaceConnection, topic);
      }
    }
    for (const topic of [...sessionTopics.current]) {
      if (!topicsRef.current.includes(topic)) dropSubscription(solaceConnection, topic).catch(() => undefined);
    }
  }, [connectionState, solaceConnection, subscribeExisting, dropSubscription]);

  useEffect(() => {
    solaceConnection?.setIgnoreTopics(ignoreTopics);
  }, [ignoreTopics, solaceConnection]);

  // Notices from message actions (e.g. "Resent to ...") go away on their own.
  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(null), actionMessage.isError ? 8000 : 3000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const subscribeTopic = (raw: string) => {
    const topic = raw.trim();
    const error = validateTopic(topic);
    if (error) {
      setTopicError(error);
      return;
    }
    setTopicError(null);
    setTopicInputField("");
    if (topics.includes(topic)) return;
    setTopics((prev) => [...prev, topic]);
    update({ type: "addRecentTopic", topic }).catch(() => undefined);
    if (solaceConnection && isConnected) {
      setStatus(topic, { state: "pending" });
      sessionTopics.current.add(topic);
      solaceConnection
        .subscribe(topic)
        .then(() => {
          setStatus(topic, { state: "ok" });
          reportMilestone("subscribed");
        })
        .catch((e: Error) => {
          if (isRejection(e)) {
            // The broker refused it: the topic is not subscribed, so drop it from the list.
            sessionTopics.current.delete(topic);
            setTopics((prev) => prev.filter((t) => t !== topic));
            setStatus(topic, null);
            setTopicError(`Could not subscribe to "${topic}": ${e.message}`);
          } else {
            // Interrupted (disconnect or reconnect): keep it; it is retried on (re)connect.
            setStatus(topic, { state: "error", error: e.message });
          }
        });
    }
  };

  const removeFromList = (topic: string) => {
    setTopics((prev) => prev.filter((t) => t !== topic));
    setStatus(topic, null);
  };

  const unsubscribeTopic = (topic: string) => {
    const wasSubscribed = topicStatus[topic]?.state === "ok";
    if (solaceConnection && isConnected && sessionTopics.current.has(topic)) {
      setStatus(topic, { state: "pending" });
      dropSubscription(solaceConnection, topic)
        .then(() => removeFromList(topic))
        .catch((e: Error) => {
          if (isRejection(e) && wasSubscribed) {
            setStatus(topic, { state: "ok" });
            setTopicError(`Could not unsubscribe from "${topic}": ${e.message}`);
          } else {
            // Reconnecting: removed after the reconnect.
            removeFromList(topic);
          }
        });
    } else {
      // Disconnected, or reconnecting (the reconnect reconciliation unsubscribes it).
      removeFromList(topic);
    }
  };

  const addIgnoreTopic = () => {
    const topic = ignoreTopicInputField.trim();
    if (!topic) return;
    const error = validateTopic(topic);
    if (error) {
      setIgnoreError(error);
      return;
    }
    setIgnoreError(null);
    setIgnoreTopics((prev) => Array.from(new Set([...prev, topic])));
    setIgnoreTopicInputField("");
  };

  // ------------------------------------------------------------ endpoints

  const stopBinding = useCallback(() => {
    binding?.stop();
    setBinding(null);
    setBindingStatus(null);
  }, [binding]);

  const startBinding = () => {
    if (!solaceConnection) return;
    setQueueError(null);
    const isQueue = endpoint.type === solace.QueueType.QUEUE;
    const temporary = isQueue && endpoint.mode === "consume" && endpoint.temporary;
    try {
      const next = solaceConnection.bind({
        mode: isQueue ? endpoint.mode : "consume",
        type: endpoint.type,
        name: endpoint.name,
        topic: endpoint.topic,
        createIfMissing: endpoint.createIfMissing,
        temporary,
      });
      let subscriptionsApplied = false;
      next.onStatus((status) => {
        setBindingStatus(status);
        if (status.state === "down") {
          setBinding((current) => (current === next ? null : current));
          setBindingStatus(null);
          if (status.error) setQueueError(status.error);
        } else if (status.state === "active" && temporary && !subscriptionsApplied) {
          subscriptionsApplied = true;
          // The latest list: it may have changed while binding.
          for (const topic of endpointRef.current.subscriptions) {
            next.addSubscription(topic).catch((e: Error) => setQueueError(`Queue subscription "${topic}": ${e.message}`));
          }
        }
      });
      setBinding(next);
      setBindingStatus(next.status);
    } catch (error) {
      setQueueError((error as Error).message);
    }
  };

  const requestStart = () => {
    if (endpoint.type === solace.QueueType.TOPIC_ENDPOINT) {
      const name = endpoint.name.trim();
      if (teTopics[name] !== endpoint.topic.trim()) {
        setConfirmTe(true);
        return;
      }
    }
    startBinding();
  };

  const updateEndpoint = (patch: Partial<EndpointSettings>) => setEndpoint((prev) => ({ ...prev, ...patch }));

  // ------------------------------------------------------------ presets

  const configs: SubscribeConfigs = useMemo(
    () => ({
      topics,
      ignoreTopics,
      queueType: endpoint.open ? endpoint.type : undefined,
      queueName: endpoint.open && endpoint.name ? endpoint.name : undefined,
      queueTopic: endpoint.open && endpoint.type === solace.QueueType.TOPIC_ENDPOINT && endpoint.topic ? endpoint.topic : undefined,
      bindMode: endpoint.open && endpoint.mode === "browse" ? "browse" : undefined,
      createIfMissing: endpoint.open && endpoint.createIfMissing ? true : undefined,
      temporaryQueue: endpoint.open && endpoint.temporary ? true : undefined,
      queueSubscriptions: endpoint.open && endpoint.subscriptions.length ? endpoint.subscriptions : undefined,
    }),
    [topics, ignoreTopics, endpoint]
  );

  const onLoadConfig = (config: Configs) => {
    const preset = config as SubscribeConfigs;
    stopBinding();
    const nextTopics = Array.isArray(preset.topics) ? preset.topics : [];
    if (solaceConnection && isConnected) {
      for (const topic of topics) {
        if (!nextTopics.includes(topic)) {
          dropSubscription(solaceConnection, topic).catch(() => undefined);
          setStatus(topic, null);
        }
      }
      for (const topic of nextTopics) {
        if (!topics.includes(topic)) subscribeExisting(solaceConnection, topic);
      }
    }
    setTopics(nextTopics);
    setIgnoreTopics(Array.isArray(preset.ignoreTopics) ? preset.ignoreTopics : []);
    setEndpoint({
      open: !!preset.queueType,
      type: preset.queueType ?? solace.QueueType.QUEUE,
      mode: preset.bindMode ?? "consume",
      name: preset.queueName ?? "",
      topic: preset.queueTopic ?? "",
      createIfMissing: !!preset.createIfMissing,
      temporary: !!preset.temporaryQueue,
      subscriptions: (preset.queueSubscriptions ?? []).filter((t) => typeof t === "string" && validateTopic(t) === null),
    });
    setQueueError(null);
  };

  const clearFields = () => {
    stopBinding();
    if (solaceConnection && isConnected) {
      for (const topic of topics) dropSubscription(solaceConnection, topic).catch(() => undefined);
    }
    setTopics([]);
    setTopicStatus({});
    setIgnoreTopics([]);
    setEndpoint(DEFAULT_ENDPOINT_SETTINGS);
    setTopicInputField("");
    setIgnoreTopicInputField("");
    setTopicError(null);
    setIgnoreError(null);
    setQueueError(null);
  };

  // ------------------------------------------------------------ message actions

  const actions = useMemo(
    () => ({
      onCopyToPublish: (message: Message) => {
        const { content, ...options } = messageToPublishOptions(message);
        sendToPublish({ publishTo: message.topic, content, ...options });
      },
      onResend: solaceConnection
        ? (message: Message) => {
            try {
              const { content, ...options } = messageToPublishOptions(message);
              solaceConnection.publish(message.topic, content, options);
              setActionMessage({ text: `Resent to ${message.topic}.`, isError: false });
            } catch (error) {
              setActionMessage({ text: `Could not resend: ${(error as Error).message}`, isError: true });
            }
          }
        : undefined,
      canRemoveFromQueue: (message: Message) =>
        message.source === "browse" && !!solaceConnection?.canRemoveBrowsedMessage(message._extension_uid),
      onRemoveFromQueue: (message: Message) => {
        try {
          solaceConnection?.removeBrowsedMessage(message._extension_uid);
          setMessages((prev) => prev.filter((m) => m._extension_uid !== message._extension_uid));
        } catch (error) {
          setActionMessage({ text: (error as Error).message, isError: true });
        }
      },
    }),
    [solaceConnection, sendToPublish]
  );

  const statusExtras = useMemo(
    () => ({
      topics: topics.length,
      consumer: bindingStatus && bindingStatus.state !== "down" ? bindingStatus.endpointName ?? endpoint.name : undefined,
    }),
    [topics.length, bindingStatus, endpoint.name]
  );

  const recentTopics = (preferences.recentlyUsed.recentTopics ?? []).filter((t) => !topics.includes(t)).slice(0, 8);
  const disabledSubscribe = !topicInputField.trim();

  return (
    <div className="pb-3">
      <ConfigStore storeKey="subscribeConfig" currentConfig={configs} onLoadConfig={onLoadConfig} />
      <div className="flex flex-col gap-4">
        <ConnectionManager
          role="subscribe"
          onSetConnection={setSolaceConnection}
          onStateChange={setConnectionState}
          statusExtras={statusExtras}
        />
        <Input
          label="Topic Subscriber"
          placeholder="Enter topic to subscribe to"
          description={isConnected ? undefined : "Topics added while disconnected are subscribed when you connect."}
          variant="bordered"
          value={topicInputField}
          isRequired
          isInvalid={!!topicError}
          onValueChange={(value) => {
            setTopicInputField(value);
            setTopicError(null);
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter" && topicInputField.trim()) subscribeTopic(topicInputField);
          }}
        />
        {recentTopics.length > 0 && (
          <div className="flex gap-1 flex-wrap items-center -mt-2">
            <span className="text-xs text-default-500">Recent:</span>
            {recentTopics.map((topic) => (
              <Button key={topic} size="sm" radius="full" variant="flat" className="h-6 min-w-0" onPress={() => subscribeTopic(topic)}>
                {topic}
              </Button>
            ))}
          </div>
        )}
        <Button radius="sm" color="primary" onPress={() => subscribeTopic(topicInputField)} isDisabled={disabledSubscribe}>
          {isConnected ? "Subscribe" : "Add Topic"}
        </Button>
        {topicError && <ErrorMessage>{topicError}</ErrorMessage>}
        <div>
          <p>Subscribed Topics</p>
          <div className="flex gap-2 flex-wrap overflow-auto py-3 px-1">
            {topics.map((topic) => {
              const status = topicStatus[topic];
              const chip = (
                <Chip
                  key={topic}
                  classNames={wrappingTopicChip}
                  onClose={status?.state === "pending" ? undefined : () => unsubscribeTopic(topic)}
                  color={status?.state === "error" ? "danger" : status?.state === "ok" ? "default" : "default"}
                  variant={status?.state === "ok" || !isConnected ? "solid" : "flat"}
                >
                  {topic}
                  {status?.state === "pending" ? " …" : ""}
                </Chip>
              );
              return status?.error ? (
                <Tooltip key={topic} content={status.error} color="danger">
                  {chip}
                </Tooltip>
              ) : (
                chip
              );
            })}
            {topics.length === 0 && <p className="text-gray-500 text-center">No topics subscribed yet.</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-col">
          <Input
            label="Ignore Topics"
            placeholder="Topic or wildcard to hide, e.g. logs/>"
            description="Hides matching direct messages. Queue messages are always shown."
            variant="bordered"
            value={ignoreTopicInputField}
            isInvalid={!!ignoreError}
            errorMessage={ignoreError}
            onValueChange={(value) => {
              setIgnoreTopicInputField(value);
              setIgnoreError(null);
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter") addIgnoreTopic();
            }}
            endContent={
              <Button radius="lg" variant="bordered" isIconOnly aria-label="Add ignored topic" onPress={addIgnoreTopic}>
                <Plus />
              </Button>
            }
          />
          <div className="flex gap-2 flex-wrap overflow-auto pb-3 px-1">
            {ignoreTopics.map((topic) => (
              <Chip
                key={topic}
                classNames={wrappingTopicChip}
                onClose={() => setIgnoreTopics((prev) => prev.filter((t) => t !== topic))}
              >
                {topic}
              </Chip>
            ))}
          </div>
        </div>
        <Accordion
          isCompact
          selectedKeys={endpoint.open ? ["bind-settings"] : []}
          onSelectionChange={(selectedKeys) => {
            const open = Array.from(selectedKeys).length > 0;
            if (!open) stopBinding();
            updateEndpoint({ open });
          }}
        >
          <AccordionItem
            key="bind-settings"
            aria-label="guaranteed messages"
            subtitle="Bind to an endpoint to receive or browse guaranteed messages"
          >
            <EndpointSection
              settings={endpoint}
              onChange={updateEndpoint}
              isConnected={isConnected}
              status={
                connectionState?.status === ConnectionStatus.RECONNECTING && bindingStatus && bindingStatus.state !== "down"
                  ? { ...bindingStatus, state: "reconnecting" }
                  : bindingStatus
              }
              error={queueError}
              onStart={requestStart}
              onStop={stopBinding}
              onAddSubscription={(topic) => {
                updateEndpoint({ subscriptions: [...endpoint.subscriptions, topic] });
                if (binding && bindingStatus?.state === "active") {
                  binding.addSubscription(topic).catch((e: Error) => setQueueError(`Queue subscription "${topic}": ${e.message}`));
                }
              }}
              onRemoveSubscription={(topic) => {
                updateEndpoint({ subscriptions: endpoint.subscriptions.filter((t) => t !== topic) });
                if (binding && bindingStatus?.state === "active") {
                  binding.removeSubscription(topic).catch((e: Error) => setQueueError(`Queue subscription "${topic}": ${e.message}`));
                }
              }}
            />
          </AccordionItem>
        </Accordion>
      </div>
      <Divider className="my-3" />
      <div>
        <div className="flex justify-between items-end pb-3 mb-3 flex-wrap gap-2">
          <div className="flex-grow flex flex-col gap-1">
            <h2>Messages (Most Recent {settings.maxDisplayMessages})</h2>
            <div className="flex gap-2 align-center flex-wrap">
              <small>Direct: {stats.direct}</small>
              <small>Persistent: {stats.persistent}</small>
              <small>Non-Persistent: {stats.nonPersistent}</small>
              {!!stats.ignored && <small>Ignored: {stats.ignored}</small>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end items-end gap-1">
            <Button
              radius="sm"
              size="sm"
              variant="bordered"
              startContent={<Delete size={12} />}
              onPress={() => (binding ? setConfirmClear(true) : clearFields())}
            >
              Clear Fields
            </Button>
            <Button
              radius="sm"
              size="sm"
              variant="bordered"
              startContent={<SquareX size={12} />}
              onPress={() => {
                incoming.current = [];
                setPendingCount(0);
                setMessages([]);
              }}
            >
              Clear Messages
            </Button>
            <Button
              radius="sm"
              size="sm"
              variant="bordered"
              startContent={<Trash2 size={12} />}
              onPress={() => setStats(EMPTY_STATS)}
            >
              Clear Stats
            </Button>
          </div>
        </div>
        {actionMessage && (
          <ErrorMessage
            variant={actionMessage.isError ? "error" : "info"}
            className="mb-3"
            onClose={() => setActionMessage(null)}
          >
            {actionMessage.text}
          </ErrorMessage>
        )}
        <MessagesView
          messages={messages}
          maxPayloadLength={settings.maxPayloadLength}
          maxPropertyLength={settings.maxPropertyLength}
          paused={paused}
          pendingCount={pendingCount}
          onPausedChange={setPaused}
          actions={actions}
        />
      </div>
      <Modal isOpen={confirmTe} onOpenChange={setConfirmTe} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Bind to topic endpoint?</ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  If &quot;{endpoint.name.trim()}&quot; currently has a different subscription than &quot;{endpoint.topic.trim()}&quot;,
                  the broker replaces it and deletes the messages already spooled on the endpoint.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button radius="sm" variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  radius="sm"
                  color="warning"
                  onPress={() => {
                    setTeTopics((prev) => ({ ...prev, [endpoint.name.trim()]: endpoint.topic.trim() }));
                    onClose();
                    startBinding();
                  }}
                >
                  Bind
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      <Modal isOpen={confirmClear} onOpenChange={setConfirmClear} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Clear all fields?</ModalHeader>
              <ModalBody>
                <p className="text-sm">This unsubscribes every topic and stops the active endpoint binding.</p>
              </ModalBody>
              <ModalFooter>
                <Button radius="sm" variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  radius="sm"
                  color="danger"
                  onPress={() => {
                    clearFields();
                    onClose();
                  }}
                >
                  Clear
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default SubscribeView;
