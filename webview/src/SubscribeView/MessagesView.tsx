import { useEffect, useRef, useState } from "react";
import { Button, Input, Divider, ScrollShadow } from "@nextui-org/react";
import { Eraser } from "lucide-react";

import SolaceMessage from "./SolaceMessage";
import { Message } from "../Shared/interfaces";

// An uncommon values to separate the searchable parts of a message when converted to a string
const SEARCH_DELIMITER = "#!*!#";

const BOUNCE_DELAY = 400;

const filterMessages = (messages: Message[], filter: string) => {
  if (!filter) return messages;
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
      return [message, searchable] as [Message, string];
    })
    .filter(([_, searchable]) => {
      // Filter stage
      return searchable.includes(filter);
    })
    .map(([message, _]) => {
      // Restore stage
      return message;
    });
};

interface MessagesViewProps {
  messages: Message[];
  maxPayloadLength: number;
  maxPropertyLength: number;
}

const MessagesView = ({
  messages,
  maxPayloadLength,
  maxPropertyLength,
}: MessagesViewProps) => {
  const [filteredMessages, setFilteredMessages] = useState<Message[]>(messages);
  const [search, setSearch] = useState<string>("");
  const [bounceSearch, setBounceSearch] = useState<string>("");
  const bounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setFilteredMessages(filterMessages(messages, search));
  }, [messages, search]);

  useEffect(() => {
    clearTimeout(bounceRef.current);
    bounceRef.current = setTimeout(() => {
      if (bounceSearch !== search) {
        setSearch(bounceSearch);
      }
    }, BOUNCE_DELAY);
  }, [bounceSearch]);

  if (messages.length === 0) {
    return (
      <p className="text-gray-500 text-center">No messages received yet.</p>
    );
  }

  return (
    <div>
      <div className="flex gap-2 w-full align-center mb-2">
        <Input
          placeholder="Filter Results"
          value={bounceSearch}
          onChange={(e) => setBounceSearch(e.target.value)}
        />
        <Button onClick={() => {
            setSearch("");
            setBounceSearch("");
        }} isIconOnly>
          <Eraser />
        </Button>
      </div>

      <Divider />
      {filteredMessages.length > 0 && <ScrollShadow className="h-[500px] w-full">
        {filteredMessages.map((message) => (
          <SolaceMessage
            key={message._extension_uid}
            message={message}
            maxPayloadLength={maxPayloadLength}
            maxPropertyLength={maxPropertyLength}
            highlight={search}
          />
        ))}
      </ScrollShadow>}
      {filteredMessages.length === 0 && (
        <p className="text-gray-500 text-center">No messages found.</p>
      )}
    </div>
  );
};

export default MessagesView;
