import { ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Chip, Divider, Input, Select, SelectItem, Tooltip } from "@nextui-org/react";
import {
  CaseSensitive,
  Check,
  Eraser,
  EyeOff,
  FileArchive,
  ListChecks,
  Pause,
  Play,
  Regex,
  Rows4,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import SolaceMessage, { MessageActions } from "./SolaceMessage";
import { Message } from "../Shared/interfaces";
import { usePersistentState } from "../Shared/usePersistentState";
import ErrorMessage from "../Shared/components/ErrorMessage";
import { wrappingTopicChip } from "../Shared/components/chipStyles";
import {
  compileFilter,
  countChips,
  DEFAULT_FILTER,
  DELIVERY_OPTIONS,
  MessageFilter,
  normalizeFilter,
  SEARCH_SCOPES,
  SearchScope,
  SOURCE_OPTIONS,
  TYPE_OPTIONS,
} from "./messageFilter";
import { saveMessagesZip } from "./messageArchive";

const BOUNCE_DELAY = 300;
const AUTO_PAUSE_SCROLL = 60;
const STATUS_TIMEOUT = 8000;
const EMPTY_SELECTION: ReadonlySet<string> = new Set();
const NO_MESSAGES: Message[] = [];

const PLACEHOLDERS: Record<SearchScope, string> = {
  all: "Filter by topic, payload or user property",
  topic: "Filter by topic",
  payload: "Filter by payload",
  userProperties: "Filter by user property key or value",
};

const plural = (count: number) => (count === 1 ? "1 message" : `${count} messages`);

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** A toggle styled as a chip. The check mark shows the state without relying on color. */
const FilterChip = ({
  label,
  isSelected,
  onPress,
  ariaLabel,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  ariaLabel?: string;
}) => (
  <Button
    size="sm"
    radius="full"
    variant={isSelected ? "solid" : "flat"}
    color={isSelected ? "primary" : "default"}
    className="h-6 min-w-0 px-2 gap-1"
    aria-pressed={isSelected}
    aria-label={ariaLabel}
    startContent={isSelected ? <Check size={12} aria-hidden /> : undefined}
    onPress={onPress}
  >
    {label}
  </Button>
);

const ChipGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-1 items-center">
    <span className="text-xs text-default-500 w-16 shrink-0">{label}</span>
    {children}
  </div>
);

const SearchToggle = ({
  label,
  isSelected,
  onPress,
  children,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  children: JSX.Element;
}) => (
  <Tooltip content={label}>
    <Button
      isIconOnly
      size="sm"
      radius="sm"
      variant={isSelected ? "solid" : "light"}
      color={isSelected ? "primary" : "default"}
      className="h-7 w-7 min-w-7"
      aria-label={label}
      aria-pressed={isSelected}
      onPress={onPress}
    >
      {children}
    </Button>
  </Tooltip>
);

interface MessagesViewProps {
  messages: Message[];
  maxPayloadLength: number;
  maxPropertyLength: number;
  paused: boolean;
  pendingCount: number;
  onPausedChange: (paused: boolean) => void;
  actions?: MessageActions;
  /** usePersistentState key for the filter, so each view keeps its own. */
  filterStateKey?: string;
}

const MessagesView = ({
  messages,
  maxPayloadLength,
  maxPropertyLength,
  paused,
  pendingCount,
  onPausedChange,
  actions,
  filterStateKey = "subscribe.messageFilter",
}: MessagesViewProps) => {
  const [storedFilter, setStoredFilter] = usePersistentState<MessageFilter>(filterStateKey, DEFAULT_FILTER);
  const filter = useMemo(() => normalizeFilter(storedFilter), [storedFilter]);
  const [bounceSearch, setBounceSearch] = useState(filter.query);
  const [compactView, setCompactView] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipsId = useId();

  const updateFilter = useCallback(
    (patch: Partial<MessageFilter>) => setStoredFilter((prev) => ({ ...normalizeFilter(prev), ...patch })),
    [setStoredFilter]
  );

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setStoredFilter((prev) => {
          const current = normalizeFilter(prev);
          return current.query === bounceSearch ? prev : { ...current, query: bounceSearch };
        }),
      BOUNCE_DELAY
    );
    return () => clearTimeout(timer);
  }, [bounceSearch, setStoredFilter]);

  useEffect(() => {
    if (!exportStatus || exportStatus.isError) return;
    const timer = setTimeout(() => setExportStatus(null), STATUS_TIMEOUT);
    return () => clearTimeout(timer);
  }, [exportStatus]);

  const compiled = useMemo(() => compileFilter(filter), [filter]);

  const filteredMessages = useMemo(
    () => (compiled.active ? messages.filter(compiled.test) : messages),
    [messages, compiled]
  );

  // Selection is kept by id, so it survives cards scrolling out of the virtualized list.
  const selectedMessages = useMemo(
    () => (selected.size ? messages.filter((m) => selected.has(m._extension_uid)) : NO_MESSAGES),
    [messages, selected]
  );

  // Messages that left the buffer (trimmed or cleared) are no longer selected.
  useEffect(() => {
    if (selectedMessages.length !== selected.size) {
      setSelected(new Set(selectedMessages.map((m) => m._extension_uid)));
    }
  }, [selectedMessages, selected]);

  const onSelectedChange = useCallback((message: Message, value: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(message._extension_uid);
      else next.delete(message._extension_uid);
      return next;
    });
  }, []);

  const onFilterTopic = useCallback((topic: string) => updateFilter({ topic }), [updateFilter]);
  const cardActions = useMemo(() => ({ ...actions, onFilterTopic }), [actions, onFilterTopic]);

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

  const exportZip = (list: Message[]) => {
    if (!list.length || exporting) return;
    setExporting(true);
    setExportStatus(null);
    // Let the spinner render before the archive is built on this thread.
    setTimeout(() => {
      saveMessagesZip(list)
        .then((result) => {
          if (result?.saved) {
            setExportStatus({
              text: `Exported ${plural(list.length)}${result.path ? ` to ${result.path}` : ""}.`,
              isError: false,
            });
          }
        })
        .catch((error: Error) => setExportStatus({ text: `Could not export: ${error.message}`, isError: true }))
        .finally(() => setExporting(false));
    }, 0);
  };

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => !prev);
    setSelected(EMPTY_SELECTION);
  };

  const selectAllListed = () =>
    setSelected((prev) => new Set([...prev, ...filteredMessages.map((m) => m._extension_uid)]));

  const clearFilters = () => {
    setBounceSearch("");
    updateFilter({
      query: "",
      sources: [],
      deliveryModes: [],
      messageTypes: [],
      redelivered: false,
      hasUserProperties: false,
      topic: null,
    });
  };

  const chipCount = countChips(filter);

  return (
    <div>
      <div className="flex gap-2 w-full items-start flex-wrap">
        <Input
          className="flex-1 min-w-[12rem]"
          placeholder={PLACEHOLDERS[filter.scope]}
          aria-label="Filter messages"
          value={bounceSearch}
          onValueChange={setBounceSearch}
          isInvalid={!!compiled.error}
          errorMessage={compiled.error}
          endContent={
            <Tooltip content="Clear Filter">
              <Button
                onPress={() => {
                  setBounceSearch("");
                  updateFilter({ query: "" });
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
        <div className="flex gap-2 items-center">
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
          <Tooltip content={selectionMode ? "Stop selecting messages" : "Select messages"}>
            <Button
              onPress={toggleSelectionMode}
              isIconOnly
              variant={selectionMode ? "shadow" : "light"}
              color={selectionMode ? "primary" : "default"}
              radius="sm"
              aria-label="Select messages"
              aria-pressed={selectionMode}
            >
              <ListChecks />
            </Button>
          </Tooltip>
          <Tooltip content="Export the listed messages as ZIP, one JSON file per message">
            <Button
              onPress={() => exportZip(filteredMessages)}
              isIconOnly
              variant="light"
              radius="sm"
              aria-label="Export listed as ZIP"
              isDisabled={!filteredMessages.length || exporting}
              isLoading={exporting && !selectionMode}
            >
              <FileArchive />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex gap-2 items-center mt-2 flex-wrap">
        <span className="text-xs text-default-500" aria-hidden>
          Search in
        </span>
        <Select
          size="sm"
          aria-label="Search in"
          className="w-40"
          disallowEmptySelection
          selectedKeys={[filter.scope]}
          onSelectionChange={(selection) => {
            const key = Array.from(selection)[0];
            if (SEARCH_SCOPES.some((s) => s.key === key)) updateFilter({ scope: key as SearchScope });
          }}
        >
          {SEARCH_SCOPES.map((scope) => (
            <SelectItem key={scope.key}>{scope.label}</SelectItem>
          ))}
        </Select>
        <div className="flex gap-0.5 items-center" role="group" aria-label="Search options">
          <SearchToggle
            label="Match case"
            isSelected={filter.caseSensitive}
            onPress={() => updateFilter({ caseSensitive: !filter.caseSensitive })}
          >
            <CaseSensitive size={16} />
          </SearchToggle>
          <SearchToggle
            label="Use regular expression"
            isSelected={filter.regex}
            onPress={() => updateFilter({ regex: !filter.regex })}
          >
            <Regex size={16} />
          </SearchToggle>
          <SearchToggle
            label="Hide matches (show messages that do not match)"
            isSelected={filter.invert}
            onPress={() => updateFilter({ invert: !filter.invert })}
          >
            <EyeOff size={16} />
          </SearchToggle>
        </div>
        <Button
          size="sm"
          radius="sm"
          variant={filter.showChips ? "flat" : "light"}
          startContent={<SlidersHorizontal size={14} aria-hidden />}
          aria-expanded={filter.showChips}
          aria-controls={chipsId}
          onPress={() => updateFilter({ showChips: !filter.showChips })}
        >
          Quick filters{chipCount ? ` (${chipCount})` : ""}
        </Button>
      </div>
      {filter.showChips && (
        <div id={chipsId} className="flex flex-col gap-1 mt-2">
          <ChipGroup label="Source">
            {SOURCE_OPTIONS.map((option) => (
              <FilterChip
                key={option.key}
                label={option.label}
                ariaLabel={`Source: ${option.label}`}
                isSelected={filter.sources.includes(option.key)}
                onPress={() => updateFilter({ sources: toggle(filter.sources, option.key) })}
              />
            ))}
          </ChipGroup>
          <ChipGroup label="Delivery">
            {DELIVERY_OPTIONS.map((option) => (
              <FilterChip
                key={option.key}
                label={option.label}
                ariaLabel={`Delivery mode: ${option.label}`}
                isSelected={filter.deliveryModes.includes(option.key)}
                onPress={() => updateFilter({ deliveryModes: toggle(filter.deliveryModes, option.key) })}
              />
            ))}
          </ChipGroup>
          <ChipGroup label="Type">
            {TYPE_OPTIONS.map((option) => (
              <FilterChip
                key={option.key}
                label={option.label}
                ariaLabel={`Message type: ${option.label}`}
                isSelected={filter.messageTypes.includes(option.key)}
                onPress={() => updateFilter({ messageTypes: toggle(filter.messageTypes, option.key) })}
              />
            ))}
          </ChipGroup>
          <ChipGroup label="Only">
            <FilterChip
              label="Redelivered"
              isSelected={filter.redelivered}
              onPress={() => updateFilter({ redelivered: !filter.redelivered })}
            />
            <FilterChip
              label="Has user properties"
              isSelected={filter.hasUserProperties}
              onPress={() => updateFilter({ hasUserProperties: !filter.hasUserProperties })}
            />
          </ChipGroup>
        </div>
      )}
      {selectionMode && (
        <div className="flex gap-2 items-center flex-wrap mt-2 p-2 rounded-medium bg-default-100">
          <span className="text-sm" aria-live="polite">
            {selectedMessages.length} selected
          </span>
          <Button size="sm" radius="sm" variant="flat" onPress={selectAllListed} isDisabled={!filteredMessages.length}>
            Select all listed
          </Button>
          <Button size="sm" radius="sm" variant="flat" onPress={() => setSelected(EMPTY_SELECTION)} isDisabled={!selected.size}>
            Clear selection
          </Button>
          <Button
            size="sm"
            radius="sm"
            color="primary"
            startContent={exporting ? undefined : <FileArchive size={14} aria-hidden />}
            isLoading={exporting}
            isDisabled={!selectedMessages.length || exporting}
            onPress={() => exportZip(selectedMessages)}
          >
            Export selected as ZIP
          </Button>
        </div>
      )}
      {exportStatus && <ErrorMessage variant={exportStatus.isError ? "error" : "info"}>{exportStatus.text}</ErrorMessage>}
      <div className="flex gap-2 items-center mt-1 ml-3 flex-wrap">
        {compiled.active && (
          <p className="text-sm text-gray-500" aria-live="polite">
            Showing {filteredMessages.length} of {messages.length} messages.
          </p>
        )}
        {filter.topic !== null && (
          <Chip
            size="sm"
            variant="flat"
            color="primary"
            classNames={wrappingTopicChip}
            endContent={
              <button
                type="button"
                aria-label={`Remove topic filter ${filter.topic}`}
                className="mx-1 rounded-full opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => updateFilter({ topic: null })}
              >
                <X size={14} />
              </button>
            }
          >
            Topic: {filter.topic}
          </Chip>
        )}
        {(compiled.active || !!bounceSearch) && (
          <Button size="sm" radius="full" variant="light" className="h-6 min-w-0" onPress={clearFilters}>
            Clear all filters
          </Button>
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
                    highlight={compiled.highlight}
                    actions={cardActions}
                    selectable={selectionMode}
                    selected={selected.has(message._extension_uid)}
                    onSelectedChange={onSelectedChange}
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
