import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@nextui-org/react";
import { Eye, EyeOff } from "lucide-react";

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
    setDisableSave(!title || !url || !vpn || !username || !password);
  }, [title, url, vpn, username, password]);

  return (
    <Modal
      isOpen={show}
      placement="center"
      onOpenChange={(open) => {
        if (!open) {
          onClose(null);
        }
      }}
    >
      <ModalContent>
        {(onModalClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              Modal Title
            </ModalHeader>
            <ModalBody>
              <Input
                type="text"
                label="Title"
                value={title}
                onValueChange={setTitle}
              />
              <Input
                type="url"
                label="URL"
                value={url}
                onValueChange={setUrl}
              />
              <Input
                type="text"
                label="VPN"
                value={vpn}
                onValueChange={setVpn}
              />
              <Input
                type="text"
                label="Username"
                value={username}
                onValueChange={setUsername}
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
              <Button color="danger" variant="light" onPress={onModalClose}>
                Close
              </Button>
              <Button
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
