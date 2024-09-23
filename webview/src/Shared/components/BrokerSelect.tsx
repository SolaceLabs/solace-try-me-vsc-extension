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
    const state = getVscConfig();
    if (state && state.brokerConfigs) {
      setBrokers(state.brokerConfigs);
    }
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
        items={brokers}
        label="Solace Broker Config"
        placeholder="Select a broker"
        className="max-w-xs"
        onOpenChange={(open) => open && fetchBrokers()}
        onSelectionChange={(selection) => {
          const values = Array.from(selection);
          if (values.length > 0) {
            const key = values[0];
            const broker = brokers.find((b) => b.id === key);
            if (broker) setCurrentBroker(broker);
          }
        }}
      >
        {(broker) => <SelectItem key={broker.id}>{broker.title}</SelectItem>}
      </Select>
  );
};

export default BrokerSelect;
