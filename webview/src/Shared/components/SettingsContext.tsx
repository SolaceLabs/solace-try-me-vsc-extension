import React,  { ReactNode, useContext, useState } from "react";
import { BROKER_DISCONNECT_TIMEOUT, MAX_DISPLAY_MESSAGES, MAX_PAYLOAD_LENGTH, MAX_PROPERTY_LENGTH } from "../constants";


const defaultSettings = {
    maxDisplayMessages: MAX_DISPLAY_MESSAGES,
    maxPayloadLength: MAX_PAYLOAD_LENGTH,
    maxPropertyLength: MAX_PROPERTY_LENGTH,
    brokerDisconnectTimeout: BROKER_DISCONNECT_TIMEOUT,
}

const SettingsContext = React.createContext({
  settings: defaultSettings,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSettings: (_settings: typeof defaultSettings) => {}
})

const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<typeof defaultSettings>(defaultSettings)

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

const useSettings = () => {
    const context = useContext(SettingsContext)
    if (context === undefined) {
        throw new Error("useSettings must be used within a SettingsProvider")
    }
    return context
    }


// eslint-disable-next-line react-refresh/only-export-components
export { SettingsProvider, useSettings }