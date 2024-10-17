import { ExtSettings, VscConfigInterface } from "./interfaces";

// ** Not exported
const MAX_DISPLAY_MESSAGES = 20;
const MAX_PAYLOAD_LENGTH = 1024;
const MAX_PROPERTY_LENGTH = 128;
const BROKER_DISCONNECT_TIMEOUT = 30 * 60 * 1000; // 30 minutes
// **

export const DEFAULT_SETTINGS: ExtSettings = {
  maxDisplayMessages: MAX_DISPLAY_MESSAGES,
  maxPayloadLength: MAX_PAYLOAD_LENGTH,
  maxPropertyLength: MAX_PROPERTY_LENGTH,
  brokerDisconnectTimeout: BROKER_DISCONNECT_TIMEOUT,
};

export const VSC_CONFIG_DEFAULT: VscConfigInterface = {
  settings: DEFAULT_SETTINGS,
  brokerConfigs: [
    {
      id: "default_localhost",
      title: "Default Localhost",
      url: "ws://localhost:8008",
      vpn: "default",
      username: "default",
      password: "default",
    },
  ],
  recentlyUsed: {
    views: ["config"],
    subscribeConfig: [],
    publishConfig: [],
  },
};
