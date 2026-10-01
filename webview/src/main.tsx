import { useCallback, useEffect, useRef, useState } from "react";
import { Accordion, AccordionItem } from "./Shared/components/Accordion";

import ConfigView from "./ConfigView/ConfigView";
import PublishView from "./PublishView/PublishView";
import SubscribeView from "./SubscribeView/SubscribeView";
import { Views } from "./Shared/interfaces";
import { usePreferences } from "./Shared/components/SettingsContext";
import { PublishDraftProvider } from "./Shared/components/PublishDraftContext";
import ErrorBoundary from "./Shared/components/ErrorBoundary";
import { host } from "./Shared/host";
import { SOLCLIENT_VERSION } from "./Shared/SolaceManager";

const Main = () => {
  const { preferences, loaded, update } = usePreferences();
  const [tabs, setTabs] = useState<Views[]>(["config"]);
  const initialized = useRef(false);

  useEffect(() => {
    if (loaded && !initialized.current) {
      initialized.current = true;
      setTabs(preferences.recentlyUsed.views);
    }
  }, [loaded, preferences.recentlyUsed.views]);

  useEffect(() => {
    host.post("hello", { solclientVersion: SOLCLIENT_VERSION });
    return host.on("setTheme", (message) => {
      if (document.body.parentElement && typeof message.theme === "string") {
        document.body.parentElement.className = message.theme;
      }
    });
  }, []);

  const changeTabs = useCallback(
    (next: Views[]) => {
      setTabs(next);
      update({ type: "setViews", views: next }).catch(() => undefined);
    },
    [update]
  );

  const openPublish = useCallback(() => {
    setTabs((prev) => {
      if (prev.includes("publish")) return prev;
      const next: Views[] = [...prev, "publish"];
      update({ type: "setViews", views: next }).catch(() => undefined);
      return next;
    });
  }, [update]);

  return (
    <PublishDraftProvider onDraft={openPublish}>
      <main className="w-full h-full">
        <Accordion
          selectionMode="multiple"
          defaultExpandedKeys={["config"]}
          keepContentMounted
          selectedKeys={tabs}
          onSelectionChange={(selectedKeys) => changeTabs(Array.from(selectedKeys) as Views[])}
        >
          <AccordionItem key="config" aria-label="Broker Config" title="Broker Config">
            <ErrorBoundary name="Broker Config">
              <ConfigView />
            </ErrorBoundary>
          </AccordionItem>
          <AccordionItem key="publish" aria-label="Publish" title="Publish">
            <ErrorBoundary name="Publish">
              <PublishView />
            </ErrorBoundary>
          </AccordionItem>
          <AccordionItem key="subscribe" aria-label="Subscribe" title="Subscribe">
            <ErrorBoundary name="Subscribe">
              <SubscribeView />
            </ErrorBoundary>
          </AccordionItem>
        </Accordion>
      </main>
    </PublishDraftProvider>
  );
};

export default Main;
