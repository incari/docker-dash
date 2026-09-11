/**
 * SWR-based data fetching hooks for automatic deduplication and revalidation
 * Following Vercel React best practices for client-side data fetching
 *
 * Network-first strategy with IndexedDB fallback:
 * 1. Try to fetch from server
 * 2. On success, save to IndexedDB and return data
 * 3. On error, fall back to IndexedDB cached data
 */
import { useCallback } from "react";
import useSWR from "swr";
import {
  shortcutsApi,
  sectionsApi,
  containersApi,
  tailscaleApi,
} from "../services/api";
import {
  indexedDBContainers,
  indexedDBShortcuts,
  indexedDBSections,
  indexedDBTailscale,
} from "../services/indexedDB";
import type { DockerContainer, Shortcut, Section } from "../types";
import type { TailscaleInfoExtended } from "../appTypes";

// SWR configuration for automatic polling and deduplication
const SWR_CONFIG = {
  refreshInterval: 5000, // Poll every 5 seconds for real-time updates
  dedupingInterval: 2000, // Deduplicate requests within 2 seconds
  revalidateOnFocus: true, // Revalidate when window regains focus
  revalidateOnReconnect: true, // Revalidate when network reconnects
  shouldRetryOnError: false, // Don't retry on error (we'll use IndexedDB fallback)
  errorRetryCount: 0, // No retries (we'll use IndexedDB fallback)
};

// Fetcher functions with IndexedDB fallback (network-first strategy)
const fetchers = {
  shortcuts: async (): Promise<Shortcut[]> => {
    try {
      const data = await shortcutsApi.getAll();
      // Save to IndexedDB on success
      await indexedDBShortcuts.save(data);
      console.log(`[IndexedDB] Saved ${data.length} shortcuts to cache`);
      return data;
    } catch (error) {
      console.warn("[IndexedDB] Failed to fetch shortcuts from server, using cached data:", error);
      // Fall back to IndexedDB
      const cached = await indexedDBShortcuts.getAll();
      console.log(`[IndexedDB] Loaded ${cached.length} shortcuts from cache`);
      return cached;
    }
  },

  sections: async (): Promise<Section[]> => {
    try {
      const data = await sectionsApi.getAll();
      // Save to IndexedDB on success
      await indexedDBSections.save(data);
      console.log(`[IndexedDB] Saved ${data.length} sections to cache`);
      return data;
    } catch (error) {
      console.warn("[IndexedDB] Failed to fetch sections from server, using cached data:", error);
      // Fall back to IndexedDB
      const cached = await indexedDBSections.getAll();
      console.log(`[IndexedDB] Loaded ${cached.length} sections from cache`);
      return cached;
    }
  },

  containers: async (): Promise<DockerContainer[]> => {
    try {
      const data = await containersApi.getAll();
      // Save to IndexedDB on success
      await indexedDBContainers.save(data);
      console.log(`[IndexedDB] Saved ${data.length} containers to cache`);
      return data;
    } catch (error) {
      console.warn("[IndexedDB] Failed to fetch containers from server, using cached data:", error);
      // Fall back to IndexedDB
      const cached = await indexedDBContainers.getAll();
      console.log(`[IndexedDB] Loaded ${cached.length} containers from cache`);
      return cached;
    }
  },

  tailscale: async (): Promise<TailscaleInfoExtended> => {
    try {
      const data = await tailscaleApi.getInfo();
      // Save to IndexedDB on success
      await indexedDBTailscale.save(data);
      console.log("[IndexedDB] Saved tailscale info to cache");
      return data;
    } catch (error) {
      console.warn("[IndexedDB] Failed to fetch tailscale info from server, using cached data:", error);
      // Fall back to IndexedDB
      const cached = await indexedDBTailscale.get();
      console.log("[IndexedDB] Loaded tailscale info from cache");
      return cached || { available: false, enabled: false, ip: null };
    }
  },
};

/**
 * Hook for fetching shortcuts with SWR and IndexedDB fallback
 */
export function useShortcuts() {
  const { data, error, isLoading, mutate } = useSWR<Shortcut[]>(
    "/api/shortcuts",
    fetchers.shortcuts,
    {
      ...SWR_CONFIG,
      fallbackData: [], // Start with empty array while loading
    },
  );

  return {
    shortcuts: data ?? [],
    isLoading,
    isError: error,
    mutate, // Allows manual revalidation
  };
}

/**
 * Hook for fetching sections with SWR and IndexedDB fallback
 */
export function useSections() {
  const { data, error, isLoading, mutate } = useSWR<Section[]>(
    "/api/sections",
    fetchers.sections,
    {
      ...SWR_CONFIG,
      fallbackData: [], // Start with empty array while loading
    },
  );

  return {
    sections: data ?? [],
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Hook for fetching containers with SWR and IndexedDB fallback
 */
export function useContainers() {
  const { data, error, isLoading, mutate } = useSWR<DockerContainer[]>(
    "/api/containers",
    fetchers.containers,
    {
      ...SWR_CONFIG,
      fallbackData: [], // Start with empty array while loading
    },
  );

  return {
    containers: data ?? [],
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Hook for fetching Tailscale info with SWR and IndexedDB fallback
 * Uses longer refresh interval since this data changes less frequently
 */
export function useTailscale() {
  const DEFAULT_TAILSCALE: TailscaleInfoExtended = {
    available: false,
    enabled: false,
    ip: null,
  };

  const { data, error, isLoading, mutate } = useSWR<TailscaleInfoExtended>(
    "/api/tailscale",
    fetchers.tailscale,
    {
      ...SWR_CONFIG,
      refreshInterval: 30000, // Poll every 30 seconds (less frequent)
      fallbackData: DEFAULT_TAILSCALE,
    },
  );

  return {
    tailscaleInfo: data ?? DEFAULT_TAILSCALE,
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Applies a change to the cached list, runs the request, and puts the previous
 * list back if the request fails.
 *
 * The UI renders straight from the SWR cache, so the change is on screen before
 * the request leaves the browser instead of after a write plus a refetch. The
 * returned promise rejects when the request fails, so callers can tell the user.
 */
export type OptimisticUpdate<T> = (
  updater: (current: T[]) => T[],
  request: () => Promise<unknown>,
) => Promise<unknown>;

/**
 * Combined hook for all dashboard data
 * Uses parallel SWR hooks for automatic deduplication
 */
export function useDashboardSWR() {
  const { shortcuts, isLoading: shortcutsLoading, mutate: mutateShortcuts } = useShortcuts();
  const { sections, isLoading: sectionsLoading, mutate: mutateSections } = useSections();
  const { containers, isLoading: containersLoading, mutate: mutateContainers } = useContainers();
  const { tailscaleInfo, isLoading: tailscaleLoading } = useTailscale();

  // Overall loading state - true only if ALL are loading (initial load)
  const loading = shortcutsLoading && sectionsLoading && containersLoading && tailscaleLoading;

  // Manual refresh function for all data. Memoized so the callers that hold it
  // in a dependency array are not rebuilt on every render.
  const refreshAll = useCallback(async () => {
    await Promise.all([
      mutateShortcuts(),
      mutateSections(),
      mutateContainers(),
    ]);
  }, [mutateShortcuts, mutateSections, mutateContainers]);

  // SWR shows `optimisticData` immediately, keeps the value the request settles
  // on, rolls back to the previous list if it throws, and revalidates
  // afterwards so the cache cannot drift away from the server.
  const updateShortcutsOptimistic = useCallback<OptimisticUpdate<Shortcut>>(
    (updater, request) =>
      mutateShortcuts(
        async (current) => {
          await request();
          return updater(current ?? []);
        },
        {
          optimisticData: (current) => updater(current ?? []),
          rollbackOnError: true,
          revalidate: true,
        },
      ),
    [mutateShortcuts],
  );

  const updateSectionsOptimistic = useCallback<OptimisticUpdate<Section>>(
    (updater, request) =>
      mutateSections(
        async (current) => {
          await request();
          return updater(current ?? []);
        },
        {
          optimisticData: (current) => updater(current ?? []),
          rollbackOnError: true,
          revalidate: true,
        },
      ),
    [mutateSections],
  );

  return {
    shortcuts,
    sections,
    containers,
    tailscaleInfo,
    loading,
    refreshAll,
    mutateShortcuts,
    mutateSections,
    updateShortcutsOptimistic,
    updateSectionsOptimistic,
  };
}

