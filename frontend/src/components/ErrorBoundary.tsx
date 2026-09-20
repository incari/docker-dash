import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw } from "../constants/icons";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Names the part that failed, so the message can say what is missing. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** The fallback is its own component so it can use hooks - the boundary cannot. */
const ErrorCard: React.FC<{ error: Error; onRetry: () => void }> = ({
  error,
  onRetry,
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="m-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center"
    >
      <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
      <p
        className="font-semibold"
        style={{ color: "var(--color-background-contrast)" }}
      >
        {t("errors.boundaryTitle")}
      </p>
      <p className="text-sm text-slate-400 mt-1">
        {t("errors.boundaryDescription")}
      </p>

      {/* The message itself, because "something went wrong" helps nobody
          report a bug. */}
      <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-900/60 p-3 text-left text-xs text-slate-400 whitespace-pre-wrap">
        {error.message}
      </pre>

      <div className="mt-4 flex justify-center gap-3">
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {t("errors.boundaryRetry")}
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
        >
          {t("errors.boundaryReload")}
        </button>
      </div>
    </div>
  );
};

/**
 * Keeps one broken render from blanking the page.
 *
 * React unmounts the whole tree when a render throws, so without a boundary any
 * single malformed shortcut - or a card reading a field the server stopped
 * sending - leaves a white screen with no way back but a reload the user has to
 * think of themselves.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(
      `[ErrorBoundary]${this.props.label ? ` ${this.props.label}:` : ""}`,
      error,
      info.componentStack,
    );
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <ErrorCard
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
