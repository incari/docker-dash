import { useCallback } from "react";
import { containersApi } from "../services/api";

/**
 * Starting, stopping and restarting containers.
 *
 * Every action names the server as well as the container: Docker IDs are only
 * unique within one daemon, so two servers can hand out the same ID and the
 * dashboard has to say which machine it means.
 */
interface ContainerActions {
  handleStart: (hostId: number, id: string) => Promise<void>;
  handleStop: (
    hostId: number,
    id: string,
    showConfirm: (onConfirm: () => Promise<void>) => void,
  ) => void;
  handleRestart: (hostId: number, id: string) => Promise<void>;
}

export function useContainerActions(onRefresh: () => void): ContainerActions {
  const handleStart = useCallback(
    async (hostId: number, id: string) => {
      try {
        await containersApi.start(hostId, id);
        onRefresh();
      } catch (err) {
        console.error("Failed to start container:", err);
      }
    },
    [onRefresh],
  );

  const handleStop = useCallback(
    (
      hostId: number,
      id: string,
      showConfirm: (onConfirm: () => Promise<void>) => void,
    ) => {
      showConfirm(async () => {
        try {
          await containersApi.stop(hostId, id);
          onRefresh();
        } catch (err) {
          console.error("Failed to stop container:", err);
        }
      });
    },
    [onRefresh],
  );

  const handleRestart = useCallback(
    async (hostId: number, id: string) => {
      try {
        await containersApi.restart(hostId, id);
        onRefresh();
      } catch (err) {
        console.error("Failed to restart container:", err);
      }
    },
    [onRefresh],
  );

  return {
    handleStart,
    handleStop,
    handleRestart,
  };
}
