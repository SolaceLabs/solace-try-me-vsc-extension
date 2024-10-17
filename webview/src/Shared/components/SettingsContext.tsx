/* eslint-disable react-refresh/only-export-components */
import React, { ReactNode, useContext, useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "../constants";
import { getVscConfig, setVscConfig } from "../utils";
import { ExtSettings } from "../interfaces";

const SettingsContext = React.createContext<{
  settings: ExtSettings;
  setSettings: React.Dispatch<React.SetStateAction<ExtSettings>>;
}>({
  settings: DEFAULT_SETTINGS,
  setSettings: () => {},
});

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<ExtSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    getVscConfig().then((state) => {
      if (state && state.settings) {
        setSettings(state.settings);
      }
    });
  }, []);

  useEffect(() => {
    setVscConfig((state) => {
      const newState = { ...state };
      newState.settings = settings;
      return newState;
    });
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
