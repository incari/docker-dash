import { renderHook, act } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, it, expect, vi } from "vitest";

// FormKit's drag-and-drop spins under jsdom (it needs real layout), so it is
// stubbed out: these tests cover this hook's own list-syncing logic.
vi.mock("@formkit/drag-and-drop/react", () => ({
  useDragAndDrop: (initial: unknown[]) => {
    const ref = useRef(null);
    const [list, setList] = useState(initial);
    return [ref, list, setList];
  },
  dragAndDrop: vi.fn(),
}));
vi.mock("@formkit/drag-and-drop", () => ({
  animations: () => ({}),
  dragAndDrop: vi.fn(),
}));

import { useDashboardDragDrop } from "../useDashboardDragDrop";
import type { Shortcut } from "../../types";

const makeShortcut = (id: number, name: string) =>
  ({ id, display_name: name, section_id: null, position: id } as Shortcut);

// Kept stable: the hook re-syncs whenever the sections identity changes, so a
// fresh [] on every render would spin.
const NO_SECTIONS: never[] = [];

const a = makeShortcut(1, "Jellyfin");
const b = makeShortcut(2, "Sonarr");
const c = makeShortcut(3, "Pi-hole");

function setup(unsectionedShortcuts: Shortcut[], isEditMode: boolean) {
  return renderHook(
    ({ list, edit }: { list: Shortcut[]; edit: boolean }) =>
      useDashboardDragDrop({
        isEditMode: edit,
        unsectionedShortcuts: list,
        sections: NO_SECTIONS,
        onSaveChanges: vi.fn(),
        handleReorderSections: vi.fn(),
      }),
    { initialProps: { list: unsectionedShortcuts, edit: isEditMode } },
  );
}

describe("useDashboardDragDrop unsectioned list sync", () => {
  it("replaces the list wholesale outside edit mode", () => {
    const { result, rerender } = setup([a, b], false);
    expect(result.current.unsectionedList.map((s) => s.id)).toEqual([1, 2]);

    act(() => rerender({ list: [c], edit: false }));
    expect(result.current.unsectionedList.map((s) => s.id)).toEqual([3]);
  });

  it("picks up shortcuts that become visible during edit mode", () => {
    const { result, rerender } = setup([a, b], true);
    expect(result.current.unsectionedList.map((s) => s.id)).toEqual([1, 2]);

    // e.g. the search filter was cleared, or auto-sync added a shortcut
    act(() => rerender({ list: [a, b, c], edit: true }));
    expect(result.current.unsectionedList.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("drops shortcuts that disappear during edit mode", () => {
    const { result, rerender } = setup([a, b, c], true);
    act(() => rerender({ list: [a, c], edit: true }));
    expect(result.current.unsectionedList.map((s) => s.id)).toEqual([1, 3]);
  });

  it("refreshes item properties without reordering in edit mode", () => {
    const { result, rerender } = setup([b, a], true);
    expect(result.current.unsectionedList.map((s) => s.id)).toEqual([2, 1]);

    const renamed = { ...a, display_name: "Jellyfin HD" } as Shortcut;
    act(() => rerender({ list: [renamed, b], edit: true }));

    // order the user arranged is kept, but the fresh name is picked up
    expect(result.current.unsectionedList.map((s) => s.id)).toEqual([2, 1]);
    expect(result.current.unsectionedList[1]?.display_name).toBe("Jellyfin HD");
  });
});
