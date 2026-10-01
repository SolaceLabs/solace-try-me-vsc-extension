import { ExtSettings, VscConfigInterface } from "./interfaces";

// ** Not exported
const MAX_DISPLAY_MESSAGES = 20;
const MAX_PAYLOAD_LENGTH = 1024;
const MAX_PROPERTY_LENGTH = 128;
const BROKER_DISCONNECT_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const PAYLOAD_BASE_PATH = "./.solace-try-me";
const SAVE_PAYLOADS = false;
// **

export const DEFAULT_SETTINGS: ExtSettings = {
  maxDisplayMessages: MAX_DISPLAY_MESSAGES,
  maxPayloadLength: MAX_PAYLOAD_LENGTH,
  maxPropertyLength: MAX_PROPERTY_LENGTH,
  brokerDisconnectTimeout: BROKER_DISCONNECT_TIMEOUT,
  savePayloads: SAVE_PAYLOADS,
  payloadBasePath: PAYLOAD_BASE_PATH,
  showDisconnectNotifications: true,
};

/** Bounds enforced by the settings dialog and when loading stored settings. */
export const SETTINGS_LIMITS = {
  maxDisplayMessages: { min: 1, max: 5000 },
  maxPayloadLength: { min: 100, max: 1_000_000 },
  maxPropertyLength: { min: 5, max: 100_000 },
  // Minutes. setTimeout overflows above 2^31-1 ms (about 35,791 minutes).
  brokerDisconnectTimeoutMinutes: { min: 0, max: 35_000 },
};

export const DEFAULT_LOCALHOST_BROKER_ID = "default_localhost";

export const VSC_CONFIG_DEFAULT: VscConfigInterface = {
  settings: DEFAULT_SETTINGS,
  brokerConfigs: [
    {
      id: DEFAULT_LOCALHOST_BROKER_ID,
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
    recentTopics: [],
    publishHistory: [],
  },
};

export const MAX_RECENT_TOPICS = 20;
export const MAX_PUBLISH_HISTORY = 50;
/** Payloads larger than this are not stored in the publish history. */
export const MAX_HISTORY_PAYLOAD_LENGTH = 4 * 1024;

export const DEFAULT_REQUEST_TIMEOUT = 5000;
export const MIN_REQUEST_TIMEOUT = 100;

/** Broker limits enforced by solclientjs in the Session constructor. */
export const BROKER_FIELD_LIMITS = {
  vpn: 32,
  username: 189,
  password: 128,
  clientName: 160,
};
