/* eslint-disable react-refresh/only-export-components */
import React, {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DEFAULT_SETTINGS, SETTINGS_LIMITS, VSC_CONFIG_DEFAULT } from "../constants";
import { ExtSettings, VscConfigInterface } from "../interfaces";
import { host } from "../host";
import { logger } from "../logger";
import { clampNumber } from "../utils";
import type { PreferencesOp, StoredPreferences } from "../../../../src/shared/preferences";

export interface EnvInfo {
  viewLabel: string;
  remoteName: string | null;
  uiKind: "web" | "desktop";
  appName: string;
  vscodeVersion: string;
  extensionVersion: string;
}

interface PreferencesContextValue {
  preferences: VscConfigInterface;
  settings: ExtSettings;
  loaded: boolean;
  env?: EnvInfo;
  update: (op: PreferencesOp) => Promise<void>;
  updateSettings: (patch: Partial<ExtSettings>) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Fills in defaults and repairs out-of-range values from older versions. */
export function sanitizeSettings(raw: Record<string, unknown> | undefined): ExtSettings {
  const s = raw ?? {};
  const num = (key: keyof ExtSettings, min: number, max: number) => {
    const value = s[key];
    const fallback = DEFAULT_SETTINGS[key] as number;
    return typeof value === "number" ? clampNumber(Math.round(value), min, max, fallback) : fallback;
  };
  const timeoutLimit = SETTINGS_LIMITS.brokerDisconnectTimeoutMinutes;
  return {
    maxDisplayMessages: num(
      "maxDisplayMessages",
      SETTINGS_LIMITS.maxDisplayMessages.min,
      SETTINGS_LIMITS.maxDisplayMessages.max
    ),
    maxPayloadLength: num("maxPayloadLength", 1, SETTINGS_LIMITS.maxPayloadLength.max),
    maxPropertyLength: num(
      "maxPropertyLength",
      SETTINGS_LIMITS.maxPropertyLength.min,
      SETTINGS_LIMITS.maxPropertyLength.max
    ),
    brokerDisconnectTimeout: num(
      "brokerDisconnectTimeout",
      timeoutLimit.min * 60000,
      timeoutLimit.max * 60000
    ),
    savePayloads:
      typeof s.savePayloads === "boolean" ? s.savePayloads : DEFAULT_SETTINGS.savePayloads,
    payloadBasePath:
      typeof s.payloadBasePath === "string" ? s.payloadBasePath : DEFAULT_SETTINGS.payloadBasePath,
    showDisconnectNotifications:
      typeof s.showDisconnectNotifications === "boolean"
        ? s.showDisconnectNotifications
        : DEFAULT_SETTINGS.showDisconnectNotifications,
  };
}

function toPreferences(stored: StoredPreferences): VscConfigInterface {
  const recent = stored.recentlyUsed;
  return {
    ...(stored as unknown as VscConfigInterface),
    settings: sanitizeSettings(stored.settings),
    brokerConfigs: stored.brokerConfigs as unknown as VscConfigInterface["brokerConfigs"],
    recentlyUsed: {
      ...(recent as unknown as VscConfigInterface["recentlyUsed"]),
      views: (recent.views as VscConfigInterface["recentlyUsed"]["views"]) ?? ["config"],
    },
  };
}

const PreferencesContext = React.createContext<PreferencesContextValue | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [preferences, setPreferences] = useState<VscConfigInterface>(VSC_CONFIG_DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [env, setEnv] = useState<EnvInfo>();

  const apply = useCallback((stored: StoredPreferences | undefined) => {
    if (stored) {
      setPreferences(toPreferences(stored));
      setLoaded(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await host.request<StoredPreferences>("preferences/get"));
    } catch (error) {
      logger.error(`Could not load preferences: ${(error as Error).message}`);
      setLoaded(true);
    }
  }, [apply]);

  useEffect(() => {
    refresh();
    host
      .request<EnvInfo>("env/info")
      .then(setEnv)
      .catch(() => undefined);
    return host.on("preferences/changed", (message) =>
      apply(message.preferences as StoredPreferences)
    );
  }, [apply, refresh]);

  const update = useCallback(
    async (op: PreferencesOp) => {
      apply(await host.request<StoredPreferences>("preferences/update", { op }));
    },
    [apply]
  );

  const updateSettings = useCallback(
    (patch: Partial<ExtSettings>) =>
      update({ type: "setSettings", settings: patch as Record<string, unknown> }),
    [update]
  );

  const value = useMemo(
    () => ({
      preferences,
      settings: preferences.settings,
      loaded,
      env,
      update,
      updateSettings,
      refresh,
    }),
    [preferences, loaded, env, update, updateSettings, refresh]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error("usePreferences must be used within a SettingsProvider");
  }
  return context;
};

export const useSettings = () => {
  const { settings, updateSettings } = usePreferences();
  return { settings, updateSettings };
};
