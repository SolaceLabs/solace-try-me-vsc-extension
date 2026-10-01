import { useState } from "react";
import { Button, Input, Link, Switch, Tooltip } from "@nextui-org/react";
import { Info } from "lucide-react";

import { ModalBody, Modal, ModalContent, ModalFooter, ModalHeader } from "../Shared/components/Modal";
import { useSettings } from "../Shared/components/SettingsContext";
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from "../Shared/constants";
import { ExtSettings } from "../Shared/interfaces";
import { host } from "../Shared/host";
import { clampNumber } from "../Shared/utils";

interface NumberSettingProps {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  description?: string;
}

/**
 * Keeps the typed text as-is while editing and only clamps and saves it on blur or Enter,
 * so fields can be cleared and retyped.
 */
const NumberSetting = ({ label, tooltip, value, min, max, onCommit, description }: NumberSettingProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = Math.round(Number(draft));
    const next = draft.trim() === "" ? value : clampNumber(parsed, min, max, value);
    setDraft(null);
    if (next !== value) onCommit(next);
  };
  return (
    <Input
      type="number"
      label={label}
      description={description ?? `Between ${min} and ${max}.`}
      endContent={
        <Tooltip content={tooltip}>
          <Info />
        </Tooltip>
      }
      value={draft ?? String(value)}
      onValueChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      min={min}
      max={max}
      step={1}
    />
  );
};

interface SwitchSettingProps {
  label: string;
  tooltip: string;
  isSelected: boolean;
  onValueChange: (value: boolean) => void;
}

/** The info icon sits next to the switch: inside its label, the switch swallows the hover. */
const SwitchSetting = ({ label, tooltip, isSelected, onValueChange }: SwitchSettingProps) => (
  <div className="flex items-center gap-3">
    <Switch isSelected={isSelected} onValueChange={onValueChange}>
      {label}
    </Switch>
    <Tooltip content={tooltip}>
      <span tabIndex={0} aria-label={tooltip} className="inline-flex outline-none">
        <Info />
      </span>
    </Tooltip>
  </div>
);

const SettingsView = ({ show, onClose }: { show: boolean; onClose: () => void }) => {
  const { settings, updateSettings } = useSettings();
  const [pathDraft, setPathDraft] = useState<string | null>(null);
  const set = (patch: Partial<ExtSettings>) => {
    updateSettings(patch);
  };
  const timeoutLimits = SETTINGS_LIMITS.brokerDisconnectTimeoutMinutes;

  return (
    <Modal isOpen={show} placement="center" scrollBehavior="inside" onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        {(onModalClose) => (
          <>
            <ModalHeader>Solace Try Me Extension Settings</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <NumberSetting
                label="Maximum number of retained messages"
                tooltip="Maximum number of received messages kept in the subscribe view. Older messages are dropped."
                value={settings.maxDisplayMessages}
                min={SETTINGS_LIMITS.maxDisplayMessages.min}
                max={SETTINGS_LIMITS.maxDisplayMessages.max}
                onCommit={(maxDisplayMessages) => set({ maxDisplayMessages })}
              />
              <NumberSetting
                label="Maximum visible payload length"
                tooltip="Maximum length of the payload that can be displayed before truncation. You can still open the message in VS Code."
                value={settings.maxPayloadLength}
                min={1}
                max={SETTINGS_LIMITS.maxPayloadLength.max}
                onCommit={(maxPayloadLength) => set({ maxPayloadLength })}
              />
              <NumberSetting
                label="Maximum visible property length"
                tooltip="Maximum length of the message properties (metadata and user properties) that can be displayed before truncation. You can still open the message in VS Code."
                value={settings.maxPropertyLength}
                min={SETTINGS_LIMITS.maxPropertyLength.min}
                max={SETTINGS_LIMITS.maxPropertyLength.max}
                onCommit={(maxPropertyLength) => set({ maxPropertyLength })}
              />
              <NumberSetting
                label="Broker disconnection timeout (minutes)"
                tooltip="Minutes without activity (messages, publishing, subscribing) after which the connection is closed. 0 never disconnects."
                description={`0 turns it off. At most ${timeoutLimits.max}.`}
                value={Math.round(settings.brokerDisconnectTimeout / 60000)}
                min={timeoutLimits.min}
                max={timeoutLimits.max}
                onCommit={(minutes) => set({ brokerDisconnectTimeout: minutes * 60000 })}
              />
              <SwitchSetting
                label="Notify on unexpected disconnects"
                tooltip="Show a VS Code notification when a connection drops or times out, with a Reconnect action."
                isSelected={settings.showDisconnectNotifications}
                onValueChange={(showDisconnectNotifications) => set({ showDisconnectNotifications })}
              />
              <SwitchSetting
                label="Save payloads on open"
                tooltip="Whether to save the message to a new file or an unsaved file when you open it in VS Code."
                isSelected={settings.savePayloads}
                onValueChange={(savePayloads) => set({ savePayloads })}
              />
              <Input
                type="text"
                label="Payload storage directory"
                description="Absolute path, ~/path, or a path relative to the workspace folder."
                endContent={
                  <Tooltip content="Relative paths are resolved against the workspace folder of the active editor (or the first folder). Without an open folder, messages open in an unsaved editor.">
                    <Info />
                  </Tooltip>
                }
                isDisabled={!settings.savePayloads}
                value={pathDraft ?? settings.payloadBasePath}
                onValueChange={setPathDraft}
                onBlur={() => {
                  if (pathDraft !== null) {
                    set({ payloadBasePath: pathDraft.trim() });
                    setPathDraft(null);
                  }
                }}
              />
              <p className="text-xs text-default-500 flex flex-wrap gap-3">
                <Link size="sm" className="cursor-pointer" onPress={() => host.request("command/run", { command: "solaceTryMeVscExtension.showLogs" })}>
                  Show logs
                </Link>
                <Link size="sm" className="cursor-pointer" onPress={() => host.request("command/run", { command: "solaceTryMeVscExtension.copyDiagnostics" })}>
                  Copy diagnostics
                </Link>
              </p>
            </ModalBody>
            <ModalFooter>
              <Button radius="sm" color="danger" variant="light" onPress={onModalClose}>
                Close
              </Button>
              <Button radius="sm" color="secondary" variant="light" onPress={() => set({ ...DEFAULT_SETTINGS })}>
                Reset to Default
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default SettingsView;
