const ALLOWED_PROTOCOLS = new Set(["ws:", "wss:", "http:", "https:"]);
const SECURE_PROTOCOLS = new Set(["wss:", "https:"]);

export interface BrokerUrlOptions {
  /** Client certificates are sent during the TLS handshake, so every URL must use TLS. */
  secureOnly?: boolean;
}

export function validateBrokerUrl(value: string, options: BrokerUrlOptions = {}): string | null {
  const urls = value.split(",").map((u) => u.trim()).filter(Boolean);
  if (!urls.length) return "Enter a URL.";
  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return `"${url}" is not a valid URL. Use e.g. ws://localhost:8008 or wss://host:443.`;
    }
    if (parsed.protocol === "tcp:" || parsed.protocol === "tcps:") {
      return "tcp:// and tcps:// cannot be used from VS Code's webview. Use the broker's ws:// or wss:// port.";
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) {
      return `"${url}" must start with ws://, wss://, http:// or https://.`;
    }
    if (options.secureOnly && !SECURE_PROTOCOLS.has(parsed.protocol)) {
      return `Client certificate authentication needs TLS: use wss:// or https:// instead of "${url}".`;
    }
  }
  return null;
}
