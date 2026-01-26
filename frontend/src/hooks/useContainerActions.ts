import { useCallback } from "react";
import { containersApi } from "../services/api";

interface ContainerActions {
  handleStart: (id: string) => Promise<void>;
  handleStop: (id: string, showConfirm: (onConfirm: () => Promise<void>) => void) => void;
  handleRestart: (id: string) => Promise<void>;
}

export function useContainerActions(onRefresh: () => void): ContainerActions {
  const handleStart = useCallback(async (id: string) => {
    try {
      await containersApi.start(id);
      onRefresh();
    } catch (err) {
      console.error("Failed to start container:", err);
    }
  }, [onRefresh]);

  const handleStop = useCallback((id: string, showConfirm: (onConfirm: () => Promise<void>) => void) => {
    showConfirm(async () => {
      try {
        await containersApi.stop(id);
        onRefresh();
      } catch (err) {
        console.error("Failed to stop container:", err);
      }
    });
  }, [onRefresh]);

  const handleRestart = useCallback(async (id: string) => {
    try {
      await containersApi.restart(id);
      onRefresh();
    } catch (err) {
      console.error("Failed to restart container:", err);
    }
  }, [onRefresh]);

  return {
    handleStart,
    handleStop,
    handleRestart,
  };
}

