import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Chip,
  Input,
  Link,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from "@nextui-org/react";
import { Info, Link2, Link2Off, X } from "lucide-react";
import BrokerSelect from "./BrokerSelect";
import { BrokerConfig, ConnectionRole } from "../interfaces";
import SolaceManager, {
  ConnectionInfo,
  ConnectionState,
  ConnectionStatus,
} from "../SolaceManager";
import ErrorMessage from "./ErrorMessage";
import { wrappingChip } from "./chipStyles";
import { usePreferences } from "./SettingsContext";
import { usePersistentState } from "../usePersistentState";
import { host } from "../host";
import { logger } from "../logger";
import { selectClientCertificate } from "../clientCertificate";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "./Modal";

interface ConnectionManagerProps {
  role: ConnectionRole;
  onSetConnection: (connection: SolaceManager | null) => void;
  onStateChange?: (state: ConnectionState) => void;
  /** Shown in the VS Code status bar tooltip. */
  statusExtras?: { topics?: number; consumer?: string };
}

/** Ignore a second click this soon after a state change (double clicks). */
const CLICK_GUARD_MS = 400;

const sessionOptionsKey = (broker?: BrokerConfig) =>
  broker
    ? JSON.stringify([
        broker.url,
        broker.vpn,
        broker.username,
        broker.authScheme ?? "basic",
        broker.sessionOptions ?? null,
      ])
    : "";

const ConnectionManager = ({
  role,
  onSetConnection,
  onStateChange,
  statusExtras,
}: ConnectionManagerProps) => {
  const { preferences, settings, env } = usePreferences();
  const [manager] = useState(() => new SolaceManager(role, settings.brokerDisconnectTimeout));
  const [state, setState] = useState<ConnectionState>(manager.getState());
  const [selectedId, setSelectedId] = usePersistentState<string | undefined>(
    `connection.${role}.brokerId`,
    undefined
  );
  const [preparing, setPreparing] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    broker: BrokerConfig;
    resolve: (password: string | null) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [connectedConfigKey, setConnectedConfigKey] = useState("");
  const lastChange = useRef(0);
  const promptedPasswords = useRef(new Map<string, string>());
  // Bumped to cancel a connect that is still resolving its password or URL.
  const attempt = useRef(0);

  const brokers = preferences.brokerConfigs;
  const selected = brokers.find((b) => b.id === selectedId);
  const status = preparing ? ConnectionStatus.CONNECTING : state.status;

  useEffect(() => {
    const unsubscribe = manager.onStateChange((next) => {
      lastChange.current = Date.now();
      setState(next);
      if (next.status === ConnectionStatus.DISCONNECTED && next.reason === "failed") {
        // Ask again next time: the prompted password may have been wrong.
        const brokerId = manager.getBroker()?.id;
        if (brokerId) promptedPasswords.current.delete(brokerId);
      }
    });
    return () => {
      // A counter, not a DOM ref: bumping it cancels a connect that is still being prepared.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      attempt.current++;
      unsubscribe();
      manager.disconnect("user");
    };
  }, [manager]);

  // Close the session cleanly when the webview goes away.
  useEffect(() => {
    const onPageHide = () => manager.disconnect("user");
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [manager]);

  useEffect(() => {
    manager.setInactivityTimeout(settings.brokerDisconnectTimeout);
  }, [manager, settings.brokerDisconnectTimeout]);

  useEffect(() => {
    // The connection stays usable while the session reconnects; calls fail with a clear message.
    onSetConnection(
      state.status === ConnectionStatus.CONNECTED || state.status === ConnectionStatus.RECONNECTING
        ? manager
        : null
    );
    onStateChange?.(state);
  }, [state, manager, onSetConnection, onStateChange]);

  // Report to the extension host (status bar, notifications, diagnostics).
  useEffect(() => {
    host.post("connection/state", {
      role,
      status,
      brokerTitle: manager.getBroker()?.title ?? selected?.title,
      reason: state.reason,
      error: state.error,
      clientName: manager.getClientName(),
      topics: statusExtras?.topics,
      consumer: statusExtras?.consumer,
    });
  }, [role, status, state, manager, selected?.title, statusExtras?.topics, statusExtras?.consumer]);

  const askPassword = (broker: BrokerConfig) =>
    new Promise<string | null>((resolve) => {
      setPromptValue("");
      setPasswordPrompt({ broker, resolve });
    });

  const connect = useCallback(async () => {
    if (!selected || preparing) return;
    const current = ++attempt.current;
    const cancelled = () => attempt.current !== current;
    setPreparing(true);
    try {
      let password: string | null | undefined;
      if (selected.authScheme === "clientCertificate") {
        // The certificate from the OS store replaces the password.
        password = "";
      } else if (selected.savePassword === false) {
        password = promptedPasswords.current.get(selected.id) ?? (await askPassword(selected));
        if (password === null || cancelled()) return;
        promptedPasswords.current.set(selected.id, password);
      } else {
        password = await host
          .request<string | undefined>("secrets/getBrokerPassword", { id: selected.id })
          .catch((error: Error) => {
            logger.warn(`Could not read the saved password: ${error.message}`);
            return undefined;
          });
      }
      if (cancelled()) return;
      const url = await host
        .request<string>("broker/resolveUrl", {
          url: selected.url,
          forward: selected.sessionOptions?.forwardLoopbackInRemote === true,
        })
        .catch(() => selected.url);
      if (cancelled()) return;
      if (selected.authScheme === "clientCertificate") {
        await selectClientCertificate(url);
        if (cancelled()) return;
      }
      setConnectedConfigKey(sessionOptionsKey(selected));
      manager.connect({
        broker: selected,
        password: password ?? selected.password ?? "",
        url,
        remoteName: env?.remoteName,
      });
    } finally {
      setPreparing(false);
    }
  }, [selected, preparing, manager, env?.remoteName]);

  // Commands from the extension host (notification actions, "Disconnect all").
  useEffect(
    () =>
      host.on("connection/command", (message) => {
        if (message.role && message.role !== role) return;
        if (message.action === "disconnect") {
          attempt.current++;
          manager.disconnect("user");
        } else if (
          message.action === "connect" &&
          manager.getState().status === ConnectionStatus.DISCONNECTED
        ) {
          connect();
        }
      }),
    [role, manager, connect]
  );

  const onToggle = () => {
    if (Date.now() - lastChange.current < CLICK_GUARD_MS) return;
    lastChange.current = Date.now();
    if (status === ConnectionStatus.DISCONNECTED) {
      connect();
    } else {
      attempt.current++;
      manager.disconnect("user");
    }
  };

  const isDisconnected = status === ConnectionStatus.DISCONNECTED;
  const configChanged =
    !isDisconnected && !!selected && connectedConfigKey !== sessionOptionsKey(selected);
  const brokerDeleted = !isDisconnected && !!manager.getBroker() && !selected;

  let button: JSX.Element;
  switch (status) {
    case ConnectionStatus.CONNECTED:
      button = (
        <Button radius="sm" color="success" variant="bordered" startContent={<Link2 size={24} />} onPress={onToggle}>
          Disconnect
        </Button>
      );
      break;
    case ConnectionStatus.CONNECTING:
    case ConnectionStatus.RECONNECTING:
      button = (
        <Button
          radius="sm"
          color="warning"
          variant="flat"
          startContent={<Spinner color="current" size="sm" />}
          endContent={<X size={16} />}
          onPress={onToggle}
          aria-label="Cancel connection"
        >
          {status === ConnectionStatus.RECONNECTING ? "Reconnecting" : "Connecting"}
        </Button>
      );
      break;
    default:
      button = (
        <Button
          radius="sm"
          color="success"
          startContent={<Link2Off size={24} />}
          onPress={onToggle}
          isDisabled={!selected}
        >
          Connect
        </Button>
      );
  }

  const showError = isDisconnected && state.error && state.reason !== "user";
  const isInactivity = state.reason === "inactivity";

  return (
    <div>
      <div className="flex gap-4 items-center justify-between flex-wrap">
        <BrokerSelect
          brokers={brokers}
          selectedId={selectedId}
          onSelect={(id) => {
            promptedPasswords.current.clear();
            setSelectedId(id);
          }}
          isDisabled={!isDisconnected}
        />
        <div className="flex gap-2 items-center">
          {state.status === ConnectionStatus.CONNECTED && <ConnectionInfoButton manager={manager} />}
          {button}
        </div>
      </div>
      {state.status === ConnectionStatus.RECONNECTING && (
        <Chip size="sm" color="warning" variant="flat" className="mt-2" classNames={wrappingChip}>
          Connection interrupted. Reconnecting{state.error ? `: ${state.error}` : "…"}
        </Chip>
      )}
      {configChanged && (
        <p className="text-xs text-warning mt-2">
          This broker profile changed. Disconnect and connect again to use the new settings.
        </p>
      )}
      {brokerDeleted && (
        <p className="text-xs text-warning mt-2">
          This broker profile was deleted. The current connection stays open until you disconnect.
        </p>
      )}
      {showError && (
        <ErrorMessage variant={isInactivity ? "warning" : "error"}>
          <p>{state.error}</p>
          {state.hint && <p className="mt-1 opacity-80">{state.hint}</p>}
          <p className="mt-1">
            <Link
              size="sm"
              className="cursor-pointer"
              onPress={() => host.request("command/run", { command: "solaceTryMeVscExtension.showLogs" })}
            >
              Show logs
            </Link>
          </p>
        </ErrorMessage>
      )}
      <Modal
        isOpen={!!passwordPrompt}
        placement="center"
        onOpenChange={(open) => {
          if (!open && passwordPrompt) {
            passwordPrompt.resolve(null);
            setPasswordPrompt(null);
          }
        }}
      >
        <ModalContent>
          {() => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                passwordPrompt?.resolve(promptValue);
                setPasswordPrompt(null);
              }}
            >
              <ModalHeader>Password for {passwordPrompt?.broker.title}</ModalHeader>
              <ModalBody>
                <Input
                  autoFocus
                  type="password"
                  label="Password"
                  value={promptValue}
                  onValueChange={setPromptValue}
                  description="Kept only until this view is closed."
                />
              </ModalBody>
              <ModalFooter>
                <Button
                  radius="sm"
                  variant="light"
                  color="danger"
                  onPress={() => {
                    passwordPrompt?.resolve(null);
                    setPasswordPrompt(null);
                  }}
                >
                  Cancel
                </Button>
                <Button radius="sm" color="primary" type="submit">
                  Connect
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

const ConnectionInfoButton = ({ manager }: { manager: SolaceManager }) => {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<ConnectionInfo>();

  useEffect(() => {
    if (!open) return;
    setInfo(manager.getConnectionInfo());
    const timer = setInterval(() => setInfo(manager.getConnectionInfo()), 2000);
    return () => clearInterval(timer);
  }, [open, manager]);

  return (
    <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button isIconOnly radius="sm" variant="light" aria-label="Connection details">
          <Info size={18} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-80">
        {info ? (
          <div className="text-xs flex flex-col gap-1 p-1">
            <p className="text-sm font-semibold">Connection details</p>
            <p>Client name: {info.clientName ?? "?"}</p>
            {info.routerName && <p>Router: {info.routerName}</p>}
            {info.brokerVersion && <p>Broker: {info.brokerVersion}</p>}
            {info.platform && <p>Platform: {info.platform}</p>}
            {info.maxDirectMessageSize !== undefined && (
              <p>
                Max message size: {info.maxDirectMessageSize} direct
                {info.maxGuaranteedMessageSize !== undefined && ` / ${info.maxGuaranteedMessageSize} guaranteed`}
              </p>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(info.capabilities).map(([name, supported]) => (
                <Chip key={name} size="sm" variant="flat" color={supported ? "success" : "default"}>
                  {name}
                </Chip>
              ))}
            </div>
            <div className="mt-1">
              {Object.entries(info.stats).map(([name, value]) => (
                <p key={name} className={name === "Discard indications" && value > 0 ? "text-danger" : ""}>
                  {name}: {value}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs p-1">Not connected.</p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ConnectionManager;
