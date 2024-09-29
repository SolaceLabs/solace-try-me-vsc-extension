import React, { ReactNode } from "react";

interface ErrorMessageProps {
  children: ReactNode;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ children }) => {
  return (
    <div className="text-red-700 text-sm mt-2 bg-red-100 p-2 rounded-md text-center">
      {children}
    </div>
  );
};

export default ErrorMessage;
