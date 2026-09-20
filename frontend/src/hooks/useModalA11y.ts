import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Skip controls that are present but not actually shown (a collapsed panel, a
 * hidden tab). checkVisibility covers ancestor-hidden cases but is unavailable
 * in jsdom, so fall back to the element's own computed style there.
 */
function isVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility();
  }
  if (el.hasAttribute("hidden")) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * Dialog keyboard and focus behaviour.
 *
 * The modals already closed on Escape, but focus stayed on whatever was behind
 * them: Tab walked the page underneath, and closing a dialog dropped focus back
 * to the top of the document. This moves focus into the dialog on open, keeps
 * Tab inside it, locks background scrolling, and restores focus to the element
 * that opened it.
 *
 * Returns the ref to attach to the dialog panel.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void,
) {
  const containerRef = useRef<T>(null);

  // Held in a ref so an inline onClose does not re-run the effect on every
  // render, which would re-steal focus and re-run the restore cleanup.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const visibleFocusable = () => {
      const node = containerRef.current;
      if (!node) return [] as HTMLElement[];
      return Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isVisible);
    };

    // Wait a frame so the entry animation has mounted the content.
    const frame = requestAnimationFrame(() => {
      const [first] = visibleFocusable();
      (first ?? containerRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const items = visibleFocusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = containerRef.current?.contains(active as Node);

      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  return containerRef;
}
