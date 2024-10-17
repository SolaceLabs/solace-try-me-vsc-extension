import { Button, Input } from "@nextui-org/react";

import {
  ModalBody,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "../Shared/components/Modal";
import { useSettings } from "../Shared/components/SettingsContext";
import { DEFAULT_SETTINGS } from "../Shared/constants";

const getInteger = (value: string, min=0) => {
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
            <ModalHeader>
              Solace Try Me Extension Settings
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input
                type="number"
                label="Maximum number of visible messages"
                value={maxDisplayMessages.toString()}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxDisplayMessages: getInteger(e.target.value, 1),
                  }))
                }
                max={1000}
                min={1}
                step={1}
              />
              <Input
                type="number"
                label="Maximum visible payload length"
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
                label="Automatic broker disconnection after inactivity (minutes) "
                value={(brokerDisconnectTimeout / 1000 / 60).toString()}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    brokerDisconnectTimeout: getInteger(e.target.value, 1) * 1000 * 60,
                  }))
                }
                min={1}
                step={1}
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
