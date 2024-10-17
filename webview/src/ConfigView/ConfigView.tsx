import { useEffect, useState } from "react";
import { Button } from "@nextui-org/button";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from "@nextui-org/react";
import { Pencil, Trash2, RefreshCcw, Settings } from "lucide-react";

import { BrokerConfig } from "../Shared/interfaces";
import { getVscConfig, setVscConfig } from "../Shared/utils";
import ConfigModal from "./ConfigModal";
import SettingsView from "./SettingsView";

const ConfigView = () => {
  const [brokerConfigs, setBrokerConfigs] = useState<BrokerConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<BrokerConfig | null>(
    null
  );
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  useEffect(() => {
    getVscConfig().then((state) => {
      setBrokerConfigs(state?.brokerConfigs || []);
    });
  }, []);

  const updateBrokerConfigs = (brokers: BrokerConfig[]) => {
    setBrokerConfigs(brokers);
    setVscConfig((state) => ({ ...state, brokerConfigs: brokers }));
  };

  const addConfig = (broker: BrokerConfig) => {
    updateBrokerConfigs([...brokerConfigs, broker]);
  };

  const deleteConfig = (id: string) => {
    const newConfigs = brokerConfigs.filter((config) => config.id !== id);
    updateBrokerConfigs(newConfigs);
  };

  return (
    <div>
      <div className="flex justify-between align-center mb-2">
        <h2>Solace Broker Configurations</h2>
        <div className="flex gap-2 flex-wrap">
          <Button
            radius="sm"
            size="sm"
            onClick={() => {
              setSelectedConfig(null);
              setShowBrokerModal(true);
            }}
          >
            New Config
          </Button>
          <Tooltip content="Sync Configurations">
            <Button
              radius="sm"
              size="sm"
              isIconOnly
              onClick={() => {
                getVscConfig().then((state) => {
                  setBrokerConfigs(state?.brokerConfigs || []);
                });
              }}
            >
              <RefreshCcw size={14} />
            </Button>
          </Tooltip>
          <Tooltip content="Extension Settings">
            <Button
              radius="sm"
              size="sm"
              isIconOnly
              onClick={() => setShowSettingsModal(true)}
            >
              <Settings size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>
      <SettingsView show={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
      <ConfigModal
        show={showBrokerModal}
        initialConfig={selectedConfig}
        onClose={(newConfig) => {
          if (newConfig) {
            if (newConfig.id) {
              const newConfigs = brokerConfigs.map((config) =>
                config.id === newConfig.id ? newConfig : config
              );
              updateBrokerConfigs(newConfigs);
            } else {
              newConfig.id = Math.random().toString().slice(2);
              addConfig(newConfig);
            }
          }
          setSelectedConfig(null);
          setShowBrokerModal(false);
        }}
      />
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
              <TableCell>{broker.title}</TableCell>
              <TableCell>{broker.vpn}</TableCell>
              <TableCell>{broker.username}</TableCell>
              <TableCell className="flex gap-2">
                <Tooltip content="Edit Broker Config">
                  <Button
                    radius="sm"
                    isIconOnly
                    className="text-default-400 active:opacity-50"
                    variant="light"
                    onClick={() => {
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
                    onClick={() => deleteConfig(broker.id)}
                  >
                    <Trash2 />
                  </Button>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ConfigView;
