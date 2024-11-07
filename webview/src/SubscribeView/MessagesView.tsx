import { useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Divider,
  ScrollShadow,
  Tooltip,
} from "@nextui-org/react";
import { Eraser, Rows4 } from "lucide-react";

import SolaceMessage from "./SolaceMessage";
import { Message } from "../Shared/interfaces";

// An uncommon values to separate the searchable parts of a message when converted to a string
const SEARCH_DELIMITER = "#!*!#";

const BOUNCE_DELAY = 400;

const filterMessages = (messages: Message[], filter: string) => {
  if (!filter) return messages;
  filter = filter.toLowerCase();
  return messages
    .map((message) => {
      // stringify stage
      let searchable = message.topic + SEARCH_DELIMITER;
      searchable += message.payload + SEARCH_DELIMITER;
      if (message.userProperties) {
        for (const [key, value] of Object.entries(message.userProperties)) {
          searchable += key + SEARCH_DELIMITER + value + SEARCH_DELIMITER;
        }
      }
      searchable = searchable.toLowerCase();
      return [message, searchable] as [Message, string];
    })
    .filter((searchable) => {
      // Filter stage
      return searchable[1].includes(filter);
    })
    .map((message) => {
      // Restore stage
      return message[0];
    });
};

interface MessagesViewProps {
  messages: Message[];
  maxPayloadLength: number;
  maxPropertyLength: number;
  baseFilePath?: string;
}

const MessagesView = ({
  messages,
  maxPayloadLength,
  maxPropertyLength,
  baseFilePath,
}: MessagesViewProps) => {
  const [filteredMessages, setFilteredMessages] = useState<Message[]>(messages);
  const [search, setSearch] = useState<string>("");
  const [bounceSearch, setBounceSearch] = useState<string>("");
  const [compactView, setCompactView] = useState<boolean>(false);
  const bounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setFilteredMessages(filterMessages(messages, search));
  }, [messages, search]);

  console.log(messages);

  useEffect(() => {
    clearTimeout(bounceRef.current);
    bounceRef.current = setTimeout(() => {
      if (bounceSearch !== search) {
        setSearch(bounceSearch);
      }
    }, BOUNCE_DELAY);
  }, [bounceSearch, search]);

  return (
    <div>
      <div className="flex gap-2 w-full items-center">
        <Input
          placeholder="Filter Results"
          value={bounceSearch}
          onChange={(e) => setBounceSearch(e.target.value)}
          endContent={
            <Tooltip content="Clear Filter">
              <Button
                onClick={() => {
                  setSearch("");
                  setBounceSearch("");
                }}
                isIconOnly
                variant="light"
                radius="lg"
                size="sm"
              >
                <Eraser />
              </Button>
            </Tooltip>
          }
        />
        <Tooltip
          content={compactView ? "Disable Compact View" : "Compact View"}
        >
          <Button
            onClick={() => setCompactView(!compactView)}
            isIconOnly
            variant={compactView ? "shadow" : "light"}
            radius="sm"
          >
            <Rows4 />
          </Button>
        </Tooltip>
      </div>
      {search.length > 0 && (
        <p className="text-sm text-gray-500 mt-1 ml-3">
          Showing {filteredMessages.length} of {messages.length} messages.
        </p>
      )}
      <Divider className="my-2" />
      {filteredMessages.length > 0 && (
        <ScrollShadow className="h-[500px] w-full">
          {filteredMessages.map((message) => (
            <SolaceMessage
              key={message._extension_uid}
              message={message}
              compactMode={compactView}
              maxPayloadLength={maxPayloadLength}
              maxPropertyLength={maxPropertyLength}
              baseFilePath={baseFilePath}
              highlight={search}
            />
          ))}
        </ScrollShadow>
      )}
      {messages.length === 0 && (
        <p className="text-gray-500 text-center">No messages received yet.</p>
      )}
      {messages.length > 0 && filteredMessages.length === 0 && (
        <p className="text-gray-500 text-center">No messages found.</p>
      )}
    </div>
  );
};

export default MessagesView;
