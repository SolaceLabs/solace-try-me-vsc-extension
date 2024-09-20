import { StrictMode } from "react";
import { ReactNode } from "react";
import { NextUIProvider } from "@nextui-org/react";

const Bootstrap = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <NextUIProvider>
      <main className="dark text-foreground bg-background w-full h-full p-2">{children}</main>
    </NextUIProvider>
  </StrictMode>
);

export default Bootstrap;
