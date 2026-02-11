import React, { useCallback, useMemo } from "react";
import {
  Server,
  Star,
  ExternalLink,
  Play,
  Square,
  Settings,
} from "../constants/icons";
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
  // Memoize derived state
  const isRunning = useMemo(
    () => container.state === "running",
    [container.state],
  );

  const ports = useMemo(
    () => container.ports.map((p) => p.public).filter(Boolean) as number[],
    [container.ports],
  );

  const portsDisplay = useMemo(
    () =>
      ports.length === 0 ? "No ports" : ports.map((p) => `:${p}`).join(", "),
    [ports],
  );

  // Memoize event handlers
  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = `rgba(var(--color-primary-rgb), 0.3)`;
    },
    [],
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
    },
    [],
  );

  const handleLaunch = useCallback(() => {
    if (ports.length > 0) {
      window.open(`http://${window.location.hostname}:${ports[0]}`, "_blank");
    }
  }, [ports]);

  const handleStarClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isAdded) {
        onToggleFavorite();
      } else {
        onQuickAdd();
      }
    },
    [isAdded, onToggleFavorite, onQuickAdd],
  );

  const handleCustomizeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCustomize();
    },
    [onCustomize],
  );

  const handleStartClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStart();
    },
    [onStart],
  );

  const handleStopClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStop();
    },
    [onStop],
  );

  // Memoize style objects
  const cardStyle = useMemo(
    () => ({
      backgroundColor: "var(--color-card-background)",
      borderColor: "rgba(255, 255, 255, 0.05)",
      boxShadow: "0 25px 50px -12px rgba(var(--color-primary-rgb), 0.05)",
      color: "var(--color-background-contrast)",
    }),
    [],
  );

  const iconBackgroundStyle = useMemo(
    () => ({
      background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`,
    }),
    [],
  );

  return (
    <div
      className="group relative border rounded-2xl sm:rounded-3xl overflow-hidden transition-all duration-300 h-full flex flex-col"
      style={cardStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Mobile: Full-width Icon with overlay */}
      <MobileHeader
        isAdded={isAdded}
        isFavorite={isFavorite}
        containerName={container.name}
        portsDisplay={portsDisplay}
        isRunning={isRunning}
        onStarClick={handleStarClick}
        iconBackgroundStyle={iconBackgroundStyle}
      />

      {/* Desktop: Horizontal layout (original) */}
      <DesktopHeader
        containerName={container.name}
        portsDisplay={portsDisplay}
        isRunning={isRunning}
        isAdded={isAdded}
        isFavorite={isFavorite}
        onStarClick={handleStarClick}
        iconBackgroundStyle={iconBackgroundStyle}
      />

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
      <ActionButtons
        ports={ports}
        isRunning={isRunning}
        onLaunch={handleLaunch}
        onStart={handleStartClick}
        onStop={handleStopClick}
        onCustomize={handleCustomizeClick}
      />
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

interface MobileHeaderProps {
  isAdded: boolean;
  isFavorite: boolean;
  containerName: string;
  portsDisplay: string;
  isRunning: boolean;
  onStarClick: (e: React.MouseEvent) => void;
  iconBackgroundStyle: React.CSSProperties;
}

const MobileHeader: React.FC<MobileHeaderProps> = React.memo(
  ({
    isAdded,
    isFavorite,
    containerName,
    portsDisplay,
    isRunning,
    onStarClick,
    iconBackgroundStyle,
  }) => (
    <div
      className="sm:hidden relative w-full aspect-video flex items-center justify-center"
      style={iconBackgroundStyle}
    >
      {/* Server Icon - Full size */}
      <Server
        className="w-32 h-32"
        style={{ color: "var(--color-primary)" }}
      />

      {/* Overlay: Title, Subtitle, and Star */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent flex flex-col justify-between p-4">
        {/* Star in top-right */}
        <div className="flex justify-end">
          <StarButton
            isAdded={isAdded}
            isFavorite={isFavorite}
            onClick={onStarClick}
            variant="mobile"
          />
        </div>

        {/* Title and Subtitle at bottom */}
        <div>
          <h3 className="text-white font-bold text-base leading-tight uppercase truncate mb-1.5">
            {containerName}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-300 bg-slate-950/80 backdrop-blur-sm px-2 py-1 rounded border border-white/10 tracking-wider uppercase truncate">
              {portsDisplay}
            </span>
            <StatusIndicator
              isRunning={isRunning}
              size="small"
            />
          </div>
        </div>
      </div>
    </div>
  ),
);
MobileHeader.displayName = "MobileHeader";

interface DesktopHeaderProps {
  containerName: string;
  portsDisplay: string;
  isRunning: boolean;
  isAdded: boolean;
  isFavorite: boolean;
  onStarClick: (e: React.MouseEvent) => void;
  iconBackgroundStyle: React.CSSProperties;
}

const DesktopHeader: React.FC<DesktopHeaderProps> = React.memo(
  ({
    containerName,
    portsDisplay,
    isRunning,
    isAdded,
    isFavorite,
    onStarClick,
    iconBackgroundStyle,
  }) => {
    const handleTitleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLHeadingElement>) => {
        e.currentTarget.style.color = "var(--color-primary)";
      },
      [],
    );

    const handleTitleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLHeadingElement>) => {
        e.currentTarget.style.color = "var(--color-background-contrast)";
      },
      [],
    );

    return (
      <div className="hidden sm:flex items-start gap-3 sm:gap-4 p-4 sm:p-5 md:p-6">
        {/* Icon - Using Server icon for containers */}
        <div
          className="w-14 h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center border border-white/5 shrink-0 overflow-hidden"
          style={iconBackgroundStyle}
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
            style={{ color: "var(--color-background-contrast)" }}
            onMouseEnter={handleTitleMouseEnter}
            onMouseLeave={handleTitleMouseLeave}
          >
            {containerName}
          </h3>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5">
            <span
              className="text-[10px] sm:text-xs font-mono px-2 sm:px-2.5 py-0.5 sm:py-1 rounded border border-white/5 tracking-wider uppercase truncate"
              style={{
                color: "rgba(var(--color-background-contrast), 0.6)",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
              }}
            >
              {portsDisplay}
            </span>
            <StatusIndicator
              isRunning={isRunning}
              size="tiny"
            />
          </div>
        </div>

        {/* Favorite Star */}
        <StarButton
          isAdded={isAdded}
          isFavorite={isFavorite}
          onClick={onStarClick}
          variant="desktop"
        />
      </div>
    );
  },
);
DesktopHeader.displayName = "DesktopHeader";

interface StarButtonProps {
  isAdded: boolean;
  isFavorite: boolean;
  onClick: (e: React.MouseEvent) => void;
  variant: "mobile" | "desktop";
}

const StarButton: React.FC<StarButtonProps> = React.memo(
  ({ isAdded, isFavorite, onClick, variant }) => {
    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.color =
          variant === "mobile"
            ? "var(--color-primary)"
            : "var(--color-primary)";
      },
      [variant],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (variant === "mobile") {
          e.currentTarget.style.color = isFavorite
            ? "#facc15"
            : "rgb(148, 163, 184)";
        } else {
          e.currentTarget.style.color = isFavorite
            ? "var(--color-primary)"
            : "rgb(100, 116, 139)";
        }
      },
      [variant, isFavorite],
    );

    if (variant === "mobile") {
      return (
        <button
          onClick={onClick}
          className={`p-2 rounded-lg bg-slate-900/80 backdrop-blur-sm transition-colors ${
            isAdded && isFavorite
              ? "text-yellow-400 hover:text-yellow-300"
              : "text-slate-400 hover:text-yellow-400"
          }`}
          title={
            isAdded && isFavorite ? "Remove from Favorites" : "Add to Favorites"
          }
        >
          <Star
            className={`w-5 h-5 ${isAdded && isFavorite ? "fill-current" : ""}`}
          />
        </button>
      );
    }

    return (
      <button
        onClick={onClick}
        className="p-1.5 sm:p-2 transition-colors shrink-0"
        style={{
          color:
            isAdded && isFavorite
              ? "var(--color-primary)"
              : "rgb(100, 116, 139)",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={
          isAdded && isFavorite ? "Remove from Favorites" : "Add to Favorites"
        }
      >
        <Star
          className={`w-5 h-5 ${isAdded && isFavorite ? "fill-current" : ""}`}
        />
      </button>
    );
  },
);
StarButton.displayName = "StarButton";

interface StatusIndicatorProps {
  isRunning: boolean;
  size: "tiny" | "small";
}

const StatusIndicator: React.FC<StatusIndicatorProps> = React.memo(
  ({ isRunning, size }) => (
    <div
      className={`rounded-full ${size === "tiny" ? "w-1.5 h-1.5" : "w-2 h-2"} ${
        isRunning
          ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
          : "bg-red-500"
      }`}
    />
  ),
);
StatusIndicator.displayName = "StatusIndicator";

interface ActionButtonsProps {
  ports: number[];
  isRunning: boolean;
  onLaunch: () => void;
  onStart: (e: React.MouseEvent) => void;
  onStop: (e: React.MouseEvent) => void;
  onCustomize: (e: React.MouseEvent) => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = React.memo(
  ({ ports, isRunning, onLaunch, onStart, onStop, onCustomize }) => (
    <div className="px-4 pb-5 sm:px-5 sm:pb-5 md:px-6 md:pb-6 sm:flex sm:items-center sm:justify-between sm:gap-2 sm:mt-auto space-y-2 sm:space-y-0">
      <div className="flex items-center gap-2 sm:gap-1.5">
        {/* Launch button - only show if container has ports */}
        {ports.length > 0 && (
          <button
            onClick={onLaunch}
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
  ),
);
ActionButtons.displayName = "ActionButtons";
