import React from "react";
import {
  Server,
  Star,
  ExternalLink,
  Play,
  Square,
  Settings,
} from "lucide-react";
import type { ContainerCardProps } from "../types";

/**
 * Container card component displaying a Docker container
 */
export const ContainerCard: React.FC<ContainerCardProps> = ({
  container,
  isAdded,
  isFavorite,
  onQuickAdd,
  onToggleFavorite,
  onCustomize,
  onStart,
  onStop,
}) => {
  const isRunning = container.state === "running";
  const ports = container.ports
    .map((p) => p.public)
    .filter(Boolean) as number[];

  // Format ports for display - show all ports if multiple
  const portsDisplay =
    ports.length === 0 ? "No ports" : ports.map((p) => `:${p}`).join(", ");

  return (
    <div
      className="group relative border rounded-2xl sm:rounded-3xl overflow-hidden transition-all duration-300 h-full flex flex-col"
      style={{
        backgroundColor: "var(--color-card-background)",
        borderColor: "rgba(255, 255, 255, 0.05)",
        boxShadow: "0 25px 50px -12px rgba(var(--color-primary-rgb), 0.05)",
        color: "var(--color-background-contrast)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `rgba(var(--color-primary-rgb), 0.3)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
      }}
    >
      {/* Mobile: Full-width Icon with overlay */}
      <div
        className="sm:hidden relative w-full aspect-video flex items-center justify-center"
        style={{
          background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`
        }}
      >
        {/* Server Icon - Full size */}
        <Server className="w-32 h-32" style={{ color: "var(--color-primary)" }} />

        {/* Overlay: Title, Subtitle, and Star */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent flex flex-col justify-between p-4">
          {/* Star in top-right */}
          <div className="flex justify-end">
            {isAdded ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                className={`p-2 rounded-lg bg-slate-900/80 backdrop-blur-sm transition-colors ${
                  isFavorite
                    ? "text-yellow-400 hover:text-yellow-300"
                    : "text-slate-400 hover:text-yellow-400"
                }`}
                title={
                  isFavorite ? "Remove from Favorites" : "Add to Favorites"
                }
              >
                <Star
                  className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`}
                />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAdd();
                }}
                className="p-2 rounded-lg bg-slate-900/80 backdrop-blur-sm text-slate-400 hover:text-yellow-400 transition-colors"
                title="Quick Add to Favorites"
              >
                <Star className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Title and Subtitle at bottom */}
          <div>
            <h3 className="text-white font-bold text-base leading-tight uppercase truncate mb-1.5">
              {container.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-300 bg-slate-950/80 backdrop-blur-sm px-2 py-1 rounded border border-white/10 tracking-wider uppercase truncate">
                {portsDisplay}
              </span>
              <div
                className={`w-2 h-2 rounded-full ${
                  isRunning
                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                    : "bg-red-500"
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Horizontal layout (original) */}
      <div className="hidden sm:flex items-start gap-3 sm:gap-4 p-4 sm:p-5 md:p-6">
        {/* Icon - Using Server icon for containers */}
        <div
          className="w-14 h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center border border-white/5 shrink-0 overflow-hidden"
          style={{
            background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`
          }}
        >
          <Server
            className="w-6 h-6 md:w-7 md:h-7 group-hover:scale-110 transition-transform duration-500"
            style={{ color: "var(--color-primary)" }}
          />
        </div>

        {/* Title and Subtitle */}
        <div className="min-w-0 flex-1">
          <h3
            className="font-bold text-sm sm:text-base md:text-lg leading-tight transition-colors uppercase truncate"
            style={{
              color: "var(--color-background-contrast)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-primary)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-background-contrast)"}
          >
            {container.name}
          </h3>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5">
            <span
              className="text-[10px] sm:text-xs font-mono px-2 sm:px-2.5 py-0.5 sm:py-1 rounded border border-white/5 tracking-wider uppercase truncate"
              style={{
                color: "rgba(var(--color-background-contrast), 0.6)",
                backgroundColor: "rgba(0, 0, 0, 0.3)"
              }}
            >
              {portsDisplay}
            </span>
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isRunning
                  ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  : "bg-red-500"
              }`}
            />
          </div>
        </div>

        {/* Favorite Star */}
        {isAdded ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="p-1.5 sm:p-2 transition-colors shrink-0"
            style={{
              color: isFavorite ? "var(--color-primary)" : "rgb(100, 116, 139)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isFavorite ? "var(--color-primary)" : "rgb(100, 116, 139)";
            }}
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`} />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd();
            }}
            className="p-1.5 sm:p-2 transition-colors shrink-0"
            style={{
              color: "rgb(100, 116, 139)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgb(100, 116, 139)";
            }}
            title="Quick Add to Favorites"
          >
            <Star className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Description - Below image on mobile, in card on desktop */}
      {container.description && (
        <p
          className="text-xs sm:text-sm leading-relaxed line-clamp-2 sm:line-clamp-3 px-4 sm:px-0 sm:mx-5 md:mx-6 my-4 sm:mb-4 md:mb-6 flex-1"
          style={{ color: "rgba(var(--color-background-contrast), 0.6)" }}
        >
          {container.description}
        </p>
      )}

      {/* Action Buttons - Full width on mobile, inline on desktop */}
      <div className="px-4 pb-5 sm:px-5 sm:pb-5 md:px-6 md:pb-6 sm:flex sm:items-center sm:justify-between sm:gap-2 sm:mt-auto space-y-2 sm:space-y-0">
        <div className="flex items-center gap-2 sm:gap-1.5">
          {/* Launch button - only show if container has ports */}
          {ports.length > 0 && (
            <button
              onClick={() =>
                window.open(
                  `http://${window.location.hostname}:${ports[0]}`,
                  "_blank"
                )
              }
              className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-500 text-white px-3 py-2.5 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
              title="Launch"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Launch</span>
            </button>
          )}

          {/* Start/Stop buttons */}
          {isRunning ? (
            <button
              onClick={onStop}
              className="flex-1 sm:flex-initial p-2.5 sm:p-2 rounded-lg sm:rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/10"
              title="Stop Container"
            >
              <Square
                className="w-4 h-4 sm:w-3.5 sm:h-3.5 mx-auto"
                fill="currentColor"
              />
            </button>
          ) : (
            <button
              onClick={onStart}
              className="flex-1 sm:flex-initial p-2.5 sm:p-2 rounded-lg sm:rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all border border-green-500/10"
              title="Start Container"
            >
              <Play
                className="w-4 h-4 sm:w-3.5 sm:h-3.5 mx-auto"
                fill="currentColor"
              />
            </button>
          )}
        </div>

        {/* Customize button */}
        <button
          onClick={onCustomize}
          className="w-full sm:w-auto p-2.5 sm:p-2 rounded-lg sm:rounded-xl bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
          title="Customize Shortcut"
        >
          <Settings className="w-4 h-4" />
          <span className="sm:hidden">Customize</span>
        </button>
      </div>
    </div>
  );
};
