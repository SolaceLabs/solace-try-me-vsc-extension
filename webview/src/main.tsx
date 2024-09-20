import { createRoot } from "react-dom/client";

import Bootstrap from "./Bootstrap";
import ConfigView from "./ConfigView/ConfigView";
import PublishView from "./PublishView/PublishView";
import SubscribeView from "./SubscribeView/SubscribeView";

import "./index.css";

const configPanel = document.getElementById("config-panel");
if (configPanel) {
  createRoot(configPanel).render(
    <Bootstrap>
      <ConfigView />
    </Bootstrap>
  );
}

const publishPanel = document.getElementById("publish-panel");
if (publishPanel) {
  createRoot(publishPanel).render(
    <Bootstrap>
      <PublishView />
    </Bootstrap>
  );
}

const subscribePanel = document.getElementById("subscribe-panel");
if (subscribePanel) {
  createRoot(subscribePanel).render(
    <Bootstrap>
      <SubscribeView />
    </Bootstrap>
  );
}
