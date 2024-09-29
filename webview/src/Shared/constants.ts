import { VscConfigInterface } from "./interfaces";

// export const VSC_CONFIG_DEFAULT: VscConfigInterface = {
//     brokerConfigs: [],
//     recentlyUsed: {
//         brokers: [],
//         subscribeTopics: [],
//         publishTopics: []
//     }
// };

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
    {
      id: "1234",
      title: "Broker 1",
      url: "tcp://localhost:1883",
      vpn: "vpn1",
      username: "user1",
      password: "password1",
    },
    {
      id: "4321",
      title: "Broker 2",
      url: "tcp://localhost:1884",
      vpn: "vpn2",
      username: "user2",
      password: "password2",
    },
  ],
  recentlyUsed: {
    views: ["config"],
    subscribeConfig: [],
    publishConfig: [],
  },
};

export const MAX_DISPLAY_MESSAGES = 20;

export const MAC_PAYLOAD_LENGTH = 1024;