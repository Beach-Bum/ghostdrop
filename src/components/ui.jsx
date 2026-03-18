// ─── Design Tokens ────────────────────────────────────────────────
export const C = {
  bg: "#060606",
  surface: "#0f0f0f",
  surface2: "#161616",
  border: "#1e1e1e",
  borderBright: "#2e2e2e",
  accent: "#AAFF00",
  accentDim: "#556600",
  accentFaint: "#1a2200",
  red: "#FF3535",
  redFaint: "#1f0000",
  amber: "#FFB800",
  blue: "#4488FF",
  muted: "#3a3a3a",
  text: "#DEDEDE",
  textDim: "#555",
  textFaint: "#333",
  mono: "'Courier New', 'Courier', monospace",
};

// ─── CSS Injection ────────────────────────────────────────────────
export function injectStyles() {
  if (document.getElementById("ld-styles")) return;
  const s = document.createElement("style");
  s.id = "ld-styles";
  s.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: ${C.bg}; }
    ::-webkit-scrollbar-thumb { background: ${C.muted}; }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes slide-in{ from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes blink   { 0%,100%{opacity:1} 49%{opacity:1} 50%{opacity:0} 99%{opacity:0} }
    @keyframes spin    { to{transform:rotate(360deg)} }
    @keyframes glow    { 0%,100%{box-shadow:0 0 4px ${C.accentDim}} 50%{box-shadow:0 0 12px ${C.accent}} }
    .ld-anim    { animation: slide-in 0.25s ease both; }
    .ld-spin    { animation: spin 1s linear infinite; }
    .ld-pulse   { animation: pulse 1.5s ease-in-out infinite; }
    .ld-blink   { animation: blink 1s step-end infinite; }
    .ld-glow    { animation: glow 2s ease-in-out infinite; }
    .ld-hover-row:hover { background: ${C.surface2} !important; cursor: pointer; }
    .ld-btn { cursor:pointer; font-family:${C.mono}; font-size:11px; letter-spacing:0.08em; border:none; padding:8px 18px; text-transform:uppercase; transition:all 0.15s; }
    .ld-btn-primary { background:${C.accent}; color:#000; }
    .ld-btn-primary:hover:not(:disabled) { background:#fff; }
    .ld-btn-ghost { background:transparent; color:${C.textDim}; border:1px solid ${C.border}; }
    .ld-btn-ghost:hover:not(:disabled) { border-color:${C.accent}; color:${C.accent}; }
    .ld-btn-danger { background:transparent; color:${C.red}; border:1px solid ${C.red}; }
    .ld-btn-danger:hover:not(:disabled) { background:${C.redFaint}; }
    .ld-btn:disabled { opacity:0.35; cursor:not-allowed; }
    .ld-input { background:${C.surface}; border:1px solid ${C.border}; color:${C.text}; font-family:${C.mono}; font-size:12px; padding:8px 10px; width:100%; outline:none; transition:border-color 0.15s; }
    .ld-input:focus { border-color:${C.accent}; }
    .ld-outlet-card { border:1px solid ${C.border}; padding:14px; cursor:pointer; transition:all 0.15s; background:${C.surface}; }
    .ld-outlet-card:hover { border-color:${C.accent}; background:${C.accentFaint}; }
    .ld-outlet-card.selected { border-color:${C.accent}; background:${C.accentFaint}; }
    .copy-btn { cursor:pointer; color:${C.textDim}; font-size:10px; background:none; border:none; font-family:${C.mono}; padding:0 4px; transition:color 0.1s; }
    .copy-btn:hover { color:${C.accent}; }
    textarea.ld-input { resize: vertical; min-height: 80px; }
  `;
  document.head.appendChild(s);
}

// ─── Shared Components ────────────────────────────────────────────

import { useState } from "react";

export function Panel({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "20px", ...style }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.textDim, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ display: "inline-block", width: 16, height: 1, background: C.muted }} />
      {children}
      <span style={{ display: "inline-block", flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

export function HashDisplay({ value, label, color }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {label && <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>}
        <div style={{ fontFamily: C.mono, fontSize: 10, color: color || C.accent, wordBreak: "break-all" }}>{value}</div>
      </div>
      <button className="copy-btn" onClick={copy} style={{ flexShrink: 0, marginLeft: 8 }}>{copied ? "✓" : "copy"}</button>
    </div>
  );
}

export function StatusLine({ status, text, color }) {
  const colors = { active: C.accent, idle: C.muted, error: C.red, warn: C.amber, info: C.blue };
  const c = colors[color || status] || C.muted;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 11, color: C.textDim }}>
      <span className={status === "active" ? "ld-pulse" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: c, display: "inline-block", flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}

export function Spinner({ size = 12 }) {
  return (
    <span className="ld-spin" style={{ display: "inline-block", width: size, height: size, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%" }} />
  );
}

export function StepIndicator({ steps, current }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: i > current ? 0.3 : 1 }}>
          <div style={{ width: 22, height: 22, border: `1px solid ${i === current ? C.accent : i < current ? C.accentDim : C.border}`, background: i < current ? C.accentFaint : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono, fontSize: 9, color: i === current ? C.accent : i < current ? C.accentDim : C.textDim }}>
            {i < current ? "✓" : i + 1}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 8, color: i === current ? C.accent : C.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>{s}</div>
        </div>
      ))}
    </div>
  );
}

export function LogTerminal({ lines, loading, style = {} }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "12px", maxHeight: 180, overflowY: "auto", ...style }}>
      {lines.map((l, i) => (
        <div key={i} style={{ fontFamily: C.mono, fontSize: 10, color: l.color || C.textDim, lineHeight: 1.8 }}>{l.msg}</div>
      ))}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Spinner size={10} />
          <span className="ld-blink" style={{ fontFamily: C.mono, fontSize: 10, color: C.textFaint }}>_</span>
        </div>
      )}
    </div>
  );
}

export function Tag({ children }) {
  return (
    <span style={{ display: "inline-block", background: C.surface2, color: C.textDim, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 6px", border: `1px solid ${C.border}`, marginRight: 4 }}>
      {children}
    </span>
  );
}

// ─── Utilities ────────────────────────────────────────────────────
export const fmtAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const fmtTime = (ts) => {
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

export const truncate = (s = "", n = 16) => `${s.slice(0, n)}…${s.slice(-8)}`;
