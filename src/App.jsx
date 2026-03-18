import { useState, useEffect, useRef, useCallback } from "react";

// ─── Ghost SVG Logo ───────────────────────────────────────────────
const GhostIcon = ({ size = 22 }) => (
  <span style={{ fontSize: size, lineHeight: 1, display: 'block' }}>👻</span>
)

// ─── Design tokens (WCAG AA accessible, light + dark) ────────────
const injectStyles = () => {
  if (document.getElementById("gd-styles")) return;
  const s = document.createElement("style");
  s.id = "gd-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root, [data-theme="dark"] {
      --sidebar: #1a1b1e;
      --bg: #212226;
      --surface: #2a2b30;
      --surface2: #35363c;
      --border: #3d3e44;
      --border-light: #2a2b30;
      --accent: #4d94ff;
      --accent-hover: #3d84ef;
      --accent-soft: rgba(77,148,255,0.14);
      --text: #f1f3f5;
      --text-2: #b0b3b8;
      --text-3: #8b8d93;
      --green: #51cf66;
      --green-soft: rgba(81,207,102,0.12);
      --amber: #fcc419;
      --amber-soft: rgba(252,196,25,0.12);
      --red: #ff6b6b;
      --red-soft: rgba(255,107,107,0.1);
      --radius: 10px;
      --radius-sm: 6px;
      --shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
    }
    [data-theme="light"] {
      --sidebar: #f8f9fa;
      --bg: #ffffff;
      --surface: #f1f3f5;
      --surface2: #e9ecef;
      --border: #dee2e6;
      --border-light: #f1f3f5;
      --accent: #0061ff;
      --accent-hover: #0052d9;
      --accent-soft: rgba(0,97,255,0.08);
      --text: #1a1b1e;
      --text-2: #495057;
      --text-3: #6c7178;
      --green: #2f9e44;
      --green-soft: rgba(47,158,68,0.08);
      --amber: #e67700;
      --amber-soft: rgba(230,119,0,0.08);
      --red: #c92a2a;
      --red-soft: rgba(201,42,42,0.06);
      --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
    }
    body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; background: var(--bg); color: var(--text); }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes shimmer { 0%{opacity:0.5} 50%{opacity:1} 100%{opacity:0.5} }
    .fade-up { animation: fadeUp 0.22s ease both; }
    .gd-pulse { animation: pulse 1.8s ease-in-out infinite; }
    .gd-spin { animation: spin 0.9s linear infinite; }

    /* Buttons — min 44px touch target (WCAG 2.5.5) */
    .btn { cursor: pointer; border: none; border-radius: var(--radius-sm); font-family: inherit; font-size: 14px; font-weight: 600; padding: 10px 20px; min-height: 40px; transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
    .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
    .btn-ghost:hover:not(:disabled) { background: var(--surface2); color: var(--text); border-color: var(--text-3); }
    .btn-danger { background: var(--red-soft); color: var(--red); border: 1px solid transparent; }
    .btn-danger:hover:not(:disabled) { background: rgba(255,107,107,0.18); }
    .btn-sm { padding: 6px 13px; font-size: 13px; min-height: 32px; }

    /* Inputs — clear focus states */
    .input { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-family: inherit; font-size: 14px; padding: 10px 14px; width: 100%; outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
    .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .input::placeholder { color: var(--text-3); }
    textarea.input { resize: vertical; min-height: 90px; line-height: 1.5; }

    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }

    /* Nav items */
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-2); transition: all 0.12s; text-decoration: none; user-select: none; }
    .nav-item:hover { background: var(--surface); color: var(--text); }
    .nav-item.active { background: var(--accent-soft); color: var(--accent); }
    .nav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

    /* Outlet cards */
    .outlet-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 16px; cursor: pointer; transition: all 0.15s; }
    .outlet-card:hover { border-color: var(--accent); background: var(--accent-soft); }
    .outlet-card.selected { border-color: var(--accent); background: var(--accent-soft); }
    .outlet-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    /* Steps */
    .step-pill { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 50px; font-size: 13px; font-weight: 500; transition: all 0.15s; }
    .step-pill.done { background: var(--green-soft); color: var(--green); }
    .step-pill.active { background: var(--accent-soft); color: var(--accent); }
    .step-pill.pending { background: transparent; color: var(--text-3); }

    /* Tag badges */
    .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 50px; font-size: 12px; font-weight: 500; gap: 4px; }
    .badge-blue { background: var(--accent-soft); color: var(--accent); }
    .badge-green { background: var(--green-soft); color: var(--green); }
    .badge-amber { background: var(--amber-soft); color: var(--amber); }
    .badge-red { background: var(--red-soft); color: var(--red); }
    .badge-gray { background: var(--surface2); color: var(--text-2); }

    /* List row hover */
    .list-row { border-bottom: 1px solid var(--border-light); transition: background 0.1s; cursor: pointer; }
    .list-row:hover { background: var(--surface2); }
    .list-row:last-child { border-bottom: none; }

    /* Progress bar */
    .progress-bar { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s ease; }

    /* Terminal log */
    .log-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12.5px; line-height: 1.9; max-height: 200px; overflow-y: auto; }
    [data-theme="dark"] .log-box, :root .log-box { background: #0d0e12; }
    .log-line-accent { color: var(--accent); }
    .log-line-dim { color: var(--text-3); }
    .log-line-success { color: var(--green); }
    .log-line-error { color: var(--red); }
    .log-line-default { color: var(--text-2); }

    /* Hash display */
    .hash-box { background: var(--surface2); border-radius: var(--radius-sm); padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .hash-value { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; color: var(--accent); word-break: break-all; flex: 1; }

    /* Dot indicator */
    .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
    .dot-green { background: var(--green); }
    .dot-amber { background: var(--amber); }
    .dot-red { background: var(--red); }
    .dot-gray { background: var(--text-3); }
    .dot-blue { background: var(--accent); }

    /* Drag zone */
    .drop-zone { border: 2px dashed var(--border); border-radius: var(--radius); padding: 48px 24px; text-align: center; cursor: pointer; transition: all 0.15s; }
    .drop-zone:hover, .drop-zone.has-file { border-color: var(--accent); background: var(--accent-soft); }

    /* Mnemonic box */
    .mnemonic-box { background: var(--surface2); border: 1px solid var(--amber); border-radius: var(--radius-sm); padding: 18px 20px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 14px; line-height: 2.2; color: var(--text); letter-spacing: 0.02em; }

    /* Metadata risk rows */
    .risk-critical { color: var(--red); }
    .risk-high { color: var(--amber); }
    .risk-medium { color: #fab005; }
    .risk-low { color: var(--text-2); }

    /* Responsive */
    @media (max-width: 768px) {
      .gd-sidebar { display: none !important; }
      .gd-topbar { padding: 0 16px !important; }
      .gd-content { padding: 16px !important; }
      .gd-mobile-header { display: flex !important; }
    }
    .gd-mobile-header { display: none; }
  `;
  document.head.appendChild(s);
};

// ─── Utilities ────────────────────────────────────────────────────
const rHex = n => Array.from({length:n}, ()=>Math.floor(Math.random()*16).toString(16)).join("");
const rB58 = n => { const c="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; return Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join(""); };
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const fmtAgo = ts => { const s=Math.floor((Date.now()-ts)/1000); if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };
const truncate = (s="",n=16) => `${s.slice(0,n)}…${s.slice(-6)}`;
const WORDS = ["access","arctic","arrow","audit","basin","beacon","border","carbon","cipher","codex","commit","delta","deploy","derive","domain","echo","epoch","field","forge","ghost","grant","harbor","kernel","layer","limit","logic","matrix","mirror","nomos","orbit","parse","phase","prime","proof","proxy","relay","scope","seal","signal","stake","state","stream","token","trace","trust","vault","verify","waku","yield","zero"];
const genMnemonic = () => Array.from({length:12},()=>WORDS[Math.floor(Math.random()*WORDS.length)]).join(" ");

// ─── Mock services ────────────────────────────────────────────────
const MOCK_OUTLETS = [
  { id:"o1", name:"The Distributed Press", stake:"12,400 NOM", docs:47, topic:"/logos-drop/1/sub/o1", pubKeyHex:rHex(66) },
  { id:"o2", name:"Ciphertext Journal",    stake:"8,200 NOM",  docs:23, topic:"/logos-drop/1/sub/o2", pubKeyHex:rHex(66) },
  { id:"o3", name:"Zero Knowledge Reports",stake:"31,000 NOM", docs:112,topic:"/logos-drop/1/sub/o3", pubKeyHex:rHex(66) },
];
const MOCK_PUBS = [
  { id:"p1", headline:"Internal Memos Reveal Systematic Data Retention Violations", outlet:"Zero Knowledge Reports", cid:`Qm${rB58(44)}`, hash:`sha256:${rHex(64)}`, txHash:`0x${rHex(64)}`, block:848201, ts:Date.now()-432000000, tags:["corporate","privacy"], tipPool:"0.34 XMR", summary:"Documents show a major technology firm retained user communications for up to 7 years beyond stated policy, directly violating published privacy commitments." },
  { id:"p2", headline:"Procurement Records Expose Pattern of Regulatory Capture",   outlet:"The Distributed Press",  cid:`Qm${rB58(44)}`, hash:`sha256:${rHex(64)}`, txHash:`0x${rHex(64)}`, block:841932, ts:Date.now()-1036800000,tags:["government","finance"],tipPool:"1.20 XMR", summary:"Records cross-referenced with lobbying disclosures reveal a coordinated strategy to influence regulatory outcomes across three separate agencies." },
  { id:"p3", headline:"Leaked Audit: Environmental Compliance Data Falsified for 4 Years", outlet:"Ciphertext Journal", cid:`Qm${rB58(44)}`, hash:`sha256:${rHex(64)}`, txHash:`0x${rHex(64)}`, block:839104, ts:Date.now()-1814400000,tags:["environment","fraud"],tipPool:"0.78 XMR", summary:"An internal audit shows that environmental monitoring reports were systematically altered to conceal exceedances of permitted emission levels." },
];
const MOCK_INBOX = [
  { id:"s1", ts:Date.now()-7200000,  size:"2.4 MB", type:"PDF",  ephPub:rHex(64), status:"unread" },
  { id:"s2", ts:Date.now()-64800000, size:"847 KB", type:"PDF",  ephPub:rHex(64), status:"unread" },
  { id:"s3", ts:Date.now()-259200000,size:"5.1 MB", type:"ZIP",  ephPub:rHex(64), status:"read"   },
];

// ─── Shared Components ────────────────────────────────────────────

const Spinner = ({ size=16 }) => (
  <span className="gd-spin" style={{ display:"inline-block", width:size, height:size, border:"2px solid rgba(255,255,255,0.15)", borderTopColor:"var(--accent)", borderRadius:"50%" }} />
);

const Dot = ({ status }) => {
  const cls = { active:"dot-green", warn:"dot-amber", error:"dot-red", idle:"dot-gray", info:"dot-blue" }[status] || "dot-gray";
  return <span className={`dot ${cls} ${status==="active"?"gd-pulse":""}`} />;
};

const SectionTitle = ({ children, sub }) => (
  <div style={{ marginBottom:20 }}>
    <div style={{ fontSize:17, fontWeight:600, color:"var(--text)" }}>{children}</div>
    {sub && <div style={{ fontSize:13, color:"var(--text-2)", marginTop:4 }}>{sub}</div>}
  </div>
);

const HashDisplay = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom:8 }}>
      {label && <div style={{ fontSize:11, fontWeight:500, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>{label}</div>}
      <div className="hash-box">
        <span className="hash-value">{value}</span>
        <button className="btn btn-ghost btn-sm" onClick={()=>{ navigator.clipboard?.writeText(value); setCopied(true); setTimeout(()=>setCopied(false),1500); }} style={{ flexShrink:0, fontSize:12 }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
};

const LogTerminal = ({ lines, loading }) => (
  <div className="log-box" style={{ marginBottom:16 }}>
    {lines.map((l,i) => (
      <div key={i} className={`log-line-${l.type||"default"}`}>{l.msg}</div>
    ))}
    {loading && <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}><Spinner size={12}/><span className="log-line-dim">processing…</span></div>}
  </div>
);

const StepBar = ({ steps, current, compact }) => (
  <div style={{ display:"flex", gap:compact?4:6, marginBottom:compact?0:28, flexWrap:"wrap" }}>
    {steps.map((s,i) => (
      <div key={i} className={`step-pill ${i<current?"done":i===current?"active":"pending"}`} style={compact?{padding:"4px 10px",fontSize:12}:undefined}>
        {i < current ? (
          <svg width={compact?12:14} height={compact?12:14} viewBox="0 0 14 14"><path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        ) : (
          <span style={{ width:compact?14:18, height:compact?14:18, borderRadius:"50%", background:"currentColor", opacity:0.15, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:compact?9:11, fontWeight:700 }}>
            <span style={{ color:"currentColor", opacity:7 }}>{i+1}</span>
          </span>
        )}
        {s}
      </div>
    ))}
  </div>
);

const Alert = ({ type="info", children }) => {
  const styles = {
    info:    { bg:"var(--accent-soft)",  text:"var(--accent)",  border:"rgba(0,97,255,0.2)" },
    success: { bg:"var(--green-soft)",   text:"var(--green)",   border:"rgba(47,158,68,0.2)" },
    warning: { bg:"var(--amber-soft)",   text:"var(--amber)",   border:"rgba(245,159,0,0.2)" },
    danger:  { bg:"var(--red-soft)",     text:"var(--red)",     border:"rgba(224,49,49,0.2)" },
  }[type];
  return (
    <div style={{ background:styles.bg, color:styles.text, border:`1px solid ${styles.border}`, borderRadius:"var(--radius-sm)", padding:"11px 14px", fontSize:13.5, marginBottom:14, lineHeight:1.5 }}>
      {children}
    </div>
  );
};

// ─── Source View ──────────────────────────────────────────────────
const STEPS_SRC = ["Upload", "Strip", "Outlet", "Submit", "Receipt"];

function SourceView({ onStepChange }) {
  const [step, _setStep] = useState(0);
  const setStep = (v) => { _setStep(v); onStepChange?.(v); };
  const [file, setFile] = useState(null);
  const [stripping, setStripping] = useState(false);
  const [stripDone, setStripDone] = useState(false);
  const [stripFields] = useState(["Author & editor names","GPS coordinates","Creation timestamp","Software version","Revision history","Printer stego dots","Last-modified date"]);
  const [stripPct, setStripPct] = useState(0);
  const [outlets, setOutlets] = useState(null);
  const [loadingOutlets, setLoadingOutlets] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [log, setLog] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [coverNote, setCoverNote] = useState("");
  const [backMsgs, setBackMsgs] = useState([]);
  const [polling, setPolling] = useState(false);
  const addLog = (msg, type="default") => setLog(p=>[...p,{msg,type}]);

  const handleFile = f => { setFile(f); setStripDone(false); setStripPct(0); };

  const runStrip = async () => {
    setStripping(true);
    for (let i=0;i<=100;i+=5) {
      await sleep(60);
      setStripPct(i);
    }
    setStripping(false);
    setStripDone(true);
  };

  const loadOutlets = async () => {
    if (outlets) { setStep(2); return; }
    setLoadingOutlets(true);
    await sleep(700);
    setOutlets(MOCK_OUTLETS);
    setLoadingOutlets(false);
    setStep(2);
  };

  const runSubmit = async () => {
    setSubmitting(true); setLog([]);
    addLog("► Generating ephemeral secp256k1 keypair…", "dim");
    await sleep(500);
    const ephPub = rHex(66);
    addLog(`  pubkey: ${ephPub.slice(0,32)}…`, "accent");
    addLog("► ECIES encrypting document payload…", "dim");
    await sleep(800);
    addLog(`  payload: ${Math.floor((file?.size||40000)/1024) + 24} KB encrypted`, "success");
    addLog("► Connecting to Logos Messaging p2p network…", "dim");
    await sleep(900);
    addLog(`  peers: 7 connected`, "accent");
    addLog(`► Pushing to ${selectedOutlet?.topic}…`, "dim");
    await sleep(1100);
    const msgId = rHex(32);
    addLog(`  msgId: ${msgId}`, "success");
    addLog("► Transmission complete via Logos Messaging gossip", "success");
    setReceipt({ msgId, outletName: selectedOutlet?.name, ephPub, mnemonic: genMnemonic(), docHash: `sha256:${rHex(64)}`, ts: Date.now() });
    setSubmitting(false);
    setStep(4);
  };

  const pollBack = async () => {
    setPolling(true);
    await sleep(1400);
    setPolling(false);
    setBackMsgs([{ text:"Document received. Under editorial review. We'll respond within 48 hours.", ts: Date.now()-3600000 }]);
  };

  const reset = () => { setStep(0); setFile(null); setStripDone(false); setStripPct(0); setSelectedOutlet(null); setLog([]); setReceipt(null); setBackMsgs([]); setCoverNote(""); setOutlets(null); };

  return (
    <div className="fade-up">
      <div style={{ fontSize:13, color:"var(--text-2)", marginBottom:20 }}>Your document is processed entirely in your browser. Nothing leaves until you submit.</div>

      {/* Step 0 — Upload */}
      {step === 0 && (
        <div>
          <div className={`drop-zone${file?" has-file":""}`} onClick={() => document.getElementById("gd-file").click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); handleFile(e.dataTransfer.files[0]);}}>
            <input id="gd-file" type="file" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
            {file ? (
              <div>
                <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
                <div style={{ fontSize:15, fontWeight:600, color:"var(--accent)" }}>{file.name}</div>
                <div style={{ fontSize:13, color:"var(--text-2)", marginTop:4 }}>{(file.size/1024).toFixed(1)} KB · {file.type||"unknown"}</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:36, marginBottom:10, opacity:0.4 }}>↑</div>
                <div style={{ fontSize:15, fontWeight:600, color:"var(--text-2)" }}>Drop file here or click to browse</div>
                <div style={{ fontSize:13, color:"var(--text-3)", marginTop:5 }}>PDF, DOCX, images, ZIP · Any size</div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16 }}>
            <button className="btn btn-ghost btn-sm" onClick={()=>handleFile(new File(["DEMO CONFIDENTIAL MEMO — Internal use only. This document contains sensitive operational data that should not be distributed outside the organization. Generated for GhostDrop demonstration purposes."], "demo_memo.txt",{type:"text/plain"}))}>Load demo file</button>
            {file && <button className="btn btn-primary" onClick={()=>setStep(1)}>Continue to Strip →</button>}
          </div>
        </div>
      )}

      {/* Step 1 — Strip */}
      {step === 1 && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600 }}>{file?.name}</div>
                <div style={{ fontSize:13, color:"var(--text-2)", marginTop:2 }}>{(file?.size/1024).toFixed(1)} KB · {file?.type||"unknown"}</div>
              </div>
              <span className={`badge ${stripDone ? "badge-green" : "badge-amber"}`}>{stripDone ? "Stripped" : "Needs strip"}</span>
            </div>

            {!stripping && !stripDone && (
              <div>
                <Alert type="warning">⚠ This document may contain identifying metadata. Strip before submitting.</Alert>
                <div style={{ marginBottom:14 }}>
                  {stripFields.map((f,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid var(--border-light)", fontSize:13.5 }}>
                      <span style={{ color:"var(--amber)", fontSize:16 }}>·</span>
                      <span style={{ color:"var(--text-2)" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={runStrip}>Run Metadata Strip</button>
              </div>
            )}

            {stripping && (
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, fontSize:14, color:"var(--text-2)" }}>
                  <Spinner /> Stripping metadata… {stripPct}%
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width:`${stripPct}%` }} />
                </div>
              </div>
            )}

            {stripDone && (
              <div>
                <Alert type="success">✓ {stripFields.length} metadata fields removed · Document re-rendered to clean format</Alert>
                <div style={{ marginBottom:14 }}>
                  {stripFields.map((f,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", fontSize:13, color:"var(--text-3)" }}>
                      <svg width={14} height={14} viewBox="0 0 14 14"><path d="M2.5 7L5.5 10L11.5 4" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <button className="btn btn-ghost" onClick={()=>setStep(0)}>← Back</button>
            {stripDone && (
              <button className="btn btn-primary" disabled={loadingOutlets} onClick={loadOutlets}>
                {loadingOutlets ? <><Spinner/> Loading…</> : "Select Outlet →"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 2 — Outlet */}
      {step === 2 && outlets && (
        <div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, color:"var(--text-2)", marginBottom:14 }}>
              Outlets are registered on Logos Blockchain with a credibility stake. Your submission is encrypted — only the selected outlet can decrypt it.
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
              {outlets.map(o => (
                <div key={o.id} className={`outlet-card${selectedOutlet?.id===o.id?" selected":""}`} onClick={()=>setSelectedOutlet(o)}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:3 }}>
                        {selectedOutlet?.id===o.id && <span style={{ color:"var(--accent)", marginRight:6 }}>✓</span>}
                        {o.name}
                      </div>
                      <div style={{ fontSize:12, color:"var(--text-3)", fontFamily:"'SF Mono','Fira Code',monospace" }}>{o.topic}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--accent)" }}>{o.stake}</div>
                      <div style={{ fontSize:12, color:"var(--text-3)" }}>{o.docs} publications</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:500, color:"var(--text-2)", display:"block", marginBottom:8 }}>Cover note (optional — encrypted, only the outlet can read it)</label>
              <textarea className="input" placeholder="Add context for the editor…" value={coverNote} onChange={e=>setCoverNote(e.target.value)} />
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <button className="btn btn-ghost" onClick={()=>setStep(1)}>← Back</button>
            <button className="btn btn-primary" disabled={!selectedOutlet} onClick={()=>setStep(3)}>Review & Submit →</button>
          </div>
        </div>
      )}

      {/* Step 3 — Submit */}
      {step === 3 && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>Review before submitting</div>
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {[
                ["Document", file?.name],
                ["Metadata stripped", `✓ ${stripFields.length} fields removed`],
                ["Outlet", selectedOutlet?.name],
                ["Encryption", "ECIES · secp256k1 + AES-256-GCM"],
                ["Your IP visible to outlet", "No — Logos Messaging gossip protocol"],
                ["Identity linked", "No — ephemeral key only"],
              ].map(([l,v]) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border-light)", fontSize:14, gap:16 }}>
                  <span style={{ color:"var(--text-2)", flexShrink:0 }}>{l}</span>
                  <span style={{ color: v?.startsWith("✓")||v?.startsWith("No") ? "var(--green)" : "var(--text)", textAlign:"right" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {log.length > 0 && <LogTerminal lines={log} loading={submitting} />}

          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <button className="btn btn-ghost" disabled={submitting} onClick={()=>setStep(2)}>← Back</button>
            <button className="btn btn-primary" disabled={submitting} onClick={runSubmit}>
              {submitting ? <><Spinner/> Transmitting…</> : "🔒 Encrypt & Submit"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Receipt */}
      {step === 4 && receipt && (
        <div className="fade-up">
          <Alert type="success">✓ Delivered to <strong>{receipt.outletName}</strong> via Logos Messaging · Metadata stripped · End-to-end encrypted</Alert>

          <div className="card" style={{ marginBottom:14 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Your Claim Key</div>
            <div style={{ fontSize:13, color:"var(--text-2)", marginBottom:14 }}>
              This 12-word phrase is your only proof of submission and tip claim key. Save it somewhere safe — it's not stored anywhere.
            </div>
            <div style={{ background:"var(--amber-soft)", border:"1px solid rgba(245,159,0,0.3)", borderRadius:"var(--radius-sm)", padding:"10px 14px", fontSize:13, color:"var(--amber)", marginBottom:14 }}>
              ⚠ Cannot be recovered if lost
            </div>
            <div className="mnemonic-box">{receipt.mnemonic}</div>
          </div>

          <div className="card" style={{ marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>Submission Details</div>
            <HashDisplay value={receipt.ephPub}   label="Ephemeral Public Key" />
            <HashDisplay value={receipt.docHash}  label="Document Hash (SHA-256)" />
            <HashDisplay value={receipt.msgId}    label="Logos Messaging ID" />
          </div>

          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Back-channel</div>
            <div style={{ fontSize:13, color:"var(--text-2)", marginBottom:12 }}>Poll the Logos Messaging Store for outlet responses. Passive — no connection kept open.</div>
            {backMsgs.length > 0 ? backMsgs.map((m,i) => (
              <div key={i} style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", padding:"12px 14px" }}>
                <div style={{ fontSize:12, color:"var(--text-3)", marginBottom:4 }}>{fmtAgo(m.ts)}</div>
                <div style={{ fontSize:14 }}>{m.text}</div>
              </div>
            )) : (
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <button className="btn btn-ghost btn-sm" disabled={polling} onClick={pollBack}>
                  {polling ? <><Spinner size={13}/> Polling Logos Messaging Store…</> : "Check for reply"}
                </button>
                <span style={{ fontSize:13, color:"var(--text-3)" }}>No messages yet</span>
              </div>
            )}
          </div>

          <button className="btn btn-ghost" onClick={reset}>Submit another document</button>
        </div>
      )}
    </div>
  );
}

// ─── Outlet View ──────────────────────────────────────────────────
function OutletView() {
  const [screen, setScreen] = useState("dash");
  const [inbox, setInbox] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [headline, setHeadline] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [log, setLog] = useState([]);
  const [published, setPublished] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const addLog = (msg, type="default") => setLog(p=>[...p,{msg,type}]);

  const loadInbox = async () => {
    setLoading(true);
    await sleep(900);
    setInbox(MOCK_INBOX);
    setLoading(false);
    setScreen("inbox");
  };

  const runPublish = async () => {
    if (!headline.trim()) return;
    setPublishing(true); setLog([]);
    addLog("► Decrypting submission with outlet private key…","dim");
    await sleep(600); addLog("  ✓ Decryption successful","success");
    addLog("► Verifying strip attestation…","dim");
    await sleep(400); addLog("  ✓ Clean — 7 fields removed","success");
    addLog("► Uploading to Logos Storage network…","dim");
    const cid = `Qm${rB58(44)}`;
    await sleep(1800); addLog(`  CID: ${cid}`, "accent");
    addLog("► Anchoring to Logos Blockchain…","dim");
    const txHash = `0x${rHex(64)}`;
    await sleep(2200); addLog(`  tx: ${txHash.slice(0,42)}…`,"accent");
    addLog("► Broadcasting via Logos Messaging…","dim");
    await sleep(600); addLog("  ✓ Announced on reader topic","success");
    addLog("✓ Document is live and tamper-evident.","success");
    const hash = `sha256:${rHex(64)}`;
    setPublished({ headline, cid, hash, txHash, block:848201+Math.floor(Math.random()*100) });
    setPublishing(false);
    setScreen("published");
  };

  const runReject = async () => {
    setRejecting(true);
    await sleep(700);
    setRejecting(false);
    setScreen("rejected");
  };

  if (screen === "dash") return (
    <div className="fade-up">
      <SectionTitle children="Outlet Dashboard" sub="Zero Knowledge Reports" />
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            ["Outlet name","Zero Knowledge Reports"],
            ["Logos Blockchain address",`0x${rHex(40)}`],
            ["Staked bond","31,000 NOM"],
            ["Total publications","112"],
            ["Logos Messaging topic","/logos-drop/1/sub/outlet_3"],
          ].map(([l,v]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border-light)", fontSize:14, gap:16 }}>
              <span style={{ color:"var(--text-2)", flexShrink:0 }}>{l}</span>
              <span style={{ color:"var(--text)", textAlign:"right", wordBreak:"break-all", fontSize:13, fontFamily: l==="Logos Blockchain address"||l==="Logos Messaging topic" ? "'SF Mono','Fira Code',monospace":"inherit" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
        <Dot status="active"/> <span style={{ fontSize:13, color:"var(--text-2)" }}>Logos Messaging filter active — subscribed to submission topic</span>
      </div>
      <button className="btn btn-primary" disabled={loading} onClick={loadInbox}>
        {loading ? <><Spinner/> Loading inbox…</> : "Open Encrypted Inbox"}
      </button>
    </div>
  );

  if (screen === "inbox") return (
    <div className="fade-up">
      <SectionTitle children={`Encrypted Inbox`} sub={`${inbox?.length} submissions · All end-to-end encrypted`} />
      <div className="card" style={{ padding:0, overflow:"hidden", marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 60px 90px 80px", padding:"10px 18px", borderBottom:"1px solid var(--border)", fontSize:12, color:"var(--text-3)", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.07em" }}>
          <span>Ephemeral Key</span><span>Size</span><span>Type</span><span>Received</span><span>Status</span>
        </div>
        {inbox?.map(item => (
          <div key={item.id} className="list-row" style={{ display:"grid", gridTemplateColumns:"1fr 80px 60px 90px 80px", padding:"13px 18px", alignItems:"center" }}
            onClick={()=>{ setSelected(item); setHeadline(""); setLog([]); setScreen("review"); }}>
            <span style={{ fontFamily:"'SF Mono','Fira Code',monospace", fontSize:12, color:"#74c0fc" }}>{truncate(item.ephPub,20)}</span>
            <span style={{ fontSize:13, color:"var(--text-2)" }}>{item.size}</span>
            <span style={{ fontSize:13, color:"var(--text-2)" }}>{item.type}</span>
            <span style={{ fontSize:13, color:"var(--text-2)" }}>{fmtAgo(item.ts)}</span>
            <span className={`badge ${item.status==="unread"?"badge-blue":"badge-gray"}`}>{item.status}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={()=>setScreen("dash")}>← Dashboard</button>
    </div>
  );

  if (screen === "review" && selected) return (
    <div className="fade-up">
      <SectionTitle children="Review Submission" />
      <div className="card" style={{ marginBottom:14 }}>
        <HashDisplay value={selected.ephPub} label="Source Ephemeral Pubkey" />
        <div style={{ display:"flex", gap:16, marginTop:10, fontSize:13, color:"var(--text-2)" }}>
          <span>Received: <strong style={{ color:"var(--text)" }}>{fmtAgo(selected.ts)}</strong></span>
          <span>Size: <strong style={{ color:"var(--text)" }}>{selected.size}</strong></span>
          <span>Type: <strong style={{ color:"var(--text)" }}>{selected.type}</strong></span>
          <span className="badge badge-green">✓ Strip attested</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:500, color:"var(--text-2)", marginBottom:10 }}>Document Content</div>
        <div style={{ background:"var(--surface2)", borderRadius:"var(--radius-sm)", padding:"32px", textAlign:"center", fontSize:13, color:"var(--text-3)" }}>
          ECIES encrypted · Decrypt with outlet private key to view
        </div>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <label style={{ fontSize:13, fontWeight:500, color:"var(--text-2)", display:"block", marginBottom:8 }}>Publication headline</label>
        <input className="input" placeholder="Enter headline…" value={headline} onChange={e=>setHeadline(e.target.value)} style={{ marginBottom:16 }} />
        {log.length > 0 && <LogTerminal lines={log} loading={publishing} />}
        <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-ghost" disabled={publishing||rejecting} onClick={()=>setScreen("inbox")}>← Inbox</button>
            <input className="input" style={{ width:200 }} placeholder="Rejection reason…" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} />
            <button className="btn btn-danger btn-sm" disabled={publishing||!rejectReason.trim()} onClick={runReject}>
              {rejecting ? <Spinner size={13}/> : "Reject"}
            </button>
          </div>
          <button className="btn btn-primary" disabled={publishing||!headline.trim()} onClick={runPublish}>
            {publishing ? <><Spinner/> Publishing…</> : "Publish to Logos Storage + Logos Blockchain"}
          </button>
        </div>
      </div>
    </div>
  );

  if (screen === "published" && published) return (
    <div className="fade-up">
      <Alert type="success">✓ Document is live — pinned to Logos Storage, anchored on Logos Blockchain, announced via Logos Messaging</Alert>
      <div className="card">
        <div style={{ fontSize:16, fontWeight:600, marginBottom:16 }}>{published.headline}</div>
        <HashDisplay value={published.cid}    label="Logos Storage CID" />
        <HashDisplay value={published.hash}   label="Document Hash (SHA-256)" />
        <HashDisplay value={published.txHash} label="Logos Blockchain Anchor Tx" />
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text-2)", padding:"10px 0", borderTop:"1px solid var(--border)", marginTop:4 }}>
          <span>Logos Blockchain block</span>
          <span style={{ color:"var(--accent)", fontWeight:500 }}>#{published.block.toLocaleString()}</span>
        </div>
        <button className="btn btn-ghost" style={{ marginTop:14 }} onClick={()=>{ setSelected(null); setPublished(null); setScreen("inbox"); }}>← Back to Inbox</button>
      </div>
    </div>
  );

  if (screen === "rejected") return (
    <div className="fade-up">
      <Alert type="info">✓ Rejection sent to source via Logos Messaging back-channel keyed to their ephemeral pubkey</Alert>
      <button className="btn btn-ghost" onClick={()=>{ setSelected(null); setScreen("inbox"); }}>← Back to Inbox</button>
    </div>
  );
  return null;
}

// ─── Reader View ──────────────────────────────────────────────────
function ReaderView() {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [tipping, setTipping] = useState(false);
  const [tipped, setTipped] = useState(null);
  const tags = [...new Set(MOCK_PUBS.flatMap(p=>p.tags))];
  const pubs = filter ? MOCK_PUBS.filter(p=>p.tags.includes(filter)) : MOCK_PUBS;

  const runVerify = async () => {
    setVerifying(true); await sleep(1700); setVerifying(false); setVerified(true);
  };
  const runTip = async () => {
    if (!tipAmount) return;
    setTipping(true); await sleep(1200); setTipping(false);
    setTipped({ txHash:`0x${rHex(64)}`, amount:tipAmount });
  };

  if (!selected) return (
    <div className="fade-up">
      <SectionTitle children="Published Documents" sub="Anchored on Logos Blockchain · Stored on Logos Storage · Delivered via Logos Messaging" />
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        <button className={`btn btn-sm ${!filter?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter(null)}>All</button>
        {tags.map(t => (
          <button key={t} className={`btn btn-sm ${filter===t?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter(t)}>{t}</button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {pubs.map(p => (
          <div key={p.id} className="card list-row" style={{ cursor:"pointer", borderRadius:"var(--radius)", marginBottom:2 }} onClick={()=>{ setSelected(p); setVerified(false); setTipped(null); setTipAmount(""); }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:5, lineHeight:1.4 }}>{p.headline}</div>
                <div style={{ fontSize:13, color:"var(--text-2)", marginBottom:10, lineHeight:1.5 }}>{p.summary.slice(0,130)}…</div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, color:"var(--text-3)" }}>{p.outlet}</span>
                  {p.tags.map(t => <span key={t} className="badge badge-gray">{t}</span>)}
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div className="badge badge-green" style={{ marginBottom:6 }}>✓ verified</div>
                <div style={{ fontSize:12, color:"var(--text-3)" }}>{fmtAgo(p.ts)}</div>
                <div style={{ fontSize:12, color:"var(--text-2)", marginTop:4 }}>tip pool: <span style={{ color:"var(--accent)" }}>{p.tipPool}</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fade-up">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom:18 }} onClick={()=>setSelected(null)}>← All documents</button>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:6, lineHeight:1.4 }}>{selected.headline}</div>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:20, flexWrap:"wrap" }}>
        <span style={{ fontSize:13, color:"var(--text-2)" }}>{selected.outlet}</span>
        <span style={{ color:"var(--text-3)" }}>·</span>
        <span style={{ fontSize:13, color:"var(--text-3)" }}>{fmtAgo(selected.ts)}</span>
        {selected.tags.map(t => <span key={t} className="badge badge-gray">{t}</span>)}
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <p style={{ fontSize:14, lineHeight:1.7, color:"var(--text-2)" }}>{selected.summary}</p>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Tamper Verification</div>
        <HashDisplay value={selected.hash}   label="Document Hash (SHA-256)" />
        <HashDisplay value={selected.cid}    label="Logos Storage CID" />
        <HashDisplay value={selected.txHash} label="Logos Blockchain Anchor Tx" />
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text-2)", padding:"10px 0", borderTop:"1px solid var(--border)", marginTop:8, marginBottom:14 }}>
          <span>Anchored at block</span>
          <span style={{ fontWeight:500 }}>#{selected.block.toLocaleString()}</span>
        </div>
        {!verified ? (
          <button className="btn btn-ghost" disabled={verifying} onClick={runVerify}>
            {verifying ? <><Spinner size={14}/> Verifying against Logos Blockchain + Storage…</> : "Verify document integrity"}
          </button>
        ) : (
          <Alert type="success">✓ Hash verified on Logos Blockchain · CID confirmed on Logos Storage · Document unmodified</Alert>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Tip the Source</div>
        <div style={{ fontSize:13, color:"var(--text-2)", marginBottom:12 }}>
          Tips are held in Logos Blockchain escrow, claimable only with the source's ephemeral private key. Fully anonymous.
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text-2)", marginBottom:14, padding:"10px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)" }}>
          <span>Current tip pool</span>
          <span style={{ color:"var(--accent)", fontWeight:600 }}>{selected.tipPool}</span>
        </div>
        {!tipped ? (
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <div style={{ position:"relative", flex:1 }}>
              <input className="input" type="number" step="0.01" min="0" placeholder="0.00" value={tipAmount} onChange={e=>setTipAmount(e.target.value)} style={{ paddingRight:48 }} />
              <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"var(--text-3)" }}>XMR</span>
            </div>
            <button className="btn btn-primary" disabled={tipping||!tipAmount} onClick={runTip}>
              {tipping ? <><Spinner/> Locking…</> : "Lock in escrow"}
            </button>
          </div>
        ) : (
          <div>
            <Alert type="success">✓ {tipped.amount} XMR locked in Logos Blockchain escrow · Source can claim anonymously with their 12-word key</Alert>
            <HashDisplay value={tipped.txHash} label="Escrow Transaction" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────
const NAV = [
  { id:"source", icon:"↑", label:"Submit Document",  sub:"Send a document securely" },
  { id:"outlet", icon:"◫", label:"Outlet Inbox",      sub:"Receive & publish" },
  { id:"reader", icon:"≡", label:"Publications",      sub:"Browse & verify" },
];

const STATUS_ITEMS = [
  { label:"Logos Messaging",  statusKey:"active" },
  { label:"Logos Storage", statusKey:"warn"   },
  { label:"Logos Blockchain", statusKey:"warn"   },
];

// ─── App Root ─────────────────────────────────────────────────────
const getInitialTheme = () => {
  const saved = localStorage.getItem("gd-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

export default function App() {
  const [view, setView] = useState("source");
  const [theme, setTheme] = useState(getInitialTheme);
  const [sourceStep, setSourceStep] = useState(0);
  useEffect(() => { injectStyles(); }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("gd-theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:"var(--bg)", fontFamily:"'Plus Jakarta Sans',-apple-system,sans-serif" }}>

      {/* Sidebar */}
      <div className="gd-sidebar" style={{ width:250, background:"var(--sidebar)", display:"flex", flexDirection:"column", borderRight:"1px solid var(--border)", flexShrink:0 }}>

        {/* Logo */}
        <div style={{ padding:"20px 18px 14px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <GhostIcon size={22} />
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"var(--text)", letterSpacing:"-0.02em" }}>GhostDrop</div>
              <div style={{ fontSize:11, color:"var(--text-3)", marginTop:1 }}>Decentralised · Private</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex:1, padding:"14px 10px", overflowY:"auto" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:"0.1em", padding:"4px 8px", marginBottom:6 }}>Navigation</div>
          {NAV.map(n => (
            <div key={n.id} className={`nav-item${view===n.id?" active":""}`} onClick={()=>setView(n.id)}>
              <span style={{ fontSize:16, width:20, textAlign:"center" }}>{n.icon}</span>
              <div>
                <div style={{ fontSize:13.5, lineHeight:1 }}>{n.label}</div>
                <div style={{ fontSize:11, color:"var(--text-3)", marginTop:3, fontWeight:400 }}>{n.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Status footer */}
        <div style={{ padding:"14px 16px", borderTop:"1px solid var(--border)" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Stack Status</div>
          {STATUS_ITEMS.map(s => (
            <div key={s.label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
              <Dot status={s.statusKey} />
              <span style={{ fontSize:12.5, color:"var(--text-2)" }}>{s.label}</span>
              <span style={{ fontSize:11, color:"var(--text-3)", marginLeft:"auto" }}>
                {s.statusKey==="active"?"live":s.statusKey==="warn"?"mock":"error"}
              </span>
            </div>
          ))}
          <div style={{ marginTop:12, padding:"8px 10px", background:"var(--surface)", borderRadius:"var(--radius-sm)", fontSize:11.5, color:"var(--text-3)", lineHeight:1.5 }}>
            Logos Messaging: public fleet · Storage/Blockchain: run locally to activate
          </div>
          <button onClick={toggleTheme} className="btn btn-ghost btn-sm" style={{ width:"100%", marginTop:10, justifyContent:"center", fontSize:12 }}>
            {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Mobile header */}
        <div className="gd-mobile-header" style={{ height:48, alignItems:"center", padding:"0 16px", borderBottom:"1px solid var(--border)", background:"var(--sidebar)", flexShrink:0, gap:10 }}>
          <GhostIcon size={18} />
          <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>GhostDrop</span>
          <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
            <button onClick={toggleTheme} className="btn btn-ghost btn-sm" style={{ padding:"4px 8px", fontSize:12, minHeight:28 }}>
              {theme === "dark" ? "☀" : "☾"}
            </button>
            {NAV.map(n => (
              <button key={n.id} className={`btn btn-sm ${view===n.id?"btn-primary":"btn-ghost"}`} onClick={()=>setView(n.id)} style={{ padding:"4px 10px", fontSize:12 }}>
                {n.icon}
              </button>
            ))}
          </div>
        </div>

        {/* Top bar */}
        <div className="gd-topbar" style={{ minHeight:56, display:"flex", alignItems:"center", padding:"12px 28px", borderBottom:"1px solid var(--border)", background:"var(--sidebar)", flexShrink:0, gap:20, flexWrap:"wrap" }}>
          <span style={{ fontSize:15, fontWeight:600, color:"var(--text)", flexShrink:0 }}>
            {NAV.find(n=>n.id===view)?.label}
          </span>
          {view === "source" && <StepBar steps={STEPS_SRC} current={sourceStep} compact />}
        </div>

        {/* Scrollable content */}
        <div className="gd-content" style={{ flex:1, overflowY:"auto", padding:"28px" }}>
          <div style={{ maxWidth:720 }}>
            {view === "source" && <SourceView onStepChange={setSourceStep} />}
            {view === "outlet" && <OutletView />}
            {view === "reader" && <ReaderView />}
          </div>
        </div>
      </div>
    </div>
  );
}
