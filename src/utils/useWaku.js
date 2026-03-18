/**
 * useWaku — React hook for Logos Messaging node lifecycle management
 *
 * Handles:
 * - Auto-connect on mount
 * - Status tracking (disconnected → connecting → connected → error)
 * - Peer count tracking
 * - Graceful disconnect on unmount
 */

import { useState, useEffect, useCallback } from "react";
import * as WakuService from "../services/waku.js";

export function useWaku({ autoConnect = true } = {}) {
  const [status, setStatus] = useState(WakuService.getStatus());
  const [diagnostics, setDiagnostics] = useState(null);
  const [error, setError] = useState(null);

  // Track status changes from Logos Messaging service
  useEffect(() => {
    const unsub = WakuService.onStatusChange((s) => {
      setStatus(s);
      if (s === "connected") {
        setDiagnostics(WakuService.diagnostics());
      }
    });
    return unsub;
  }, []);

  // Auto-connect
  useEffect(() => {
    if (!autoConnect) return;
    if (status === "connected" || status === "connecting") return;

    WakuService.connect().catch((err) => {
      setError(err.message);
    });
  }, [autoConnect, status]);

  const connect = useCallback(() => {
    setError(null);
    return WakuService.connect();
  }, []);

  const disconnect = useCallback(() => {
    return WakuService.disconnect();
  }, []);

  const refreshDiagnostics = useCallback(() => {
    setDiagnostics(WakuService.diagnostics());
  }, []);

  return {
    status,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    diagnostics,
    error,
    connect,
    disconnect,
    refreshDiagnostics,
  };
}

/**
 * useWakuSubscription — subscribe to a Logos Messaging topic with auto-cleanup
 */
export function useWakuSubscription(topic, onMessage, { enabled = true } = {}) {
  const [subscribed, setSubscribed] = useState(false);
  const [messages, setMessages] = useState([]);
  const { isConnected } = useWaku({ autoConnect: enabled });

  useEffect(() => {
    if (!enabled || !isConnected || !topic) return;

    let unsubscribe;

    const handleMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
      onMessage?.(msg);
    };

    WakuService.subscribe(topic, handleMessage)
      .then((unsub) => {
        unsubscribe = unsub;
        setSubscribed(true);
      })
      .catch((err) => {
        console.error("[useWakuSubscription] Failed:", err);
        setSubscribed(false);
      });

    return () => {
      unsubscribe?.();
      setSubscribed(false);
    };
  }, [topic, enabled, isConnected]);

  return { subscribed, messages };
}
