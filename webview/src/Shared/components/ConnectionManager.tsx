import { useEffect, useState } from "react";
import BrokerSelect from "./BrokerSelect";
import { BrokerConfig } from "../interfaces";
import SolaceManager from "../SolaceManager";
import { compareBrokerConfigs } from "../utils";
import { Button } from "@nextui-org/react";
import { Link2, Link2Off } from "lucide-react";

interface ConnectionManagerProps {
  onSetConnection: (connection: SolaceManager | null) => void;
}

enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
}

const ConnectionManager = ({ onSetConnection }: ConnectionManagerProps) => {
  const [currentBroker, setCurrentBroker] = useState<BrokerConfig | null>(null);
  const [connectionState, setConnectionState] = useState(
    ConnectionState.DISCONNECTED
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
      const solace = new SolaceManager(currentBroker);
      setConnectionState(ConnectionState.DISCONNECTED);

      solace.onConnectionStateChange = (
        isConnected: boolean,
        error: string | null
      ) => {
        setConnectionError(error);
        if (isConnected) {
          setConnectionState(ConnectionState.CONNECTED);
        } else {
          setConnectionState(ConnectionState.DISCONNECTED);
        }
      };
      setSolaceConnection(solace);
    }
  }, [currentBroker, solaceConnection]);

  useEffect(() => {
    if (solaceConnection) {
      if (connectionState === ConnectionState.CONNECTED) {
        onSetConnection(solaceConnection);
      } else {
        onSetConnection(null);
      }
    }
  }, [connectionState, onSetConnection, solaceConnection]);

  const onToggleConnection = () => {
    if (connectionState === ConnectionState.CONNECTED) {
      solaceConnection?.disconnect();
    } else {
      if (currentBroker) {
        setConnectionState(ConnectionState.CONNECTING);
        solaceConnection?.connect();
      }
    }
  };

  const buttonProps: {
    onClick: () => void;
    color?: "success" | "danger";
    startContent?: JSX.Element;
    children?: string;
    isLoading?: boolean;
    isDisabled?: boolean;
  } = {
    onClick: onToggleConnection,
  };
  switch (connectionState) {
    case ConnectionState.CONNECTED:
      buttonProps.color = "danger";
      buttonProps.startContent = <Link2 size={24} />;
      buttonProps.children = "Disconnect";
      break;
    case ConnectionState.CONNECTING:
      buttonProps.color = "success";
      buttonProps.isLoading = true;
      buttonProps.children = "Connecting";
      buttonProps.isDisabled = true;
      break;
    default:
      buttonProps.color = "success";
      buttonProps.startContent = <Link2Off size={24} />;
      buttonProps.children = "Connect";
      buttonProps.isDisabled = !currentBroker;
  }

  return (
    <>
      <div className="flex gap-2 items-center justify-between">
        <BrokerSelect onBrokerSelect={setCurrentBroker} />
        <Button {...buttonProps} />
      </div>
      {connectionError && (
        <div className="text-red-500 text-sm p-2">{connectionError}</div>
      )}
    </>
  );
};

export default ConnectionManager;
