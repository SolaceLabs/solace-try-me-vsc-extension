import { Message } from "../Shared/interfaces";

interface SolaceMessageProps {
  message: Message;
}

const SolaceMessage = ({ message }: SolaceMessageProps) => {
    // TODO: Implement SolaceMessage component
  return (
    <div className="flex flex-col bg-black-100 p-2 rounded-md">
      <div className="text-xs text-gray-500">Topic: {message.topic}</div>
      <div className="text-sm">{message.payload}</div>
    </div>
  );
};

export default SolaceMessage;
