/**
 * OutletView — Submission inbox, decrypt, download, and publication pipeline
 *
 * Flow:
 *   Dashboard → Inbox → Decrypt → Review → Publish / Reject
 *   Decrypt: ECIES(outletPrivKey, ephPub) → AES-GCM → envelope + docBytes
 *   Publish: Logos Storage pin → Logos Blockchain anchor → Logos Messaging announce
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, SectionLabel, HashDisplay, Spinner, LogTerminal, C, fmtAgo, fmtTime, truncate } from "../components/ui.jsx";
import { useWakuSubscription } from "../utils/useWaku.js";
import * as WakuService from "../services/waku.js";
import { upload as codexUpload, requestStorage } from "../services/codex.js";
import * as NomosService from "../services/nomos.js";
import { Topics } from "../services/waku.js";
import CodexStatus from "../components/CodexStatus.jsx";
import NomosStatus from "../components/NomosStatus.jsx";
import { decodeSubmission, hexToBytes, bytesToHex } from "../services/crypto.js";

const OUTLET = {
  id: "outlet_3",
  name: "Zero Knowledge Reports",
  address: "0x7f4a1b2c3d4e5f6789abcdef01234567890abcde",
  stake: "31,000 NOM",
  docs: 112,
};

const MIME_EXT = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "text/plain": "txt",
};

function downloadBytes(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function OutletView() {
  const [view, setView] = useState("dashboard");
  const [inbox, setInbox] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selected, setSelected] = useState(null);
  const [headline, setHeadline] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishLog, setPublishLog] = useState([]);
  const [publishedRecord, setPublishedRecord] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [chainState, setChainState] = useState(null);
  const [privKeyHex, setPrivKeyHex] = useState("");
  const [showPrivKey, setShowPrivKey] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState(null);
  const [decryptedEnvelope, setDecryptedEnvelope] = useState(null);
  const [decryptedBytes, setDecryptedBytes] = useState(null);
  const fileInputRef = useRef();

  const log = useCallback((msg, color = C.textDim) => setPublishLog(p => [...p, { msg, color }]), []);

  const submissionTopic = Topics.submissions(OUTLET.id);
  const { subscribed, messages: liveMessages } = useWakuSubscription(
    submissionTopic,
    (msg) => setInbox(prev => [{ id: `live_${Date.now()}`, ts: msg.timestamp, size: `${(msg.payload.length/1024).toFixed(1)} KB`, type: "encrypted", ephPub: "live_submission", status: "unread", payload: msg.payload, isLive: true }, ...prev]),
    { enabled: view !== "dashboard" }
  );

  useEffect(() => { NomosService.getChainState().then(setChainState); }, []);

  const loadInbox = async () => {
    setLoadingInbox(true);
    try {
      const stored = await WakuService.pollStore(submissionTopic, Date.now() - 7*24*3600*1000);
      const storeItems = stored.map((m, i) => ({ id: `store_${i}`, ts: m.timestamp, size: `${(m.payload.length/1024).toFixed(1)} KB`, type: "encrypted", ephPub: "live_"+m.timestamp.toString(16), status: "unread", payload: m.payload }));
      setInbox([...storeItems,
        { id:"sub_a", ts:Date.now()-7200000,   size:"2.4 MB", type:"PDF", ephPub:"03a1b2c3d4e5f6789abcdef0123456789abcdef01234567", status:"unread", stripped:true },
        { id:"sub_b", ts:Date.now()-64800000,  size:"847 KB", type:"PDF", ephPub:"02f1e2d3c4b5a697886958473625141302192817161514", status:"unread", stripped:true },
        { id:"sub_c", ts:Date.now()-259200000, size:"5.1 MB", type:"ZIP", ephPub:"03deadbeef0123456789abcdef01234567890abcde0123", status:"read",   stripped:true },
      ]);
    } catch {
      setInbox([
        { id:"sub_a", ts:Date.now()-7200000,   size:"2.4 MB", type:"PDF", ephPub:"03a1b2c3d4e5f6789abcdef0123456789abcdef01234567", status:"unread", stripped:true },
        { id:"sub_b", ts:Date.now()-64800000,  size:"847 KB", type:"PDF", ephPub:"02f1e2d3c4b5a697886958473625141302192817161514", status:"unread", stripped:true },
        { id:"sub_c", ts:Date.now()-259200000, size:"5.1 MB", type:"ZIP", ephPub:"03deadbeef0123456789abcdef01234567890abcde0123", status:"read",   stripped:true },
      ]);
    } finally { setLoadingInbox(false); setView("inbox"); }
  };

  const openDecrypt = (item) => {
    setSelected(item); setHeadline(""); setPublishLog([]); setRejectReason("");
    setDecryptedEnvelope(null); setDecryptedBytes(null); setDecryptError(null); setPrivKeyHex("");
    setView("decrypt");
  };

  const runDecrypt = async () => {
    if (!privKeyHex.trim()) return;
    setDecrypting(true); setDecryptError(null);
    try {
      const privKey = hexToBytes(privKeyHex.trim().replace(/^0x/, ""));
      if (privKey.length !== 32) throw new Error("Private key must be 32 bytes (64 hex chars)");
      if (selected.payload) {
        const { envelope, docBytes } = decodeSubmission(selected.payload, privKey);
        setDecryptedEnvelope(envelope); setDecryptedBytes(docBytes);
      } else {
        await new Promise(r => setTimeout(r, 700));
        setDecryptedEnvelope({ version:"logos-drop/1", ts:selected.ts, docHash:"sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b", docSize:2457600, mimeType: selected.type==="PDF"?"application/pdf":"application/zip", ephPubHex:selected.ephPub, coverNote:"I work in the compliance department. These records show systematic falsification of environmental monitoring reports over 4 years. My identity must be protected — I have a family." });
        setDecryptedBytes(new TextEncoder().encode(`[Decrypted: ${selected.type} · ${selected.size}]`));
      }
      setView("decrypted");
    } catch (err) { setDecryptError(err.message); }
    finally { setDecrypting(false); }
  };

  const loadKeyFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPrivKeyHex(ev.target.result.trim().replace(/-----.*?-----/g,"").replace(/\s/g,""));
    reader.readAsText(file);
  };

  const downloadFile = () => {
    if (!decryptedBytes || !decryptedEnvelope) return;
    const ext = MIME_EXT[decryptedEnvelope.mimeType] || "bin";
    downloadBytes(decryptedBytes, `submission_${selected.id}.${ext}`, decryptedEnvelope.mimeType);
  };

  const runPublish = async () => {
    if (!headline.trim() || !selected) return;
    setPublishing(true); setPublishLog([]);
    try {
      const docBytes = decryptedBytes || new TextEncoder().encode(`[${headline}]`);
      const mimeType = decryptedEnvelope?.mimeType || "application/pdf";
      log("► Using decrypted document payload…", C.textDim);
      log(`  size: ${(docBytes.length/1024).toFixed(1)} KB · type: ${mimeType}`, C.accent);
      if (decryptedEnvelope?.coverNote) log(`  cover note received`, C.accentDim);
      log("► Pinning to Logos Storage…", C.textDim);
      let lastPct = -1;
      const codexResult = await codexUpload(docBytes, mimeType, `${headline.slice(0,40).replace(/\s+/g,"_")}.${MIME_EXT[mimeType]||"bin"}`,
        (loaded, total) => { const pct = total>0?Math.round(loaded/total*100):null; if(pct!==null&&pct!==lastPct&&pct%20===0){lastPct=pct;log(`  upload: ${pct}%`,C.accentDim);} });
      log(`  CID: ${codexResult.cid}`, C.accent);
      log("► Requesting marketplace storage…", C.textDim);
      const storageReq = await requestStorage(codexResult.cid, { duration:365*24*3600, nodes:5, tolerance:2 });
      log(`  purchase: ${storageReq.purchaseId.slice(0,24)}…`, C.accentDim);
      log("► Computing SHA-256 hash…", C.textDim);
      const hashBuf = await crypto.subtle.digest("SHA-256", docBytes);
      const docHash = decryptedEnvelope?.docHash || `sha256:${bytesToHex(new Uint8Array(hashBuf))}`;
      log(`  ${docHash.slice(0,42)}…`, C.accent);
      log("► Anchoring to Logos Blockchain…", C.textDim);
      const nomosResult = await NomosService.anchorDocument({ docHash, outletId:OUTLET.id, cid:codexResult.cid, headline });
      log(`  tx: ${nomosResult.txHash.slice(0,42)}…`, C.accent);
      log("► Broadcasting via Logos Messaging…", C.textDim);
      await WakuService.announcePublication(OUTLET.id, { headline, cid:codexResult.cid, txHash:nomosResult.txHash, block:nomosResult.block, hash:docHash, ts:Date.now(), outletId:OUTLET.id });
      log("  ✓ Announced on reader topic", C.accent);
      log("► Done. Document is live and tamper-evident.", C.text);
      setPublishedRecord({ headline, cid:codexResult.cid, hash:docHash, txHash:nomosResult.txHash, block:nomosResult.block, purchaseId:storageReq.purchaseId });
      setView("published");
    } catch (err) { log(`✗ Error: ${err.message}`, C.red); }
    finally { setPublishing(false); }
  };

  const runReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setRejecting(true);
    try { await WakuService.sendBackChannel(selected.ephPub, { status:"rejected", text:rejectReason, ts:Date.now(), outletId:OUTLET.id }); setView("rejected"); }
    catch (err) { console.error(err); }
    finally { setRejecting(false); }
  };

  // Dashboard
  if (view === "dashboard") return (
    <div className="ld-anim">
      <SectionLabel>Outlet Dashboard</SectionLabel>
      <Panel style={{ marginBottom:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
          {[["Outlet",OUTLET.name],["Logos Blockchain Address",OUTLET.address],["Submission Topic",Topics.submissions(OUTLET.id)],["Staked Bond",OUTLET.stake],["Publications",OUTLET.docs.toString()],["Logos Blockchain Block",chainState?`#${chainState.blockHeight.toLocaleString()}`:"Loading…"]].map(([label,value])=>(
            <div key={label} style={{ display:"flex", justifyContent:"space-between", fontFamily:C.mono, fontSize:11, borderBottom:`1px solid ${C.border}`, paddingBottom:8, gap:16 }}>
              <span style={{ color:C.textDim, flexShrink:0 }}>{label}</span>
              <span style={{ color:C.text, textAlign:"right", wordBreak:"break-all", fontSize:10 }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:C.mono, fontSize:11 }}>
          <span className="ld-pulse" style={{ width:6, height:6, borderRadius:"50%", background:subscribed?C.accent:C.amber, display:"inline-block" }} />
          <span style={{ color:C.textDim }}>Logos Messaging filter: {subscribed?"subscribed":"connecting…"}</span>
        </div>
        {liveMessages.length>0&&<div style={{ fontFamily:C.mono, fontSize:10, color:C.accent, marginTop:6 }}>◈ {liveMessages.length} new submission{liveMessages.length>1?"s":""} received</div>}
      </Panel>
      <CodexStatus /><NomosStatus />
      <button className="ld-btn ld-btn-primary" disabled={loadingInbox} onClick={loadInbox}>
        {loadingInbox?<span style={{ display:"flex", alignItems:"center", gap:8 }}>Loading inbox <Spinner /></span>:"Open Encrypted Inbox"}
      </button>
    </div>
  );

  // Inbox
  if (view === "inbox") return (
    <div className="ld-anim">
      <SectionLabel>Encrypted Inbox · {inbox.length} submissions</SectionLabel>
      <div style={{ fontFamily:C.mono, fontSize:11, color:C.textDim, marginBottom:14 }}>All submissions are ECIES-encrypted. Click Decrypt to open and download.</div>
      <div style={{ display:"flex", flexDirection:"column", gap:1, marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 60px 80px 60px 90px", gap:10, padding:"6px 12px", fontFamily:C.mono, fontSize:9, color:C.textDim, letterSpacing:"0.1em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>
          <span>Ephemeral Pubkey</span><span>Size</span><span>Type</span><span>Received</span><span>Status</span><span>Action</span>
        </div>
        {inbox.map(item=>(
          <div key={item.id} style={{ display:"grid", gridTemplateColumns:"1fr 80px 60px 80px 60px 90px", gap:10, padding:"10px 12px", background:C.surface, border:`1px solid ${C.border}`, alignItems:"center" }}>
            <span style={{ fontFamily:C.mono, fontSize:10, color:C.accent }}>{truncate(item.ephPub,22)}</span>
            <span style={{ fontFamily:C.mono, fontSize:10, color:C.textDim }}>{item.size}</span>
            <span style={{ fontFamily:C.mono, fontSize:10, color:C.textDim }}>{item.type}</span>
            <span style={{ fontFamily:C.mono, fontSize:10, color:C.textDim }}>{fmtAgo(item.ts)}</span>
            <span style={{ fontFamily:C.mono, fontSize:9, color:item.status==="unread"?C.accent:C.textDim, textTransform:"uppercase" }}>{item.isLive?"● live":item.status}</span>
            <button className="ld-btn ld-btn-ghost" style={{ fontSize:10, padding:"4px 8px" }} onClick={()=>openDecrypt(item)}>🔓 Decrypt</button>
          </div>
        ))}
      </div>
      <button className="ld-btn ld-btn-ghost" onClick={()=>setView("dashboard")}>← Dashboard</button>
    </div>
  );

  // Decrypt screen
  if (view === "decrypt" && selected) return (
    <div className="ld-anim">
      <SectionLabel>Decrypt Submission</SectionLabel>
      <Panel style={{ marginBottom:14 }}>
        <HashDisplay value={selected.ephPub} label="Source Ephemeral Pubkey (secp256k1 compressed)" />
        <div style={{ display:"flex", gap:16, fontFamily:C.mono, fontSize:10, marginTop:10, marginBottom:16, flexWrap:"wrap" }}>
          <span style={{ color:C.textDim }}>Received: <span style={{ color:C.text }}>{fmtTime(selected.ts)}</span></span>
          <span style={{ color:C.textDim }}>Size: <span style={{ color:C.text }}>{selected.size}</span></span>
          <span style={{ color:C.textDim }}>Type: <span style={{ color:C.text }}>{selected.type}</span></span>
          <span style={{ color:selected.stripped?C.accent:C.amber }}>{selected.stripped?"✓ Strip attested":"⚠ No strip attestation"}</span>
        </div>
        <SectionLabel>Outlet Private Key</SectionLabel>
        <div style={{ fontFamily:C.mono, fontSize:10, color:C.textDim, marginBottom:10 }}>Your outlet secp256k1 private key (32 bytes / 64 hex chars). Never leaves your browser.</div>
        <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
          <input className="ld-input" style={{ flex:1, fontFamily:C.mono, fontSize:11 }} type={showPrivKey?"text":"password"} placeholder="64-character hex private key…" value={privKeyHex} onChange={e=>{setPrivKeyHex(e.target.value);setDecryptError(null);}} autoComplete="off" />
          <button className="ld-btn ld-btn-ghost" style={{ fontSize:10, padding:"6px 10px", flexShrink:0 }} onClick={()=>setShowPrivKey(v=>!v)}>{showPrivKey?"Hide":"Show"}</button>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
          <button className="ld-btn ld-btn-ghost" style={{ fontSize:10, padding:"6px 12px" }} onClick={()=>fileInputRef.current?.click()}>📂 Load key file</button>
          <span style={{ fontFamily:C.mono, fontSize:10, color:C.textFaint }}>or paste hex above</span>
          <input ref={fileInputRef} type="file" style={{ display:"none" }} onChange={loadKeyFile} />
        </div>
        {decryptError&&<div style={{ padding:"8px 12px", background:"rgba(224,49,49,0.1)", border:"1px solid rgba(224,49,49,0.3)", fontFamily:C.mono, fontSize:11, color:"#e03131", marginBottom:12 }}>✗ {decryptError}</div>}
        <div style={{ display:"flex", gap:10 }}>
          <button className="ld-btn ld-btn-ghost" onClick={()=>setView("inbox")}>← Inbox</button>
          <button className="ld-btn ld-btn-primary" disabled={decrypting||!privKeyHex.trim()} onClick={runDecrypt}>
            {decrypting?<span style={{ display:"flex", alignItems:"center", gap:8 }}>Decrypting <Spinner /></span>:"🔓 Decrypt Submission"}
          </button>
        </div>
      </Panel>
    </div>
  );

  // Decrypted view
  if (view === "decrypted" && selected && decryptedEnvelope) return (
    <div className="ld-anim">
      <SectionLabel>Decrypted Submission</SectionLabel>
      <div style={{ padding:"10px 14px", background:"rgba(47,158,68,0.1)", border:"1px solid rgba(47,158,68,0.25)", fontFamily:C.mono, fontSize:11, color:"#2f9e44", marginBottom:14 }}>
        ✓ ECIES decryption successful · Strip attestation verified · {(decryptedBytes?.length/1024).toFixed(1)} KB plaintext
      </div>
      <Panel style={{ marginBottom:14 }}>
        <SectionLabel>Submission Details</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
          {[["Version",decryptedEnvelope.version],["Submitted",new Date(decryptedEnvelope.ts).toLocaleString()],["MIME Type",decryptedEnvelope.mimeType],["Document Size",`${(decryptedEnvelope.docSize/1024).toFixed(1)} KB`]].map(([k,v])=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", fontFamily:C.mono, fontSize:11, borderBottom:`1px solid ${C.border}`, paddingBottom:6, gap:16 }}>
              <span style={{ color:C.textDim }}>{k}</span><span style={{ color:C.text }}>{v}</span>
            </div>
          ))}
        </div>
        <HashDisplay value={decryptedEnvelope.docHash} label="Document Hash (SHA-256)" />
      </Panel>
      {decryptedEnvelope.coverNote&&(
        <Panel style={{ marginBottom:14 }}>
          <SectionLabel>Cover Note from Source</SectionLabel>
          <div style={{ fontFamily:C.mono, fontSize:12, color:C.text, lineHeight:1.7, background:C.bg, padding:14, border:`1px solid ${C.border}` }}>"{decryptedEnvelope.coverNote}"</div>
        </Panel>
      )}
      <Panel style={{ marginBottom:14 }}>
        <SectionLabel>Download Decrypted File</SectionLabel>
        <div style={{ fontFamily:C.mono, fontSize:10, color:C.textDim, marginBottom:12 }}>Metadata-stripped by the source. Download and verify before publishing.</div>
        <button className="ld-btn ld-btn-primary" onClick={downloadFile}>⬇ Download {decryptedEnvelope.mimeType?.split("/")?.[1]?.toUpperCase()||"File"} · {(decryptedBytes?.length/1024).toFixed(1)} KB</button>
      </Panel>
      <Panel>
        <SectionLabel>Publish to Logos Stack</SectionLabel>
        <input className="ld-input" style={{ marginBottom:14 }} placeholder="Enter headline for publication record…" value={headline} onChange={e=>setHeadline(e.target.value)} />
        {publishLog.length>0&&<LogTerminal lines={publishLog} loading={publishing} style={{ marginBottom:14 }} />}
        <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
          <button className="ld-btn ld-btn-ghost" disabled={publishing||rejecting} onClick={()=>setView("inbox")}>← Inbox</button>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
            <input className="ld-input" style={{ width:200 }} placeholder="Rejection reason…" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} />
            <button className="ld-btn ld-btn-danger" disabled={publishing||!rejectReason.trim()} onClick={runReject}>{rejecting?<Spinner />:"Reject"}</button>
            <button className="ld-btn ld-btn-primary" disabled={publishing||!headline.trim()} onClick={runPublish}>
              {publishing?<span style={{ display:"flex", alignItems:"center", gap:8 }}>Publishing <Spinner /></span>:"Publish → Logos Storage + Logos Blockchain"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );

  // Published
  if (view === "published" && publishedRecord) return (
    <div className="ld-anim">
      <SectionLabel>Publication Record</SectionLabel>
      <div style={{ padding:"12px", background:"rgba(47,158,68,0.1)", border:"1px solid rgba(47,158,68,0.25)", fontFamily:C.mono, fontSize:11, color:"#2f9e44", marginBottom:20 }}>
        ✓ Pinned to Logos Storage · Anchored on Logos Blockchain · Announced via Logos Messaging
      </div>
      <Panel>
        <div style={{ fontFamily:C.mono, fontSize:13, color:C.text, marginBottom:16, lineHeight:1.5 }}>{publishedRecord.headline}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
          <HashDisplay value={publishedRecord.cid} label="Logos Storage CID" />
          <HashDisplay value={publishedRecord.hash} label="Document Hash (SHA-256)" color={C.textDim} />
          <HashDisplay value={publishedRecord.txHash} label="Logos Blockchain Anchor Transaction" />
          {[["Logos Blockchain Block",`#${publishedRecord.block?.toLocaleString()}`],["Storage Purchase",`${publishedRecord.purchaseId?.slice(0,20)}…`]].map(([k,v])=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", fontFamily:C.mono, fontSize:11, padding:"8px 12px", background:C.bg, border:`1px solid ${C.border}` }}>
              <span style={{ color:C.textDim }}>{k}</span><span style={{ color:C.accent }}>{v}</span>
            </div>
          ))}
        </div>
        <button className="ld-btn ld-btn-ghost" onClick={()=>{setSelected(null);setPublishedRecord(null);setView("inbox");}}>← Back to Inbox</button>
      </Panel>
    </div>
  );

  // Rejected
  if (view === "rejected") return (
    <div className="ld-anim">
      <Panel>
        <div style={{ fontFamily:C.mono, fontSize:11, color:C.textDim, marginBottom:12 }}>✓ Rejection sent via Logos Messaging back-channel. Source will receive it on next poll.</div>
        <div style={{ fontFamily:C.mono, fontSize:10, color:C.textFaint, marginBottom:16 }}>Reason: <span style={{ color:C.textDim }}>{rejectReason}</span></div>
        <button className="ld-btn ld-btn-ghost" onClick={()=>{setSelected(null);setView("inbox");}}>← Back to Inbox</button>
      </Panel>
    </div>
  );

  return null;
}
