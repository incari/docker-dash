import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The hooks under test only need the request layer to be observable, so the
// HTTP client and the IndexedDB mirror are stubbed; the SWR cache is real,
// which is the part the optimistic updates act on.
vi.mock("../../services/api", () => ({
  shortcutsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    toggleFavorite: vi.fn(),
    updateSection: vi.fn(),
  },
  sectionsApi: { getAll: vi.fn() },
  containersApi: { getAll: vi.fn() },
  tailscaleApi: { getInfo: vi.fn() },
}));

vi.mock("../../services/indexedDB", () => ({
  indexedDBShortcuts: { save: vi.fn(), getAll: vi.fn(async () => []) },
  indexedDBSections: { save: vi.fn(), getAll: vi.fn(async () => []) },
  indexedDBContainers: { save: vi.fn(), getAll: vi.fn(async () => []) },
  indexedDBTailscale: { save: vi.fn(), get: vi.fn(async () => null) },
}));

import {
  shortcutsApi,
  sectionsApi,
  containersApi,
  tailscaleApi,
} from "../../services/api";
import { useDashboardSWR } from "../useSWRData";
import { useShortcutActions } from "../useShortcutActions";
import type { Shortcut } from "../../types";

const makeShortcut = (id: number, is_favorite: boolean) =>
  ({
    id,
    display_name: `Shortcut ${id}`,
    is_favorite,
    section_id: null,
    position: id,
  }) as Shortcut;

// A promise whose settling this test controls, so the UI can be inspected while
// the request is still in flight.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nothing else awaits a rejection until the action does.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

// Every test gets its own cache, otherwise one test's shortcuts leak into the
// next through SWR's module-level store.
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

function setup(onError = vi.fn()) {
  const hook = renderHook(
    () => {
      const { shortcuts, refreshAll, updateShortcutsOptimistic } =
        useDashboardSWR();
      const actions = useShortcutActions(
        {
          onRefresh: refreshAll,
          onError,
          applyOptimistic: updateShortcutsOptimistic,
          // Delete is confirmed by a modal in the app; here it goes straight
          // through.
          showDeleteConfirm: (onConfirm) => {
            void onConfirm();
          },
        },
        shortcuts,
      );
      return { shortcuts, actions };
    },
    { wrapper },
  );
  return { ...hook, onError };
}

describe("useShortcutActions optimistic updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sectionsApi.getAll).mockResolvedValue([]);
    vi.mocked(containersApi.getAll).mockResolvedValue([]);
    vi.mocked(tailscaleApi.getInfo).mockResolvedValue({
      available: false,
      enabled: false,
      ip: null,
    });
  });

  it("stars a shortcut before the request comes back", async () => {
    vi.mocked(shortcutsApi.getAll).mockResolvedValue([makeShortcut(1, false)]);

    const { result } = setup();
    await waitFor(() => expect(result.current.shortcuts).toHaveLength(1));

    const request = deferred<unknown>();
    vi.mocked(shortcutsApi.toggleFavorite).mockReturnValue(request.promise);
    // The refetch that follows a successful write sees the server's version.
    vi.mocked(shortcutsApi.getAll).mockResolvedValue([makeShortcut(1, true)]);

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.actions.handleToggleFavorite(1, false);
    });

    // The star is filled in while the POST is still open.
    expect(result.current.shortcuts[0]?.is_favorite).toBe(true);
    expect(shortcutsApi.toggleFavorite).toHaveBeenCalledWith(1, true);

    await act(async () => {
      request.resolve(undefined);
      await pending;
    });

    expect(result.current.shortcuts[0]?.is_favorite).toBe(true);
  });

  it("puts the star back and reports the failure when the server refuses", async () => {
    vi.mocked(shortcutsApi.getAll).mockResolvedValue([makeShortcut(1, false)]);

    const { result, onError } = setup();
    await waitFor(() => expect(result.current.shortcuts).toHaveLength(1));

    vi.mocked(shortcutsApi.toggleFavorite).mockRejectedValue(
      Object.assign(new Error("boom"), {
        response: { data: { error: "Database is locked" } },
      }),
    );

    await act(async () => {
      await result.current.actions.handleToggleFavorite(1, false);
    });

    expect(result.current.shortcuts[0]?.is_favorite).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      "Error Updating Favorite",
      "Database is locked",
    );
  });

  it("removes a deleted shortcut right away and restores it on failure", async () => {
    vi.mocked(shortcutsApi.getAll).mockResolvedValue([
      makeShortcut(1, true),
      makeShortcut(2, true),
    ]);

    const { result, onError } = setup();
    await waitFor(() => expect(result.current.shortcuts).toHaveLength(2));

    vi.mocked(shortcutsApi.delete).mockRejectedValue(new Error("offline"));

    await act(async () => {
      result.current.actions.handleDelete(1);
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.shortcuts.map((s) => s.id)).toEqual([1, 2]);
  });

  it("moves shortcuts into their new positions without waiting for the writes", async () => {
    vi.mocked(shortcutsApi.getAll).mockResolvedValue([
      makeShortcut(1, true),
      makeShortcut(2, true),
    ]);

    const { result } = setup();
    await waitFor(() => expect(result.current.shortcuts).toHaveLength(2));

    const request = deferred<void>();
    vi.mocked(shortcutsApi.updateSection).mockReturnValue(request.promise);

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.actions.handleSaveChanges([
        { type: "move", shortcutId: 1, sectionId: 7, position: 1 },
        { type: "move", shortcutId: 2, sectionId: 7, position: 0 },
      ]);
    });

    expect(result.current.shortcuts.map((s) => s.id)).toEqual([2, 1]);
    expect(result.current.shortcuts.every((s) => s.section_id === 7)).toBe(true);

    await act(async () => {
      request.resolve();
      await pending;
    });
  });
});
