import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import ConfigView from "./ConfigView/ConfigView";
import PublishView from "./PublishView/PublishView";
import SubscribeView from "./SubscribeView/SubscribeView";

import "./index.css";

const configPanel = document.getElementById("config-panel");
if (configPanel) {
  createRoot(configPanel).render(
    <StrictMode>
      <ConfigView />
    </StrictMode>
  );
}

const publishPanel = document.getElementById("publish-panel");
if (publishPanel) {
  createRoot(publishPanel).render(
    <StrictMode>
      <PublishView />
    </StrictMode>
  );
}

const subscribePanel = document.getElementById("subscribe-panel");
if (subscribePanel) {
  createRoot(subscribePanel).render(
    <StrictMode>
      <SubscribeView />
    </StrictMode>
  );
}
