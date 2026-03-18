/**
 * useCodex — React hook for Codex node status
 * Polls the local node every 30s and exposes health + space info.
 */

import { useState, useEffect, useCallback } from "react";
import { getNodeStatus, getSpaceSummary } from "../services/codex.js";

export function useCodexStatus() {
  const [nodeInfo, setNodeInfo] = useState(null);
  const [space, setSpace] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [info, sp] = await Promise.all([
      getNodeStatus(true),
      getSpaceSummary(),
    ]);
    setNodeInfo(info);
    setSpace(sp);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { nodeInfo, space, loading, refresh };
}
