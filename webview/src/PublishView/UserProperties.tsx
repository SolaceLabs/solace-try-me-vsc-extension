import React, { useEffect } from "react";
import { useState } from "react";
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
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
} from "@nextui-org/react";
import { Pencil, Trash2 } from "lucide-react";
import solace from "solclientjs";

import { Accordion, AccordionItem } from "../Shared/components/Accordion";
import { UserPropertiesMap } from "../Shared/interfaces";
import { convertTypeToString } from "../Shared/utils";

type UserPropertiesProps = {
  userProperties: UserPropertiesMap;
  setUserProperties: React.Dispatch<React.SetStateAction<UserPropertiesMap>>;
  disablePage?: boolean;
};

const getValueInput = (
  type: solace.SDTFieldType,
  value: unknown,
  setValue: (value: unknown) => void
) => {
  switch (type) {
    case solace.SDTFieldType.BOOL:
      return (
        <RadioGroup
          value={String(value ?? "false")}
          onChange={(e) => setValue(e.target.value === "true")}
        >
          <Radio value={"true"}>True</Radio>
          <Radio value={"false"}>False</Radio>
        </RadioGroup>
      );
    case solace.SDTFieldType.INT8:
    case solace.SDTFieldType.INT16:
    case solace.SDTFieldType.INT32:
    case solace.SDTFieldType.INT64:
    case solace.SDTFieldType.UINT8:
    case solace.SDTFieldType.UINT16:
    case solace.SDTFieldType.UINT32:
    case solace.SDTFieldType.UINT64:
      return (
        <Input
          type="number"
          label="Value"
          placeholder="Enter value"
          step={1}
          value={(value as string) ?? "0"}
          onChange={(e) => setValue(Math.floor(Number(e.target.value)))}
        />
      );
    case solace.SDTFieldType.FLOATTYPE:
    case solace.SDTFieldType.DOUBLETYPE:
      return (
        <Input
          type="number"
          label="Value"
          placeholder="Enter value"
          step={0.01}
          value={(value as string) ?? "0"}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      );
    case solace.SDTFieldType.WCHAR:
    case solace.SDTFieldType.STRING:
      return (
        <Textarea
          label="Value"
          placeholder="Enter value"
          value={(value as string) ?? ""}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    default:
      return <></>;
  }
};

const UserProperties = ({
  userProperties,
  setUserProperties,
  disablePage = false,
}: UserPropertiesProps) => {
  const [openUserProperties, setOpenUserProperties] = useState(
    () => Object.keys(userProperties).length > 0
  );
  const [showModal, setShowModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [wipProperty, setWipProperty] = useState<{
    key: string;
    type: solace.SDTFieldType;
    value: unknown;
  }>({
    key: "",
    type: solace.SDTFieldType.STRING,
    value: undefined,
  });

  useEffect(() => {
    setOpenUserProperties(() => Object.keys(userProperties).length > 0);
  }, [userProperties]);

  useEffect(() => {
    if (selectedProperty) {
      const { type, value } = userProperties[selectedProperty];
      setWipProperty({ key: selectedProperty, type, value });
    }
  }, [selectedProperty, userProperties]);

  const wipKeyExists =
    wipProperty.key !== selectedProperty &&
    Object.keys(userProperties).includes(wipProperty.key);

  const disabledCreateButton =
    !wipProperty.key || wipProperty.value === undefined || wipKeyExists;

  return (
    <Accordion
      isCompact
      selectedKeys={openUserProperties ? ["user-properties"] : []}
      onSelectionChange={(selectedKeys) => {
        if (Array.from(selectedKeys).length) {
          setOpenUserProperties(true);
        } else {
          setOpenUserProperties(false);
        }
      }}
    >
      <AccordionItem
        key="user-properties"
        aria-label="user-properties"
        subtitle="User Properties"
      >
        <div className="flex flex-col gap-4 pl-2">
          <Button
            size="sm"
            isDisabled={disablePage}
            onClick={() => {
              setSelectedProperty(null);
              setShowModal(true);
            }}
          >
            New Property
          </Button>
          <Modal
            isOpen={showModal}
            placement="center"
            onOpenChange={(open) => {
              if (!open) {
                setShowModal(false);
                setSelectedProperty(null);
                setWipProperty({
                  key: "",
                  type: solace.SDTFieldType.STRING,
                  value: undefined,
                });
              }
            }}
          >
            <ModalContent>
              {(onModalClose) => (
                <>
                  <ModalHeader className="flex flex-col gap-1">
                    Add User Property
                  </ModalHeader>
                  <ModalBody>
                    <Input
                      type="text"
                      label="Key"
                      placeholder="Enter key"
                      isInvalid={wipKeyExists}
                      errorMessage="Key must be unique"
                      value={wipProperty.key}
                      onChange={(e) =>
                        setWipProperty((prev) => ({
                          ...prev,
                          key: e.target.value,
                        }))
                      }
                    />
                    <Select
                      label="Value Type"
                      variant="bordered"
                      placeholder="Select a value type"
                      selectedKeys={[wipProperty.type.toString()]}
                      className="max-w-xs"
                      onSelectionChange={(selected) => {
                        if ((selected as Set<string>).size === 0) return;
                        const newType = Number(
                          Array.from(selected)[0]
                        ) as solace.SDTFieldType;

                        setWipProperty((prev) => ({
                          ...prev,
                          value:
                            newType === solace.SDTFieldType.BOOL
                              ? false
                              : newType === solace.SDTFieldType.STRING
                              ? undefined
                              : 0,
                          type: newType,
                        }));
                      }}
                    >
                      <SelectItem
                        key={solace.SDTFieldType.STRING}
                        value={solace.SDTFieldType.STRING}
                      >
                        {convertTypeToString(solace.SDTFieldType.STRING)}
                      </SelectItem>
                      <SelectItem
                        key={solace.SDTFieldType.INT64}
                        value={solace.SDTFieldType.INT64}
                      >
                        {convertTypeToString(solace.SDTFieldType.INT64)}
                      </SelectItem>
                      <SelectItem
                        key={solace.SDTFieldType.FLOATTYPE}
                        value={solace.SDTFieldType.FLOATTYPE}
                      >
                        {convertTypeToString(solace.SDTFieldType.FLOATTYPE)}
                      </SelectItem>
                      <SelectItem
                        key={solace.SDTFieldType.BOOL}
                        value={solace.SDTFieldType.BOOL}
                      >
                        {convertTypeToString(solace.SDTFieldType.BOOL)}
                      </SelectItem>
                    </Select>
                    {getValueInput(
                      wipProperty.type,
                      wipProperty.value,
                      (value: unknown) => {
                        setWipProperty((prev) => ({
                          ...prev,
                          value,
                        }));
                      }
                    )}
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      color="danger"
                      variant="light"
                      onPress={() => {
                        onModalClose();
                      }}
                    >
                      Close
                    </Button>
                    <Button
                      color="primary"
                      isDisabled={disabledCreateButton}
                      onPress={() => {
                        if (selectedProperty) {
                          setUserProperties((prev) => {
                            const newProps = { ...prev };
                            delete newProps[selectedProperty];
                            newProps[wipProperty.key] = {
                              type: wipProperty.type,
                              value: wipProperty.value,
                            };
                            return newProps;
                          });
                        } else {
                          setUserProperties((prev) => ({
                            ...prev,
                            [wipProperty.key]: {
                              type: wipProperty.type,
                              value: wipProperty.value,
                            },
                          }));
                        }
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
            aria-label="Broker Configurations List"
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
                  <TableCell className="max-w-16 text-nowrap text-ellipsis overflow-hidden ...">
                    {key}
                  </TableCell>
                  <TableCell>{convertTypeToString(type)}</TableCell>
                  <TableCell className="max-w-16 text-nowrap text-ellipsis overflow-hidden ...">
                    {String(value)}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Tooltip content="Edit Broker Config">
                      <Button
                        isIconOnly
                        className="text-default-400 active:opacity-50"
                        isDisabled={disablePage}
                        size="sm"
                        variant="light"
                        onClick={() => {
                          setSelectedProperty(key);
                          setShowModal(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                    </Tooltip>
                    <Tooltip color="danger" content="Delete Broker Config">
                      <Button
                        isIconOnly
                        isDisabled={disablePage}
                        size="sm"
                        variant="light"
                        className="text-danger active:opacity-50"
                        onClick={() => {
                          setUserProperties((prev) => {
                            const newProps = { ...prev };
                            delete newProps[key];
                            return newProps;
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
