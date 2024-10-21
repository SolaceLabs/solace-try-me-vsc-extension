import { Button, Input, Switch, Tooltip } from "@nextui-org/react";
import { Info } from "lucide-react";

import {
  ModalBody,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "../Shared/components/Modal";
import { useSettings } from "../Shared/components/SettingsContext";
import { DEFAULT_SETTINGS } from "../Shared/constants";

const getInteger = (value: string, min = 0) => {
  return Math.max(Math.abs(parseInt(value) || 0), min);
};

const SettingsView = ({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) => {
  const {
    settings: {
      maxDisplayMessages,
      maxPayloadLength,
      maxPropertyLength,
      brokerDisconnectTimeout,
      savePayloads,
      payloadBasePath,
    },
    setSettings,
  } = useSettings();

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <Modal
      isOpen={show}
      placement="center"
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        {(onModalClose) => (
          <>
            <ModalHeader>Solace Try Me Extension Settings</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input
                type="number"
                label="Maximum number of visible messages"
                endContent={
                  <Tooltip content="Maximum number of messages that can be displayed in the subscribe view.">
                    <Info />
                  </Tooltip>
                }
                value={maxDisplayMessages.toString()}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxDisplayMessages: getInteger(e.target.value, 1),
                  }))
                }
                max={100}
                min={1}
                step={1}
              />
              <Input
                type="number"
                label="Maximum visible payload length"
                endContent={
                  <Tooltip content="Maximum length of the payload that can be displayed before truncation. You can still open the message in VSC">
                    <Info />
                  </Tooltip>
                }
                value={maxPayloadLength.toString()}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxPayloadLength: getInteger(e.target.value, 1),
                  }))
                }
                min={100}
                step={50}
              />
              <Input
                type="number"
                label="Maximum visible property length"
                endContent={
                  <Tooltip content="Maximum length of the message properties (metadata and user properties) that can be displayed before truncation. You can still open the message in VSC">
                    <Info />
                  </Tooltip>
                }
                value={maxPropertyLength.toString()}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxPropertyLength: getInteger(e.target.value, 5),
                  }))
                }
                min={5}
                step={5}
              />
              <Input
                type="number"
                className="no-wrap"
                label="Broker disconnection timeout"
                endContent={
                  <Tooltip content="Time in minutes after which the broker connection will be automatically disconnected if there is no activity.">
                    <Info />
                  </Tooltip>
                }
                value={(brokerDisconnectTimeout / 1000 / 60).toString()}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    brokerDisconnectTimeout:
                      getInteger(e.target.value, 1) * 1000 * 60,
                  }))
                }
                min={1}
                step={1}
              />
              <Switch
                isSelected={savePayloads}
                onValueChange={(savePayloads) => {
                  setSettings((prev) => ({
                    ...prev,
                    savePayloads,
                  }));
                }}
              >
                <div className="flex align-center gap-3">
                  Save payloads on open
                  <Tooltip content="Whether to save the payload to a new file or an unsaved file when clicked on open payload in VSC.">
                    <Info />
                  </Tooltip>
                </div>
              </Switch>
              <Input
                type="text"
                label="Payload storage directory"
                endContent={
                  <Tooltip content="You can use relative and absolute paths. Relative paths would be based on the VS Code location">
                    <Info />
                  </Tooltip>
                }
                isDisabled={!savePayloads}
                value={payloadBasePath || ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    payloadBasePath: e.target.value,
                  }))
                }
              />
            </ModalBody>
            <ModalFooter>
              <Button
                radius="sm"
                color="danger"
                variant="light"
                onPress={onModalClose}
              >
                Close
              </Button>
              <Button
                radius="sm"
                color="secondary"
                variant="light"
                onPress={resetSettings}
              >
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
