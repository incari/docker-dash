import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  RefreshCw,
} from "../constants/icons";
import { hostsApi } from "../services/api";
import type { AgentAccess } from "../types";

interface AgentAccessPanelProps {
  hostId: number;
  access: AgentAccess;
  onChanged: () => void;
  onError: (title: string, message: string) => void;
  showConfirm: (message: string, onConfirm: () => Promise<void>) => void;
}

/**
 * This machine's own API key, on its own server card.
 *
 * It lives here so setting up a fleet needs no terminal: open this machine's
 * dashboard, allow it to be read, copy the key, paste it into the hub.
 *
 * The key is fetched when the person asks for it - to see it or to copy it -
 * rather than arriving with the host list that every tab polls. A secret that
 * is in every response is a secret in every proxy log and browser extension.
 */
export const AgentAccessPanel: React.FC<AgentAccessPanelProps> = ({
  hostId,
  access,
  onChanged,
  onError,
  showConfirm,
}) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  // Fetched once per card and dropped when the key is replaced, so the copy
  // button never hands out a key that no longer opens anything.
  const loadKey = useCallback(async (): Promise<string> => {
    if (key) return key;
    const fetched = await hostsApi.getApiKey(hostId);
    setKey(fetched);
    return fetched;
  }, [hostId, key]);

  const handleReveal = useCallback(async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    try {
      await loadKey();
      setRevealed(true);
    } catch (err: any) {
      onError(
        t("hosts.agent.keyErrorTitle"),
        err.response?.data?.error || t("hosts.agent.keyError"),
      );
    }
  }, [loadKey, onError, revealed, t]);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setBusy(true);
      try {
        await hostsApi.setAgentEnabled(hostId, enabled);
        onChanged();
      } catch (err: any) {
        onError(
          t("hosts.agent.toggleErrorTitle"),
          err.response?.data?.error || t("hosts.agent.toggleError"),
        );
      } finally {
        setBusy(false);
      }
    },
    [hostId, onChanged, onError, t],
  );

  const handleCopy = useCallback(async () => {
    let value: string;
    try {
      value = await loadKey();
    } catch (err: any) {
      onError(
        t("hosts.agent.keyErrorTitle"),
        err.response?.data?.error || t("hosts.agent.keyError"),
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused on plain HTTP in some browsers, and the
      // key is useless if it cannot be got out of here - so reveal it instead
      // and let the user select it by hand.
      setRevealed(true);
      onError(t("hosts.agent.copyFailedTitle"), t("hosts.agent.copyFailed"));
    }
  }, [loadKey, onError, t]);

  const handleRotate = useCallback(() => {
    showConfirm(t("hosts.agent.rotateConfirm"), async () => {
      setBusy(true);
      try {
        await hostsApi.rotateApiKey(hostId);
        setKey(null);
        setRevealed(false);
        onChanged();
      } catch (err: any) {
        onError(
          t("hosts.agent.rotateErrorTitle"),
          err.response?.data?.error || t("hosts.agent.rotateError"),
        );
      } finally {
        setBusy(false);
      }
    });
  }, [hostId, onChanged, onError, showConfirm, t]);

  return (
    <div className="pt-3 border-t border-white/10 space-y-2">
      <label className="flex items-start gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={access.enabled}
          disabled={access.managed_by_env || busy}
          onChange={(e) => handleToggle(e.target.checked)}
          className="w-3.5 h-3.5 mt-0.5 shrink-0 accent-purple-500 disabled:opacity-50"
        />
        <span className="opacity-80">{t("hosts.agent.allowHub")}</span>
      </label>

      {access.managed_by_env && (
        <p className="text-xs opacity-60 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {t("hosts.agent.managedByEnv")}
        </p>
      )}

      {access.enabled && (
        <>
          <div className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 shrink-0 opacity-50" />
            <code className="text-xs font-mono truncate opacity-80 min-w-0 flex-1">
              {revealed && key ? key : t("hosts.agent.keyHidden")}
            </code>
            <button
              onClick={handleReveal}
              aria-label={
                revealed ? t("hosts.agent.hide") : t("hosts.agent.reveal")
              }
              title={revealed ? t("hosts.agent.hide") : t("hosts.agent.reveal")}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
            >
              {revealed ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={handleCopy}
              aria-label={t("hosts.agent.copy")}
              title={t("hosts.agent.copy")}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            {!access.managed_by_env && (
              <button
                onClick={handleRotate}
                disabled={busy}
                aria-label={t("hosts.agent.rotate")}
                title={t("hosts.agent.rotate")}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
          <p className="text-xs opacity-60">{t("hosts.agent.keyHint")}</p>
        </>
      )}
    </div>
  );
};
