import * as vscode from "vscode";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type DisconnectReason = "user" | "inactivity" | "failed" | "down";

export interface ConnectionStateMessage {
  role: "publish" | "subscribe";
  status: ConnectionStatus;
  brokerTitle?: string;
  reason?: DisconnectReason;
  error?: string;
  clientName?: string;
  topics?: number;
  consumer?: string;
}

export interface TrackedSession extends ConnectionStateMessage {
  viewId: string;
  viewLabel: string;
  updatedAt: number;
}

const ROLE_LABEL = { publish: "Publish", subscribe: "Subscribe" };

/**
 * Tracks the connection state that every webview reports. Drives the status bar item and
 * the notifications for disconnects the user did not ask for.
 */
export class ConnectionTracker implements vscode.Disposable {
  private readonly sessions = new Map<string, TrackedSession>();
  private readonly statusBar: vscode.StatusBarItem;

  /** Set by the webview host. */
  onReconnect: (viewId: string, role: ConnectionStateMessage["role"]) => void = () => {};
  onReveal: (viewId: string) => void = () => {};

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly notificationsEnabled: () => boolean
  ) {
    this.statusBar = vscode.window.createStatusBarItem(
      "solaceTryMe.connections",
      vscode.StatusBarAlignment.Left,
      50
    );
    this.statusBar.name = "Solace Try Me Connections";
    this.statusBar.command = "solaceTryMeVscExtension.showConnections";
  }

  dispose() {
    this.statusBar.dispose();
  }

  list(): TrackedSession[] {
    return [...this.sessions.values()].sort((a, b) =>
      (a.viewLabel + a.role).localeCompare(b.viewLabel + b.role)
    );
  }

  update(viewId: string, viewLabel: string, state: ConnectionStateMessage) {
    const key = `${viewId}:${state.role}`;
    const previous = this.sessions.get(key);
    const session: TrackedSession = { ...state, viewId, viewLabel, updatedAt: Date.now() };
    this.sessions.set(key, session);

    if (previous?.status !== state.status) {
      const detail = [state.brokerTitle, state.reason, state.error].filter(Boolean).join(" | ");
      this.log.info(`[${viewLabel}/${state.role}] ${state.status}${detail ? ` (${detail})` : ""}`);
    }

    const wasUp = previous?.status === "connected" || previous?.status === "reconnecting";
    if (
      wasUp &&
      state.status === "disconnected" &&
      (state.reason === "inactivity" || state.reason === "down")
    ) {
      this.notifyDisconnect(session);
    }
    this.render();
  }

  removeView(viewId: string) {
    for (const key of [...this.sessions.keys()]) {
      if (key.startsWith(`${viewId}:`)) {
        this.sessions.delete(key);
      }
    }
    this.render();
  }

  private notifyDisconnect(session: TrackedSession) {
    if (!this.notificationsEnabled()) {
      return;
    }
    const what = `${ROLE_LABEL[session.role]} (${session.viewLabel})`;
    const why =
      session.reason === "inactivity"
        ? "was disconnected after a period of inactivity"
        : `lost its connection${session.error ? `: ${session.error}` : ""}`;
    const broker = session.brokerTitle ? ` to ${session.brokerTitle}` : "";
    vscode.window
      .showWarningMessage(`Solace Try Me: ${what}${broker} ${why}.`, "Reconnect", "Show")
      .then((action) => {
        if (action === "Reconnect") {
          this.onReconnect(session.viewId, session.role);
        } else if (action === "Show") {
          this.onReveal(session.viewId);
        }
      });
  }

  private render() {
    const active = this.list().filter((s) => s.status !== "disconnected");
    if (!active.length) {
      this.statusBar.hide();
      vscode.commands.executeCommand("setContext", "solaceTryMe.anyConnected", false);
      return;
    }
    const connected = active.filter((s) => s.status === "connected").length;
    const pending = active.length - connected;
    if (pending) {
      this.statusBar.text = `$(sync~spin) Solace: ${connected}/${active.length}`;
      this.statusBar.backgroundColor = active.some((s) => s.status === "reconnecting")
        ? new vscode.ThemeColor("statusBarItem.warningBackground")
        : undefined;
    } else {
      this.statusBar.text = `$(broadcast) Solace: ${connected}`;
      this.statusBar.backgroundColor = undefined;
    }

    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown("**Solace Try Me connections**\n\n");
    for (const s of active) {
      const extra = [
        s.topics ? `${s.topics} topic(s)` : "",
        s.consumer ? `consuming ${s.consumer}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      tooltip.appendMarkdown(
        `- ${ROLE_LABEL[s.role]} · ${escapeMarkdown(s.viewLabel)} · ${escapeMarkdown(
          s.brokerTitle ?? "?"
        )} · _${s.status}_${extra ? ` · ${escapeMarkdown(extra)}` : ""}\n`
      );
    }
    tooltip.appendMarkdown("\nClick to manage connections.");
    this.statusBar.tooltip = tooltip;
    this.statusBar.show();
    vscode.commands.executeCommand("setContext", "solaceTryMe.anyConnected", connected > 0);
  }
}

function escapeMarkdown(text: string) {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");
}
