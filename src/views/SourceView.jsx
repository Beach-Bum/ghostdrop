/**
 * SourceView — Document submission flow
 *
 * Steps:
 *   1. Upload   — drag-and-drop file or demo mode
 *   2. Strip    — metadata removal + attestation (real, Layer 4)
 *   3. Outlet   — select from Nomos registry
 *   4. Submit   — ECIES encrypt + Waku LightPush
 *   5. Receipt  — save claim key, poll back-channel
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Panel, SectionLabel, HashDisplay, Spinner, StepIndicator, LogTerminal, Tag, C, fmtAgo } from "../components/ui.jsx";
import { buildSubmissionEnvelope, bytesToHex, privKeyToMnemonic, hexToBytes } from "../services/crypto.js";
import { stripMetadata, scanMetadata, formatRisk } from "../services/strip.js";
import { runOpsecCheck, OPSEC_GUIDE } from "../services/transport.js";
import * as WakuService from "../services/waku.js";
import * as NomosService from "../services/nomos.js";

const STEPS = ["Upload", "Strip", "Outlet", "Encrypt & Send", "Receipt"];

const STRIPPED_FIELDS = [
  "Author & editor names",
  "GPS coordinates (if image attachment)",
  "Document creation timestamp",
  "Software version string",
  "Revision history delta",
  "Printer steganographic dots",
  "Last-modified metadata",
];

export default function SourceView() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [fileBytes, setFileBytes] = useState(null);
  // Strip state
  const [scanning,     setScanning]     = useState(false);
  const [scanResult,   setScanResult]   = useState(null);
  const [stripping,    setStripping]    = useState(false);
  const [stripReport,  setStripReport]  = useState(null);
  const [strippedBytes,setStrippedBytes]= useState(null);
  const [stripProgress,setStripProgress]= useState(null);
  // OpSec
  const [opsec,        setOpsec]        = useState(null);
  const [opsecLoading, setOpsecLoading] = useState(false);
  const [showOpsec,    setShowOpsec]    = useState(false);
  // Outlet + submit
  const [outlets,        setOutlets]        = useState(null);
  const [loadingOutlets, setLoadingOutlets] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [submitLog,      setSubmitLog]      = useState([]);
  const [receipt,        setReceipt]        = useState(null);
  const [checkingBack,   setCheckingBack]   = useState(false);
  const [backMessages,   setBackMessages]   = useState([]);
  const [coverNote,      setCoverNote]      = useState("");
  const dropRef = useRef(null);

  const log = useCallback((msg, color = C.textDim) => {
    setSubmitLog((prev) => [...prev, { msg, color }]);
  }, []);

  // Run OpSec check on mount (non-blocking)
  useEffect(() => {
    setOpsecLoading(true);
    runOpsecCheck().then(r => { setOpsec(r); setOpsecLoading(false); }).catch(() => setOpsecLoading(false));
  }, []);

  // ─── File Handling ──────────────────────────────────────────────

  const handleFile = useCallback((f) => {
    setFile(f);
    setScanResult(null);
    setStripReport(null);
    setStrippedBytes(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result);
      setFileBytes(bytes);
      // Auto-scan on file load
      setScanning(true);
      scanMetadata(f).then(r => { setScanResult(r); setScanning(false); }).catch(() => setScanning(false));
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0] || e.target.files?.[0];
    if (f) handleFile(f);
  };

  const loadDemo = () => {
    const demoContent = "CONFIDENTIAL INTERNAL MEMO\n\nTo: Executive Team\nFrom: Compliance\nDate: March 15, 2024\nAuthor: Jane Smith, Compliance Officer\nRe: Data Retention Policy Violations\n\n[DEMO DOCUMENT — no real content]";
    const bytes = new TextEncoder().encode(demoContent);
    const f = new File([bytes], "confidential_memo.txt", { type: "text/plain" });
    handleFile(f);
  };

  // ─── Metadata Strip ─────────────────────────────────────────────

  const runStrip = async () => {
    if (!file) return;
    setStripping(true);
    setStripProgress(null);
    try {
      const result = await stripMetadata(file, (stage, pct) => {
        setStripProgress({ stage, pct });
      });
      setStrippedBytes(result.strippedBytes);
      setStripReport(result.report);
    } catch (err) {
      setStripReport({ error: err.message, fieldsRemoved: [], technique: "failed", warnings: [err.message] });
    } finally {
      setStripping(false);
      setStripProgress(null);
    }
  };

  // ─── Load Outlets ───────────────────────────────────────────────

  const loadOutlets = async () => {
    if (outlets) { setStep(2); return; }
    setLoadingOutlets(true);
    const list = await NomosService.getOutlets();
    setOutlets(list);
    setLoadingOutlets(false);
    setStep(2);
  };

  // ─── Submit ─────────────────────────────────────────────────────

  const runSubmit = async () => {
    // Use stripped bytes if stripping ran, fall back to original
    const bytesToSubmit = strippedBytes || fileBytes;
    if (!bytesToSubmit || !selectedOutlet) return;
    setSubmitting(true);
    setSubmitLog([]);

    try {
      // 1. Build ECIES envelope (includes strip attestation)
      log("► Generating ephemeral secp256k1 keypair...", C.textDim);
      const outletPubKeyBytes = hexToBytes(selectedOutlet.pubKeyHex);

      // Embed strip report in cover note if available
      const envelopeMeta = stripReport ? `[strip:${stripReport.technique}|fields:${stripReport.fieldsRemoved.length}|hash:${stripReport.strippedHash?.slice(7, 23)}]` : "[strip:none]";
      const fullCoverNote = coverNote ? `${coverNote}\n\n${envelopeMeta}` : envelopeMeta;

      const { payload, ephKeys, docHash } = buildSubmissionEnvelope(
        bytesToSubmit,
        file.type || "application/octet-stream",
        outletPubKeyBytes,
        fullCoverNote
      );
      const ephPubHex  = bytesToHex(ephKeys.pubKey);
      const ephPrivHex = bytesToHex(ephKeys.privKey);
      log(`  pubkey:   ${ephPubHex.slice(0, 32)}…`, C.accent);
      log(`  doc hash: ${docHash.slice(0, 42)}…`, C.accent);
      if (stripReport) {
        log(`  strip:    ${stripReport.technique} · ${stripReport.fieldsRemoved.length} fields removed`, C.accentDim);
      }

      // 2. Encryption confirmation
      log("► ECIES encryption complete (secp256k1 + AES-256-GCM)...", C.textDim);
      log(`  payload: ${payload.length} bytes (${(payload.length / 1024).toFixed(1)} KB)`, C.accentDim);

      // 3. Connect to Waku
      log("► Connecting to Waku p2p network...", C.textDim);
      await WakuService.connect();
      const diag = WakuService.diagnostics();
      log(`  peers: ${diag.peers} · node: ${diag.nodeId}`, C.accent);

      // 4. LightPush send
      log(`► Pushing to topic: ${selectedOutlet.topic}`, C.textDim);
      const result = await WakuService.send(selectedOutlet.topic, payload);
      log(`  msgId: ${result.msgId}`, C.accent);
      log(`  timestamp: ${new Date(result.ts).toISOString()}`, C.accentDim);
      log("► Transmission complete. Message gossiping through Waku network.", C.text);

      // 5. Build receipt
      setReceipt({
        msgId:      result.msgId,
        topic:      selectedOutlet.topic,
        outletName: selectedOutlet.name,
        docHash,
        ephPubHex,
        ephPrivHex,
        mnemonic:   privKeyToMnemonic(ephKeys.privKey),
        ts:         result.ts,
        stripped:   !!stripReport,
        stripReport,
      });
      setStep(4);

    } catch (err) {
      log(`✗ Error: ${err.message}`, C.red);
      log("  Check Waku connection and try again.", C.textDim);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Back Channel Poll ──────────────────────────────────────────

  const pollBackChannel = async () => {
    if (!receipt) return;
    setCheckingBack(true);
    try {
      const messages = await WakuService.pollBackChannel(receipt.ephPubHex);
      setBackMessages(messages);
    } catch (err) {
      console.error("Back channel poll failed:", err);
    } finally {
      setCheckingBack(false);
    }
  };

  const reset = () => {
    setStep(0);
    setFile(null); setFileBytes(null); setStrippedBytes(null);
    setScanResult(null); setStripReport(null); setStripProgress(null);
    setSelectedOutlet(null); setSubmitLog([]); setReceipt(null);
    setBackMessages([]); setCoverNote("");
    setShowOpsec(false);
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="ld-anim">
      <StepIndicator steps={STEPS} current={step} />

      {/* STEP 0 — Upload */}
      {step === 0 && (
        <div>
          <SectionLabel>Document Upload</SectionLabel>
          <div style={{ marginBottom: 16, fontFamily: C.mono, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
            Your document is processed entirely in your browser. Nothing is transmitted until you explicitly submit in step 4.
          </div>
          <div
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{ border: `1px dashed ${file ? C.accent : C.border}`, padding: "44px 20px", textAlign: "center", cursor: "pointer", background: file ? C.accentFaint : "transparent", transition: "all 0.2s", marginBottom: 16 }}
            onClick={() => document.getElementById("ld-file-input").click()}
          >
            <input id="ld-file-input" type="file" style={{ display: "none" }} onChange={handleDrop} />
            {file ? (
              <div>
                <div style={{ fontFamily: C.mono, fontSize: 13, color: C.accent, marginBottom: 6 }}>▣ {file.name}</div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim }}>{(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}</div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: C.mono, fontSize: 12, color: C.textDim, marginBottom: 6 }}>DROP FILE HERE</div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textFaint }}>or click to browse · PDF, DOCX, ZIP, images, text</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button className="ld-btn ld-btn-ghost" onClick={loadDemo}>◈ Load demo file</button>
            {file && <button className="ld-btn ld-btn-primary" onClick={() => setStep(1)}>Next: Strip Metadata →</button>}
          </div>
        </div>
      )}

      {/* STEP 1 — Strip */}
      {step === 1 && (
        <div>
          <SectionLabel>Metadata Removal</SectionLabel>
          <Panel style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, marginBottom: 12 }}>
              File: <span style={{ color: C.text }}>{file?.name}</span>
              <span style={{ marginLeft: 16 }}>Size: <span style={{ color: C.text }}>{(file?.size / 1024).toFixed(1)} KB</span></span>
            </div>

            {/* Auto-scan results */}
            {scanning && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Spinner /> <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim }}>Scanning for metadata…</span>
              </div>
            )}

            {scanResult && !stripping && !stripReport && (
              <div style={{ marginBottom: 16 }}>
                {scanResult.fields.length > 0 ? (
                  <>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.amber, marginBottom: 10, padding: "8px 12px", border: `1px solid ${C.amber}44`, background: "#1a1200" }}>
                      ⚠  Found {scanResult.fields.length} metadata field{scanResult.fields.length > 1 ? "s" : ""} that could identify you:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                      {scanResult.fields.map((f, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: C.bg, border: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 10, gap: 12 }}>
                          <span style={{ color: f.risk === "critical" ? C.red : f.risk === "high" ? C.amber : C.textDim, flexShrink: 0 }}>
                            {formatRisk(f.risk)} {f.field}
                          </span>
                          <span style={{ color: C.textFaint, textAlign: "right", wordBreak: "break-all" }}>{f.value}</span>
                        </div>
                      ))}
                    </div>
                    {scanResult.hasGPS && (
                      <div style={{ padding: "8px 12px", background: C.redFaint, border: `1px solid ${C.red}`, fontFamily: C.mono, fontSize: 10, color: C.red, marginBottom: 10 }}>
                        🔴 GPS coordinates detected — your precise location is embedded in this file.
                      </div>
                    )}
                    {scanResult.hasPrinterDots && (
                      <div style={{ padding: "8px 12px", background: "#1a1200", border: `1px solid ${C.amber}44`, fontFamily: C.mono, fontSize: 10, color: C.amber, marginBottom: 10 }}>
                        ⚠  This is a JPEG — if scanned from a colour laser print, it may contain printer steganographic dots. Consider photocopying on B&W first.
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: "8px 12px", background: C.accentFaint, border: `1px solid ${C.accentDim}`, fontFamily: C.mono, fontSize: 10, color: C.accent, marginBottom: 10 }}>
                    ✓ No identifying metadata detected. Stripping will verify and sanitise.
                  </div>
                )}
                <button className="ld-btn ld-btn-primary" onClick={runStrip}>
                  Run Metadata Strip
                </button>
              </div>
            )}

            {stripping && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Spinner />
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim }}>
                    {stripProgress ? `${stripProgress.stage} (${stripProgress.pct}%)` : "Processing…"}
                  </span>
                </div>
                {stripProgress && (
                  <div style={{ height: 3, background: C.border, marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${stripProgress.pct}%`, background: C.accent, transition: "width 0.2s" }} />
                  </div>
                )}
              </div>
            )}

            {stripReport && !stripReport.error && (
              <div>
                <div style={{ padding: "10px 12px", background: C.accentFaint, border: `1px solid ${C.accentDim}`, fontFamily: C.mono, fontSize: 11, color: C.accent, marginBottom: 12 }}>
                  ✓ Strip complete via <span style={{ color: C.text }}>{stripReport.technique}</span>
                  {" · "}{stripReport.fieldsRemoved.length} field{stripReport.fieldsRemoved.length !== 1 ? "s" : ""} removed
                  {" · "}{stripReport.changed ? "Document modified" : "No changes needed"}
                </div>

                {stripReport.fieldsRemoved.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
                    {stripReport.fieldsRemoved.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 10 }}>
                        <span style={{ color: C.red }}>—</span>
                        <span style={{ color: C.textDim }}>{f.field}</span>
                        <span style={{ color: C.textFaint, marginLeft: "auto" }}>{String(f.value).slice(0, 40)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {stripReport.warnings.map((w, i) => (
                  <div key={i} style={{ padding: "6px 10px", background: "#1a1200", border: `1px solid ${C.amber}44`, fontFamily: C.mono, fontSize: 10, color: C.amber, marginBottom: 6 }}>
                    ⚠  {w}
                  </div>
                ))}

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Strip Attestation</div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>
                    Original: <span style={{ color: C.textDim }}>{stripReport.originalHash?.slice(0, 32)}…</span>
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>
                    Stripped: <span style={{ color: C.accent }}>{stripReport.strippedHash?.slice(0, 32)}…</span>
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>
                    Size: {(stripReport.originalSize / 1024).toFixed(1)} KB → {(stripReport.strippedSize / 1024).toFixed(1)} KB
                  </div>
                </div>

                <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
                  <button className="ld-btn ld-btn-ghost" onClick={() => { setStripReport(null); setStrippedBytes(null); }}>Re-strip</button>
                  <button className="ld-btn ld-btn-primary" onClick={loadOutlets} disabled={loadingOutlets}>
                    {loadingOutlets ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Loading outlets <Spinner /></span> : "Next: Select Outlet →"}
                  </button>
                </div>
              </div>
            )}

            {stripReport?.error && (
              <div>
                <div style={{ padding: "10px 12px", background: C.redFaint, border: `1px solid ${C.red}`, fontFamily: C.mono, fontSize: 11, color: C.red, marginBottom: 12 }}>
                  ✗ Strip failed: {stripReport.error}
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim, marginBottom: 12 }}>
                  You can still proceed — the document will be submitted without stripping. Ensure you have manually verified no identifying metadata remains.
                </div>
                <button className="ld-btn ld-btn-ghost" onClick={loadOutlets} disabled={loadingOutlets}>
                  {loadingOutlets ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Loading <Spinner /></span> : "Proceed without strip →"}
                </button>
              </div>
            )}

            {!scanning && !scanResult && !stripping && !stripReport && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ld-btn ld-btn-primary" onClick={runStrip}>Run Metadata Strip</button>
              </div>
            )}
          </Panel>

          {/* OpSec panel */}
          <div style={{ marginBottom: 16 }}>
            <button
              className="ld-btn ld-btn-ghost"
              style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between" }}
              onClick={() => setShowOpsec(v => !v)}
            >
              <span>
                {opsecLoading ? "Checking operational security…" : (
                  opsec ? `OpSec: ${opsec.overall.toUpperCase()} (${opsec.score}/${opsec.total} checks)` : "Operational Security Check"
                )}
              </span>
              <span>{showOpsec ? "▲" : "▼"}</span>
            </button>
            {showOpsec && opsec && (
              <div style={{ border: `1px solid ${C.border}`, borderTop: "none", background: C.surface, padding: "14px" }}>
                {opsec.checks.map((check) => (
                  <div key={check.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{check.label}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 9, color: check.status === "pass" ? C.accent : check.status === "fail" ? C.red : check.status === "warn" ? C.amber : C.textDim, textTransform: "uppercase" }}>
                        {check.status === "pass" ? "✓ pass" : check.status === "fail" ? "✗ fail" : check.status === "warn" ? "⚠ warn" : "ℹ info"}
                      </span>
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim, marginBottom: check.action ? 4 : 0 }}>{check.detail}</div>
                    {check.action && (
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.amber }}>→ {check.action}</div>
                    )}
                  </div>
                ))}
                <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginTop: 8 }}>
                  Using Tor Browser is the most important step you can take.
                </div>
              </div>
            )}
          </div>

          <button className="ld-btn ld-btn-ghost" onClick={() => setStep(0)}>← Back</button>
        </div>
      )}

      {/* STEP 2 — Outlet */}
      {step === 2 && outlets && (
        <div>
          <SectionLabel>Select Publication Outlet</SectionLabel>
          <div style={{ marginBottom: 14, fontFamily: C.mono, fontSize: 11, color: C.textDim }}>
            Outlets are registered on Nomos. Stake indicates their credibility bond — slashable if fabricated documents are published.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {outlets.map((o) => (
              <div key={o.id} className={`ld-outlet-card${selectedOutlet?.id === o.id ? " selected" : ""}`} onClick={() => setSelectedOutlet(o)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, marginBottom: 4 }}>
                      {selectedOutlet?.id === o.id ? "▶ " : "  "}{o.name}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint, wordBreak: "break-all", marginBottom: 4 }}>
                      waku: {o.topic}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>
                      nomos: {o.address}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent }}>{o.stake}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim }}>{o.docs} publications</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SectionLabel>Cover Note (Optional)</SectionLabel>
          <textarea className="ld-input" style={{ marginBottom: 16, minHeight: 80 }} placeholder="Add context for the outlet editor. This is encrypted — only they can read it." value={coverNote} onChange={(e) => setCoverNote(e.target.value)} />

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="ld-btn ld-btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="ld-btn ld-btn-primary" disabled={!selectedOutlet} onClick={() => setStep(3)}>Next: Encrypt & Submit →</button>
          </div>
        </div>
      )}

      {/* STEP 3 — Submit */}
      {step === 3 && (
        <div>
          <SectionLabel>Review & Transmit</SectionLabel>
          <Panel style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {[
                ["Document",    file?.name],
                ["Size",        strippedBytes
                  ? `${(strippedBytes.length / 1024).toFixed(1)} KB (stripped from ${(file?.size / 1024).toFixed(1)} KB)`
                  : `${(file?.size / 1024).toFixed(1)} KB`],
                ["Outlet",      selectedOutlet?.name],
                ["Waku Topic",  selectedOutlet?.topic],
                ["Metadata",    stripReport
                  ? `✓ ${stripReport.fieldsRemoved.length} fields stripped via ${stripReport.technique}`
                  : "⚠ Not stripped — proceed with caution"],
                ["Encryption",  "ECIES — secp256k1 + AES-256-GCM"],
                ["IP exposed",  "✓ None — Waku gossip protocol"],
                ["Identity",    "✓ None — ephemeral key only"],
                ["OpSec",       opsec
                  ? `${opsec.overall.toUpperCase()} (${opsec.score}/${opsec.total})`
                  : "Not checked"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 11, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, gap: 16 }}>
                  <span style={{ color: C.textDim, flexShrink: 0 }}>{label}</span>
                  <span style={{
                    color: String(value).startsWith("✓") ? C.accent
                         : String(value).startsWith("⚠") ? C.amber
                         : C.text,
                    textAlign: "right", maxWidth: "65%",
                  }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Strip attestation hashes */}
            {stripReport && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Strip Attestation (embedded in envelope)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 9, padding: "4px 8px", background: C.bg, border: `1px solid ${C.border}` }}>
                    <span style={{ color: C.textFaint }}>orig: </span>
                    <span style={{ color: C.textDim }}>{stripReport.originalHash?.slice(0, 48)}…</span>
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, padding: "4px 8px", background: C.bg, border: `1px solid ${C.accentDim}` }}>
                    <span style={{ color: C.textFaint }}>stripped: </span>
                    <span style={{ color: C.accent }}>{stripReport.strippedHash?.slice(0, 48)}…</span>
                  </div>
                </div>
              </div>
            )}

            {!stripReport && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "#1a1200", border: `1px solid ${C.amber}44`, fontFamily: C.mono, fontSize: 10, color: C.amber }}>
                ⚠  No strip attestation — go back and run metadata stripping first for maximum safety.
              </div>
            )}

            {submitLog.length > 0 && <LogTerminal lines={submitLog} loading={submitting} style={{ marginBottom: 14 }} />}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button className="ld-btn ld-btn-ghost" disabled={submitting} onClick={() => setStep(2)}>← Back</button>
              <button className="ld-btn ld-btn-primary" disabled={submitting} onClick={runSubmit}>
                {submitting
                  ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Transmitting <Spinner /></span>
                  : "Encrypt & Submit via Waku"}
              </button>
            </div>
          </Panel>
        </div>
      )}

      {/* STEP 4 — Receipt */}
      {step === 4 && receipt && (
        <div className="ld-anim">
          <SectionLabel>Submission Receipt</SectionLabel>
          <div style={{ padding: "12px", background: C.accentFaint, border: `1px solid ${C.accentDim}`, fontFamily: C.mono, fontSize: 11, color: C.accent, marginBottom: 20 }}>
            ✓ Delivered to <strong>{receipt.outletName}</strong> via Waku LightPush
            {receipt.stripped && " · Metadata stripped"}
            {" · "}msgId: {receipt.msgId.slice(0, 20)}…
          </div>

          {/* Claim key */}
          <Panel style={{ marginBottom: 14 }}>
            <SectionLabel>Your Claim Key — Save This Now</SectionLabel>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, marginBottom: 10, padding: "10px 12px", border: `1px solid ${C.amber}44`, background: "#1a1200" }}>
              ⚠  This 12-word key is your only proof of submission and your tip claim key. It is NOT stored anywhere. If you lose it, you cannot prove your submission or claim tips.
            </div>
            <div style={{ background: C.bg, border: `1px solid ${C.amber}`, padding: "16px", marginBottom: 12 }}>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text, lineHeight: 2.4, letterSpacing: "0.05em", wordSpacing: "0.4em" }}>
                {receipt.mnemonic}
              </div>
            </div>
            <HashDisplay value={receipt.ephPubHex} label="Ephemeral Public Key (secp256k1 compressed)" />
            <div style={{ marginTop: 8 }}>
              <HashDisplay value={receipt.docHash} label="Document Hash (SHA-256)" color={C.textDim} />
            </div>
          </Panel>

          {/* Strip attestation in receipt */}
          {receipt.stripReport && (
            <Panel style={{ marginBottom: 14 }}>
              <SectionLabel>Strip Attestation</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Technique",   receipt.stripReport.technique],
                  ["Fields removed", receipt.stripReport.fieldsRemoved.length.toString()],
                  ["Original hash", receipt.stripReport.originalHash],
                  ["Stripped hash", receipt.stripReport.strippedHash],
                  ["Size change",  `${(receipt.stripReport.originalSize / 1024).toFixed(1)} KB → ${(receipt.stripReport.strippedSize / 1024).toFixed(1)} KB`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 5, gap: 12 }}>
                    <span style={{ color: C.textDim, flexShrink: 0 }}>{l}</span>
                    <span style={{ color: C.text, wordBreak: "break-all", textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Back-channel */}
          <Panel style={{ marginBottom: 14 }}>
            <SectionLabel>Back-Channel</SectionLabel>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, marginBottom: 12 }}>
              Poll the Waku Store for outlet responses. Your client only listens — no call-home, no persistent connection.
            </div>

            {backMessages.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {backMessages.map((m, i) => (
                  <div key={i} style={{ background: C.surface2, border: `1px solid ${C.border}`, padding: "12px", fontFamily: C.mono, fontSize: 11 }}>
                    <div style={{ color: C.textDim, fontSize: 9, marginBottom: 6 }}>{fmtAgo(m.timestamp)}</div>
                    <div style={{ color: m.status === "rejected" ? C.red : C.text }}>{m.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="ld-btn ld-btn-ghost" disabled={checkingBack} onClick={pollBackChannel}>
                  {checkingBack
                    ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Querying Waku Store <Spinner /></span>
                    : "Poll Back-Channel"}
                </button>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textFaint }}>No messages yet</span>
              </div>
            )}
          </Panel>

          <button className="ld-btn ld-btn-ghost" onClick={reset}>Submit Another Document</button>
        </div>
      )}
    </div>
  );
}
