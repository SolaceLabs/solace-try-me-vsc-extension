import solace from "solclientjs";

export type ConnectionRole = "publish" | "subscribe";

/** Optional per-broker session tuning. Every field falls back to a default. */
export interface BrokerSessionOptions {
  /** Client name template. Supports {role} and {random}. Empty lets the broker assign one. */
  clientName?: string;
  connectTimeoutInMsecs?: number;
  connectRetries?: number;
  reconnectRetries?: number;
  reconnectRetryWaitInMsecs?: number;
  reapplySubscriptions?: boolean;
  /** Remote windows only: forward loopback URLs to the remote workspace through VS Code. */
  forwardLoopbackInRemote?: boolean;
}

/**
 * - "basic": username and password.
 * - "clientCertificate": a client certificate from the operating system's certificate store,
 *   which VS Code presents during the TLS handshake. Needs a wss:// or https:// URL.
 */
export type BrokerAuthScheme = "basic" | "clientCertificate";

export interface BrokerConfig {
  id: string;
  title: string;
  /** One URL, or a comma-separated host list for failover. */
  url: string;
  vpn: string;
  /** Optional with client certificates: the broker then takes the username from the certificate. */
  username: string;
  /** Absent means "basic", so profiles saved by older versions keep working. */
  authScheme?: BrokerAuthScheme;
  /**
   * Only set transiently: when the webview sends a new or changed password to the host,
   * or for profiles that have not been migrated yet. Saved passwords live in VS Code SecretStorage.
   */
  password?: string;
  /** Set by the host when a password is saved in SecretStorage. */
  hasPassword?: boolean;
  /** false: ask for the password on every connect instead of saving it. Defaults to true. */
  savePassword?: boolean;
  sessionOptions?: BrokerSessionOptions;
}

export type Views = "config" | "subscribe" | "publish";

export interface ExtSettings {
  maxDisplayMessages: number;
  maxPayloadLength: number;
  maxPropertyLength: number;
  /** Milliseconds. 0 disables the inactivity disconnect. */
  brokerDisconnectTimeout: number;
  savePayloads: boolean;
  payloadBasePath: string;
  showDisconnectNotifications: boolean;
}

export interface Preset<T> {
  name: string;
  config: T;
}

export interface PublishHistoryEntry {
  id: string;
  timestamp: number;
  config: PublishConfigs;
  status: "sent" | "acknowledged" | "rejected";
  error?: string;
  /** The payload was too large to keep in the history. */
  truncated?: boolean;
}

export interface VscConfigInterface {
  brokerConfigs: BrokerConfig[];
  settings: ExtSettings;
  recentlyUsed: {
    views: Views[];
    subscribeConfig: Preset<SubscribeConfigs>[];
    publishConfig: Preset<PublishConfigs>[];
    recentTopics?: string[];
    publishHistory?: PublishHistoryEntry[];
  };
}

export interface PublishOptions {
  deliveryMode?: solace.MessageDeliveryModeType;
  destinationType?: solace.DestinationType;
  dmqEligible?: boolean;
  priority?: number;
  timeToLive?: number;
  replyToTopic?: string;
  correlationId?: string;
  applicationMessageId?: string;
  applicationMessageType?: string;
  messageType?: solace.MessageType;
  userProperties?: UserPropertiesMap;
}

export type PublishMode = "publish" | "request";

export interface PublishConfigs extends PublishOptions {
  publishTo: string;
  content: string;
  mode?: PublishMode;
  /** Milliseconds */
  requestTimeout?: number;
}

export type QueueBindMode = "consume" | "browse";

export interface SubscribeConfigs {
  topics: string[];
  ignoreTopics: string[];
  queueType?: solace.QueueType;
  queueName?: string;
  queueTopic?: string;
  bindMode?: QueueBindMode;
  createIfMissing?: boolean;
  temporaryQueue?: boolean;
  queueSubscriptions?: string[];
}

export interface PublishStats {
  direct: number;
  persistent: number;
  acknowledged?: number;
  rejected?: number;
}

export interface SubscribeStats {
  direct: number;
  persistent: number;
  nonPersistent: number;
  ignored?: number;
}

export type MessageSource = "direct" | "queue" | "browse" | "reply";

export interface UserPropertyValue {
  type: solace.SDTFieldType;
  value: unknown;
}

export type UserPropertiesMap = {
  [key: string]: UserPropertyValue;
};

export interface MessageMetadata {
  messageType?: solace.MessageType;
  deliveryMode: solace.MessageDeliveryModeType;
  redelivered: boolean;
  senderId: string | null;
  replyTo: string | null;
  replyToType?: solace.DestinationType | null;
  correlationId: string | null;
  applicationMessageId?: string | null;
  applicationMessageType?: string | null;
  httpContentType?: string | null;
  httpContentEncoding?: string | null;
  sequenceNumber?: number | null;
  deliveryCount?: number | null;
  rgmid?: string | null;
  isDiscardIndication?: boolean;
  ttl: number | null;
  senderTimestamp: number | null;
  receiverTimestamp: number;
  priority: number | null;
  isDMQEligible: boolean;
}

export interface Message {
  /** Internal id used for React keys and actions. Never exported. */
  _extension_uid: string;
  topic: string;
  destinationType?: solace.DestinationType;
  source?: MessageSource;
  payload: string;
  /** "base64" when the payload is binary data that is not valid UTF-8. */
  payloadEncoding?: "text" | "base64";
  userProperties: UserPropertiesMap;
  metadata: MessageMetadata;
}

export type Configs = PublishConfigs | SubscribeConfigs;
