import React from "react";

interface CardShellProps {
  /** Destination the card points at, or null when it has no link. */
  link: string | null;
  /** Accessible name for the stretched link (the card title is decorative). */
  linkLabel: string;
  isEditMode?: boolean;
  isOver?: boolean;
  dragHandleProps?: Record<string, unknown>;
  /** Variant-specific layout classes (rounding, overflow, cursor). */
  className?: string;
  /** Variant-specific resting shadow. */
  shadow?: string;
  children: React.ReactNode;
}

/**
 * Shared root for the shortcut cards.
 *
 * The card used to be a <div> with an onClick that called window.open, which
 * meant it could not be reached with Tab, opened with Enter, cmd/middle-clicked
 * into a new tab, or right-clicked to copy the address. It now renders a real
 * anchor stretched over the card, so the browser's own link affordances work.
 * Action buttons stay outside that anchor (see the .card-actions class).
 */
export const CardShell: React.FC<CardShellProps> = ({
  link,
  linkLabel,
  isEditMode,
  isOver,
  dragHandleProps,
  className = "",
  shadow,
  children,
}) => {
  // In edit mode the card is a drag target, so the link is withheld.
  const showLink = !isEditMode && Boolean(link);

  return (
    <div
      {...(isEditMode && dragHandleProps ? dragHandleProps : {})}
      data-edit={isEditMode ? "true" : undefined}
      data-over={isOver ? "true" : undefined}
      className={`card-shell group relative border transition-all duration-300 ${className}`}
      style={{
        backgroundColor: isOver
          ? "rgba(var(--color-primary-rgb), 0.1)"
          : "var(--color-card-background)",
        boxShadow: isOver || !isEditMode ? shadow : undefined,
        color: "var(--color-background-contrast)",
      }}
    >
      {showLink && (
        <a
          href={link as string}
          target="_blank"
          rel="noopener noreferrer"
          className="card-shell-link"
          aria-label={linkLabel}
        />
      )}
      {children}
    </div>
  );
};
