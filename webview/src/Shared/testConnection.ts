import SolaceManager, { ConnectionInfo, ConnectionStatus } from "./SolaceManager";
import { BrokerConfig } from "./interfaces";
import { host } from "./host";

export interface TestConnectionResult {
  ok: boolean;
  ms: number;
  error?: string;
  hint?: string;
  info?: ConnectionInfo;
}

/** Connects a throwaway session to check a broker profile, then disconnects it. */
export async function testConnection(
  broker: BrokerConfig,
  password: string,
  remoteName?: string | null
): Promise<TestConnectionResult> {
  const url = await host
    .request<string>("broker/resolveUrl", {
      url: broker.url,
      forward: broker.sessionOptions?.forwardLoopbackInRemote === true,
    })
    .catch(() => broker.url);
  const manager = new SolaceManager("subscribe", 0);
  const started = performance.now();
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: Omit<TestConnectionResult, "ms">) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      manager.disconnect("user");
      resolve({ ...result, ms: Math.round(performance.now() - started) });
    };
    const unsubscribe = manager.onStateChange((state) => {
      if (state.status === ConnectionStatus.CONNECTED) {
        finish({ ok: true, info: manager.getConnectionInfo() });
      } else if (state.status === ConnectionStatus.DISCONNECTED && state.reason === "failed") {
        finish({ ok: false, error: state.error, hint: state.hint });
      }
    });
    const timer = setTimeout(
      () => finish({ ok: false, error: "No answer from the broker within 30 seconds." }),
      30000
    );
    manager.connect({
      broker: { ...broker, sessionOptions: { ...broker.sessionOptions, connectRetries: 0 } },
      password,
      url,
      remoteName,
    });
  });
}
