import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConfirmModal } from "../ConfirmModal";

function renderModal(overrides: Record<string, unknown> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const utils = render(
    <ConfirmModal
      isOpen
      title="Delete shortcut"
      message="This cannot be undone."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { ...utils, onCancel, onConfirm };
}

describe("ConfirmModal accessibility", () => {
  it("exposes itself as a labelled modal dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Delete shortcut");
  });

  it("moves focus into the dialog on open", async () => {
    const { container } = renderModal();
    await waitFor(() =>
      expect(container.querySelector('[role="dialog"]')).toContainElement(
        document.activeElement as HTMLElement,
      ),
    );
  });

  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    const { container } = renderModal();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    // Walk past the last control; focus must wrap back inside, not escape.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderModal();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("restores focus to the opener when closed", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount, container } = renderModal();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("locks background scrolling while open and releases it on close", async () => {
    const { unmount } = renderModal();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
