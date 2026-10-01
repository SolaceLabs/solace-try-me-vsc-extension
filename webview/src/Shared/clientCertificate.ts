import { createLogger } from "./logger";

const log = createLogger("certificates");

/** Long enough to answer a keychain prompt that asks to use the certificate's private key. */
const SELECT_TIMEOUT_MS = 60000;

/** https://host:port for each URL of a comma-separated broker URL list. */
export function httpsOrigins(url: string): string[] {
  const origins = new Set<string>();
  for (const part of url.split(",").map((u) => u.trim()).filter(Boolean)) {
    try {
      origins.add(`https://${new URL(part).host}`);
    } catch {
      // Invalid URLs fail later with a proper error from the session.
    }
  }
  return [...origins];
}

/**
 * Chromium never asks for a client certificate on a WebSocket: when the broker requests one,
 * the handshake only sends the certificate already selected for that host and port, or fails.
 * An HTTPS request to the same host and port lets VS Code select the certificate from the OS
 * store first (the first one that matches), and WebSockets reuse that selection afterwards.
 * Errors are ignored: the session reports them when it connects.
 */
export async function selectClientCertificate(url: string): Promise<void> {
  await Promise.all(
    httpsOrigins(url).map((origin) =>
      fetch(`${origin}/`, {
        mode: "no-cors",
        // Client certificates are only sent for requests with credentials.
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(SELECT_TIMEOUT_MS),
      }).then(
        () => undefined,
        (error: Error) => log.info(`TLS check of ${origin} failed: ${error.message}`)
      )
    )
  );
}
