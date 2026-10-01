/**
 * Bridge to the extension host. In VS Code it talks to the host over postMessage; in a
 * plain browser (`npm run dev`) a mock backed by localStorage stands in for the host.
 */
import {
  applyPreferencesOp,
  brokerSecretKey,
  DEFAULT_LOCALHOST_BROKER,
  DEFAULT_LOCALHOST_PASSWORD,
  normalizeStoredPreferences,
  PreferencesOp,
  StoredPreferences,
  withoutSecrets,
} from "../../../src/shared/preferences";

interface VsCodeApi {
  getState(): unknown;
  setState(state: unknown): void;
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export interface HostMessage {
  command: string;
  [key: string]: unknown;
}

type Handler = (message: HostMessage) => void;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class HostBridge {
  readonly isBrowser: boolean;
  private readonly api: VsCodeApi;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor() {
    let api: VsCodeApi;
    let isBrowser = false;
    try {
      api = acquireVsCodeApi();
    } catch {
      isBrowser = true;
      api = createBrowserMock((message) => this.receive(message));
    }
    this.api = api;
    this.isBrowser = isBrowser;
    window.addEventListener("message", (event: MessageEvent) => this.receive(event.data));
  }

  /** Request/response call to the host. */
  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The extension did not answer "${method}" in time.`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.api.postMessage({ command: "rpc", id, method, params });
    });
  }

  /** Fire-and-forget message to the host. */
  post(command: string, payload: Record<string, unknown> = {}) {
    this.api.postMessage({ command, ...payload });
  }

  on(command: string, handler: Handler): () => void {
    let set = this.handlers.get(command);
    if (!set) {
      set = new Set();
      this.handlers.set(command, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Per-webview UI state that survives the webview being re-created. */
  getState<T>(): T | undefined {
    try {
      return (this.api.getState() as T) ?? undefined;
    } catch {
      return undefined;
    }
  }

  setState(state: unknown) {
    try {
      this.api.setState(state);
    } catch {
      // Ignore: UI state persistence is best effort.
    }
  }

  private receive(message: unknown) {
    if (!message || typeof message !== "object") return;
    const msg = message as HostMessage;
    if (msg.command === "rpc/response") {
      const id = msg.id as number;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      if (typeof msg.error === "string") {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    this.handlers.get(msg.command)?.forEach((handler) => {
      try {
        handler(msg);
      } catch (error) {
        console.error(`Handler for ${msg.command} failed`, error);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Browser mock, used only when the app runs outside VS Code.
// ---------------------------------------------------------------------------

const MOCK_PREFS_KEY = "vscConfig";
const MOCK_SECRETS_KEY = "vscSecrets";
const MOCK_STATE_KEY = "vscWebviewState";
const MOCK_SECRET_NAMESPACE = "browser";

function createBrowserMock(deliver: (message: HostMessage) => void): VsCodeApi {
  console.info("Using mock vscode API");

  const readSecrets = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(MOCK_SECRETS_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const writeSecrets = (secrets: Record<string, string>) =>
    localStorage.setItem(MOCK_SECRETS_KEY, JSON.stringify(secrets));

  const readPrefs = (): StoredPreferences => {
    const raw = localStorage.getItem(MOCK_PREFS_KEY);
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      parsed = undefined;
    }
    const prefs = normalizeStoredPreferences(parsed);
    if (parsed === undefined) {
      writeSecrets({
        ...readSecrets(),
        [brokerSecretKey(MOCK_SECRET_NAMESPACE, DEFAULT_LOCALHOST_BROKER.id)]: DEFAULT_LOCALHOST_PASSWORD,
      });
      prefs.brokerConfigs.forEach((b) => (b.hasPassword = true));
      localStorage.setItem(MOCK_PREFS_KEY, JSON.stringify(prefs));
    }
    return prefs;
  };

  const broadcast = (prefs: StoredPreferences) =>
    deliver({ command: "preferences/changed", preferences: withoutSecrets(prefs) });

  // Other browser tabs act like other webviews.
  window.addEventListener("storage", (event) => {
    if (event.key === MOCK_PREFS_KEY) broadcast(readPrefs());
  });

  const handle = async (method: string, params: Record<string, unknown>) => {
    switch (method) {
      case "preferences/get":
        return withoutSecrets(readPrefs());
      case "preferences/update": {
        const op = params.op as PreferencesOp;
        const secrets = readSecrets();
        const current = readPrefs();
        if (op.type === "upsertBroker") {
          const key = brokerSecretKey(MOCK_SECRET_NAMESPACE, op.broker.id);
          const existing = current.brokerConfigs.find((b) => b.id === op.broker.id);
          if (op.clearPassword || op.broker.savePassword === false) {
            delete secrets[key];
            op.broker.hasPassword = false;
          } else if (typeof op.password === "string") {
            if (op.password) secrets[key] = op.password;
            else delete secrets[key];
            op.broker.hasPassword = !!op.password;
          } else {
            op.broker.hasPassword = existing?.hasPassword === true;
          }
        } else if (op.type === "deleteBroker") {
          delete secrets[brokerSecretKey(MOCK_SECRET_NAMESPACE, op.id)];
        }
        writeSecrets(secrets);
        const next = applyPreferencesOp(current, op);
        localStorage.setItem(MOCK_PREFS_KEY, JSON.stringify(next));
        broadcast(next);
        return withoutSecrets(next);
      }
      case "secrets/getBrokerPassword":
        return readSecrets()[brokerSecretKey(MOCK_SECRET_NAMESPACE, String(params.id))];
      case "file/open": {
        const win = window.open("", "_blank");
        if (win) {
          const pre = win.document.createElement("pre");
          pre.textContent = String(params.content ?? "");
          win.document.body.appendChild(pre);
        }
        return null;
      }
      case "broker/resolveUrl":
        return params.url;
      case "clipboard/write":
        await navigator.clipboard?.writeText(String(params.text ?? ""));
        return null;
      case "env/info":
        return {
          viewLabel: "Browser",
          remoteName: null,
          uiKind: "web",
          appName: "Browser mock",
          vscodeVersion: "n/a",
          extensionVersion: "dev",
        };
      case "command/run":
        console.info("Mock host: run command", params.command);
        return null;
      default:
        throw new Error(`Unknown request: ${method}`);
    }
  };

  return {
    getState: () => {
      try {
        const raw = sessionStorage.getItem(MOCK_STATE_KEY);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    },
    setState: (state: unknown) => sessionStorage.setItem(MOCK_STATE_KEY, JSON.stringify(state)),
    postMessage: (message: unknown) => {
      const msg = message as HostMessage;
      if (msg.command === "rpc") {
        handle(String(msg.method), (msg.params ?? {}) as Record<string, unknown>).then(
          (result) => deliver({ command: "rpc/response", id: msg.id, result }),
          (error: Error) => deliver({ command: "rpc/response", id: msg.id, error: error.message })
        );
      } else if (msg.command === "log") {
        for (const entry of (msg.entries as { level: string; message: string }[]) ?? []) {
          const fn = (console as unknown as Record<string, (...a: unknown[]) => void>)[entry.level] ?? console.log;
          fn(`[${(entry as { role?: string }).role ?? "app"}] ${entry.message}`);
        }
      }
    },
  };
}

export const host = new HostBridge();
