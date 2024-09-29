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

export interface VscConfigInterface {
  brokerConfigs: BrokerConfig[];
  recentlyUsed: {
    views: Views[];
    subscribeConfig: {name: string, config: SubscribeConfigs}[];
    publishConfig: {name: string, config: PublishConfigs}[];
  };
}

export interface VsCodeApi {
  getState(): VscConfigInterface;
  setState(state: VscConfigInterface): void;
}

export interface PublishOptions {
  deliveryMode?: solace.MessageDeliveryModeType;
  destinationType?: solace.DestinationType;
  dmqEligible?: boolean;
  priority?: number;
  timeToLive?: number;
  replyToTopic?: string;
  correlationId?: string;
}

export interface PublishConfigs extends PublishOptions {
  publishTo: string;
  content: string;
}

export interface SubscribeConfigs {

}

export interface PublishStats {
  direct: number;
  persistent: number;
}

export type Configs = PublishConfigs | SubscribeConfigs;