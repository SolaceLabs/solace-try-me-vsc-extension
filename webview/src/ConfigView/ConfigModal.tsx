import { Button, Input } from "@nextui-org/react";
import { Eye, EyeOff } from "lucide-react";

import {
  ModalBody,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "../Shared/components/Modal";
import { BrokerConfig } from "../Shared/interfaces";
import { useEffect, useState } from "react";

const ConfigModal = ({
  show,
  onClose,
  initialConfig,
}: {
  show: boolean;
  onClose: (config: BrokerConfig | null) => void;
  initialConfig: BrokerConfig | null;
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [vpn, setVpn] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [visiblePassword, setVisiblePassword] = useState(false);
  const [disableSave, setDisableSave] = useState(true);

  useEffect(() => {
    setTitle(initialConfig?.title || "");
    setUrl(initialConfig?.url || "");
    setVpn(initialConfig?.vpn || "");
    setUsername(initialConfig?.username || "");
    setPassword(initialConfig?.password || "");
  }, [initialConfig]);

  useEffect(() => {
    setDisableSave(!title || !url || !vpn || !username);
  }, [title, url, vpn, username]);

  return (
    <Modal
      isOpen={show}
      placement="center"
      onOpenChange={(open) => {
        if (!open) {
          onClose(null);
          setTitle("");
          setUrl("");
          setVpn("");
          setUsername("");
          setPassword("");
        }
      }}
    >
      <ModalContent>
        {(onModalClose) => (
          <>
            <ModalHeader>
              Add Solace Broker Configuration
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input
                type="text"
                label="Title"
                value={title}
                onValueChange={setTitle}
                isRequired
              />
              <Input
                type="url"
                label="URL"
                value={url}
                onValueChange={setUrl}
                isRequired
              />
              <Input
                type="text"
                label="Message VPN"
                value={vpn}
                onValueChange={setVpn}
                isRequired
              />
              <Input
                type="text"
                label="Username"
                value={username}
                onValueChange={setUsername}
                isRequired
              />
              <Input
                type={visiblePassword ? "text" : "password"}
                endContent={
                  <button
                    className="focus:outline-none"
                    type="button"
                    onClick={() => setVisiblePassword(!visiblePassword)}
                    aria-label="toggle password visibility"
                  >
                    {visiblePassword ? (
                      <EyeOff className="text-2xl text-default-400 pointer-events-none" />
                    ) : (
                      <Eye className="text-2xl text-default-400 pointer-events-none" />
                    )}
                  </button>
                }
                label="Password"
                value={password}
                onValueChange={setPassword}
              />
            </ModalBody>
            <ModalFooter>
              <Button radius="sm" color="danger" variant="light" onPress={onModalClose}>
                Close
              </Button>
              <Button radius="sm"
                color="primary"
                isDisabled={disableSave}
                onPress={() => {
                  const newConfig: BrokerConfig = {
                    id: initialConfig?.id || "",
                    title,
                    url,
                    vpn,
                    username,
                    password,
                  };
                  onClose(newConfig);
                  setTitle("");
                  setUrl("");
                  setVpn("");
                  setUsername("");
                  setPassword("");
                }}
              >
                {initialConfig?.id ? "Save" : "Create"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ConfigModal;
