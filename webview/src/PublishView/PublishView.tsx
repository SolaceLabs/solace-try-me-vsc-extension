import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RadioGroup, Radio, Input, Textarea, Button, Switch, Slider, Spinner } from "@nextui-org/react";
import { DestinationType, MessageDeliveryModeType, MessageType } from "solclientjs";
import { Delete, Trash2 } from "lucide-react";

import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager, { ConnectionState, ConnectionStatus, PublishResult } from "../Shared/SolaceManager";
import {
  Configs,
  Message,
  PublishConfigs,
  PublishHistoryEntry,
  PublishMode,
  PublishOptions,
  PublishStats,
  UserPropertiesMap,
} from "../Shared/interfaces";
import ConfigStore from "../Shared/components/ConfigStore";
import ErrorMessage from "../Shared/components/ErrorMessage";
import UserProperties from "./UserProperties";
import PublishHistory from "./PublishHistory";
import SolaceMessage from "../SubscribeView/SolaceMessage";
import { usePreferences } from "../Shared/components/SettingsContext";
import { usePublishDraft } from "../Shared/components/PublishDraftContext";
import { usePersistentState } from "../Shared/usePersistentState";
import { createUid } from "../Shared/messageCodec";
import { reportMilestone } from "../Shared/utils";
import {
  DEFAULT_REQUEST_TIMEOUT,
  MAX_HISTORY_PAYLOAD_LENGTH,
  MIN_REQUEST_TIMEOUT,
} from "../Shared/constants";

const DEFAULT_PRIORITY = 4;
const DEFAULT_DMQ_ELIGIBLE = true;

type AdvancedSettings = Pick<
  PublishOptions,
  "dmqEligible" | "priority" | "timeToLive" | "replyToTopic" | "correlationId" | "applicationMessageId" | "applicationMessageType"
>;

const ADVANCED_KEYS: (keyof AdvancedSettings)[] = [
  "dmqEligible",
  "priority",
  "timeToLive",
  "replyToTopic",
  "correlationId",
  "applicationMessageId",
  "applicationMessageType",
];

const pickAdvanced = (config: Partial<PublishConfigs>): AdvancedSettings => {
  const result: AdvancedSettings = {};
  for (const key of ADVANCED_KEYS) {
    const value = config[key];
    if (value !== undefined && value !== "") (result as Record<string, unknown>)[key] = value;
  }
  return result;
};

const EMPTY_STATS: Required<PublishStats> = { direct: 0, persistent: 0, acknowledged: 0, rejected: 0 };

const PublishView = () => {
  const { preferences, update } = usePreferences();
  const { draft } = usePublishDraft();
  const [solaceConnection, setSolaceConnection] = useState<SolaceManager | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>();
  const isConnected = !!solaceConnection && connectionState?.status === ConnectionStatus.CONNECTED;

  const [destinationType, setDestinationType] = usePersistentState<DestinationType>("publish.destinationType", DestinationType.TOPIC);
  const [publishTo, setPublishTo] = usePersistentState("publish.publishTo", "");
  const [deliveryMode, setDeliveryMode] = usePersistentState<MessageDeliveryModeType>(
    "publish.deliveryMode",
    MessageDeliveryModeType.DIRECT
  );
  const [messageType, setMessageType] = usePersistentState<MessageType>("publish.messageType", MessageType.TEXT);
  const [content, setContent] = usePersistentState("publish.content", "");
  const [userProperties, setUserProperties] = usePersistentState<UserPropertiesMap>("publish.userProperties", {});
  const [advancedSettings, setAdvancedSettings] = usePersistentState<AdvancedSettings>("publish.advanced", {});
  const [openAdvancedSettings, setOpenAdvancedSettings] = usePersistentState("publish.advancedOpen", false);
  const [mode, setMode] = usePersistentState<PublishMode>("publish.mode", "publish");
  const [requestTimeout, setRequestTimeout] = usePersistentState("publish.requestTimeout", DEFAULT_REQUEST_TIMEOUT);

  const [stats, setStats] = useState<Required<PublishStats>>(EMPTY_STATS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRejection, setLastRejection] = useState<string | null>(null);
  const [requestPending, setRequestPending] = useState(false);
  const [reply, setReply] = useState<{ message: Message; rttMs: number } | null>(null);
  const historyIds = useRef(new Set<string>());

  const disablePublish = !isConnected || !publishTo.trim() || requestPending;
  const history = (preferences.recentlyUsed.publishHistory ?? []) as PublishHistoryEntry[];

  const configs: PublishConfigs = useMemo(
    () => ({
      publishTo,
      content,
      deliveryMode,
      destinationType,
      messageType,
      userProperties,
      ...(openAdvancedSettings ? advancedSettings : {}),
      ...(mode === "request" ? { mode, requestTimeout } : {}),
    }),
    [publishTo, content, deliveryMode, destinationType, messageType, userProperties, openAdvancedSettings, advancedSettings, mode, requestTimeout]
  );

  const onLoadConfig = useCallback(
    (config: Configs) => {
      const preset = config as PublishConfigs;
      setPublishTo(preset.publishTo ?? "");
      setContent(preset.content ?? "");
      setUserProperties(preset.userProperties ?? {});
      setDeliveryMode(preset.deliveryMode ?? MessageDeliveryModeType.DIRECT);
      setDestinationType(preset.destinationType ?? DestinationType.TOPIC);
      setMessageType(preset.messageType ?? MessageType.TEXT);
      setMode(preset.mode === "request" ? "request" : "publish");
      setRequestTimeout(preset.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT);
      const advanced = pickAdvanced(preset);
      setAdvancedSettings(advanced);
      setOpenAdvancedSettings(Object.keys(advanced).length > 0);
      setErrorMessage(null);
      setReply(null);
    },
    [setPublishTo, setContent, setUserProperties, setDeliveryMode, setDestinationType, setMessageType, setMode, setRequestTimeout, setAdvancedSettings, setOpenAdvancedSettings]
  );

  // "Copy to Publish" from a received message.
  useEffect(() => {
    if (draft) onLoadConfig(draft.config);
  }, [draft, onLoadConfig]);

  // Errors belong to the previous connection; keep them visible until the next one.
  useEffect(() => {
    if (!solaceConnection) return;
    setErrorMessage(null);
    setLastRejection(null);
  }, [solaceConnection]);

  useEffect(() => {
    if (!solaceConnection) return;
    solaceConnection.setOnPublishResult((result: PublishResult) => {
      setStats((prev) =>
        result.ok
          ? { ...prev, acknowledged: prev.acknowledged + 1 }
          : { ...prev, rejected: prev.rejected + 1 }
      );
      if (!result.ok) setLastRejection(result.error ?? "Rejected by the broker.");
      if (historyIds.current.delete(result.id)) {
        update({
          type: "updatePublishHistory",
          id: result.id,
          patch: { status: result.ok ? "acknowledged" : "rejected", error: result.ok ? undefined : result.error },
        }).catch(() => undefined);
      }
    });
  }, [solaceConnection, update]);

  const recordHistory = (id: string, config: PublishConfigs, status: PublishHistoryEntry["status"], error?: string) => {
    const truncated = config.content.length > MAX_HISTORY_PAYLOAD_LENGTH;
    const entry: PublishHistoryEntry = {
      id,
      timestamp: Date.now(),
      config: truncated ? { ...config, content: "" } : config,
      status,
      ...(error ? { error } : {}),
      ...(truncated ? { truncated } : {}),
    };
    update({ type: "addPublishHistory", entry: JSON.parse(JSON.stringify(entry)) }).catch(() => undefined);
  };

  const optionsFor = (config: PublishConfigs): PublishOptions => ({
    deliveryMode: config.deliveryMode,
    destinationType: config.destinationType,
    messageType: config.messageType,
    userProperties: config.userProperties,
    ...pickAdvanced(config),
  });

  const publish = (config: PublishConfigs) => {
    if (!solaceConnection) return;
    setErrorMessage(null);
    try {
      const { id, tracked } = solaceConnection.publish(config.publishTo, config.content, optionsFor(config));
      setStats((prev) => (tracked ? { ...prev, persistent: prev.persistent + 1 } : { ...prev, direct: prev.direct + 1 }));
      if (tracked) historyIds.current.add(id);
      recordHistory(id, { ...config, mode: undefined, requestTimeout: undefined }, "sent");
      reportMilestone("published");
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  const sendRequest = async (config: PublishConfigs) => {
    if (!solaceConnection) return;
    setErrorMessage(null);
    setReply(null);
    setRequestPending(true);
    const id = createUid();
    try {
      const timeout = Math.max(config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT, MIN_REQUEST_TIMEOUT);
      const result = await solaceConnection.request(config.publishTo, config.content, optionsFor(config), timeout);
      setReply({ message: result.reply, rttMs: result.rttMs });
      recordHistory(id, config, "acknowledged");
      reportMilestone("published");
    } catch (error) {
      setErrorMessage(`Request failed: ${(error as Error).message}`);
      recordHistory(id, config, "rejected", (error as Error).message);
    } finally {
      setRequestPending(false);
    }
  };

  const clearFields = () => {
    setPublishTo("");
    setContent("");
    setDeliveryMode(MessageDeliveryModeType.DIRECT);
    setDestinationType(DestinationType.TOPIC);
    setMessageType(MessageType.TEXT);
    setUserProperties({});
    setAdvancedSettings({});
    setOpenAdvancedSettings(false);
    setMode("publish");
    setRequestTimeout(DEFAULT_REQUEST_TIMEOUT);
    setErrorMessage(null);
    setReply(null);
  };

  const setAdvanced = (patch: AdvancedSettings) => setAdvancedSettings((prev) => ({ ...prev, ...patch }));
  const optionalText = (value: string) => (value === "" ? undefined : value);

  return (
    <div className="pb-3">
      <ConfigStore storeKey="publishConfig" currentConfig={configs} onLoadConfig={onLoadConfig} />
      <div className="flex flex-col gap-4">
        <ConnectionManager role="publish" onSetConnection={setSolaceConnection} onStateChange={setConnectionState} />
        <RadioGroup
          label="Select a topic or queue to publish to"
          orientation="horizontal"
          value={destinationType}
          onValueChange={(value) => {
            const next = value as DestinationType;
            setDestinationType(next);
            // Direct messages to a queue are never acknowledged, so failures would go unnoticed.
            if (next === DestinationType.QUEUE && deliveryMode === MessageDeliveryModeType.DIRECT) {
              setDeliveryMode(MessageDeliveryModeType.PERSISTENT);
            }
          }}
        >
          <Radio className="capitalize" value={DestinationType.TOPIC}>
            Topic
          </Radio>
          <Radio className="capitalize" value={DestinationType.QUEUE}>
            Queue
          </Radio>
        </RadioGroup>
        <Input label={`Publish to ${destinationType}`} value={publishTo} isRequired onValueChange={setPublishTo} />
        <div className="flex flex-row flex-wrap gap-4 justify-between">
          <RadioGroup
            label="Delivery Mode"
            orientation="horizontal"
            value={deliveryMode.toString()}
            onValueChange={(value) => setDeliveryMode(Number(value) as MessageDeliveryModeType)}
            description={
              destinationType === DestinationType.QUEUE && deliveryMode === MessageDeliveryModeType.DIRECT
                ? "Direct messages to a queue are not acknowledged."
                : undefined
            }
          >
            <Radio className="capitalize" value={MessageDeliveryModeType.DIRECT.toString()} size="sm">
              Direct
            </Radio>
            <Radio className="capitalize" size="sm" value={MessageDeliveryModeType.PERSISTENT.toString()}>
              Persistent
            </Radio>
          </RadioGroup>
          <UserProperties userProperties={userProperties} setUserProperties={setUserProperties} />
          <RadioGroup
            label="Message Type"
            orientation="horizontal"
            value={messageType.toString()}
            onValueChange={(value) => setMessageType(Number(value) as MessageType)}
            description={
              messageType === MessageType.TEXT
                ? "Sent as an SDT text payload (JMS TextMessage)."
                : "Sent as a UTF-8 binary attachment (JMS BytesMessage)."
            }
          >
            <Radio className="capitalize" size="sm" value={MessageType.TEXT.toString()}>
              TextMessage
            </Radio>
            <Radio className="capitalize" size="sm" value={MessageType.BINARY.toString()}>
              ByteMessage
            </Radio>
          </RadioGroup>
        </div>
        <Textarea label="Message Content" value={content} onValueChange={setContent} />
        <Accordion
          isCompact
          selectedKeys={openAdvancedSettings ? ["advanced-settings"] : []}
          onSelectionChange={(selectedKeys) => {
            if (Array.from(selectedKeys).length) {
              setOpenAdvancedSettings(true);
              setAdvancedSettings((prev) => ({
                ...prev,
                dmqEligible: prev.dmqEligible ?? DEFAULT_DMQ_ELIGIBLE,
                priority: prev.priority ?? DEFAULT_PRIORITY,
              }));
            } else {
              setAdvancedSettings({});
              setOpenAdvancedSettings(false);
            }
          }}
        >
          <AccordionItem key="advanced-settings" aria-label="advanced settings" subtitle="Advanced Settings">
            <div className="flex flex-col gap-4 pl-2">
              <Switch
                isSelected={advancedSettings.dmqEligible ?? DEFAULT_DMQ_ELIGIBLE}
                onValueChange={(dmqEligible) => setAdvanced({ dmqEligible })}
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
                showTooltip={true}
                value={advancedSettings.priority ?? DEFAULT_PRIORITY}
                onChange={(priority) => setAdvanced({ priority: Array.isArray(priority) ? priority[0] : priority })}
              />
              <Input
                label="Time to Live (sec)"
                type="number"
                min={0}
                description="0 or empty: the message never expires."
                value={advancedSettings.timeToLive ? String(advancedSettings.timeToLive) : ""}
                onValueChange={(value) => {
                  const ttl = Number(value);
                  setAdvanced({ timeToLive: value === "" || !Number.isFinite(ttl) || ttl <= 0 ? undefined : ttl });
                }}
              />
              <Input
                label="Reply To Topic"
                value={advancedSettings.replyToTopic ?? ""}
                isDisabled={mode === "request"}
                description={mode === "request" ? "Requests use this session's reply inbox." : undefined}
                onValueChange={(value) => setAdvanced({ replyToTopic: optionalText(value) })}
              />
              <Input
                label="Correlation ID"
                value={advancedSettings.correlationId ?? ""}
                onValueChange={(value) => setAdvanced({ correlationId: optionalText(value) })}
              />
              <Input
                label="Application Message ID"
                value={advancedSettings.applicationMessageId ?? ""}
                onValueChange={(value) => setAdvanced({ applicationMessageId: optionalText(value) })}
              />
              <Input
                label="Application Message Type"
                value={advancedSettings.applicationMessageType ?? ""}
                onValueChange={(value) => setAdvanced({ applicationMessageType: optionalText(value) })}
              />
            </div>
          </AccordionItem>
        </Accordion>
        <div className="flex gap-2 items-end flex-wrap">
          <RadioGroup
            orientation="horizontal"
            size="sm"
            label="Mode"
            value={mode}
            onValueChange={(value) => {
              setMode(value as PublishMode);
              setReply(null);
            }}
          >
            <Radio value="publish">Publish</Radio>
            <Radio value="request">Request / Reply</Radio>
          </RadioGroup>
          {mode === "request" && (
            <Input
              size="sm"
              type="number"
              label="Reply timeout (ms)"
              className="max-w-40"
              min={MIN_REQUEST_TIMEOUT}
              value={String(requestTimeout)}
              onValueChange={(value) => {
                const n = Number(value);
                if (Number.isFinite(n)) setRequestTimeout(n);
              }}
            />
          )}
        </div>
        <Button
          radius="sm"
          color="success"
          isDisabled={disablePublish}
          startContent={requestPending ? <Spinner size="sm" color="current" /> : undefined}
          onPress={() => (mode === "request" ? sendRequest(configs) : publish(configs))}
        >
          {mode === "request" ? (requestPending ? "Waiting for reply" : "Send Request") : "Publish"}
        </Button>
      </div>
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
      {reply && (
        <div className="mt-3">
          <p className="text-sm mb-1">Reply received in {reply.rttMs} ms</p>
          <SolaceMessage message={reply.message} compactMode={false} maxPayloadLength={4096} maxPropertyLength={256} highlight="" />
        </div>
      )}
      <div className="flex justify-between items-end gap-4 mt-4">
        <div>
          <small>Messages Published</small>
          <div className="flex gap-4 flex-wrap">
            <small>Direct: {stats.direct}</small>
            <small>Persistent: {stats.persistent}</small>
            <small>Acknowledged: {stats.acknowledged}</small>
            <small className={stats.rejected ? "text-danger" : ""}>Rejected: {stats.rejected}</small>
          </div>
        </div>
        <div className="flex flex-wrap justify-end items-end gap-1 mt-3">
          <Button
            radius="sm"
            size="sm"
            variant="bordered"
            startContent={<Trash2 size={12} />}
            onPress={() => {
              setStats(EMPTY_STATS);
              setLastRejection(null);
            }}
          >
            Clear Stats
          </Button>
          <Button radius="sm" size="sm" variant="bordered" startContent={<Delete size={12} />} onPress={clearFields}>
            Clear Fields
          </Button>
        </div>
      </div>
      {lastRejection && <ErrorMessage>Last rejected message: {lastRejection}</ErrorMessage>}
      <div className="mt-3">
        <PublishHistory
          entries={history}
          canResend={isConnected && !requestPending}
          onLoad={onLoadConfig}
          onResend={(config) => (config.mode === "request" ? sendRequest(config) : publish(config))}
          onClear={() => update({ type: "clearPublishHistory" }).catch(() => undefined)}
        />
      </div>
    </div>
  );
};

export default PublishView;
