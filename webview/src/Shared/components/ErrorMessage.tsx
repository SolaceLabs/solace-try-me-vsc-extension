import React, { ReactNode } from "react";

interface ErrorMessageProps {
  children: ReactNode;
  variant?: "error" | "warning" | "info";
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ children, variant = "error" }) => {
  const colors =
    variant === "warning"
      ? "text-warning-700 bg-warning-100"
      : variant === "info"
      ? "text-default-700 bg-default-100"
      : "text-red-700 bg-red-100";
  return (
    <div className={`${colors} text-sm mt-2 p-2 rounded-md text-center break-words`} role={variant === "info" ? "status" : "alert"}>
      {children}
    </div>
  );
};

export default ErrorMessage;
