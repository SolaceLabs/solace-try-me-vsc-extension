import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { NextUIProvider } from "@nextui-org/react";

import Main from "./main";
import "./index.css";

const root = document.getElementById("root");
createRoot(root!).render(
  <StrictMode>
    <NextUIProvider>
      <Main />
    </NextUIProvider>
  </StrictMode>
);
