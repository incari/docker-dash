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

/** Enough of the key to recognise it, without filling the card with hex. */
function abbreviate(key: string): string {
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/**
 * This machine's own API key, on its own server card.
 *
 * It lives here so setting up a fleet needs no terminal: open this machine's
 * dashboard, allow it to be read, copy the key, paste it into the hub. Showing
 * the key on this page gives away nothing the page does not already offer -
 * there is no login, and anyone looking at it can already start and stop these
 * containers.
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
    try {
      await navigator.clipboard.writeText(access.api_key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused on plain HTTP in some browsers, and the
      // key is useless if it cannot be got out of here - so reveal it instead
      // and let the user select it by hand.
      setRevealed(true);
      onError(t("hosts.agent.copyFailedTitle"), t("hosts.agent.copyFailed"));
    }
  }, [access.api_key, onError, t]);

  const handleRotate = useCallback(() => {
    showConfirm(t("hosts.agent.rotateConfirm"), async () => {
      setBusy(true);
      try {
        await hostsApi.rotateApiKey(hostId);
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
              {revealed ? access.api_key : abbreviate(access.api_key)}
            </code>
            <button
              onClick={() => setRevealed((prev) => !prev)}
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
