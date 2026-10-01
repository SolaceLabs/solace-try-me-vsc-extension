import { useState } from "react";
import {
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from "@nextui-org/react";
import { Pencil, Trash2, RefreshCcw, Settings, KeyRound } from "lucide-react";

import { BrokerConfig } from "../Shared/interfaces";
import ConfigModal, { BrokerEdit } from "./ConfigModal";
import SettingsView from "./SettingsView";
import { usePreferences } from "../Shared/components/SettingsContext";
import { createUid } from "../Shared/messageCodec";
import { logger } from "../Shared/logger";
import ErrorMessage from "../Shared/components/ErrorMessage";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "../Shared/components/Modal";
import type { StoredBroker } from "../../../src/shared/preferences";

const ConfigView = () => {
  const { preferences, update, refresh } = usePreferences();
  const brokerConfigs = preferences.brokerConfigs;
  const [selectedConfig, setSelectedConfig] = useState<BrokerConfig | null>(null);
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrokerConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveBroker = (edit: BrokerEdit) => {
    const broker = { ...edit.broker, id: edit.broker.id || createUid() };
    setError(null);
    update({
      type: "upsertBroker",
      broker: broker as unknown as StoredBroker,
      password: edit.password,
      clearPassword: edit.clearPassword,
    }).catch((e: Error) => {
      logger.error(`Could not save broker profile: ${e.message}`);
      setError(`Could not save the broker profile: ${e.message}`);
    });
  };

  const deleteBroker = (broker: BrokerConfig) => {
    update({ type: "deleteBroker", id: broker.id }).catch((e: Error) =>
      setError(`Could not delete the broker profile: ${e.message}`)
    );
  };

  return (
    <div>
      <div className="flex justify-between align-center mb-2">
        <h2>Solace Broker Configurations</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-2 justify-between w-full">
            <Tooltip content="Reload configurations">
              <Button radius="sm" size="sm" isIconOnly className="w-full" aria-label="Reload configurations" onPress={() => refresh()}>
                <RefreshCcw size={14} />
              </Button>
            </Tooltip>
            <Tooltip content="Extension Settings">
              <Button
                radius="sm"
                size="sm"
                isIconOnly
                className="w-full"
                aria-label="Extension settings"
                onPress={() => setShowSettingsModal(true)}
              >
                <Settings size={14} />
              </Button>
            </Tooltip>
          </div>
          <Button
            radius="sm"
            size="sm"
            className="w-full"
            onPress={() => {
              setSelectedConfig(null);
              setShowBrokerModal(true);
            }}
          >
            New Config
          </Button>
        </div>
      </div>
      <SettingsView show={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
      <ConfigModal
        show={showBrokerModal}
        initialConfig={selectedConfig}
        onClose={(edit) => {
          if (edit) saveBroker(edit);
          setShowBrokerModal(false);
        }}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <Table
        aria-label="Broker Configurations List"
        classNames={{
          base: "max-h-[300px] overflow-y-auto",
        }}
        isHeaderSticky
        isCompact
      >
        <TableHeader>
          <TableColumn>Title</TableColumn>
          <TableColumn>Message VPN</TableColumn>
          <TableColumn>User</TableColumn>
          <TableColumn>Actions</TableColumn>
        </TableHeader>
        <TableBody emptyContent={"No rows to display."}>
          {brokerConfigs.map((broker) => (
            <TableRow key={broker.id}>
              <TableCell>
                <span className="flex items-center gap-1">
                  {broker.title}
                  {broker.savePassword === false && (
                    <Tooltip content="Asks for the password when connecting">
                      <KeyRound size={12} className="text-default-400" />
                    </Tooltip>
                  )}
                </span>
              </TableCell>
              <TableCell>{broker.vpn}</TableCell>
              <TableCell>{broker.username}</TableCell>
              <TableCell className="flex gap-2">
                <Tooltip content="Edit Broker Config">
                  <Button
                    radius="sm"
                    isIconOnly
                    className="text-default-400 active:opacity-50"
                    variant="light"
                    aria-label={`Edit ${broker.title}`}
                    onPress={() => {
                      setSelectedConfig(broker);
                      setShowBrokerModal(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                </Tooltip>
                <Tooltip color="danger" content="Delete Broker Config">
                  <Button
                    radius="sm"
                    isIconOnly
                    className="text-danger active:opacity-50"
                    variant="light"
                    aria-label={`Delete ${broker.title}`}
                    onPress={() => setPendingDelete(broker)}
                  >
                    <Trash2 />
                  </Button>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Modal isOpen={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete broker profile</ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Delete &quot;{pendingDelete?.title}&quot; and its saved password? Open connections stay
                  connected until you disconnect them.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button radius="sm" variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  radius="sm"
                  color="danger"
                  onPress={() => {
                    if (pendingDelete) deleteBroker(pendingDelete);
                    onClose();
                  }}
                >
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ConfigView;
