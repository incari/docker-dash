import React from "react";
import { Link, Dock } from "lucide-react";
import { DynamicIcon } from "../components/DynamicIcon";
import type { Shortcut, Container } from "../types";

/**
 * Shared utility functions for shortcut cards
 */

/**
 * Get the appropriate icon for the link type
 */
export const getLinkIcon = (shortcut: Shortcut, size: "sm" | "md" | "lg" = "md") => {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-3 h-3 sm:w-3.5 sm:h-3.5",
    lg: "w-3.5 h-3.5"
  };

  if (shortcut.url) {
    return <Link className={`${sizeClasses[size]} shrink-0`} />;
  } else if (shortcut.port) {
    return <Dock className={`${sizeClasses[size]} shrink-0`} />;
  }
  return null;
};

/**
 * Render the shortcut icon (image or dynamic icon)
 */
export const renderShortcutIcon = (shortcut: Shortcut) => {
  if (
    shortcut.icon &&
    (shortcut.icon.startsWith("http") || shortcut.icon.includes("/"))
  ) {
    const src = shortcut.icon.startsWith("http")
      ? shortcut.icon
      : `/${shortcut.icon}`;
    return (
      <img
        src={src}
        alt={shortcut.name}
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <DynamicIcon
      name={shortcut.icon || "Server"}
      className="w-full h-full"
    />
  );
};

/**
 * Render the container status indicator
 */
export const renderContainerStatus = (container: Container | undefined) => {
  if (!container) return null;
  
  const isRunning = container.state === "running";
  
  return (
    <div
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        isRunning
          ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
          : "bg-red-500"
      }`}
    />
  );
};

/**
 * Get the link and subtitle for a shortcut
 */
export const getShortcutLink = (
  shortcut: Shortcut,
  container: Container | undefined,
  tailscaleIP: string | null,
  maxLength: number = 40
): { link: string | null; subtitle: string } => {
  let link: string | null = null;
  let subtitle = "No Link";

  if (shortcut.url) {
    link = shortcut.url;
    subtitle = shortcut.url.length > maxLength
      ? shortcut.url.substring(0, maxLength) + "..."
      : shortcut.url;
  } else if (shortcut.port) {
    if ((shortcut as any).use_tailscale && tailscaleIP) {
      link = `http://${tailscaleIP}:${shortcut.port}`;
      subtitle = `Tailscale :${shortcut.port}`;
    } else {
      link = `http://${window.location.hostname}:${shortcut.port}`;
      subtitle = `:${shortcut.port}`;
    }
  } else if (container) {
    subtitle = "Container Only";
  }

  return { link, subtitle };
};

