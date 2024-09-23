import { useEffect, useState } from "react";
import BrokerSelect from "./BrokerSelect";
import { BrokerConfig } from "../interfaces";
import SolaceManager from "../SolaceManager";
import { compareBrokerConfigs } from "../utils";

interface ConnectionManagerProps {
  onSetConnection: (connection: SolaceManager) => void;
}

const ConnectionManager = ({ onSetConnection }: ConnectionManagerProps) => {
  const [currentBroker, setCurrentBroker] = useState<BrokerConfig | null>(null);
  const [solaceConnection, setSolaceConnection] =
    useState<SolaceManager | null>(null);

  useEffect(() => {
    if (currentBroker) {
      if (solaceConnection) {
        if (
          compareBrokerConfigs(solaceConnection.brokerConfig, currentBroker)
        ) {
          return;
        }
        solaceConnection.disconnect();
      }
      const solace = new SolaceManager();
      solace.connect(currentBroker);
      setSolaceConnection(solace);
      onSetConnection(solace);
    }
  }, [currentBroker, onSetConnection, solaceConnection]);

  return <BrokerSelect onBrokerSelect={setCurrentBroker} />;
};

export default ConnectionManager;
