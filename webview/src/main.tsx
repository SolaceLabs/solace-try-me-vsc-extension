import { Accordion, AccordionItem } from "@nextui-org/react";

import ConfigView from "./ConfigView/ConfigView";
import PublishView from "./PublishView/PublishView";
import SubscribeView from "./SubscribeView/SubscribeView";

const Main = () => {
  return (
    <main className="dark text-foreground bg-background w-full h-full p-2">
      <Accordion
        selectionMode="multiple"
        defaultExpandedKeys={["config"]}
        keepContentMounted
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
