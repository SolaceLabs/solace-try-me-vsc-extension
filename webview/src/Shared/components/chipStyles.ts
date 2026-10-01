/** Lets a chip wrap long text instead of growing wider than its container. */
export const wrappingChip = {
  base: "max-w-full h-auto min-h-6 py-1",
  content: "whitespace-normal break-words",
};

/** Like wrappingChip, but breaks anywhere: topics have no spaces to wrap at. */
export const wrappingTopicChip = {
  base: "max-w-full h-auto min-h-7 py-1",
  content: "whitespace-normal break-all",
};
