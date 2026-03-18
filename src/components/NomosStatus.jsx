import { useState, useEffect, useRef, useCallback } from "react";
import { Panel, SectionLabel, C, Spinner } from "./ui.jsx";
import { getNodeStatus, watchBlocks, LOGOS_DROP_CHANNEL } from "../services/nomos.js";

export default function NomosStatus({ compact = false }) {
  const [status,  setStatus]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocks,  setBlocks]  = useState([]);
  const streamRef = useRef(null);

  const poll = useCallback(async () => {
    const s = await getNodeStatus();
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    if (!status?.online) return;
    streamRef.current?.abort();
    watchBlocks(
      (b) => setBlocks(prev => [b, ...prev].slice(0, 6)),
      (e) => console.warn("[Nomos stream]", e?.message)
    ).then(ctrl => { streamRef.current = ctrl; }).catch(() => {});
    return () => streamRef.current?.abort();
  }, [status?.online]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
      <Spinner />
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim }}>Checking Nomos node...</span>
    </div>
  );

  if (!status) return null;

  if (compact) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 11 }}>
      <span className={status.online ? "ld-pulse" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: status.online ? C.accent : C.red, display: "inline-block" }} />
      <span style={{ color: C.textDim }}>
        Nomos: {status.online ? `synced · block ${status.blockHeight?.toLocaleString()} · ${status.peers}p` : "offline — mock"}
      </span>
    </div>
  );

  return (
    <Panel style={{ marginBottom: 16 }}>
      <SectionLabel>Nomos Node</SectionLabel>

      <div style={{ padding: "10px 14px", marginBottom: 14, background: status.online ? C.accentFaint : C.redFaint, border: `1px solid ${status.online ? C.accentDim : C.red}`, fontFamily: C.mono, fontSize: 11, color: status.online ? C.accent : C.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          <span className={status.online ? "ld-pulse" : ""} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: status.online ? C.accent : C.red, marginRight: 8 }} />
          {status.online ? "Node online · Cryptarchia PoS consensus" : "Node offline — using mock settlement"}
        </span>
        <button style={{ background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 9, color: status.online ? C.accentDim : C.red }} onClick={poll}>↺</button>
      </div>

      {status.online ? (
        <>
          {/* Chain metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {[["Block", status.blockHeight?.toLocaleString()], ["Slot", status.slot?.toLocaleString()], ["Epoch", status.epoch?.toLocaleString()]].map(([l, v]) => (
              <div key={l} style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "8px 10px" }}>
                <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>{l}</div>
                <div style={{ fontFamily: C.mono, fontSize: 13, color: C.accent }}>{v ?? "—"}</div>
              </div>
            ))}
          </div>

          {/* Detail rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
            {[["Peers", status.peers], ["Fork", status.fork], ["Node ID", status.nodeId]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 5, gap: 12 }}>
                <span style={{ color: C.textDim, flexShrink: 0 }}>{l}</span>
                <span style={{ color: C.text, wordBreak: "break-all", textAlign: "right" }}>{v ?? "—"}</span>
              </div>
            ))}
          </div>

          {/* Anchor channel */}
          <div style={{ marginBottom: 14, padding: "8px 12px", background: C.bg, border: `1px solid ${C.accentDim}` }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.accentDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              Anchor channel — sha256("logos-drop-v1")
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, wordBreak: "break-all" }}>{LOGOS_DROP_CHANNEL}</div>
          </div>

          {/* Live block ticker */}
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ld-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent, display: "inline-block" }} />
              Live Block Stream
            </div>
            {blocks.length === 0
              ? <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textFaint }}>Awaiting blocks…</div>
              : blocks.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 9, padding: "3px 8px", marginBottom: 2, background: i === 0 ? C.accentFaint : C.bg, border: `1px solid ${i === 0 ? C.accentDim : C.border}`, transition: "all 0.3s" }}>
                  <span style={{ color: i === 0 ? C.accent : C.textDim }}>{b.hash ? b.hash.slice(0,14)+"…" : "block"}</span>
                  <span style={{ color: C.textFaint }}>{b.slot != null ? `slot ${b.slot}` : ""}</span>
                </div>
              ))
            }
          </div>
        </>
      ) : (
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, lineHeight: 1.8, marginBottom: 12 }}>
            Run a local Nomos node to enable real settlement:
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "10px 12px", fontFamily: C.mono, fontSize: 10, marginBottom: 10 }}>
            <div style={{ color: C.textDim, marginBottom: 2 }}># Clone + build</div>
            <div style={{ color: C.text }}>git clone https://github.com/logos-co/nomos-node</div>
            <div style={{ color: C.text }}>cargo build -p nomos-node --release</div>
            <div style={{ color: C.textDim, marginTop: 8, marginBottom: 2 }}># Or run devnet</div>
            <div style={{ color: C.text }}>cd testnet && docker compose up</div>
          </div>
          <div style={{ padding: "8px 12px", background: "#0d0d00", border: `1px solid ${C.amber}44`, color: C.amber, fontFamily: C.mono, fontSize: 10, marginBottom: 8 }}>
            ⚠  Mock mode active — anchor tx structure is finalised and ready to submit when node connects.
          </div>
          <div style={{ padding: "8px 12px", background: C.accentFaint, border: `1px solid ${C.accentDim}`, fontFamily: C.mono, fontSize: 10, color: C.accentDim }}>
            Channel ready: <span style={{ color: C.accent }}>{LOGOS_DROP_CHANNEL.slice(0,32)}…</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
