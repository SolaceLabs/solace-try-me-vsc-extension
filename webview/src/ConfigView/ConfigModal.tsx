import { Button, Checkbox, Input, Radio, RadioGroup, Spinner, Switch } from "@nextui-org/react";
import { Eye, EyeOff } from "lucide-react";
import { useRef, useState } from "react";

import { ModalBody, Modal, ModalContent, ModalFooter, ModalHeader } from "../Shared/components/Modal";
import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import { BrokerAuthScheme, BrokerConfig, BrokerSessionOptions } from "../Shared/interfaces";
import { BROKER_FIELD_LIMITS } from "../Shared/constants";
import { validateBrokerUrl } from "../Shared/brokerValidation";
import { host } from "../Shared/host";
import { testConnection, TestConnectionResult } from "../Shared/testConnection";
import { usePreferences } from "../Shared/components/SettingsContext";

export interface BrokerEdit {
  broker: BrokerConfig;
  /** New password to save; undefined keeps the saved one. */
  password?: string;
  clearPassword?: boolean;
}

interface FormState {
  title: string;
  url: string;
  vpn: string;
  authScheme: BrokerAuthScheme;
  username: string;
  password: string;
  savePassword: boolean;
  clearPassword: boolean;
  clientName: string;
  connectTimeout: string;
  connectRetries: string;
  reconnectRetries: string;
  reconnectWait: string;
  reapplySubscriptions: boolean;
  forwardLoopbackInRemote: boolean;
}

const toForm = (config: BrokerConfig | null): FormState => {
  const options = config?.sessionOptions ?? {};
  const str = (value: number | undefined) => (value === undefined ? "" : String(value));
  return {
    title: config?.title ?? "",
    url: config?.url ?? "",
    vpn: config?.vpn ?? "",
    authScheme: config?.authScheme === "clientCertificate" ? "clientCertificate" : "basic",
    username: config?.username ?? "",
    // Saved passwords stay in SecretStorage and are never shown.
    password: config?.password ?? "",
    savePassword: config?.savePassword !== false,
    clearPassword: false,
    clientName: options.clientName ?? "",
    connectTimeout: str(options.connectTimeoutInMsecs),
    connectRetries: str(options.connectRetries),
    reconnectRetries: str(options.reconnectRetries),
    reconnectWait: str(options.reconnectRetryWaitInMsecs),
    reapplySubscriptions: options.reapplySubscriptions !== false,
    forwardLoopbackInRemote: options.forwardLoopbackInRemote === true,
  };
};

const intOrUndefined = (value: string, min: number) => {
  const trimmed = value.trim();
  if (!trimmed) return { value: undefined, error: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < min) return { value: undefined, error: `Enter a whole number ≥ ${min}.` };
  return { value: n, error: null };
};

const ConfigModal = ({
  show,
  onClose,
  initialConfig,
}: {
  show: boolean;
  onClose: (edit: BrokerEdit | null) => void;
  initialConfig: BrokerConfig | null;
}) => {
  const { env } = usePreferences();
  const [form, setForm] = useState<FormState>(() => toForm(initialConfig));
  const [openedFor, setOpenedFor] = useState<{ show: boolean; config: BrokerConfig | null }>({
    show,
    config: initialConfig,
  });
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  // Results of a test started for an earlier dialog are ignored.
  const testRun = useRef(0);

  // Start from the config being edited (or an empty form) every time the dialog opens.
  if (openedFor.show !== show || openedFor.config !== initialConfig) {
    setOpenedFor({ show, config: initialConfig });
    testRun.current++;
    setTesting(false);
    if (show) {
      setForm(toForm(initialConfig));
      setTestResult(null);
      setVisiblePassword(false);
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isEdit = !!initialConfig?.id;
  const hasSavedPassword = isEdit && initialConfig?.hasPassword === true;
  const clientCertificate = form.authScheme === "clientCertificate";

  const urlError = form.url.trim() ? validateBrokerUrl(form.url, { secureOnly: clientCertificate }) : null;
  const vpnError = form.vpn.trim().length > BROKER_FIELD_LIMITS.vpn ? `At most ${BROKER_FIELD_LIMITS.vpn} characters.` : null;
  const userError =
    form.username.trim().length > BROKER_FIELD_LIMITS.username ? `At most ${BROKER_FIELD_LIMITS.username} characters.` : null;
  const passwordError =
    !clientCertificate && form.password.length > BROKER_FIELD_LIMITS.password
      ? `At most ${BROKER_FIELD_LIMITS.password} characters.`
      : null;
  const clientNameError =
    form.clientName.trim().length > BROKER_FIELD_LIMITS.clientName ? `At most ${BROKER_FIELD_LIMITS.clientName} characters.` : null;
  const connectTimeout = intOrUndefined(form.connectTimeout, 100);
  const connectRetries = intOrUndefined(form.connectRetries, 0);
  const reconnectRetries = intOrUndefined(form.reconnectRetries, -1);
  const reconnectWait = intOrUndefined(form.reconnectWait, 0);

  const isInvalid =
    !form.title.trim() ||
    !form.url.trim() ||
    !form.vpn.trim() ||
    // With a client certificate the broker can take the username from the certificate.
    (!clientCertificate && !form.username.trim()) ||
    !!(urlError || vpnError || userError || passwordError || clientNameError) ||
    !!(connectTimeout.error || connectRetries.error || reconnectRetries.error || reconnectWait.error);

  const buildBroker = (): BrokerConfig => {
    const sessionOptions: BrokerSessionOptions = {
      clientName: form.clientName.trim() || undefined,
      connectTimeoutInMsecs: connectTimeout.value,
      connectRetries: connectRetries.value,
      reconnectRetries: reconnectRetries.value,
      reconnectRetryWaitInMsecs: reconnectWait.value,
      reapplySubscriptions: form.reapplySubscriptions ? undefined : false,
      forwardLoopbackInRemote: form.forwardLoopbackInRemote ? true : undefined,
    };
    const hasOptions = Object.values(sessionOptions).some((v) => v !== undefined);
    return {
      id: initialConfig?.id ?? "",
      title: form.title.trim(),
      url: form.url.split(",").map((u) => u.trim()).filter(Boolean).join(","),
      vpn: form.vpn.trim(),
      username: form.username.trim(),
      authScheme: clientCertificate ? "clientCertificate" : undefined,
      savePassword: clientCertificate || form.savePassword ? undefined : false,
      sessionOptions: hasOptions ? JSON.parse(JSON.stringify(sessionOptions)) : undefined,
    };
  };

  const runTest = async () => {
    const run = ++testRun.current;
    setTesting(true);
    setTestResult(null);
    try {
      let password = clientCertificate ? "" : form.password;
      if (!clientCertificate && !password && form.savePassword && hasSavedPassword && !form.clearPassword) {
        password = (await host.request<string | undefined>("secrets/getBrokerPassword", { id: initialConfig!.id })) ?? "";
      }
      const result = await testConnection({ ...buildBroker(), id: initialConfig?.id ?? "test" }, password, env?.remoteName);
      if (run === testRun.current) setTestResult(result);
    } finally {
      if (run === testRun.current) setTesting(false);
    }
  };

  const close = () => {
    setTestResult(null);
    setVisiblePassword(false);
    onClose(null);
  };

  return (
    <Modal isOpen={show} placement="center" scrollBehavior="inside" onOpenChange={(open) => !open && close()}>
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{isEdit ? "Edit Solace Broker Configuration" : "Add Solace Broker Configuration"}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input type="text" label="Title" value={form.title} onValueChange={(v) => set("title", v)} isRequired />
              <Input
                type="text"
                label="URL"
                placeholder={clientCertificate ? "wss://broker.example.com:443" : "ws://localhost:8008"}
                description="Web transport URL. Separate several hosts with commas for failover."
                value={form.url}
                onValueChange={(v) => set("url", v)}
                isInvalid={!!urlError}
                errorMessage={urlError}
                isRequired
              />
              <Input
                type="text"
                label="Message VPN"
                value={form.vpn}
                onValueChange={(v) => set("vpn", v)}
                isInvalid={!!vpnError}
                errorMessage={vpnError}
                isRequired
              />
              <RadioGroup
                label="Authentication"
                orientation="horizontal"
                size="sm"
                value={form.authScheme}
                onValueChange={(v) => set("authScheme", v as BrokerAuthScheme)}
              >
                <Radio value="basic">Username and password</Radio>
                <Radio value="clientCertificate">Client certificate</Radio>
              </RadioGroup>
              {clientCertificate && (
                <div className="text-xs text-default-500 -mt-2 flex flex-col gap-1">
                  <p>
                    VS Code presents a client certificate from your operating system&apos;s certificate store
                    during the TLS handshake: Keychain on macOS, the personal certificate store on Windows, the
                    NSS database (~/.pki/nssdb) on Linux. Install the certificate together with its private key.
                    If several certificates match the CAs the broker asks for, the first one is used.
                  </p>
                  <p>
                    On macOS, allow VS Code to use the key when asked. To choose between several certificates, add
                    an identity preference for https://&lt;broker host&gt; to the certificate in Keychain Access.
                  </p>
                  <p>Certificate and key files (PFX, PEM) cannot be selected here.</p>
                  {hasSavedPassword && <p className="text-warning">The saved password is removed when you save.</p>}
                </div>
              )}
              <Input
                type="text"
                label="Username"
                description={
                  clientCertificate
                    ? "Optional. Leave empty to use the username the broker takes from the certificate (its common name by default)."
                    : undefined
                }
                value={form.username}
                onValueChange={(v) => set("username", v)}
                isInvalid={!!userError}
                errorMessage={userError}
                isRequired={!clientCertificate}
              />
              {!clientCertificate && (
                <>
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
                    placeholder={hasSavedPassword && !form.clearPassword ? "Saved. Leave empty to keep it." : undefined}
                    description={
                      form.savePassword
                        ? "Saved in your operating system's keychain via VS Code SecretStorage."
                        : "Not saved: used for Test connection only. You will be asked for it when connecting."
                    }
                    value={form.password}
                    onValueChange={(v) => set("password", v)}
                    isDisabled={form.savePassword && form.clearPassword}
                    isInvalid={!!passwordError}
                    errorMessage={passwordError}
                  />
                  <div className="flex flex-wrap gap-4">
                    <Switch size="sm" isSelected={form.savePassword} onValueChange={(v) => set("savePassword", v)}>
                      Save password
                    </Switch>
                    {hasSavedPassword && form.savePassword && (
                      <Checkbox size="sm" isSelected={form.clearPassword} onValueChange={(v) => set("clearPassword", v)}>
                        Remove saved password
                      </Checkbox>
                    )}
                  </div>
                </>
              )}
              <Accordion isCompact>
                <AccordionItem key="advanced" aria-label="advanced session settings" subtitle="Advanced session settings">
                  <div className="flex flex-col gap-3 pl-1">
                    <Input
                      size="sm"
                      label="Client name"
                      placeholder="try-me-vsc/{role}/{random}"
                      description="{role} becomes publish or subscribe; {random} keeps names unique."
                      value={form.clientName}
                      onValueChange={(v) => set("clientName", v)}
                      isInvalid={!!clientNameError}
                      errorMessage={clientNameError}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        size="sm"
                        type="number"
                        label="Connect timeout (ms)"
                        placeholder="10000"
                        value={form.connectTimeout}
                        onValueChange={(v) => set("connectTimeout", v)}
                        isInvalid={!!connectTimeout.error}
                        errorMessage={connectTimeout.error}
                      />
                      <Input
                        size="sm"
                        type="number"
                        label="Connect retries"
                        placeholder="1"
                        value={form.connectRetries}
                        onValueChange={(v) => set("connectRetries", v)}
                        isInvalid={!!connectRetries.error}
                        errorMessage={connectRetries.error}
                      />
                      <Input
                        size="sm"
                        type="number"
                        label="Reconnect retries"
                        placeholder="20"
                        description="-1 retries forever"
                        value={form.reconnectRetries}
                        onValueChange={(v) => set("reconnectRetries", v)}
                        isInvalid={!!reconnectRetries.error}
                        errorMessage={reconnectRetries.error}
                      />
                      <Input
                        size="sm"
                        type="number"
                        label="Reconnect wait (ms)"
                        placeholder="3000"
                        value={form.reconnectWait}
                        onValueChange={(v) => set("reconnectWait", v)}
                        isInvalid={!!reconnectWait.error}
                        errorMessage={reconnectWait.error}
                      />
                    </div>
                    <Switch
                      size="sm"
                      isSelected={form.reapplySubscriptions}
                      onValueChange={(v) => set("reapplySubscriptions", v)}
                    >
                      Re-apply subscriptions after reconnecting
                    </Switch>
                    <Switch
                      size="sm"
                      isSelected={form.forwardLoopbackInRemote}
                      onValueChange={(v) => set("forwardLoopbackInRemote", v)}
                    >
                      Forward through VS Code in remote windows
                    </Switch>
                    <p className="text-xs text-default-500 -mt-2">
                      For SSH, WSL, Dev Containers and Codespaces: turn on when the broker runs in the remote
                      workspace (e.g. ws://localhost:8008 there). Leave off when it runs on this machine.
                    </p>
                  </div>
                </AccordionItem>
              </Accordion>
              {testResult && (
                <div
                  className={`text-xs rounded-md p-2 ${testResult.ok ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger"}`}
                  role="status"
                >
                  {testResult.ok ? (
                    <p>
                      Connected in {testResult.ms} ms
                      {testResult.info?.routerName ? ` to ${testResult.info.routerName}` : ""}
                      {testResult.info?.brokerVersion ? ` (${testResult.info.brokerVersion})` : ""}.
                    </p>
                  ) : (
                    <>
                      <p>{testResult.error}</p>
                      {testResult.hint && <p className="mt-1 opacity-80">{testResult.hint}</p>}
                    </>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter className="flex-wrap">
              <Button
                radius="sm"
                variant="bordered"
                onPress={runTest}
                isDisabled={isInvalid || testing}
                startContent={testing ? <Spinner size="sm" color="current" /> : undefined}
              >
                Test connection
              </Button>
              <div className="flex-grow" />
              <Button radius="sm" color="danger" variant="light" onPress={close}>
                Close
              </Button>
              <Button
                radius="sm"
                color="primary"
                isDisabled={isInvalid}
                onPress={() => {
                  const broker = buildBroker();
                  const edit: BrokerEdit = { broker };
                  if (form.clearPassword || (clientCertificate && hasSavedPassword)) {
                    edit.clearPassword = true;
                  } else if (!clientCertificate && form.savePassword && (form.password || !hasSavedPassword)) {
                    edit.password = form.password;
                  }
                  setTestResult(null);
                  setVisiblePassword(false);
                  onClose(edit);
                }}
              >
                {isEdit ? "Save" : "Create"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ConfigModal;
