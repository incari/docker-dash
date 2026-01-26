import { useState, useCallback } from "react";
import { shortcutsApi, sectionsApi, containersApi, tailscaleApi } from "../services/api";
import type { DockerContainer, Shortcut, Section } from "../types";
import type { TailscaleInfoExtended } from "../appTypes";

interface DashboardData {
  shortcuts: Shortcut[];
  sections: Section[];
  containers: DockerContainer[];
  tailscaleInfo: TailscaleInfoExtended;
  loading: boolean;
}

interface DashboardDataActions {
  fetchData: (showLoading?: boolean) => Promise<void>;
  fetchTailscaleInfo: () => Promise<void>;
  setShortcuts: React.Dispatch<React.SetStateAction<Shortcut[]>>;
  setSections: React.Dispatch<React.SetStateAction<Section[]>>;
}

const DEFAULT_TAILSCALE: TailscaleInfoExtended = {
  available: false,
  enabled: false,
  ip: null,
};

export function useDashboardData(): DashboardData & DashboardDataActions {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [tailscaleInfo, setTailscaleInfo] = useState<TailscaleInfoExtended>(DEFAULT_TAILSCALE);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [shortcutsData, containersData, sectionsData] = await Promise.all([
        shortcutsApi.getAll(),
        containersApi.getAll(),
        sectionsApi.getAll(),
      ]);
      setShortcuts(shortcutsData);
      setContainers(containersData);
      setSections(sectionsData);
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  const fetchTailscaleInfo = useCallback(async () => {
    try {
      const data = await tailscaleApi.getInfo();
      setTailscaleInfo(data);
    } catch (err) {
      console.error("Failed to fetch Tailscale info", err);
    }
  }, []);

  return {
    shortcuts,
    sections,
    containers,
    tailscaleInfo,
    loading,
    fetchData,
    fetchTailscaleInfo,
    setShortcuts,
    setSections,
  };
}

