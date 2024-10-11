/* eslint-disable react-refresh/only-export-components */
import AccordionItem from "./AccordionIemBase";
import Accordion from "./Accordion";

// export types
export type { AccordionProps } from "./Accordion";
export type { AccordionItemIndicatorProps } from "./AccordionIemBase";
export type { AccordionItemBaseProps as AccordionItemProps } from "./AccordionIemBase";

// export hooks
export { useAccordionItem } from "./useAccordionItem";
export { useAccordion } from "./useAccordion";

// export component
export { Accordion, AccordionItem };
