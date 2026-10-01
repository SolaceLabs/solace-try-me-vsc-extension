import React, { ReactNode } from "react";
import { X } from "lucide-react";

interface ErrorMessageProps {
  children: ReactNode;
  variant?: "error" | "warning" | "info";
  className?: string;
  /** Shows a close button. */
  onClose?: () => void;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ children, variant = "error", className = "", onClose }) => {
  const colors =
    variant === "warning"
      ? "text-warning-700 bg-warning-100"
      : variant === "info"
      ? "text-default-700 bg-default-100"
      : "text-red-700 bg-red-100";
  return (
    <div
      className={`${colors} text-sm mt-2 p-2 rounded-md text-center break-words ${onClose ? "relative pr-8" : ""} ${className}`}
      role={variant === "info" ? "status" : "alert"}
    >
      {children}
      {onClose && (
        <button
          type="button"
          aria-label="Dismiss"
          className="absolute top-1/2 right-2 -translate-y-1/2 opacity-70 hover:opacity-100"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
