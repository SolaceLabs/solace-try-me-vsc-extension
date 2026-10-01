import solace from "solclientjs";

const SUBCODE_NAMES = new Map<number, string>();
for (const [name, value] of Object.entries(solace.ErrorSubcode)) {
  if (typeof value === "number" && !SUBCODE_NAMES.has(value)) {
    SUBCODE_NAMES.set(value, name);
  }
}

export function subcodeName(subcode: unknown): string | undefined {
  return typeof subcode === "number" ? SUBCODE_NAMES.get(subcode) : undefined;
}

interface ErrorLike {
  message?: unknown;
  infoStr?: unknown;
  reason?: unknown;
  subcode?: unknown;
  errorSubcode?: unknown;
  responseCode?: unknown;
}

/** The solclientjs subcode carried by an error or event, if any. */
export function getSubcode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as ErrorLike;
  const code = typeof e.subcode === "number" ? e.subcode : e.errorSubcode;
  return typeof code === "number" ? code : undefined;
}

/** A one-line, readable description of a solclientjs error, session event or JS error. */
export function describeError(error: unknown): string {
  if (error === null || error === undefined) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);

  const e = error as ErrorLike;
  const parts: string[] = [];
  const text =
    (typeof e.infoStr === "string" && e.infoStr) ||
    (typeof e.message === "string" && e.message) ||
    "";
  if (text) parts.push(text);
  const reason = typeof e.reason === "string" ? e.reason : "";
  if (reason && !text.includes(reason)) parts.push(reason);

  const details: string[] = [];
  const name = subcodeName(getSubcode(error));
  if (name && name !== "NO_ERROR" && name !== "UNKNOWN_ERROR") details.push(name);
  if (typeof e.responseCode === "number" && e.responseCode > 0) {
    details.push(`response code ${e.responseCode}`);
  }
  const base = parts.join(": ") || "Unknown error";
  return details.length ? `${base} (${details.join(", ")})` : base;
}

const Sub = solace.ErrorSubcode;

const TRANSPORT_SUBCODES = new Set<number>([
  Sub.CONNECTION_ERROR,
  Sub.CREATE_WEBSOCKET_FAILED,
  Sub.COMMUNICATION_ERROR,
  Sub.TIMEOUT,
  Sub.KEEP_ALIVE_FAILURE,
  Sub.INACTIVITY_TIMEOUT,
]);

export interface ConnectionHintContext {
  url: string;
  isDefaultLocalhost: boolean;
  remoteName?: string | null;
  /** The profile authenticates with a client certificate from the OS certificate store. */
  clientCertificate?: boolean;
}

// The broker answers "Untrusted Certificate" both for a rejected certificate and for none at all.
const CLIENT_CERTIFICATE_LOGIN_HINT =
  "The broker rejected the client certificate, or none was sent. Check that the certificate and its private key " +
  "are installed in your operating system's certificate store, that it is signed by a CA the broker trusts for " +
  "client certificates, and that it has not expired. VS Code sends the first certificate that matches the CAs " +
  "the broker asks for.";

const CLIENT_CERTIFICATE_TLS_HINT =
  "Check the URL and the port of the broker's secure web transport (e.g. 443 or 1443), and that your operating " +
  "system trusts the broker's certificate (self-signed certificates are rejected). The TLS handshake also fails " +
  "when the client certificate's private key cannot be used, e.g. when VS Code was denied access to it in a keychain prompt.";

/** Suggests what to check for a failed or lost connection. */
export function connectionHint(error: unknown, context: ConnectionHintContext): string | undefined {
  const subcode = getSubcode(error);
  const urls = context.url.split(",").map((u) => u.trim().toLowerCase());
  const describedLower = describeError(error).toLowerCase();

  if (urls.some((u) => u.startsWith("tcp://") || u.startsWith("tcps://"))) {
    return "tcp:// and tcps:// cannot be used from VS Code's webview. Use the broker's web transport instead, e.g. ws://host:8008 or wss://host:443.";
  }
  switch (subcode) {
    case Sub.LOGIN_FAILURE:
      return context.clientCertificate
        ? CLIENT_CERTIFICATE_LOGIN_HINT
        : "Check the username and password of the broker profile.";
    case Sub.CLIENT_CERTIFICATE_AUTHENTICATION_IS_SHUTDOWN:
      return "Client certificate authentication is not enabled on this Message VPN. Enable it on the broker, or switch the profile to username and password.";
    case Sub.MESSAGE_VPN_NOT_ALLOWED:
    case Sub.MESSAGE_VPN_UNAVAILABLE:
      return "Check the Message VPN name, and that the VPN is enabled.";
    case Sub.CLIENT_USERNAME_IS_SHUTDOWN:
    case Sub.BASIC_AUTHENTICATION_IS_SHUTDOWN:
      return "The client username or basic authentication is shut down on the broker.";
    case Sub.CLIENT_NAME_ALREADY_IN_USE:
      return "Another client uses the same client name. Change the client name in the broker profile's advanced settings.";
    case Sub.TOO_MANY_CLIENTS:
      return "The broker has reached its connection limit for this VPN or user.";
    case Sub.CLIENT_ACL_DENIED:
      return "The broker's ACL profile does not allow this client to connect.";
  }
  if (subcode === undefined || TRANSPORT_SUBCODES.has(subcode) || describedLower.includes("connection")) {
    const hints: string[] = [];
    if (context.isDefaultLocalhost) {
      hints.push("Is a broker running on localhost:8008? Run \"Solace Try Me: Start a Local Broker (Docker)\" to start one.");
    }
    if (context.remoteName && urls.some((u) => /\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(u))) {
      hints.push(
        "In remote windows the connection opens from your local machine. If the broker runs in the remote workspace, turn on \"Forward through VS Code in remote windows\" in the broker profile's advanced settings."
      );
    }
    if (context.clientCertificate) {
      hints.push(CLIENT_CERTIFICATE_TLS_HINT);
    } else if (urls.some((u) => u.startsWith("wss://") || u.startsWith("https://"))) {
      hints.push("For TLS, the broker certificate must be trusted by your operating system. Self-signed certificates are rejected by the webview.");
    }
    if (!hints.length) {
      hints.push("Check the URL and port (the web transport port, usually 8008 or 443), and that the broker is reachable.");
    }
    return hints.join(" ");
  }
  return undefined;
}
