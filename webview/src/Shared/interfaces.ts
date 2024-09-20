export interface VscConfigInterface {
  brokerConfigs: {
    alias: string;
    url: string;
    vpn: string;
    username: string;
    password: string;
  }[];
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
