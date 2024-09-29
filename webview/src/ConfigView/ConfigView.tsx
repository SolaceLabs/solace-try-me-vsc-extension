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
import { Pencil, Trash2 } from "lucide-react";

import { BrokerConfig } from "../Shared/interfaces";
import { getVscConfig, setVscConfig } from "../Shared/utils";
import ConfigModal from "./ConfigModal";

const ConfigView = () => {
  const [brokerConfigs, setBrokerConfigs] = useState<BrokerConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<BrokerConfig | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setBrokerConfigs(getVscConfig()?.brokerConfigs || []);
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
        <Button
          size="sm"
          onClick={() => {
            setSelectedConfig(null);
            setShowModal(true);
          }}
        >
          New Config
        </Button>
      </div>
      <ConfigModal
        show={showModal}
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
          setShowModal(false);
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
          <TableColumn>VPN</TableColumn>
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
                  <span
                    className="text-lg text-default-400 cursor-pointer active:opacity-50"
                    onClick={() => {
                      setSelectedConfig(broker);
                      setShowModal(true);
                    }}
                  >
                    <Pencil />
                  </span>
                </Tooltip>
                <Tooltip color="danger" content="Delete Broker Config">
                  <span
                    className="text-lg text-danger cursor-pointer active:opacity-50"
                    onClick={() => deleteConfig(broker.id)}
                  >
                    <Trash2 />
                  </span>
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
