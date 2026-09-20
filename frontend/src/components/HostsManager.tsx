import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle,
  Edit2,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "../constants/icons";
import { hostsApi } from "../services/api";
import { hostErrorMessage } from "../utils/hostErrors";
import { AgentAccessPanel } from "./AgentAccessPanel";
import { HostModal } from "./HostModal";
import type { Host } from "../types";

interface HostsManagerProps {
  hosts: Host[];
  onChanged: () => void;
  onError: (title: string, message: string) => void;
  /** Asks the user before something they cannot undo. */
  showConfirm: (message: string, onConfirm: () => Promise<void>) => void;
}

/**
 * The servers this dashboard reads, and their state.
 *
 * Each row says whether the server answered the last time it was read, because
 * a server that is merely unreachable looks exactly like a server with no
 * containers once its containers are missing from the list below.
 */
export const HostsManager: React.FC<HostsManagerProps> = ({
  hosts,
  onChanged,
  onError,
  showConfirm,
}) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Host | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);

  const handleRetry = useCallback(
    async (host: Host) => {
      setRetrying(host.id);
      try {
        await hostsApi.retry(host.id);
        onChanged();
      } catch (err: any) {
        onError(
          t("hosts.retryErrorTitle"),
          err.response?.data?.error || t("hosts.retryError"),
        );
      } finally {
        setRetrying(null);
      }
    },
    [onChanged, onError, t],
  );

  const openAdd = useCallback(() => {
    setEditing(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((host: Host) => {
    setEditing(host);
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    (host: Host) => {
      showConfirm(
        t("hosts.deleteConfirm", { name: host.name }),
        async () => {
          try {
            await hostsApi.delete(host.id);
            onChanged();
          } catch (err: any) {
            onError(
              t("hosts.deleteErrorTitle"),
              err.response?.data?.error || t("hosts.deleteError"),
            );
          }
        },
      );
    },
    [onChanged, onError, showConfirm, t],
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: "var(--color-background-contrast)" }}
          >
            <Server className="text-purple-500 w-6 h-6" /> {t("hosts.title")}
          </h2>
          <p
            className="text-sm mt-1"
            style={{
              color: "rgba(var(--color-background-contrast-rgb), 0.75)",
            }}
          >
            {t("hosts.description")}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-purple-600 hover:bg-purple-500 text-white px-3 md:px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20 font-medium"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden md:inline">{t("hosts.addServer")}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {hosts.map((host) => {
          const isLocal = host.type === "local";
          const Icon = isLocal ? HardDrive : Server;
          const online = host.status.online;

          return (
            <div
              key={host.id}
              className="rounded-2xl border border-white/10 p-4 flex flex-col gap-3"
              style={{
                backgroundColor: "var(--color-card-background)",
                color: "var(--color-background-contrast)",
                opacity: host.enabled ? 1 : 0.6,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="p-2 rounded-lg shrink-0"
                    style={{
                      backgroundColor: `${host.color || "#3b82f6"}22`,
                      color: host.color || "#3b82f6",
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{host.name}</p>
                    <p className="text-xs opacity-60 truncate">
                      {isLocal ? t("hosts.localServer") : host.url}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(host)}
                    aria-label={t("hosts.editServer")}
                    title={t("hosts.editServer")}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {!isLocal && (
                    <button
                      onClick={() => handleDelete(host)}
                      aria-label={t("hosts.deleteServer")}
                      title={t("hosts.deleteServer")}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {!host.enabled ? (
                <p className="text-xs opacity-60">{t("hosts.disabled")}</p>
              ) : online ? (
                <p className="text-xs text-green-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  {t("hosts.online", {
                    count: host.status.container_count ?? 0,
                  })}
                </p>
              ) : host.status.checked_at ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-400 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {hostErrorMessage(
                        t,
                        host.status.error_code,
                        host.status.error,
                        "hosts.offline",
                      )}
                    </span>
                  </p>
                  {/* A server that keeps failing is skipped for a while so it
                      does not slow every read down. That is the wrong answer
                      the moment it comes back, so there is a way to say so. */}
                  <button
                    onClick={() => handleRetry(host)}
                    disabled={retrying === host.id}
                    className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {retrying === host.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    {t("hosts.retryNow")}
                  </button>
                </div>
              ) : (
                <p className="text-xs opacity-60">{t("hosts.notCheckedYet")}</p>
              )}

              {/* Only this machine can hand out its own key. */}
              {host.agent && (
                <AgentAccessPanel
                  hostId={host.id}
                  access={host.agent}
                  onChanged={onChanged}
                  onError={onError}
                  showConfirm={showConfirm}
                />
              )}
            </div>
          );
        })}
      </div>

      <HostModal
        isOpen={modalOpen}
        host={editing}
        onSaved={onChanged}
        onClose={() => setModalOpen(false)}
        onError={onError}
      />
    </section>
  );
};
