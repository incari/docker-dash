import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import {
  Plus,
  ArrowLeft,
  LinkIcon,
  Server,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Layers,
} from "../constants/icons";
import { useTranslation } from "react-i18next";
import {
  ShortcutCard,
  ShortcutCardCompact,
  ShortcutCardIcon,
  ShortcutCardList,
  ShortcutCardTable,
} from "../components";
import { getContainerIcon } from "../utils/dockerIconVault";
import { selectBestContainerPort } from "../utils/containerPorts";
import {
  parseQuery,
  matchesContainer,
  matchesShortcut,
} from "../utils/search";
import { HostsManager } from "../components/HostsManager";
import type {
  DockerContainer,
  Host,
  Shortcut,
  ViewMode,
  MobileColumns,
} from "../types";

/**
 * Group containers by compose project
 * Returns { grouped: Map<string, DockerContainer[]>, ungrouped: DockerContainer[] }
 * Note: Single-container compose projects are treated as ungrouped
 */
function groupContainersByComposeProject(containers: DockerContainer[]) {
  const tempGrouped = new Map<string, DockerContainer[]>();
  const ungrouped: DockerContainer[] = [];

  // First pass: group all containers by compose project
  for (const container of containers) {
    if (container.composeProject) {
      const existing = tempGrouped.get(container.composeProject) || [];
      existing.push(container);
      tempGrouped.set(container.composeProject, existing);
    } else {
      ungrouped.push(container);
    }
  }

  // Second pass: move single-container groups to ungrouped
  const grouped = new Map<string, DockerContainer[]>();
  for (const [projectName, projectContainers] of tempGrouped) {
    if (projectContainers.length === 1) {
      const container = projectContainers[0];
      if (container) {
        ungrouped.push(container);
      }
    } else {
      grouped.set(projectName, projectContainers);
    }
  }

  return { grouped, ungrouped };
}

interface ManagementViewProps {
  containers: DockerContainer[];
  shortcuts: Shortcut[];
  hosts: Host[];
  tailscaleInfo: { available: boolean; ip: string | null };
  setView: (view: "dashboard" | "add") => void;
  setEditingShortcut: (shortcut: Shortcut | null) => void;
  setIsModalOpen: (open: boolean) => void;
  openEditModal: (shortcut: Shortcut) => void;
  handleDelete: (id: number) => void;
  handleStart: (hostId: number, id: string) => void;
  handleStop: (hostId: number, id: string) => void;
  handleRestart?: (hostId: number, id: string) => void;
  onHostsChanged: () => void;
  onError: (title: string, message: string) => void;
  showHostConfirm: (message: string, onConfirm: () => Promise<void>) => void;
  handleQuickAdd: (container: DockerContainer) => void;
  handleQuickAddAsFavorite: (container: DockerContainer) => void;
  handleToggleFavorite: (id: number, currentStatus: boolean | number) => void;
  viewMode: ViewMode;
  mobileColumns: MobileColumns;
  searchQuery: string;
}

/**
 * Get the appropriate card component based on view mode
 */
function getCardComponentForViewMode(viewMode: ViewMode) {
  switch (viewMode) {
    case "compact":
      return ShortcutCardCompact;
    case "icon":
      return ShortcutCardIcon;
    case "list":
      return ShortcutCardList;
    case "table":
      return ShortcutCardTable;
    default:
      return ShortcutCard;
  }
}

/**
 * Get grid layout classes based on view mode and mobile columns setting
 */
function getGridLayoutClasses(
  viewMode: ViewMode,
  mobileColumns: MobileColumns,
): string {
  const mobileClass = mobileColumns === 1 ? "grid-cols-1" : "grid-cols-2";

  switch (viewMode) {
    case "compact":
      return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`;
    case "icon":
      return `grid ${mobileClass} md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3`;
    case "list":
      return `grid ${mobileClass} md:grid-cols-1 gap-3`;
    case "table":
      return `grid ${mobileClass} md:grid-cols-1 gap-2`;
    default:
      return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`;
  }
}

export function ManagementView({
  containers,
  shortcuts,
  hosts,
  tailscaleInfo,
  setView,
  setEditingShortcut,
  setIsModalOpen,
  openEditModal,
  handleDelete,
  handleStart,
  handleStop,
  handleRestart,
  handleQuickAdd,
  handleQuickAddAsFavorite,
  handleToggleFavorite,
  viewMode,
  mobileColumns,
  searchQuery,
  onHostsChanged,
  onError,
  showHostConfirm,
}: ManagementViewProps) {
  const { t } = useTranslation();
  const searchTerms = useMemo(() => parseQuery(searchQuery), [searchQuery]);
  // Custom shortcuts are those NOT linked to any container
  // A shortcut is linked to a container if it has container_name or container_match_name
  // Custom shortcuts are manual URL entries and port-based shortcuts without a container
  const customShortcuts = useMemo(
    () =>
      shortcuts
        .filter((s) => !s.container_name && !s.container_match_name)
        .filter((s) => matchesShortcut(s, null, searchTerms)),
    [shortcuts, searchTerms],
  );

  const visibleContainers = useMemo(
    () => containers.filter((c) => matchesContainer(c, searchTerms)),
    [containers, searchTerms],
  );
  const CardComponent = getCardComponentForViewMode(viewMode);
  const gridClasses = getGridLayoutClasses(viewMode, mobileColumns);

  /**
   * Containers grouped by the server they run on, in the order the servers are
   * listed. This is the view where a fleet has to be legible: the same image
   * runs on several machines, and a flat list of thirty containers says nothing
   * about which box to look at.
   *
   * A container whose server is no longer in the list still appears, under its
   * own heading, rather than disappearing from the page.
   */
  const containersByHost = useMemo(() => {
    const remaining = new Map<number, DockerContainer[]>();
    for (const container of visibleContainers) {
      const list = remaining.get(container.hostId) || [];
      list.push(container);
      remaining.set(container.hostId, list);
    }

    const ordered: Array<{
      hostId: number;
      host: Host | undefined;
      containers: DockerContainer[];
    }> = [];

    for (const host of hosts) {
      const list = remaining.get(host.id);
      if (list && list.length > 0) {
        ordered.push({ hostId: host.id, host, containers: list });
        remaining.delete(host.id);
      }
    }
    for (const [hostId, list] of remaining) {
      ordered.push({ hostId, host: undefined, containers: list });
    }

    return ordered;
  }, [visibleContainers, hosts]);

  // Only one server: the heading would name the one thing already on screen.
  const showHostGroups = hosts.length > 1;

  // Track collapsed state for each compose group, and for each server.
  // Keys carry the server, so collapsing `supabase` on one machine does not
  // collapse the identically named project on another.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Helper to render a container card
  const renderContainerCard = (container: DockerContainer) => {
    const containerBaseName = container.name.replace(/-\d+$/, "").toLowerCase();

    // Confined to this container's own server: the same name on another
    // machine is a different container with its own shortcut.
    const existingShortcut = shortcuts.find(
      (s) =>
        s.host_id === container.hostId &&
        (s.container_name?.toLowerCase() === containerBaseName ||
          s.container_match_name?.toLowerCase() === containerBaseName ||
          s.container_name?.toLowerCase() === container.name.toLowerCase()),
    );

    // Best published port for the preview shortcut, not the first entry:
    // Docker reports ports in arbitrary order (peer/data port before the UI).
    const containerPort = selectBestContainerPort(container.ports);

    const displayShortcut = existingShortcut || {
      id: -1,
      host_id: container.hostId,
      host_name: container.hostName,
      display_name: container.name,
      container_id: null, // Not used for matching - kept for type compatibility
      container_name: containerBaseName,
      container_match_name: containerBaseName,
      port: containerPort, // Use container's port if available
      url: null,
      icon: null,
      icon_type: null,
      description: null,
      is_favorite: false,
      section_id: null,
      position: 0,
      compose_project: container.composeProject,
    };

    return (
      <CardComponent
        key={container.id}
        shortcut={displayShortcut}
        container={container}
        tailscaleIP={tailscaleInfo.ip}
        onEdit={() =>
          existingShortcut
            ? openEditModal(existingShortcut)
            : handleQuickAdd(container)
        }
        onDelete={
          existingShortcut ? () => handleDelete(existingShortcut.id) : () => {}
        }
        onStart={() => handleStart(container.hostId, container.id)}
        onStop={() => handleStop(container.hostId, container.id)}
        onRestart={
          handleRestart
            ? () => handleRestart(container.hostId, container.id)
            : undefined
        }
        onToggleFavorite={
          existingShortcut
            ? () =>
                handleToggleFavorite(
                  existingShortcut.id,
                  existingShortcut.is_favorite,
                )
            : () => handleQuickAddAsFavorite(container)
        }
        alwaysShowStar={true}
      />
    );
  };

  /**
   * Compose projects first, then everything that stands on its own.
   *
   * `keyPrefix` scopes the collapsed-group state to one server: two machines
   * running the same compose project would otherwise share a single toggle.
   */
  const renderComposeAndStandalone = (
    list: DockerContainer[],
    keyPrefix: string,
  ) => {
    const { grouped, ungrouped } = groupContainersByComposeProject(list);

    return (
      <div className="space-y-6">
        {Array.from(grouped.entries()).map(
          ([projectName, projectContainers]) => {
            const groupKey = `${keyPrefix}:${projectName}`;
            const isCollapsed = collapsedGroups.has(groupKey);
            return (
              <div
                key={groupKey}
                className="space-y-4"
              >
                {/* Group Header */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="flex items-center gap-2 text-lg font-semibold transition-colors hover:text-blue-400"
                    style={{ color: "var(--color-background-contrast)" }}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                    {/* Project icon - use compose project name to get icon, fallback to Layers */}
                    {(() => {
                      const iconSrc = getContainerIcon(projectName, "");
                      const isUrl =
                        iconSrc &&
                        (iconSrc.startsWith("http") || iconSrc.includes("/"));

                      // If no icon URL found, show Layers icon
                      if (!isUrl) {
                        return <Layers className="w-5 h-5 opacity-60" />;
                      }

                      return (
                        <img
                          src={iconSrc}
                          alt={projectName}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            // If image fails to load, replace with Layers icon
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              e.currentTarget.style.display = "none";
                              const placeholder =
                                document.createElement("span");
                              placeholder.className =
                                "w-5 h-5 opacity-60 flex items-center justify-center";
                              placeholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`;
                              parent.insertBefore(placeholder, e.currentTarget);
                            }
                          }}
                        />
                      );
                    })()}
                    <span className="capitalize">{projectName}</span>
                  </button>
                  <span
                    className="text-sm px-2 py-0.5 rounded-full"
                    style={{
                      color: "var(--color-background-contrast)",
                      opacity: 0.6,
                      backgroundColor: "rgba(var(--color-primary-rgb), 0.1)",
                    }}
                  >
                    {t("containers.count", {
                      count: projectContainers.length,
                    })}
                  </span>
                </div>

                {/* Group Content */}
                {!isCollapsed && (
                  <div
                    className={`${gridClasses} pl-4 border-l-2`}
                    style={{
                      borderColor: "rgba(var(--color-primary-rgb), 0.3)",
                    }}
                  >
                    {projectContainers.map((container) =>
                      renderContainerCard(container),
                    )}
                  </div>
                )}
              </div>
            );
          },
        )}

        {/* Standalone Containers (no compose project) */}
        {ungrouped.length > 0 && (
          <div className={gridClasses}>
            {ungrouped.map((container) => renderContainerCard(container))}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      key="add"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-12"
    >
      {/* Manual URL Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView("dashboard")}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2
                className="text-2xl font-bold flex items-center gap-2"
                style={{ color: "var(--color-background-contrast)" }}
              >
                <LinkIcon className="text-blue-500 w-6 h-6" />{" "}
                {t("shortcuts.title")}
              </h2>
              <p
                className="text-sm mt-1"
                style={{
                  color: "rgba(var(--color-background-contrast-rgb), 1)",
                }}
              >
                {t("shortcuts.description")}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingShortcut(null);
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 md:px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 font-medium"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden md:inline">{t("shortcuts.addCustom")}</span>
          </button>
        </div>

        {customShortcuts.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
            <LinkIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">
              {searchTerms.length > 0
                ? t("search.noResults", { query: searchQuery })
                : t("shortcuts.noShortcuts")}
            </p>
            <p className="text-slate-500 text-sm mt-1">
              {searchTerms.length > 0
                ? t("search.noResultsHint")
                : t("shortcuts.noShortcutsDescription")}
            </p>
          </div>
        ) : (
          <div className={gridClasses}>
            {customShortcuts.map((s) => (
              <CardComponent
                key={s.id}
                shortcut={s}
                container={null}
                tailscaleIP={tailscaleInfo.ip}
                onEdit={() => openEditModal(s)}
                onDelete={() => handleDelete(s.id)}
                onToggleFavorite={() =>
                  handleToggleFavorite(s.id, s.is_favorite)
                }
                alwaysShowStar={true}
              />
            ))}
          </div>
        )}
      </section>

      {/* Servers */}
      <HostsManager
        hosts={hosts}
        onChanged={onHostsChanged}
        onError={onError}
        showConfirm={showHostConfirm}
      />

      {/* Docker Containers Section */}
      <section className="space-y-6">
        <div>
          <h2
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: "var(--color-background-contrast)" }}
          >
            <Server className="text-green-500 w-6 h-6" />{" "}
            {t("containers.title")}
          </h2>
          <p
            className="text-sm mt-1"
            style={{
              color: "rgba(var(--color-background-contrast-rgb), 0.75)",
            }}
          >
            {t("containers.description")}
          </p>
        </div>

        {visibleContainers.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">
              {searchTerms.length > 0
                ? t("search.noResults", { query: searchQuery })
                : t("containers.noContainers")}
            </p>
            <p className="text-slate-500 text-sm mt-1">
              {searchTerms.length > 0
                ? t("search.noResultsHint")
                : t("containers.noContainersDescription")}
            </p>
          </div>
        ) : showHostGroups ? (
          <div className="space-y-10">
            {containersByHost.map(({ hostId, host, containers: onHost }) => {
              const hostKey = `host:${hostId}`;
              const isCollapsed = collapsedGroups.has(hostKey);
              const isLocal = host?.type === "local";
              const HostIcon = isLocal ? HardDrive : Server;
              const accent = host?.color || "var(--color-primary)";

              return (
                <div
                  key={hostKey}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => toggleGroup(hostKey)}
                      className="flex items-center gap-2 text-xl font-bold transition-opacity hover:opacity-80"
                      style={{ color: "var(--color-background-contrast)" }}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                      <span
                        className="p-1.5 rounded-lg"
                        style={{
                          backgroundColor: host?.color
                            ? `${host.color}22`
                            : "rgba(var(--color-primary-rgb), 0.12)",
                          color: accent,
                        }}
                      >
                        <HostIcon className="w-4 h-4" />
                      </span>
                      <span>
                        {host?.name ??
                          onHost[0]?.hostName ??
                          t("hosts.unknownServer")}
                      </span>
                    </button>
                    <span
                      className="text-sm px-2 py-0.5 rounded-full"
                      style={{
                        color: "var(--color-background-contrast)",
                        opacity: 0.6,
                        backgroundColor: "rgba(var(--color-primary-rgb), 0.1)",
                      }}
                    >
                      {t("containers.count", { count: onHost.length })}
                    </span>
                  </div>

                  {!isCollapsed && (
                    <div
                      className="pl-4 border-l-2"
                      style={{ borderColor: `${accent}55` }}
                    >
                      {renderComposeAndStandalone(onHost, hostKey)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          renderComposeAndStandalone(visibleContainers, "host:single")
        )}
      </section>
    </motion.div>
  );
}
