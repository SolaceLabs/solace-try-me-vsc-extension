import { useEffect, useState } from "react";
import BrokerSelect from "./BrokerSelect";
import { BrokerConfig } from "../interfaces";
import SolaceManager from "../SolaceManager";
import { compareBrokerConfigs } from "../utils";
import { Button, Spinner } from "@nextui-org/react";
import { Link2, Link2Off } from "lucide-react";
import ErrorMessage from "./ErrorMessage";
import { useSettings } from "./SettingsContext";

interface ConnectionManagerProps {
  onSetConnection: (connection: SolaceManager | null) => void;
}

enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
}

const ConnectionManager = ({ onSetConnection }: ConnectionManagerProps) => {
  const { settings } = useSettings();
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
      const solace = new SolaceManager(
        currentBroker,
        settings.brokerDisconnectTimeout
      );
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
  }, [currentBroker, settings.brokerDisconnectTimeout, solaceConnection]);

  useEffect(() => {
    if (solaceConnection) {
      if (connectionState === ConnectionState.CONNECTED) {
        onSetConnection(solaceConnection);
      } else {
        onSetConnection(null);
      }
    }
  }, [connectionState, onSetConnection, solaceConnection]);

  useEffect(() => {
    return () => {
      solaceConnection?.disconnect();
    };
  }, [solaceConnection]);

  const onToggleConnection = () => {
    if (
      connectionState === ConnectionState.CONNECTED ||
      connectionState === ConnectionState.CONNECTING
    ) {
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
    color?: "success";
    variant?: "bordered";
    startContent?: JSX.Element;
    children?: string;
    isLoading?: boolean;
    isDisabled?: boolean;
  } = {
    onClick: onToggleConnection,
    color: "success",
  };
  switch (connectionState) {
    case ConnectionState.CONNECTED:
      buttonProps.variant = "bordered";
      buttonProps.startContent = <Link2 size={24} />;
      buttonProps.children = "Disconnect";
      break;
    case ConnectionState.CONNECTING:
      buttonProps.children = "Connecting";
      buttonProps.startContent = <Spinner color="current" size="sm" />
      break;
    default:
      buttonProps.startContent = <Link2Off size={24} />;
      buttonProps.children = "Connect";
      buttonProps.isDisabled = !currentBroker;
  }

  return (
    <div>
      <div className="flex gap-4 items-center justify-between flex-wrap">
        <BrokerSelect onBrokerSelect={setCurrentBroker} />
        <Button radius="sm" {...buttonProps} />
      </div>
      {connectionError && <ErrorMessage>{connectionError}</ErrorMessage>}
    </div>
  );
};

export default ConnectionManager;
