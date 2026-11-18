import { useCallback, useEffect, useState } from "react";
import { listOutbox, subscribeOutbox } from "../lib/offlineStore";
import { flushOfflineOutbox } from "../lib/apiClient";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

export function useOfflineSync(
  onSynced?: (info: { synced: number; failed: number; errors: string[] }) => void
) {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);

  const refreshPending = useCallback(async () => {
    const items = await listOutbox();
    setPendingCount(items.length);
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await flushOfflineOutbox();
      await refreshPending();
      if (result.synced > 0 || result.failed > 0) {
        onSynced?.(result);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshPending, onSynced]);

  useEffect(() => {
    refreshPending();
    return subscribeOutbox(() => {
      refreshPending();
    });
  }, [refreshPending]);

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      triggerSync();
    }
  }, [isOnline, pendingCount, triggerSync]);

  return { isOnline, pendingCount, syncing, triggerSync };
}
