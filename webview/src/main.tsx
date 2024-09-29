import { useEffect, useState } from "react";
import { Accordion, AccordionItem } from "@nextui-org/react";

import ConfigView from "./ConfigView/ConfigView";
import PublishView from "./PublishView/PublishView";
import SubscribeView from "./SubscribeView/SubscribeView";
import { VscConfigInterface } from "./Shared/interfaces";
import { getVscConfig, setVscConfig } from "./Shared/utils";

const Main = () => {
  const [tabs, setTabs] = useState<VscConfigInterface["recentlyUsed"]["views"]>(
    ["config"]
  );

  useEffect(() => {
    const state = getVscConfig();
    if (state && state.recentlyUsed && state.recentlyUsed.views) {
      setTabs(state.recentlyUsed.views);
    }
  }, []);

  return (
    <main className="dark text-foreground bg-background w-full h-full p-2">
      <Accordion
        selectionMode="multiple"
        defaultExpandedKeys={["config"]}
        keepContentMounted
        selectedKeys={tabs}
        onSelectionChange={(selectedKeys) => {
          const newTabs = Array.from(selectedKeys) as VscConfigInterface["recentlyUsed"]["views"];
          setTabs(newTabs);
          setVscConfig((state) => {
            const newState = { ...state };
            newState.recentlyUsed.views = newTabs;
            return newState;
          });
        }}
      >
        <AccordionItem
          key="config"
          aria-label="Broker Config"
          title="Broker Config"
        >
          <ConfigView />
        </AccordionItem>
        <AccordionItem key="publish" aria-label="Publish" title="Publish">
          <PublishView />
        </AccordionItem>
        <AccordionItem key="subscribe" aria-label="Subscribe" title="Subscribe">
          <SubscribeView />
        </AccordionItem>
      </Accordion>
    </main>
  );
};

export default Main;
