import solace from "solclientjs";

export interface BrokerConfig {
  id: string;
  title: string;
  url: string;
  vpn: string;
  username: string;
  password: string;
}

export type Views = "config" | "subscribe" | "publish";

export interface ExtSettings {
  maxDisplayMessages: number;
  maxPayloadLength: number;
  maxPropertyLength: number;
  brokerDisconnectTimeout: number;
  savePayloads: boolean;
  payloadBasePath: string;
}

export interface VscConfigInterface {
  brokerConfigs: BrokerConfig[];
  settings: ExtSettings;
  recentlyUsed: {
    views: Views[];
    subscribeConfig: { name: string; config: SubscribeConfigs }[];
    publishConfig: { name: string; config: PublishConfigs }[];
  };
}

export interface VsCodeApi {
  getState(): VscConfigInterface;
  setState(state: VscConfigInterface): void;
  postMessage(message: { [key: string]: unknown }): void;
}

export interface PublishOptions {
  deliveryMode?: solace.MessageDeliveryModeType;
  destinationType?: solace.DestinationType;
  dmqEligible?: boolean;
  priority?: number;
  timeToLive?: number;
  replyToTopic?: string;
  correlationId?: string;
  messageType?: solace.MessageType;
  userProperties?: UserPropertiesMap;
}

export interface PublishConfigs extends PublishOptions {
  publishTo: string;
  content: string;
}

export interface SubscribeConfigs {
  topics: string[];
  queueType?: solace.QueueType;
  queueName?: string;
  queueTopic?: string;
}

export interface PublishStats {
  direct: number;
  persistent: number;
}

export interface SubscribeStats {
  direct: number;
  persistent: number;
  nonPersistent: number;
}

export interface Message {
  payload: string;
  topic: string;
  userProperties: { [key: string]: unknown };
  _extension_uid: string;
  metadata: {
    deliveryMode: solace.MessageDeliveryModeType;
    redelivered: boolean;
    senderId: string | null;
    replyTo: string | null;
    correlationId: string | null;
    ttl: number | null;
    senderTimestamp: number | null;
    receiverTimestamp: number;
    priority: number | null;
    isDMQEligible: boolean;
  };
}

export type Configs = PublishConfigs | SubscribeConfigs;

export type UserPropertiesMap = {
  [key: string]: {
    value: unknown;
    type: solace.SDTFieldType;
  };
};
