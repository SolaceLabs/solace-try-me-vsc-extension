
export interface BrokerConfig {
  id: string;
  title: string;
  url: string;
  vpn: string;
  username: string;
  password: string;
}

export interface VscConfigInterface {
  brokerConfigs: BrokerConfig[];
  recentlyUsed: {
    brokers: string[];
    subscribeTopics: string[];
    publishTopics: string[];
  };
}

export interface VsCodeApi {
  getState(): VscConfigInterface;
  setState(state: VscConfigInterface): void;
}
