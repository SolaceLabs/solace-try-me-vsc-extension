import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Tooltip,
} from "@nextui-org/react";
import { ChevronDown, RefreshCcw, Save, Trash2 } from "lucide-react";

import { ModalBody, Modal, ModalContent, ModalFooter, ModalHeader } from "./Modal";
import { configsEqual } from "../utils";
import { Configs } from "../interfaces";
import { usePreferences } from "./SettingsContext";
import { usePersistentState } from "../usePersistentState";
import { logger } from "../logger";

interface ConfigStoreProps {
  currentConfig: Configs;
  onLoadConfig: (config: Configs) => void;
  storeKey: "publishConfig" | "subscribeConfig";
  isDisabled?: boolean;
}

/**
 * Named presets. Presets are only applied by picking one from the menu, never by a
 * keyboard selection change, and deleting is a separate, confirmed action.
 */
const ConfigStore = ({ currentConfig, onLoadConfig, storeKey, isDisabled = false }: ConfigStoreProps) => {
  const { preferences, update } = usePreferences();
  const presets = preferences.recentlyUsed[storeKey] as { name: string; config: Configs }[];
  const [selectedName, setSelectedName] = usePersistentState<string | undefined>(
    `presets.${storeKey}.selected`,
    undefined
  );
  const [showNameModal, setShowNameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tempName, setTempName] = useState("");

  const selected = presets.find((p) => p.name === selectedName);

  // The view normalizes what it loads (older presets lack newer fields, or kept empty values),
  // so compare against the config as the view rebuilt it right after loading.
  const [baseline, setBaseline] = useState<{ name: string; config: Configs } | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  const latestConfig = useRef(currentConfig);
  const loadedName = useRef<string | undefined>(undefined);
  useEffect(() => {
    latestConfig.current = currentConfig;
  });
  useEffect(() => {
    if (loadToken && loadedName.current) {
      setBaseline({ name: loadedName.current, config: latestConfig.current });
    }
  }, [loadToken]);

  const hasUnsavedChanges = useMemo(() => {
    if (!selected) return false;
    const reference = baseline?.name === selected.name ? baseline.config : selected.config;
    return !configsEqual(reference, currentConfig);
  }, [selected, baseline, currentConfig]);

  const save = (name: string) => {
    update({
      type: "upsertPreset",
      storeKey,
      name,
      config: JSON.parse(JSON.stringify(currentConfig)),
    })
      .then(() => {
        setSelectedName(name);
        setBaseline({ name, config: currentConfig });
      })
      .catch((error: Error) => logger.error(`Could not save preset: ${error.message}`));
  };

  const remove = (name: string) => {
    update({ type: "deletePreset", storeKey, name })
      .then(() => setSelectedName((current) => (current === name ? undefined : current)))
      .catch((error: Error) => logger.error(`Could not delete preset: ${error.message}`));
  };

  const trimmedName = tempName.trim();
  const tempNameExists = presets.some((p) => p.name === trimmedName);

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Dropdown isDisabled={isDisabled}>
          <DropdownTrigger>
            <Button
              radius="sm"
              size="sm"
              variant="bordered"
              className="flex-grow justify-between min-w-40"
              endContent={<ChevronDown size={14} />}
              isDisabled={isDisabled}
            >
              <span className="truncate">
                {selected ? `Preset: ${selected.name}${hasUnsavedChanges ? " (modified)" : ""}` : "Load a preset"}
              </span>
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Saved presets"
            disabledKeys={presets.length ? [] : ["none"]}
            onAction={(key) => {
              const preset = presets.find((p) => p.name === key);
              if (preset) {
                setSelectedName(preset.name);
                onLoadConfig(preset.config);
                loadedName.current = preset.name;
                setLoadToken((n) => n + 1);
              }
            }}
          >
            {presets.length ? (
              presets.map((preset) => <DropdownItem key={preset.name}>{preset.name}</DropdownItem>)
            ) : (
              <DropdownItem key="none">No saved presets</DropdownItem>
            )}
          </DropdownMenu>
        </Dropdown>
        <div className="flex items-center gap-2">
          <Tooltip content="Save as a new preset">
            <Button
              radius="sm"
              variant="bordered"
              size="sm"
              isIconOnly
              aria-label="Save as a new preset"
              onPress={() => {
                setTempName("");
                setShowNameModal(true);
              }}
              isDisabled={isDisabled}
            >
              <Save size={14} />
            </Button>
          </Tooltip>
          {selected && hasUnsavedChanges && (
            <Tooltip content={`Save changes to ${selected.name}`}>
              <Button
                radius="sm"
                variant="bordered"
                size="sm"
                isIconOnly
                aria-label={`Save changes to ${selected.name}`}
                onPress={() => save(selected.name)}
                isDisabled={isDisabled}
              >
                <RefreshCcw size={14} />
              </Button>
            </Tooltip>
          )}
          {selected && (
            <Tooltip color="danger" content={`Delete ${selected.name}`}>
              <Button
                radius="sm"
                variant="bordered"
                color="danger"
                size="sm"
                isIconOnly
                aria-label={`Delete preset ${selected.name}`}
                onPress={() => setShowDeleteModal(true)}
              >
                <Trash2 size={14} />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      <Modal isOpen={showNameModal} onOpenChange={setShowNameModal} placement="center">
        <ModalContent>
          {(onClose) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!trimmedName || tempNameExists) return;
                onClose();
                save(trimmedName);
              }}
            >
              <ModalHeader>Save preset</ModalHeader>
              <ModalBody>
                <Input
                  autoFocus
                  label="Preset Name"
                  placeholder="Enter a name for this configuration"
                  variant="bordered"
                  value={tempName}
                  onValueChange={setTempName}
                  isInvalid={tempNameExists}
                  errorMessage="Name already exists"
                  isRequired
                />
              </ModalBody>
              <ModalFooter>
                <Button radius="sm" color="danger" variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button radius="sm" color="primary" type="submit" isDisabled={!trimmedName || tempNameExists}>
                  Save as new entry
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>
      <Modal isOpen={showDeleteModal} onOpenChange={setShowDeleteModal} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete preset</ModalHeader>
              <ModalBody>
                <p className="text-sm">Delete the preset &quot;{selected?.name}&quot;?</p>
              </ModalBody>
              <ModalFooter>
                <Button radius="sm" variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  radius="sm"
                  color="danger"
                  onPress={() => {
                    onClose();
                    if (selected) remove(selected.name);
                  }}
                >
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default ConfigStore;
