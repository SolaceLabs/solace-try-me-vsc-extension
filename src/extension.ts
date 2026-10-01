import { createHash } from "crypto";
import * as vscode from "vscode";
import { ConnectionTracker } from "./connections";
import { PreferencesStore } from "./preferencesStore";
import { LogBuffer, PANEL_VIEW_TYPE, SIDE_VIEW_ID, WebviewHost } from "./webviewHost";

const WALKTHROUGH_ID = "solace-tools.solace-try-me-vsc-extension#solaceTryMe.gettingStarted";
const LOCAL_BROKER_COMMAND =
  "docker run -d -p 8080:8080 -p 55555:55555 -p 8008:8008 -p 1883:1883 -p 5672:5672 -p 9000:9000 " +
  "--shm-size=1g --env username_admin_globalaccesslevel=admin --env username_admin_password=admin " +
  "--name=solace solace/solace-pubsub-standard";

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("Solace Try Me", { log: true });
  const logBuffer = new LogBuffer();
  const preferences = new PreferencesStore(context, log, {
    sessionId: vscode.env.sessionId,
    // globalStorageUri differs per VS Code profile; SecretStorage is shared by all profiles.
    secretNamespace: createHash("sha256").update(context.globalStorageUri.toString()).digest("hex").slice(0, 12),
  });
  const connections = new ConnectionTracker(
    log,
    () => preferences.getSettings().showDisconnectNotifications !== false
  );
  const host = new WebviewHost(context, log, logBuffer, preferences, connections);
  context.subscriptions.push(log, preferences, connections);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SIDE_VIEW_ID, host, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewPanelSerializer(PANEL_VIEW_TYPE, host),

    vscode.commands.registerCommand("solaceTryMeVscExtension.newWindow", () => host.openPanel()),
    vscode.commands.registerCommand("solaceTryMeVscExtension.showLogs", () => log.show()),
    vscode.commands.registerCommand("solaceTryMeVscExtension.openGettingStarted", () =>
      vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false)
    ),
    vscode.commands.registerCommand("solaceTryMeVscExtension.startLocalBroker", () => {
      const terminal = vscode.window.createTerminal({ name: "Solace broker" });
      terminal.show();
      terminal.sendText(LOCAL_BROKER_COMMAND);
    }),
    vscode.commands.registerCommand("solaceTryMeVscExtension.disconnectAll", () =>
      host.broadcast("connection/command", { action: "disconnect" })
    ),
    vscode.commands.registerCommand("solaceTryMeVscExtension.showConnections", async () => {
      const sessions = connections.list().filter((s) => s.status !== "disconnected");
      type Item = vscode.QuickPickItem & { viewId?: string; disconnectAll?: boolean };
      const items: Item[] = sessions.map((s) => ({
        label: `$(${s.status === "connected" ? "plug" : "sync"}) ${s.role === "publish" ? "Publish" : "Subscribe"} · ${s.brokerTitle ?? "?"}`,
        description: s.viewLabel,
        detail: [s.status, s.clientName, s.topics ? `${s.topics} topic(s)` : "", s.consumer ?? ""]
          .filter(Boolean)
          .join(" · "),
        viewId: s.viewId,
      }));
      items.push({ label: "$(debug-disconnect) Disconnect all", disconnectAll: true });
      const picked = await vscode.window.showQuickPick(items, {
        title: "Solace Try Me connections",
        placeHolder: "Select a connection to show it",
      });
      if (picked?.disconnectAll) {
        host.broadcast("connection/command", { action: "disconnect" });
      } else if (picked?.viewId) {
        host.reveal(picked.viewId);
      }
    }),
    vscode.commands.registerCommand("solaceTryMeVscExtension.copyDiagnostics", async () => {
      const text = await buildDiagnostics(context, preferences, connections, host, logBuffer);
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage(
        "Solace Try Me diagnostics copied to the clipboard. Passwords are never included."
      );
    })
  );

  preferences.whenReady().then(
    ({ isFirstRun }) => {
      if (isFirstRun) {
        vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
      }
    },
    (error) => log.error(`Could not load preferences: ${error}`)
  );
}

async function buildDiagnostics(
  context: vscode.ExtensionContext,
  preferences: PreferencesStore,
  connections: ConnectionTracker,
  host: WebviewHost,
  logBuffer: LogBuffer
) {
  const prefs = await preferences.get();
  const sessions = connections.list();
  const lines = [
    "## Solace Try Me diagnostics",
    "",
    `- Extension: ${context.extension.packageJSON.version}`,
    `- VS Code: ${vscode.version} (${vscode.env.appName}, ${vscode.env.uiKind === vscode.UIKind.Web ? "web" : "desktop"})`,
    `- Remote: ${vscode.env.remoteName ?? "none"}`,
    `- Platform: ${process.platform} ${process.arch}`,
    `- solclientjs: ${host.getSolclientVersion()}`,
    `- Open views: ${host.listViews().map((v) => v.label).join(", ") || "none"}`,
    `- Broker profiles: ${prefs.brokerConfigs.length}`,
    "",
    "### Settings",
    "```json",
    JSON.stringify(prefs.settings, null, 2),
    "```",
    "",
    "### Sessions",
    ...(sessions.length
      ? sessions.map(
          (s) =>
            `- ${s.viewLabel}/${s.role}: ${s.status}${s.brokerTitle ? ` · ${s.brokerTitle}` : ""}${
              s.clientName ? ` · ${s.clientName}` : ""
            }${s.reason ? ` · reason: ${s.reason}` : ""}${s.error ? ` · ${s.error}` : ""}`
        )
      : ["- none"]),
    "",
    "### Recent log",
    "```",
    ...logBuffer.tail(50),
    "```",
  ];
  return lines.join("\n");
}

export function deactivate() {}
