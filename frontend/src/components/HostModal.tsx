import React, { useCallback, useEffect, useId, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle, Loader2 } from "../constants/icons";
import { hostsApi, type HostTestResult } from "../services/api";
import { hostErrorMessage } from "../utils/hostErrors";
import { useModalA11y } from "../hooks/useModalA11y";
import type { Host } from "../types";

interface HostModalProps {
  isOpen: boolean;
  /** null adds a server; a host edits that one. */
  host: Host | null;
  onSaved: () => void;
  onClose: () => void;
  onError: (title: string, message: string) => void;
}

const PRESET_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ec4899",
  "#14b8a6",
];

/**
 * Add or edit a server.
 *
 * The key is write-only: it is never sent to the browser, so the field starts
 * empty when editing and an empty field means "keep the one already saved".
 */
export const HostModal: React.FC<HostModalProps> = ({
  isOpen,
  host,
  onSaved,
  onClose,
  onError,
}) => {
  const { t } = useTranslation();
  const isEdit = Boolean(host);
  const isLocal = host?.type === "local";

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hostname, setHostname] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [enabled, setEnabled] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<HostTestResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(host?.name ?? "");
    setUrl(host?.url ?? "");
    setApiKey("");
    setHostname(host?.hostname ?? "");
    setColor(host?.color ?? PRESET_COLORS[0]);
    setEnabled(host?.enabled ?? true);
    setTestResult(null);
  }, [host, isOpen]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(
        await hostsApi.test({
          id: host?.id,
          url: url.trim(),
          api_key: apiKey.trim(),
        }),
      );
    } catch (err: any) {
      setTestResult({
        ok: false,
        error: err.response?.data?.error || t("hosts.testFailed"),
      });
    } finally {
      setTesting(false);
    }
  }, [host?.id, url, apiKey, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;

      setSaving(true);
      try {
        const payload = {
          name: name.trim(),
          url: url.trim(),
          // An empty key leaves the saved one in place.
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          hostname: hostname.trim(),
          color,
          enabled,
        };

        if (host) {
          await hostsApi.update(host.id, payload);
        } else {
          await hostsApi.create(payload);
        }
        onSaved();
        onClose();
      } catch (err: any) {
        onError(
          t("hosts.saveErrorTitle"),
          err.response?.data?.error || t("hosts.saveError"),
        );
      } finally {
        setSaving(false);
      }
    },
    [name, url, apiKey, hostname, color, enabled, host, onSaved, onClose, onError, t],
  );

  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const inputClasses =
    "w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-md"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-5"
        >
          <h3
            id={titleId}
            className="text-xl font-bold text-white"
          >
            {isEdit ? t("hosts.editServer") : t("hosts.addServer")}
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {t("hosts.name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("hosts.namePlaceholder")}
              className={inputClasses}
              autoFocus
            />
          </div>

          {!isLocal && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t("hosts.url")}
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://192.168.1.10:3080"
                  className={inputClasses}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {t("hosts.urlHint")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t("hosts.apiKey")}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    host?.has_api_key
                      ? t("hosts.apiKeyKeepPlaceholder")
                      : t("hosts.apiKeyPlaceholder")
                  }
                  autoComplete="new-password"
                  className={inputClasses}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {t("hosts.apiKeyHint")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t("hosts.hostname")}
                </label>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder={t("hosts.hostnamePlaceholder")}
                  className={inputClasses}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {t("hosts.hostnameHint")}
                </p>
              </div>
            </>
          )}

          <div>
            <span className="block text-sm font-medium text-slate-300 mb-2">
              {t("hosts.color")}
            </span>
            <div className="flex gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={preset}
                  aria-pressed={color === preset}
                  onClick={() => setColor(preset)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === preset
                      ? "ring-2 ring-white scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            {t("hosts.enabled")}
          </label>

          {!isLocal && testResult && (
            <div
              className={`flex items-start gap-2 text-sm rounded-xl p-3 ${
                testResult.ok
                  ? "bg-green-500/10 text-green-300"
                  : "bg-red-500/10 text-red-300"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>
                {testResult.ok
                  ? t("hosts.testOk", { count: testResult.containers ?? 0 })
                  : hostErrorMessage(
                      t,
                      testResult.error_code,
                      testResult.error,
                      "hosts.testFailed",
                    )}
              </span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            {!isLocal && (
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !url.trim()}
                className="px-4 py-3 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("hosts.test")}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold transition-colors"
            >
              {isEdit ? t("common.save") : t("common.create")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
