/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable react-hooks/exhaustive-deps */
import type {Variants} from "framer-motion";

import {forwardRef} from "@nextui-org/system";
import React, {useMemo, ReactNode} from "react";
import {ChevronIcon} from "@nextui-org/shared-icons";
import {AnimatePresence, LazyMotion, domAnimation, m, useWillChange} from "framer-motion";
import {TRANSITION_VARIANTS} from "@nextui-org/framer-utils";

import {UseAccordionItemProps, useAccordionItem} from "./useAccordionItem";


export interface AccordionItemProps extends UseAccordionItemProps {}

// The accordion root handles these keys for keyboard navigation between items. Stop them
// at the content so arrow/Home/End keys keep working in inputs and Escape does not collapse
// every panel. Other keys (Ctrl+C/V/A) still reach VS Code.
const NAVIGATION_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Escape",
]);

const stopNavigationKeys = (e: React.KeyboardEvent) => {
  if (NAVIGATION_KEYS.has(e.key)) e.stopPropagation();
};

const AccordionItem = forwardRef<"button", AccordionItemProps>((props, ref) => {
  const {
    Component,
    HeadingComponent,
    classNames,
    slots,
    indicator,
    children,
    title,
    subtitle,
    startContent,
    isOpen,
    isDisabled,
    hideIndicator,
    keepContentMounted,
    disableAnimation,
    motionProps,
    getBaseProps,
    getHeadingProps,
    getButtonProps,
    getTitleProps,
    getSubtitleProps,
    getContentProps,
    getIndicatorProps,
  } = useAccordionItem({...props, ref});

  const willChange = useWillChange();

  const indicatorContent = useMemo<ReactNode | null>(() => {
    if (typeof indicator === "function") {
      return indicator({indicator: <ChevronIcon />, isOpen, isDisabled});
    }

    if (indicator) return indicator;

    return null;
  }, [indicator, isOpen, isDisabled]);

  const indicatorComponent = indicatorContent || <ChevronIcon />;

  const content = useMemo(() => {
    if (disableAnimation) {
      return (
        <div onKeyDown={stopNavigationKeys}>
          <div {...getContentProps()}>{children}</div>
        </div>
      );
    }

    const transitionVariants: Variants = {
      exit: {...TRANSITION_VARIANTS.collapse.exit, overflowY: "hidden"},
      enter: {...TRANSITION_VARIANTS.collapse.enter, overflowY: "unset"},
    };

    return keepContentMounted ? (
      <LazyMotion features={domAnimation}>
        <m.section
          key="accordion-content"
          animate={isOpen ? "enter" : "exit"}
          exit="exit"
          initial="exit"
          style={{willChange}}
          variants={transitionVariants}
          {...motionProps}
          onKeyDown={stopNavigationKeys}
        >
          <div {...getContentProps()}>{children}</div>
        </m.section>
      </LazyMotion>
    ) : (
      <AnimatePresence initial={false}>
        {isOpen && (
          <LazyMotion features={domAnimation}>
            <m.section
              key="accordion-content"
              animate="enter"
              exit="exit"
              initial="exit"
              style={{willChange}}
              variants={transitionVariants}
              {...motionProps}
              onKeyDown={stopNavigationKeys}
            >
              <div {...getContentProps()}>{children}</div>
            </m.section>
          </LazyMotion>
        )}
      </AnimatePresence>
    );
  }, [isOpen, disableAnimation, keepContentMounted, children, motionProps]);

  return (
    <Component {...getBaseProps()}>
      <HeadingComponent {...getHeadingProps()}>
        <button {...getButtonProps()}>
          {startContent && (
            <div className={slots.startContent({class: classNames?.startContent})}>
              {startContent}
            </div>
          )}
          <div className={slots.titleWrapper({class: classNames?.titleWrapper})}>
            {title && <span {...getTitleProps()}>{title}</span>}
            {subtitle && <span {...getSubtitleProps()}>{subtitle}</span>}
          </div>
          {!hideIndicator && indicatorComponent && (
            <span {...getIndicatorProps()}>{indicatorComponent}</span>
          )}
        </button>
      </HeadingComponent>
      {content}
    </Component>
  );
});

AccordionItem.displayName = "NextUI.AccordionItem";

export default AccordionItem;