import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n"; // Initialize i18n
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./contexts/ToastContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      {/* Last line of defence: a render that throws shows a message with a way
          out instead of a blank page. */}
      <ErrorBoundary label="app">
        <App />
      </ErrorBoundary>
    </ToastProvider>
  </StrictMode>,
);
