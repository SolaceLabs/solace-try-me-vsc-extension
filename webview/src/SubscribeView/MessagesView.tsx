import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Divider, Input, Tooltip } from "@nextui-org/react";
import { Eraser, FileDown, Pause, Play, Rows4 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import SolaceMessage, { MessageActions } from "./SolaceMessage";
import { Message } from "../Shared/interfaces";
import { formatPropertyValue, openFileInNewTab } from "../Shared/utils";
import { toExportable } from "../Shared/messageCodec";

const BOUNCE_DELAY = 300;
const SEARCH_DELIMITER = "\u0000";
const AUTO_PAUSE_SCROLL = 60;

// Lowercased search text, computed once per message.
const searchCache = new WeakMap<Message, string>();
const searchableText = (message: Message) => {
  let text = searchCache.get(message);
  if (text === undefined) {
    const parts = [message.topic, message.payload];
    for (const [key, prop] of Object.entries(message.userProperties)) {
      parts.push(key, formatPropertyValue(prop.value));
    }
    text = parts.join(SEARCH_DELIMITER).toLowerCase();
    searchCache.set(message, text);
  }
  return text;
};

interface MessagesViewProps {
  messages: Message[];
  maxPayloadLength: number;
  maxPropertyLength: number;
  paused: boolean;
  pendingCount: number;
  onPausedChange: (paused: boolean) => void;
  actions?: MessageActions;
}

const MessagesView = ({
  messages,
  maxPayloadLength,
  maxPropertyLength,
  paused,
  pendingCount,
  onPausedChange,
  actions,
}: MessagesViewProps) => {
  const [search, setSearch] = useState("");
  const [bounceSearch, setBounceSearch] = useState("");
  const [compactView, setCompactView] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(bounceSearch), BOUNCE_DELAY);
    return () => clearTimeout(timer);
  }, [bounceSearch]);

  const filteredMessages = useMemo(() => {
    const query = search.toLowerCase();
    if (!query) return messages;
    return messages.filter((message) => searchableText(message).includes(query));
  }, [messages, search]);

  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compactView ? 80 : 320),
    getItemKey: (index) => filteredMessages[index]._extension_uid,
    overscan: 4,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [compactView, virtualizer]);

  // Scrolling away from the newest messages pauses the stream, like a log tail.
  const onScroll = () => {
    const top = scrollRef.current?.scrollTop ?? 0;
    if (top > AUTO_PAUSE_SCROLL && !paused) {
      setAutoPaused(true);
      onPausedChange(true);
    } else if (top <= AUTO_PAUSE_SCROLL && autoPaused) {
      setAutoPaused(false);
      onPausedChange(false);
    }
  };

  const resume = () => {
    setAutoPaused(false);
    onPausedChange(false);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const exportMessages = () => {
    openFileInNewTab(JSON.stringify(filteredMessages.map(toExportable), null, 2), {
      language: "json",
      untitled: true,
    });
  };

  return (
    <div>
      <div className="flex gap-2 w-full items-center">
        <Input
          placeholder="Filter by topic, payload or user property"
          aria-label="Filter messages"
          value={bounceSearch}
          onValueChange={setBounceSearch}
          endContent={
            <Tooltip content="Clear Filter">
              <Button
                onPress={() => {
                  setSearch("");
                  setBounceSearch("");
                }}
                isIconOnly
                variant="light"
                radius="lg"
                size="sm"
                aria-label="Clear filter"
              >
                <Eraser />
              </Button>
            </Tooltip>
          }
        />
        <Tooltip content={paused ? "Resume live updates" : "Pause live updates"}>
          <Button
            onPress={() => (paused ? resume() : onPausedChange(true))}
            isIconOnly
            variant={paused ? "shadow" : "light"}
            color={paused ? "warning" : "default"}
            radius="sm"
            aria-label={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
        </Tooltip>
        <Tooltip content={compactView ? "Disable Compact View" : "Compact View"}>
          <Button
            onPress={() => setCompactView(!compactView)}
            isIconOnly
            variant={compactView ? "shadow" : "light"}
            radius="sm"
            aria-label="Toggle compact view"
          >
            <Rows4 />
          </Button>
        </Tooltip>
        <Tooltip content="Export the listed messages as JSON">
          <Button
            onPress={exportMessages}
            isIconOnly
            variant="light"
            radius="sm"
            aria-label="Export messages"
            isDisabled={!filteredMessages.length}
          >
            <FileDown />
          </Button>
        </Tooltip>
      </div>
      <div className="flex gap-2 items-center mt-1 ml-3 flex-wrap">
        {search.length > 0 && (
          <p className="text-sm text-gray-500">
            Showing {filteredMessages.length} of {messages.length} messages.
          </p>
        )}
        {paused && (
          <Button size="sm" radius="full" color="warning" variant="flat" className="h-6" onPress={resume}>
            Paused{pendingCount ? ` · ${pendingCount} new` : ""} · Resume
          </Button>
        )}
      </div>
      <Divider className="my-2" />
      {filteredMessages.length > 0 && (
        <div ref={scrollRef} onScroll={onScroll} className="h-[500px] w-full overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const message = filteredMessages[item.index];
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}
                >
                  <SolaceMessage
                    message={message}
                    compactMode={compactView}
                    maxPayloadLength={maxPayloadLength}
                    maxPropertyLength={maxPropertyLength}
                    highlight={search}
                    actions={actions}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {messages.length === 0 && <p className="text-gray-500 text-center">No messages received yet.</p>}
      {messages.length > 0 && filteredMessages.length === 0 && (
        <p className="text-gray-500 text-center">No messages found.</p>
      )}
    </div>
  );
};

export default MessagesView;
