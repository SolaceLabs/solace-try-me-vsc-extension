import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@nextui-org/react";
import { logger } from "../logger";

interface ErrorBoundaryProps {
  name: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps a render error in one section from unmounting the whole app, which would also
 * drop every live broker connection.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      `${this.props.name} crashed: ${error.message}\n${info.componentStack ?? ""}`.trim()
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="text-sm p-3 rounded-md bg-danger-50 text-danger flex flex-col gap-2">
          <p>
            Something went wrong in {this.props.name}: {this.state.error.message}
          </p>
          <Button size="sm" radius="sm" variant="flat" onPress={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
