/* eslint-disable react-refresh/only-export-components */
import React, { ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { PublishConfigs } from "../interfaces";

interface Draft {
  id: number;
  config: PublishConfigs;
}

interface PublishDraftContextValue {
  draft: Draft | null;
  /** Fills the Publish view with this config and expands it. */
  sendToPublish: (config: PublishConfigs) => void;
}

const PublishDraftContext = React.createContext<PublishDraftContextValue>({
  draft: null,
  sendToPublish: () => {},
});

export const PublishDraftProvider = ({
  children,
  onDraft,
}: {
  children: ReactNode;
  onDraft?: () => void;
}) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const sendToPublish = useCallback(
    (config: PublishConfigs) => {
      setDraft((prev) => ({ id: (prev?.id ?? 0) + 1, config }));
      onDraft?.();
    },
    [onDraft]
  );
  const value = useMemo(() => ({ draft, sendToPublish }), [draft, sendToPublish]);
  return <PublishDraftContext.Provider value={value}>{children}</PublishDraftContext.Provider>;
};

export const usePublishDraft = () => useContext(PublishDraftContext);
