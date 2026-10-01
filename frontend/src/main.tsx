import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n"; // Initialize i18n
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./contexts/ToastContext";

// Register the service worker for the PWA. From here rather than an inline
// <script> in index.html: the content-security-policy the server sends allows
// no inline scripts, so nothing on this origin can run code it did not ship.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.log("SW registration failed:", error);
    });
  });
}

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
