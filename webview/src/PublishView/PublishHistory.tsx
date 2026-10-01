import { Button, Chip, Tooltip } from "@nextui-org/react";
import { Repeat, Trash2, Upload } from "lucide-react";
import solace from "solclientjs";

import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import { PublishConfigs, PublishHistoryEntry } from "../Shared/interfaces";
import { formatDate } from "../Shared/utils";

interface PublishHistoryProps {
  entries: PublishHistoryEntry[];
  canResend: boolean;
  onLoad: (config: PublishConfigs) => void;
  onResend: (config: PublishConfigs) => void;
  onClear: () => void;
}

const STATUS_COLOR = {
  sent: "default",
  acknowledged: "success",
  rejected: "danger",
} as const;

const PublishHistory = ({ entries, canResend, onLoad, onResend, onClear }: PublishHistoryProps) => (
  <Accordion isCompact>
    <AccordionItem key="history" aria-label="publish history" subtitle={`Publish history (${entries.length})`}>
      <div className="flex flex-col gap-2 pl-2">
        {entries.length === 0 && <p className="text-sm text-default-500">Published messages appear here.</p>}
        {entries.map((entry) => {
          const { config } = entry;
          const isQueue = config.destinationType === solace.DestinationType.QUEUE;
          return (
            <div key={entry.id} className="flex items-start gap-2 border-b border-default-100 pb-2">
              <div className="flex-grow min-w-0">
                <p className="text-sm truncate">
                  {isQueue ? "Queue" : "Topic"}: {config.publishTo}
                </p>
                <p className="text-xs text-default-500 truncate">
                  {formatDate(entry.timestamp, true)} · {entry.truncated ? "(payload too large to keep)" : config.content.slice(0, 80) || "(empty)"}
                </p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Chip size="sm" variant="flat" color={STATUS_COLOR[entry.status]}>
                    {entry.status}
                  </Chip>
                  {config.mode === "request" && (
                    <Chip size="sm" variant="flat">
                      request
                    </Chip>
                  )}
                  {entry.error && (
                    <Tooltip content={entry.error} color="danger">
                      <Chip size="sm" variant="flat" color="danger" className="max-w-full">
                        <span className="truncate">{entry.error}</span>
                      </Chip>
                    </Tooltip>
                  )}
                </div>
              </div>
              <Tooltip content="Load into the form">
                <Button isIconOnly size="sm" variant="light" aria-label="Load into the form" onPress={() => onLoad(config)} isDisabled={entry.truncated}>
                  <Upload size={16} />
                </Button>
              </Tooltip>
              <Tooltip content="Publish again">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label="Publish again"
                  onPress={() => onResend(config)}
                  isDisabled={!canResend || entry.truncated}
                >
                  <Repeat size={16} />
                </Button>
              </Tooltip>
            </div>
          );
        })}
        {entries.length > 0 && (
          <Button size="sm" radius="sm" variant="bordered" startContent={<Trash2 size={12} />} onPress={onClear}>
            Clear history
          </Button>
        )}
      </div>
    </AccordionItem>
  </Accordion>
);

export default PublishHistory;
