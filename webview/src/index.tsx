import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { NextUIProvider } from "@nextui-org/react";

import Main from "./main";
import "./index.css";
import { SettingsProvider } from "./Shared/components/SettingsContext";

const root = document.getElementById("root");
createRoot(root!).render(
  <StrictMode>
    <NextUIProvider>
      <SettingsProvider>
        <Main />
      </SettingsProvider>
    </NextUIProvider>
  </StrictMode>
);
