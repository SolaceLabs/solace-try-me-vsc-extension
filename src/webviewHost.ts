import { randomBytes } from "crypto";
import * as vscode from "vscode";
import { ConnectionStateMessage, ConnectionTracker } from "./connections";
import { openContent } from "./fileOpen";
import { PreferencesStore } from "./preferencesStore";
import { PreferencesOp } from "./shared/preferences";

export const SIDE_VIEW_ID = "solaceTryMeVscExtension.sideView";
export const PANEL_VIEW_TYPE = "solaceTryMeVscExtension.newWindow";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

interface ViewEntry {
  id: string;
  label: string;
  webview: vscode.Webview;
  reveal: () => void;
}

interface WebviewMessage {
  command?: string;
  [key: string]: unknown;
}

/** Remembers the last log lines for "Copy Diagnostics". */
export class LogBuffer {
  private readonly lines: string[] = [];
  constructor(private readonly size = 200) {}
  push(line: string) {
    this.lines.push(`${new Date().toISOString()} ${line}`);
    if (this.lines.length > this.size) {
      this.lines.shift();
    }
  }
  tail(count: number) {
    return this.lines.slice(-count);
  }
}

/**
 * Creates the sidebar view and the "Tab N" panels, serves their HTML and routes their
 * messages: RPC requests, logs and connection state.
 */
export class WebviewHost implements vscode.WebviewViewProvider, vscode.WebviewPanelSerializer {
  private readonly views = new Map<string, ViewEntry>();
  private readonly tabNumbers = new Set<number>();
  private solclientVersion = "unknown";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
    private readonly logBuffer: LogBuffer,
    private readonly preferences: PreferencesStore,
    private readonly connections: ConnectionTracker
  ) {
    context.subscriptions.push(
      preferences.onDidChange((prefs) => this.broadcast("preferences/changed", { preferences: prefs })),
      vscode.window.onDidChangeActiveColorTheme(() =>
        this.broadcast("setTheme", { theme: getTheme() })
      ),
      // Another window may have changed the shared preferences.
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          this.pushPreferencesToAll();
        }
      })
    );
    connections.onReconnect = (viewId, role) =>
      this.postTo(viewId, "connection/command", { action: "connect", role });
    connections.onReveal = (viewId) => this.views.get(viewId)?.reveal();
  }

  getSolclientVersion() {
    return this.solclientVersion;
  }

  listViews() {
    return [...this.views.values()].map(({ id, label }) => ({ id, label }));
  }

  reveal(viewId: string) {
    this.views.get(viewId)?.reveal();
  }

  broadcast(command: string, payload: Record<string, unknown> = {}) {
    for (const view of this.views.values()) {
      view.webview.postMessage({ command, ...payload });
    }
  }

  postTo(viewId: string, command: string, payload: Record<string, unknown> = {}) {
    this.views.get(viewId)?.webview.postMessage({ command, ...payload });
  }

  // Sidebar view
  resolveWebviewView(webviewView: vscode.WebviewView) {
    const entry: ViewEntry = {
      id: "sidebar",
      label: "Sidebar",
      webview: webviewView.webview,
      reveal: () => webviewView.show(false),
    };
    const disposables = this.setup(entry);
    disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this.pushPreferences(entry);
        }
      })
    );
    webviewView.onDidDispose(() => this.teardown(entry, disposables));
  }

  // "Open in a new tab" panels
  openPanel() {
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      "Solace Try Me",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: this.resourceRoots() }
    );
    this.attachPanel(panel);
  }

  // Restores tabs after a window reload. The webview restores its own UI state.
  async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
    this.attachPanel(panel);
  }

  private attachPanel(panel: vscode.WebviewPanel) {
    let tabNumber = 1;
    while (this.tabNumbers.has(tabNumber)) {
      tabNumber++;
    }
    this.tabNumbers.add(tabNumber);
    panel.title = `Solace Try Me - Tab ${tabNumber}`;
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "solace-pubsub-logo.png");

    const entry: ViewEntry = {
      id: `tab-${tabNumber}`,
      label: `Tab ${tabNumber}`,
      webview: panel.webview,
      reveal: () => panel.reveal(),
    };
    const disposables = this.setup(entry);
    panel.onDidDispose(() => {
      this.tabNumbers.delete(tabNumber);
      this.teardown(entry, disposables);
    });
  }

  private resourceRoots() {
    return [
      vscode.Uri.joinPath(this.context.extensionUri, "webview-dist"),
      vscode.Uri.joinPath(this.context.extensionUri, "media"),
    ];
  }

  private setup(entry: ViewEntry): vscode.Disposable[] {
    const { webview } = entry;
    webview.options = { enableScripts: true, localResourceRoots: this.resourceRoots() };
    this.views.set(entry.id, entry);
    const disposables = [
      webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(entry, message)),
    ];
    webview.html = this.getHtml(webview);
    return disposables;
  }

  private teardown(entry: ViewEntry, disposables: vscode.Disposable[]) {
    disposables.forEach((d) => d.dispose());
    this.views.delete(entry.id);
    this.connections.removeView(entry.id);
  }

  private async pushPreferences(entry: ViewEntry) {
    try {
      entry.webview.postMessage({
        command: "preferences/changed",
        preferences: await this.preferences.get(),
      });
    } catch (error) {
      this.log.warn(`Could not send preferences to ${entry.label}: ${error}`);
    }
  }

  private pushPreferencesToAll() {
    for (const view of this.views.values()) {
      this.pushPreferences(view);
    }
  }

  private async onMessage(entry: ViewEntry, message: WebviewMessage) {
    switch (message.command) {
      case "rpc":
        await this.handleRpc(entry, message);
        break;
      case "log":
        this.handleLog(entry, message);
        break;
      case "connection/state":
        this.connections.update(entry.id, entry.label, message as unknown as ConnectionStateMessage);
        break;
      case "hello":
        if (typeof message.solclientVersion === "string") {
          this.solclientVersion = message.solclientVersion;
        }
        break;
    }
  }

  private handleLog(entry: ViewEntry, message: WebviewMessage) {
    const entries = Array.isArray(message.entries) ? message.entries : [];
    for (const item of entries) {
      const level: LogLevel = ["trace", "debug", "info", "warn", "error"].includes(item?.level)
        ? item.level
        : "info";
      const line = `[${entry.label}${item?.role ? `/${item.role}` : ""}] ${String(item?.message ?? "")}`;
      this.log[level](line);
      if (level !== "trace" && level !== "debug") {
        this.logBuffer.push(`${level.toUpperCase()} ${line}`);
      }
    }
  }

  private async handleRpc(entry: ViewEntry, message: WebviewMessage) {
    const id = message.id;
    const params = (message.params ?? {}) as Record<string, unknown>;
    try {
      const result = await this.dispatch(entry, String(message.method), params);
      entry.webview.postMessage({ command: "rpc/response", id, result });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.log.error(`[${entry.label}] ${message.method} failed: ${text}`);
      entry.webview.postMessage({ command: "rpc/response", id, error: text });
    }
  }

  private async dispatch(entry: ViewEntry, method: string, params: Record<string, unknown>) {
    switch (method) {
      case "preferences/get":
        return this.preferences.get();
      case "preferences/update":
        return this.preferences.update(params.op as PreferencesOp);
      case "secrets/getBrokerPassword":
        return this.preferences.getPassword(String(params.id));
      case "file/open":
        await openContent(
          {
            content: String(params.content ?? ""),
            language: params.language as string | undefined,
            id: params.id as string | undefined,
            untitled: params.untitled === true,
          },
          this.preferences.getSettings(),
          this.log
        );
        return null;
      case "broker/resolveUrl":
        return params.forward === true
          ? resolveBrokerUrl(String(params.url ?? ""), this.log)
          : String(params.url ?? "");
      case "clipboard/write":
        await vscode.env.clipboard.writeText(String(params.text ?? ""));
        return null;
      case "env/info":
        return {
          viewLabel: entry.label,
          remoteName: vscode.env.remoteName ?? null,
          uiKind: vscode.env.uiKind === vscode.UIKind.Web ? "web" : "desktop",
          appName: vscode.env.appName,
          vscodeVersion: vscode.version,
          extensionVersion: this.context.extension.packageJSON.version,
        };
      case "command/run": {
        const allowed = new Set([
          "solaceTryMeVscExtension.showLogs",
          "solaceTryMeVscExtension.copyDiagnostics",
        ]);
        const command = String(params.command);
        if (!allowed.has(command)) {
          throw new Error(`Command not allowed: ${command}`);
        }
        await vscode.commands.executeCommand(command);
        return null;
      }
      default:
        throw new Error(`Unknown request: ${method}`);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, "webview-dist", "assets");
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "index.js"));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "index.css"));
    const nonce = randomBytes(16).toString("base64");
    // Broker URLs are user-defined, so connect-src has to allow any ws/wss/http/https host.
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `img-src ${webview.cspSource} data: blob:`,
      "connect-src ws: wss: http: https:",
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en" class="${getTheme()}">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Solace Try Me</title>
    <script type="module" crossorigin nonce="${nonce}" src="${jsUri}"></script>
    <link rel="stylesheet" crossorigin href="${cssUri}">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
  }
}

export function getTheme() {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? "light"
    : "dark";
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The broker connection opens from the webview, which always runs on the local machine.
 * When a profile opts in, map loopback broker URLs in a remote window through VS Code's port
 * forwarding, so a broker running next to the remote workspace is reachable.
 */
async function resolveBrokerUrl(url: string, log: vscode.LogOutputChannel): Promise<string> {
  if (!vscode.env.remoteName) {
    return url;
  }
  const parts = await Promise.all(
    url.split(",").map(async (raw) => {
      const value = raw.trim();
      try {
        const parsed = new URL(value);
        if (!LOOPBACK_HOSTS.has(parsed.hostname) || !/^(wss?|https?):$/.test(parsed.protocol)) {
          return value;
        }
        const secure = parsed.protocol === "wss:" || parsed.protocol === "https:";
        const httpUrl = `${secure ? "https" : "http"}://${parsed.host}${parsed.pathname}`;
        const external = await vscode.env.asExternalUri(vscode.Uri.parse(httpUrl));
        const mapped = external.toString(true).replace(/\/$/, "");
        const isWs = parsed.protocol.startsWith("ws");
        const result = isWs ? mapped.replace(/^http/, "ws") : mapped;
        if (result !== value) {
          log.info(`Remote window: forwarding ${value} as ${result}`);
        }
        return result;
      } catch {
        return value;
      }
    })
  );
  return parts.join(",");
}
