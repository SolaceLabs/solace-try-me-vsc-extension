import { VscConfigInterface } from "./interfaces";

export const VSC_CONFIG_DEFAULT: VscConfigInterface = {
    brokerConfigs: [],
    recentlyUsed: {
        brokers: [],
        subscribeTopics: [],
        publishTopics: []
    }
};
