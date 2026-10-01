import React, { useState } from "react";
import {
  RadioGroup,
  Radio,
  Input,
  Textarea,
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
  Select,
  SelectItem,
} from "@nextui-org/react";
import { Pencil, Trash2 } from "lucide-react";
import solace from "solclientjs";

import { ModalBody, Modal, ModalContent, ModalFooter, ModalHeader } from "../Shared/components/Modal";
import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import { UserPropertiesMap } from "../Shared/interfaces";
import { convertTypeToString, formatPropertyValue } from "../Shared/utils";
import { isFloatType, isIntegerType, validateUserPropertyValue } from "../Shared/messageCodec";

type UserPropertiesProps = {
  userProperties: UserPropertiesMap;
  setUserProperties: React.Dispatch<React.SetStateAction<UserPropertiesMap>>;
  disablePage?: boolean;
};

// The four types offered in the editor. Float is sent as a 64-bit double.
const EDITABLE_TYPES = [
  solace.SDTFieldType.STRING,
  solace.SDTFieldType.INT64,
  solace.SDTFieldType.DOUBLETYPE,
  solace.SDTFieldType.BOOL,
];

const editorType = (type: solace.SDTFieldType) =>
  isIntegerType(type)
    ? solace.SDTFieldType.INT64
    : isFloatType(type)
    ? solace.SDTFieldType.DOUBLETYPE
    : type === solace.SDTFieldType.BOOL
    ? solace.SDTFieldType.BOOL
    : solace.SDTFieldType.STRING;

interface WipProperty {
  key: string;
  type: solace.SDTFieldType;
  /** Raw text while editing; parsed on save. */
  text: string;
}

const emptyProperty: WipProperty = { key: "", type: solace.SDTFieldType.STRING, text: "" };

const parseValue = (type: solace.SDTFieldType, text: string): unknown => {
  if (type === solace.SDTFieldType.BOOL) return text === "true";
  if (isIntegerType(type) || isFloatType(type)) return text.trim() === "" ? NaN : Number(text);
  return text;
};

const getValueInput = (type: solace.SDTFieldType, text: string, setText: (value: string) => void, error: string | null) => {
  if (type === solace.SDTFieldType.BOOL) {
    return (
      <RadioGroup value={text === "true" ? "true" : "false"} onValueChange={setText}>
        <Radio value="true">True</Radio>
        <Radio value="false">False</Radio>
      </RadioGroup>
    );
  }
  if (isIntegerType(type) || isFloatType(type)) {
    return (
      <Input
        // Text input: a number input drops a leading "-" while typing.
        type="text"
        inputMode={isIntegerType(type) ? "numeric" : "decimal"}
        label="Value"
        placeholder={isIntegerType(type) ? "e.g. -42" : "e.g. 3.14"}
        value={text}
        onValueChange={setText}
        isInvalid={!!error}
        errorMessage={error}
      />
    );
  }
  return <Textarea label="Value" placeholder="Enter value" value={text} onValueChange={setText} />;
};

const UserProperties = ({ userProperties, setUserProperties, disablePage = false }: UserPropertiesProps) => {
  const hasProperties = Object.keys(userProperties).length > 0;
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  const [hadProperties, setHadProperties] = useState(hasProperties);
  // Follow the property list (e.g. a loaded preset) until the user toggles the section.
  if (hadProperties !== hasProperties) {
    setHadProperties(hasProperties);
    setManuallyOpen(null);
  }
  const openUserProperties = manuallyOpen ?? hasProperties;
  const [showModal, setShowModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [wip, setWip] = useState<WipProperty>(emptyProperty);

  const openEditor = (key: string | null) => {
    setSelectedProperty(key);
    if (key && userProperties[key]) {
      const { type, value } = userProperties[key];
      const t = editorType(type);
      setWip({ key, type: t, text: t === solace.SDTFieldType.BOOL ? String(value === true) : formatPropertyValue(value) });
    } else {
      setWip(emptyProperty);
    }
    setShowModal(true);
  };

  const trimmedKey = wip.key.trim();
  const wipKeyExists = trimmedKey !== selectedProperty && Object.keys(userProperties).includes(trimmedKey);
  const value = parseValue(wip.type, wip.text);
  const valueError =
    (isIntegerType(wip.type) || isFloatType(wip.type)) && wip.text.trim() === ""
      ? null
      : validateUserPropertyValue(wip.type, value);
  const missingValue = (isIntegerType(wip.type) || isFloatType(wip.type)) && wip.text.trim() === "";
  const disabledCreateButton = !trimmedKey || wipKeyExists || !!valueError || missingValue;

  return (
    <Accordion
      isCompact
      selectedKeys={openUserProperties ? ["user-properties"] : []}
      onSelectionChange={(selectedKeys) => setManuallyOpen(Array.from(selectedKeys).length > 0)}
    >
      <AccordionItem key="user-properties" aria-label="user-properties" subtitle="User Properties">
        <div className="flex flex-col gap-4 pl-2">
          <Button radius="sm" size="sm" isDisabled={disablePage} onPress={() => openEditor(null)}>
            New Property
          </Button>
          <Modal
            isOpen={showModal}
            placement="center"
            onOpenChange={(open) => {
              if (!open) {
                setShowModal(false);
                setSelectedProperty(null);
                setWip(emptyProperty);
              }
            }}
          >
            <ModalContent>
              {(onModalClose) => (
                <>
                  <ModalHeader className="flex flex-col gap-1">
                    {selectedProperty ? "Edit User Property" : "Add User Property"}
                  </ModalHeader>
                  <ModalBody>
                    <Input
                      type="text"
                      label="Key"
                      placeholder="Enter key"
                      isInvalid={wipKeyExists}
                      errorMessage="Key must be unique"
                      value={wip.key}
                      onValueChange={(key) => setWip((prev) => ({ ...prev, key }))}
                    />
                    <Select
                      label="Value Type"
                      variant="bordered"
                      placeholder="Select a value type"
                      selectedKeys={[wip.type.toString()]}
                      disallowEmptySelection
                      className="max-w-xs"
                      onSelectionChange={(selected) => {
                        const key = Array.from(selected)[0];
                        if (key === undefined) return;
                        const type = Number(key) as solace.SDTFieldType;
                        setWip((prev) => ({
                          ...prev,
                          type,
                          text: type === solace.SDTFieldType.BOOL ? "false" : type === solace.SDTFieldType.STRING ? prev.text : "",
                        }));
                      }}
                    >
                      {EDITABLE_TYPES.map((type) => (
                        <SelectItem key={type.toString()}>{convertTypeToString(type)}</SelectItem>
                      ))}
                    </Select>
                    {getValueInput(wip.type, wip.text, (text) => setWip((prev) => ({ ...prev, text })), valueError)}
                  </ModalBody>
                  <ModalFooter>
                    <Button radius="sm" color="danger" variant="light" onPress={onModalClose}>
                      Close
                    </Button>
                    <Button
                      radius="sm"
                      color="primary"
                      isDisabled={disabledCreateButton}
                      onPress={() => {
                        setUserProperties((prev) => {
                          const next = { ...prev };
                          if (selectedProperty) delete next[selectedProperty];
                          next[trimmedKey] = { type: wip.type, value };
                          return next;
                        });
                        setManuallyOpen(true);
                        onModalClose();
                      }}
                    >
                      {selectedProperty ? "Save" : "Create"}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalContent>
          </Modal>
          <Table
            aria-label="User properties"
            classNames={{
              base: "max-h-[300px] overflow-y-auto",
            }}
            isHeaderSticky
            isCompact
          >
            <TableHeader>
              <TableColumn>Key</TableColumn>
              <TableColumn>Type</TableColumn>
              <TableColumn>Value</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyContent={"No rows to display."}>
              {Object.entries(userProperties).map(([key, { type, value }]) => (
                <TableRow key={key}>
                  <TableCell className="max-w-16 text-nowrap text-ellipsis overflow-hidden ...">{key}</TableCell>
                  <TableCell>{convertTypeToString(type)}</TableCell>
                  <TableCell className="max-w-16 text-nowrap text-ellipsis overflow-hidden ...">
                    {formatPropertyValue(value)}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Tooltip content="Edit property">
                      <Button
                        radius="sm"
                        isIconOnly
                        className="text-default-400 active:opacity-50"
                        isDisabled={disablePage}
                        size="sm"
                        variant="light"
                        aria-label={`Edit ${key}`}
                        onPress={() => openEditor(key)}
                      >
                        <Pencil />
                      </Button>
                    </Tooltip>
                    <Tooltip color="danger" content="Delete property">
                      <Button
                        radius="sm"
                        isIconOnly
                        isDisabled={disablePage}
                        size="sm"
                        variant="light"
                        className="text-danger active:opacity-50"
                        aria-label={`Delete ${key}`}
                        onPress={() => {
                          setUserProperties((prev) => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                          });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AccordionItem>
    </Accordion>
  );
};

export default UserProperties;
