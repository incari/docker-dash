import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "../constants/icons";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Disabled while reordering, where filtering would desync the drag lists. */
  disabled?: boolean;
}

/** True when the keystroke would land in a field the user is already typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
  );
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (disabled) return;

    const handleShortcut = (event: KeyboardEvent) => {
      const isFocusShortcut =
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey);

      if (isFocusShortcut) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      // "/" is the conventional search shortcut, but only when not already typing.
      if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [disabled]);

  return (
    <div
      role="search"
      className="relative flex-1 min-w-0 max-w-md"
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            // Clear first; a second Escape can then bubble normally.
            event.stopPropagation();
            onChange("");
          }
        }}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
        aria-keyshortcuts="Control+K Meta+K"
        className="w-full bg-slate-800/80 border border-white/10 rounded-lg pl-9 pr-9 py-1.5 text-xs sm:text-sm text-white placeholder-slate-500 transition-colors hover:border-white/20 focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed"
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label={t("search.clear")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
