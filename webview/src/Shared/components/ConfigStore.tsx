import { useCallback, useEffect, useState } from "react";
import { Button, Tooltip, Select, SelectItem, Input } from "@nextui-org/react";
import { Save, RefreshCcw, Trash2 } from "lucide-react";

import {
  ModalBody,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "./Modal";

import { deepCompareObjects, getVscConfig, setVscConfig } from "../utils";
import { Configs } from "../interfaces";

interface ConfigStoreProps {
  currentConfig: Configs;
  onLoadConfig: (config: Configs) => void;
  storeKey: "publishConfig" | "subscribeConfig";
  isDisabled?: boolean;
}

const ConfigStore = ({
  currentConfig,
  onLoadConfig,
  storeKey,
  isDisabled = false,
}: ConfigStoreProps) => {
  const [lastSavedConfig, setLastSavedConfig] = useState<Configs>();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [existingConfigs, setExistingConfigs] = useState<
    { name: string; config: Configs }[]
  >([]);
  const [selectedConfigName, setSelectedConfigName] = useState<string>();

  const [showNameModal, setShowNameModal] = useState(false);
  const [tempName, setTempName] = useState("");

  useEffect(() => {
    const hasUnchanged =
      lastSavedConfig &&
      selectedConfigName &&
      currentConfig &&
      !deepCompareObjects(lastSavedConfig, currentConfig);
    setHasUnsavedChanges(!!hasUnchanged);
  }, [currentConfig, lastSavedConfig, selectedConfigName]);

  const loadExistingConfigs = useCallback(() => {
    getVscConfig().then((state) => {
      if (state && state.recentlyUsed && state.recentlyUsed[storeKey]) {
        setExistingConfigs(
          state.recentlyUsed[storeKey] as { name: string; config: Configs }[]
        );
      }
    });
  }, [storeKey]);

  useEffect(() => {
    loadExistingConfigs();
  }, [loadExistingConfigs]);

  useEffect(() => {
    if (existingConfigs && existingConfigs.length) {
      setVscConfig((state) => {
        const newState = { ...state };
        (newState.recentlyUsed[storeKey] as {
          name: string;
          config: Configs;
        }[]) = existingConfigs;
        return newState;
      });
    }
  }, [existingConfigs, storeKey]);

  const onConfigSave = (name: string | undefined) => {
    if (!name) {
      console.error("No selected config name");
      return;
    }

    setLastSavedConfig(currentConfig);
    setSelectedConfigName(name);
    setHasUnsavedChanges(false);

    setExistingConfigs((prevConfigs) => {
      if (!prevConfigs) return [{ name, config: currentConfig }];
      const existingConfig = prevConfigs.find((config) => config.name === name);
      if (existingConfig) {
        existingConfig.config = currentConfig;
        return [...prevConfigs];
      }
      return [{ name, config: currentConfig }, ...prevConfigs];
    });
  };

  const deleteConfig = (name: string) => {
    if (name === selectedConfigName) {
      setLastSavedConfig(undefined);
      setSelectedConfigName(undefined);
    }
    setExistingConfigs((prevConfigs) =>
      prevConfigs.filter((config) => config.name !== name)
    );
  };

  const tempNameExists = existingConfigs.some(
    (config) => config.name === tempName
  );

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-4">
        <Select
          label="Preset Configuration"
          placeholder="Load a saved configuration"
          isDisabled={isDisabled}
          size="sm"
          className="w-auto flex-grow min-w-40"
          selectedKeys={
            selectedConfigName &&
            existingConfigs
              .map((config) => config.name)
              .includes(selectedConfigName)
              ? [selectedConfigName]
              : []
          }
          disabledKeys={["no-item-available"]}
          onClick={(open) => open && loadExistingConfigs()}
          onSelectionChange={(keys) => {
            const name = Array.from(keys)[0] as string;
            if (!existingConfigs.map((config) => config.name).includes(name)) {
              setLastSavedConfig(undefined);
              setSelectedConfigName(undefined);
            }

            setSelectedConfigName(name);
            const selectedConfig = existingConfigs.find(
              (config) => config.name === name
            );
            if (selectedConfig) {
              setLastSavedConfig(selectedConfig.config);
              onLoadConfig(selectedConfig.config);
            }
          }}
        >
          {existingConfigs.length ? (
            existingConfigs.map((config) => (
              <SelectItem
                key={config.name}
                endContent={
                  <Button radius="sm"
                    variant="flat"
                    color="danger"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.debug("Deleting config:", config.name);
                      deleteConfig(config.name);
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                }
              >
                {config.name}
              </SelectItem>
            ))
          ) : (
            <SelectItem key="no-item-available">
              No saved configurations
            </SelectItem>
          )}
        </Select>
        <div className="flex items-center gap-2">
          <Tooltip content="Save configuration as new entry">
            <Button radius="sm"
              variant="bordered"
              className="capitalize"
              onClick={() => setShowNameModal(true)}
              isDisabled={isDisabled}
              size="sm"
            >
              <Save size={12} />
            </Button>
          </Tooltip>

          {hasUnsavedChanges && (
            <Tooltip content={`Save changes to ${selectedConfigName}`}>
              <Button radius="sm"
                variant="bordered"
                className="capitalize"
                size="sm"
                onClick={() => onConfigSave(selectedConfigName)}
                isDisabled={isDisabled}
              >
                <RefreshCcw size={16} />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      <Modal
        isOpen={showNameModal}
        onOpenChange={setShowNameModal}
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader />
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
                <Button radius="sm"
                  color="primary"
                  onPress={() => {
                    onClose();
                    onConfigSave(tempName);
                    setTempName("");
                  }}
                  isDisabled={!tempName || tempNameExists}
                >
                  Save as new entry
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
