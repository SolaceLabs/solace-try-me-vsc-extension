import { Select, SelectItem } from "@nextui-org/react";
import { useEffect, useState } from "react";
import { getVscConfig } from "../utils";
import { BrokerConfig } from "../interfaces";

interface BrokerSelectProps {
  onBrokerSelect: (broker: BrokerConfig) => void;
}

const BrokerSelect = ({ onBrokerSelect }: BrokerSelectProps) => {
  const [brokers, setBrokers] = useState<BrokerConfig[]>([]);
  const [currentBroker, setCurrentBroker] = useState<BrokerConfig | null>(null);

  const fetchBrokers = () => {
    // Fetch brokers from vscode
    getVscConfig().then((state) => {
      if (state && state.brokerConfigs) {
        setBrokers(state.brokerConfigs);
      }
    });
  };

  useEffect(() => {
    fetchBrokers();
  }, []);

  useEffect(() => {
    if (currentBroker) {
      onBrokerSelect(currentBroker);
    }
  }, [currentBroker, onBrokerSelect]);

  return (
    <Select
      label="Solace Broker Config"
      placeholder="Select a broker"
      className="w-auto flex-grow min-w-40"
      onClick={(open) => open && fetchBrokers()}
      disabledKeys={["no-item-available"]}
      isRequired
      onSelectionChange={(selection) => {
        const values = Array.from(selection);
        if (values.length > 0) {
          const key = values[0];
          const broker = brokers.find((b) => b.id === key);
          if (broker) setCurrentBroker(broker);
        }
      }}
    >
      {brokers.length ? (
        brokers.map((broker) => (
          <SelectItem key={broker.id}>{broker.title}</SelectItem>
        ))
      ) : (
        <SelectItem key="no-item-available">No brokers available</SelectItem>
      )}
    </Select>
  );
};

export default BrokerSelect;
