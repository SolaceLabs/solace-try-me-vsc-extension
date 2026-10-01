import { useState } from "react";
import { Button, Chip, Input, Radio, RadioGroup, Spinner, Switch, Tooltip } from "@nextui-org/react";
import { Copy, Plus } from "lucide-react";
import solace from "solclientjs";

import { QueueBindMode } from "../Shared/interfaces";
import { EndpointSettings } from "./endpointSettings";
import { BindingStatus } from "../Shared/SolaceManager";
import ErrorMessage from "../Shared/components/ErrorMessage";
import { validateTopic } from "../Shared/topics";
import { copyToClipboard } from "../Shared/utils";

interface EndpointSectionProps {
  settings: EndpointSettings;
  onChange: (patch: Partial<EndpointSettings>) => void;
  isConnected: boolean;
  status: BindingStatus | null;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onAddSubscription: (topic: string) => void;
  onRemoveSubscription: (topic: string) => void;
}

const STATE_LABEL: Record<string, { text: string; color: "success" | "warning" | "default" | "danger" }> = {
  binding: { text: "Binding…", color: "default" },
  active: { text: "Active", color: "success" },
  standby: { text: "Standby: another consumer is active on this exclusive queue", color: "warning" },
  reconnecting: { text: "Rebinding…", color: "warning" },
};

const EndpointSection = ({
  settings,
  onChange,
  isConnected,
  status,
  error,
  onStart,
  onStop,
  onAddSubscription,
  onRemoveSubscription,
}: EndpointSectionProps) => {
  const [subscriptionInput, setSubscriptionInput] = useState("");
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const isBound = !!status && status.state !== "down";
  const isQueue = settings.type === solace.QueueType.QUEUE;
  const isBrowse = settings.mode === "browse" && isQueue;
  const isTemporary = settings.temporary && isQueue && !isBrowse;
  const locked = isBound;
  const missingName = !isTemporary && !settings.name.trim();
  const missingTopic = !isQueue && !settings.topic.trim();
  const state = status ? STATE_LABEL[status.state] : undefined;

  const addSubscription = () => {
    const topic = subscriptionInput.trim();
    const validation = validateTopic(topic);
    if (validation) {
      setSubscriptionError(validation);
      return;
    }
    setSubscriptionError(null);
    setSubscriptionInput("");
    if (!settings.subscriptions.includes(topic)) onAddSubscription(topic);
  };

  return (
    <div className="flex flex-col gap-4 pl-2">
      <RadioGroup
        orientation="horizontal"
        label="Endpoint type"
        size="sm"
        value={settings.type}
        isDisabled={locked}
        onValueChange={(value) => onChange({ type: value as solace.QueueType })}
      >
        <Radio value={solace.QueueType.QUEUE}>Queue</Radio>
        <Radio value={solace.QueueType.TOPIC_ENDPOINT}>Topic Endpoint</Radio>
      </RadioGroup>
      {isQueue && (
        <RadioGroup
          orientation="horizontal"
          label="Mode"
          size="sm"
          value={settings.mode}
          isDisabled={locked}
          onValueChange={(value) => onChange({ mode: value as QueueBindMode })}
          description={
            settings.mode === "browse"
              ? "Browsing shows the queued messages and leaves them on the queue."
              : "Consuming acknowledges every received message, which removes it from the endpoint."
          }
        >
          <Radio value="consume">Consume</Radio>
          <Radio value="browse">Browse (non-destructive)</Radio>
        </RadioGroup>
      )}
      {isQueue && !isBrowse && (
        <Switch size="sm" isSelected={settings.temporary} isDisabled={locked} onValueChange={(temporary) => onChange({ temporary })}>
          Temporary queue (named by the broker, removed on disconnect)
        </Switch>
      )}
      {!isTemporary && (
        <Input
          label={isQueue ? "Queue Name" : "Topic Endpoint Name"}
          isRequired
          value={settings.name}
          onValueChange={(name) => onChange({ name })}
          isDisabled={locked}
        />
      )}
      {!isQueue && (
        <Input
          label="Topic"
          description="Binding with a different topic replaces the endpoint's subscription, and the broker deletes the messages already spooled on it."
          value={settings.topic}
          isRequired
          onValueChange={(topic) => onChange({ topic })}
          isDisabled={locked}
        />
      )}
      {!isTemporary && !isBrowse && (
        <Switch
          size="sm"
          isSelected={settings.createIfMissing}
          isDisabled={locked}
          onValueChange={(createIfMissing) => onChange({ createIfMissing })}
        >
          Create the endpoint if it does not exist
        </Switch>
      )}
      {isTemporary && (
        <div className="flex flex-col gap-2">
          <Input
            size="sm"
            label="Queue subscriptions"
            placeholder="Topic to attract to the temporary queue"
            value={subscriptionInput}
            onValueChange={setSubscriptionInput}
            isInvalid={!!subscriptionError}
            errorMessage={subscriptionError}
            onKeyUp={(e) => e.key === "Enter" && addSubscription()}
            endContent={
              <Button isIconOnly size="sm" variant="light" aria-label="Add queue subscription" onPress={addSubscription}>
                <Plus size={16} />
              </Button>
            }
          />
          <div className="flex gap-2 flex-wrap">
            {settings.subscriptions.map((topic) => (
              <Chip key={topic} size="sm" onClose={() => onRemoveSubscription(topic)}>
                {topic}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          radius="sm"
          color={!isBound && !isBrowse ? "warning" : "primary"}
          variant={isBound ? "bordered" : "solid"}
          onPress={() => (isBound ? onStop() : onStart())}
          isDisabled={!isBound && (!isConnected || missingName || missingTopic)}
        >
          {isBound ? (isBrowse ? "Stop Browsing" : "Stop Consume") : isBrowse ? "Start Browsing" : "Start Consume (removes messages)"}
        </Button>
        {state && (
          <Chip size="sm" variant="flat" color={state.color} startContent={status?.state === "binding" ? <Spinner size="sm" color="current" /> : undefined}>
            {state.text}
          </Chip>
        )}
        {isBound && isTemporary && status?.endpointName && (
          <Tooltip content="Copy the temporary queue name">
            <Button
              size="sm"
              radius="full"
              variant="bordered"
              className="h-6 max-w-full"
              endContent={<Copy size={12} />}
              onPress={() => copyToClipboard(status.endpointName!)}
            >
              <span className="truncate">{status.endpointName}</span>
            </Button>
          </Tooltip>
        )}
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
};

export default EndpointSection;
