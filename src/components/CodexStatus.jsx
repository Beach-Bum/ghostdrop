/**
 * CodexStatus — Live Codex node health panel
 *
 * Shows:
 *  - Node online/offline status
 *  - PeerID
 *  - Storage space (total / used / free) with visual bar
 *  - Local CID count
 *  - Marketplace availability
 *
 * Polls checkNodeHealth() every 15s while mounted.
 */

import { useState, useEffect, useCallback } from "react";
import { Panel, SectionLabel, C, Spinner } from "./ui.jsx";
import { checkNodeHealth, listLocalCIDs, getSpaceStats } from "../services/codex.js";

const fmtBytes = (n) => {
  if (!n || n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export default function CodexStatus({ compact = false }) {
  const [health, setHealth]   = useState(null);
  const [cids, setCids]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastPoll, setLastPoll] = useState(null);

  const poll = useCallback(async () => {
    const h = await checkNodeHealth(true);
    setHealth(h);
    setLastPoll(new Date());
    if (h.online) {
      const localCIDs = await listLocalCIDs();
      setCids(localCIDs.length);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, 15_000);
    return () => clearInterval(timer);
  }, [poll]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
      <Spinner />
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim }}>Checking Codex node...</span>
    </div>
  );

  if (!health) return null;

  // ── Compact mode — just a status line ──────────────────────────
  if (compact) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 11 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: health.online ? C.accent : C.red, display: "inline-block" }} className={health.online ? "ld-pulse" : ""} />
      <span style={{ color: C.textDim }}>Codex: {health.online ? `online · ${fmtBytes(health.spaceFree)} free` : "offline — mock mode"}</span>
    </div>
  );

  // ── Full mode — detailed panel ──────────────────────────────────
  const usedPct = health.spaceTotal > 0
    ? Math.round((health.spaceUsed / health.spaceTotal) * 100)
    : 0;

  return (
    <Panel style={{ marginBottom: 16 }}>
      <SectionLabel>Codex Node</SectionLabel>

      {/* Status banner */}
      <div style={{
        padding: "10px 14px", marginBottom: 14,
        background: health.online ? C.accentFaint : C.redFaint,
        border: `1px solid ${health.online ? C.accentDim : C.red}`,
        fontFamily: C.mono, fontSize: 11,
        color: health.online ? C.accent : C.red,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span>
          <span className={health.online ? "ld-pulse" : ""} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: health.online ? C.accent : C.red, marginRight: 8 }} />
          {health.online ? `Node online · v${health.version}` : "Node offline — using mock storage"}
        </span>
        <button
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 9, color: health.online ? C.accentDim : C.red, letterSpacing: "0.1em" }}
          onClick={poll}
        >
          ↺ refresh
        </button>
      </div>

      {health.online ? (
        <>
          {/* Peer ID */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>Peer ID</div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.text, wordBreak: "break-all" }}>{health.peerId}</div>
          </div>

          {/* Storage bar */}
          {health.spaceTotal > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>
                <span>Storage</span>
                <span>{usedPct}% used</span>
              </div>
              {/* Bar */}
              <div style={{ height: 4, background: C.border, marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${usedPct}%`, background: usedPct > 85 ? C.amber : C.accent, transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10, color: C.textDim }}>
                <span>Used: <span style={{ color: C.text }}>{fmtBytes(health.spaceUsed)}</span></span>
                <span>Free: <span style={{ color: C.accent }}>{fmtBytes(health.spaceFree)}</span></span>
                <span>Total: <span style={{ color: C.text }}>{fmtBytes(health.spaceTotal)}</span></span>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            {[
              ["Local CIDs", cids !== null ? cids.toString() : "…"],
              ["Node URL", import.meta.env.DEV ? "localhost:8080 (proxied)" : (import.meta.env.VITE_CODEX_NODE_URL || "localhost:8080")],
              ["Last polled", lastPoll ? lastPoll.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.text }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Node addrs if available */}
          {health.addrs?.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Listen Addresses</div>
              {health.addrs.slice(0, 3).map((addr, i) => (
                <div key={i} style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint, marginBottom: 3 }}>{addr}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 12 }}>
            To enable real Codex storage, run a local Codex node and restart the app.
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "10px 12px", fontFamily: C.mono, fontSize: 10, color: C.textDim }}>
            <div style={{ color: C.textDim, marginBottom: 4 }}># Install + run Codex node</div>
            <div style={{ color: C.text }}>docker run -p 8080:8080 codexstorage/nim-codex</div>
            <div style={{ color: C.textDim, marginTop: 8, marginBottom: 4 }}># Or download binary from:</div>
            <div style={{ color: C.accent }}>https://github.com/codex-storage/nim-codex/releases</div>
          </div>
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#0d0d00", border: `1px solid ${C.amber}44`, color: C.amber, fontSize: 10 }}>
            ⚠  Mock mode active — uploads return deterministic mock CIDs derived from content hash. Switch to a real node for persistent storage.
          </div>
        </div>
      )}
    </Panel>
  );
}
