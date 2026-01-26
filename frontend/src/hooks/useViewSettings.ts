import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE } from "../constants/api";
import type { ViewMode, MobileColumns } from "../types";

interface ViewSettings {
  viewMode: ViewMode;
  mobileColumns: MobileColumns;
  isLoaded: boolean;
}

const DEFAULT_VIEW_MODE: ViewMode = "default";
const DEFAULT_MOBILE_COLUMNS: MobileColumns = 2;

export function useViewSettings(): ViewSettings & {
  setViewMode: (mode: ViewMode) => void;
  setMobileColumns: (columns: MobileColumns) => void;
} {
  const [viewMode, setViewModeState] = useState<ViewMode>(DEFAULT_VIEW_MODE);
  const [mobileColumns, setMobileColumnsState] = useState<MobileColumns>(DEFAULT_MOBILE_COLUMNS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Fetch settings from database on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get(`${API_BASE}/settings`);
        const data = response.data;
        
        if (data.view_mode) {
          setViewModeState(data.view_mode as ViewMode);
        }
        if (data.mobile_columns) {
          setMobileColumnsState(data.mobile_columns as MobileColumns);
        }
      } catch (error) {
        console.error("Failed to fetch view settings:", error);
      } finally {
        setIsLoaded(true);
      }
    };

    fetchSettings();
  }, []);

  // Save view mode to database
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    
    // Save to database
    axios.put(`${API_BASE}/settings`, { view_mode: mode })
      .catch((error) => {
        console.error("Failed to save view mode:", error);
      });
  }, []);

  // Save mobile columns to database
  const setMobileColumns = useCallback((columns: MobileColumns) => {
    setMobileColumnsState(columns);
    
    // Save to database
    axios.put(`${API_BASE}/settings`, { mobile_columns: columns })
      .catch((error) => {
        console.error("Failed to save mobile columns:", error);
      });
  }, []);

  return {
    viewMode,
    mobileColumns,
    isLoaded,
    setViewMode,
    setMobileColumns,
  };
}

