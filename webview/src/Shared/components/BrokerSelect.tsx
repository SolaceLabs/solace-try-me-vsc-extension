import { Select, SelectItem } from "@nextui-org/react";
import { BrokerConfig } from "../interfaces";

interface BrokerSelectProps {
  brokers: BrokerConfig[];
  selectedId?: string;
  onSelect: (id: string) => void;
  isDisabled?: boolean;
}

const BrokerSelect = ({ brokers, selectedId, onSelect, isDisabled }: BrokerSelectProps) => {
  const selectedExists = !!selectedId && brokers.some((b) => b.id === selectedId);
  return (
    <Select
      label="Solace Broker Config"
      placeholder="Select a broker"
      className="w-auto flex-grow min-w-52"
      disabledKeys={["no-item-available"]}
      isRequired
      isDisabled={isDisabled}
      disallowEmptySelection
      // NextUI 2.4 Select always used native validation; keep that despite the
      // app-wide "aria" default set on NextUIProvider.
      validationBehavior="native"
      selectedKeys={selectedExists ? [selectedId] : []}
      onSelectionChange={(selection) => {
        const key = Array.from(selection)[0];
        if (typeof key === "string" && brokers.some((b) => b.id === key)) {
          onSelect(key);
        }
      }}
    >
      {brokers.length ? (
        brokers.map((broker) => <SelectItem key={broker.id}>{broker.title}</SelectItem>)
      ) : (
        <SelectItem key="no-item-available">No brokers available</SelectItem>
      )}
    </Select>
  );
};

export default BrokerSelect;
