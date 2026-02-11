import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE } from "../constants/api";

interface MigrationSettings {
  migrationDismissed: boolean;
  isLoaded: boolean;
}

export function useMigrationSettings(): MigrationSettings & {
  setMigrationDismissed: (dismissed: boolean) => void;
} {
  const [migrationDismissed, setMigrationDismissedState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Fetch settings from database on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get(`${API_BASE}/settings`);
        const data = response.data;

        if (data.migration_dismissed !== undefined) {
          const dismissed = data.migration_dismissed === 1;
          setMigrationDismissedState(dismissed);
          console.log(
            `[Migration Settings] Loaded from database: migration_dismissed = ${dismissed}`,
          );
        }
      } catch (error) {
        console.error("Failed to fetch migration settings:", error);
      } finally {
        setIsLoaded(true);
      }
    };

    fetchSettings();
  }, []);

  // Save migration dismissed state to database
  const setMigrationDismissed = useCallback((dismissed: boolean) => {
    setMigrationDismissedState(dismissed);
    console.log(
      `[Migration Settings] Saving to database: migration_dismissed = ${dismissed}`,
    );

    // Save to database
    axios
      .put(`${API_BASE}/settings`, { migration_dismissed: dismissed ? 1 : 0 })
      .then(() => {
        console.log(`[Migration Settings] Successfully saved to database`);
      })
      .catch((error) => {
        console.error("Failed to save migration dismissed state:", error);
      });
  }, []);

  return {
    migrationDismissed,
    isLoaded,
    setMigrationDismissed,
  };
}
