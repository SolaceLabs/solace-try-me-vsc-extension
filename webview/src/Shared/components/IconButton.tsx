import { Button, Tooltip } from "@nextui-org/react";

interface IconButtonProps {
  /** Shown as the tooltip and used as the accessible name. */
  label: string;
  onPress: () => void;
  children: JSX.Element;
  isDisabled?: boolean;
}

/** A minimal icon-only toolbar button with a tooltip. */
const IconButton = ({ label, onPress, children, isDisabled }: IconButtonProps) => (
  <Tooltip content={label}>
    <Button isIconOnly variant="light" radius="sm" aria-label={label} onPress={onPress} isDisabled={isDisabled}>
      {children}
    </Button>
  </Tooltip>
);

export default IconButton;
