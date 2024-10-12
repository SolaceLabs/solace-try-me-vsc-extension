import { VscConfigInterface } from "./interfaces";

export const VSC_CONFIG_DEFAULT: VscConfigInterface = {
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

export const MAX_DISPLAY_MESSAGES = 25;

export const MAX_PAYLOAD_LENGTH = 1024;

export const MAX_PROPERTY_LENGTH = 128;

