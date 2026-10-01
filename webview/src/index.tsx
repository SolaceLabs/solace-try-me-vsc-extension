import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { NextUIProvider } from "@nextui-org/react";

import Main from "./main";
import "./index.css";
import { SettingsProvider } from "./Shared/components/SettingsContext";

const root = document.getElementById("root");
createRoot(root!).render(
  <StrictMode>
    {/* NextUI >= 2.5 defaults form fields to native validation, which shows browser
        messages such as "Please enter a URL." on blur. Keep the pre-2.5 ARIA behavior. */}
    <NextUIProvider validationBehavior="aria">
      <SettingsProvider>
        <Main />
      </SettingsProvider>
    </NextUIProvider>
  </StrictMode>
);
