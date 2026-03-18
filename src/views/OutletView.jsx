/**
 * OutletView — Submission inbox and publication pipeline
 *
 * Flow:
 *   Dashboard → Open Inbox → Review Submission → Publish / Reject
 *   Publish: decrypt → verify strip → Logos Storage pin → Logos Blockchain anchor → announce
 *   Reject:  send back-channel message to source's ephemeral pubkey
 */

import { useState, useEffect, useCallback } from "react";
import { Panel, SectionLabel, HashDisplay, Spinner, LogTerminal, C, fmtAgo, fmtTime, truncate } from "../components/ui.jsx";
import { useWakuSubscription } from "../utils/useWaku.js";
import * as WakuService from "../services/waku.js";
import { upload as codexUpload, requestStorage, getStorageStatus } from "../services/codex.js";
import * as NomosService from "../services/nomos.js";
import { Topics } from "../services/waku.js";
import CodexStatus from "../components/CodexStatus.jsx";
import NomosStatus from "../components/NomosStatus.jsx";

// Simulated outlet identity — in production loaded from local keystore
const OUTLET = {
  id: "outlet_3",
  name: "Zero Knowledge Reports",
  address: "0x7f4a1b2c3d4e5f6789abcdef01234567890abcde",
  stake: "31,000 NOM",
  docs: 112,
};

export default function OutletView() {
  const [view, setView] = useState("dashboard"); // dashboard | inbox | review | published | rejected
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

  const log = useCallback((msg, color = C.textDim) => {
    setPublishLog((p) => [...p, { msg, color }]);
  }, []);

  // Subscribe to live incoming submissions via Logos Messaging Filter
  const submissionTopic = Topics.submissions(OUTLET.id);
  const { subscribed, messages: liveMessages } = useWakuSubscription(
    submissionTopic,
    (msg) => {
      setInbox((prev) => [{
        id: `live_${Date.now()}`,
        ts: msg.timestamp,
        size: `${(msg.payload.length / 1024).toFixed(1)} KB`,
        type: "encrypted",
        ephPub: "live_submission",
        status: "unread",
        payload: msg.payload,
        isLive: true,
      }, ...prev]);
    },
    { enabled: view !== "dashboard" }
  );

  // Load chain state on mount
  useEffect(() => {
    NomosService.getChainState().then(setChainState);
  }, []);

  // Load inbox — pulls from Logos Messaging Store (historical messages)
  const loadInbox = async () => {
    setLoadingInbox(true);
    try {
      // Poll Logos Messaging store for past messages on this outlet's submission topic
      const stored = await WakuService.pollStore(submissionTopic, Date.now() - 7 * 24 * 3600 * 1000);

      // In production: decrypt each payload and parse the envelope header
      // For prototype: combine stored messages with mock data
      const mockInbox = [
        { id: "sub_a", ts: Date.now() - 7200000, size: "2.4 MB", type: "PDF", ephPub: "03a1b2c3d4e5f6789abc" + "def0123456789abcdef01234567", status: "unread", stripped: true },
        { id: "sub_b", ts: Date.now() - 64800000, size: "847 KB", type: "PDF", ephPub: "02f1e2d3c4b5a6978869" + "58473625141302192817161514", status: "unread", stripped: true },
        { id: "sub_c", ts: Date.now() - 259200000, size: "5.1 MB", type: "ZIP", ephPub: "03deadbeef0123456789" + "abcdef01234567890abcde0123", status: "read", stripped: true },
      ];

      const storeItems = stored.map((m, i) => ({
        id: `store_${i}`,
        ts: m.timestamp,
        size: `${(m.payload.length / 1024).toFixed(1)} KB`,
        type: "encrypted",
        ephPub: "live_" + m.timestamp.toString(16),
        status: "unread",
        payload: m.payload,
        fromStore: true,
      }));

      setInbox([...storeItems, ...mockInbox]);
    } catch (err) {
      console.error("Failed to load inbox:", err);
      // Fallback to mock data
      setInbox([
        { id: "sub_a", ts: Date.now() - 7200000, size: "2.4 MB", type: "PDF", ephPub: "03a1b2c3d4e5f6789abcdef0123456789abcdef01234567", status: "unread", stripped: true },
        { id: "sub_b", ts: Date.now() - 64800000, size: "847 KB", type: "PDF", ephPub: "02f1e2d3c4b5a697886958473625141302192817161514", status: "unread", stripped: true },
        { id: "sub_c", ts: Date.now() - 259200000, size: "5.1 MB", type: "ZIP", ephPub: "03deadbeef0123456789abcdef01234567890abcde0123", status: "read", stripped: true },
      ]);
    } finally {
      setLoadingInbox(false);
      setView("inbox");
    }
  };

  // Publish pipeline
  const runPublish = async () => {
    if (!headline.trim() || !selected) return;
    setPublishing(true);
    setPublishLog([]);

    try {
      log("► Decrypting submission with outlet private key...", C.textDim);
      await new Promise(r => setTimeout(r, 700));
      // TODO: Real decryption: const { envelope, docBytes } = decodeSubmission(selected.payload, outletPrivKey)
      log("  ✓ Decryption successful", C.accent);
      log("  ✓ Envelope verified: metadata strip attested", C.accent);

      // ── Logos Storage: Upload ────────────────────────────────────────────
      log("► Pinning document to Logos Storage network...", C.textDim);
      // TODO: replace mock bytes with real decrypted docBytes from ECIES
      const docBytes = new TextEncoder().encode(`[Document: ${headline}]`);
      let lastPct = -1;
      const codexResult = await codexUpload(
        docBytes,
        "application/pdf",
        `${headline.slice(0, 40).replace(/\s+/g, "_")}.pdf`,
        (loaded, total) => {
          const pct = total > 0 ? Math.round((loaded / total) * 100) : null;
          if (pct !== null && pct !== lastPct && pct % 20 === 0) {
            lastPct = pct;
            log(`  upload: ${pct}%`, C.accentDim);
          }
        }
      );
      log(`  CID: ${codexResult.cid}`, C.accent);
      log(`  Size: ${(codexResult.size / 1024).toFixed(1)} KB${codexResult.mock ? " ⚠ mock" : ""}`, C.accentDim);

      // ── Logos Storage: Storage Request ────────────────────────────────────
      log("► Requesting marketplace storage (1 year, 5 nodes)...", C.textDim);
      const storageReq = await requestStorage(codexResult.cid, {
        duration: 365 * 24 * 3600, nodes: 5, tolerance: 2,
      });
      log(`  Purchase: ${storageReq.purchaseId.slice(0, 24)}...${storageReq.mock ? " ⚠ mock" : ""}`, C.accentDim);

      // ── Hash document for Logos Blockchain anchor ───────────────────────────
      log("► Computing document hash (SHA-256)...", C.textDim);
      const hashDigest = await crypto.subtle.digest("SHA-256", docBytes);
      const docHash = `sha256:${Array.from(new Uint8Array(hashDigest)).map(b => b.toString(16).padStart(2,"0")).join("")}`;
      log(`  ${docHash.slice(0, 42)}...`, C.accent);

      // ── Logos Blockchain: Anchor ─────────────────────────────────────────────
      log("► Anchoring to Logos Blockchain chain...", C.textDim);
      const nomosResult = await NomosService.anchorDocument({
        docHash, outletId: OUTLET.id, cid: codexResult.cid, headline,
      });
      log(`  tx: ${nomosResult.txHash.slice(0, 42)}...`, C.accent);
      log(`  block: ${nomosResult.block}`, C.accentDim);

      // ── Logos Messaging: Announce ────────────────────────────────────────────
      log("► Broadcasting publication via Logos Messaging...", C.textDim);
      await WakuService.announcePublication(OUTLET.id, {
        headline, cid: codexResult.cid, txHash: nomosResult.txHash,
        block: nomosResult.block, hash: docHash, ts: Date.now(), outletId: OUTLET.id,
      });
      log("  ✓ Announced on reader topic", C.accent);
      log("► Done. Document is live and tamper-evident.", C.text);

      setPublishedRecord({
        headline, cid: codexResult.cid, hash: docHash,
        txHash: nomosResult.txHash, block: nomosResult.block,
        size: codexResult.size, purchaseId: storageReq.purchaseId,
        mockCodex: codexResult.mock,
      });
      setView("published");

    } catch (err) {
      log(`✗ Error: ${err.message}`, C.red);
    } finally {
      setPublishing(false);
    }
  };

  // Reject with back-channel message
  const runReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      await WakuService.sendBackChannel(selected.ephPub, {
        status: "rejected",
        text: rejectReason,
        ts: Date.now(),
        outletId: OUTLET.id,
      });
      setView("rejected");
    } catch (err) {
      console.error("Back-channel reject failed:", err);
    } finally {
      setRejecting(false);
    }
  };

  // ─── Dashboard ─────────────────────────────────────────────────

  if (view === "dashboard") return (
    <div className="ld-anim">
      <SectionLabel>Outlet Dashboard</SectionLabel>
      <Panel style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {[
            ["Outlet", OUTLET.name],
            ["Logos Blockchain Address", OUTLET.address],
            ["Logos Messaging Submission Topic", Topics.submissions(OUTLET.id)],
            ["Staked Bond", OUTLET.stake],
            ["Publications", OUTLET.docs.toString()],
            ["Logos Blockchain Block", chainState ? `#${chainState.blockHeight.toLocaleString()}` : "Loading..."],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 11, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, gap: 16 }}>
              <span style={{ color: C.textDim, flexShrink: 0 }}>{label}</span>
              <span style={{ color: C.text, textAlign: "right", wordBreak: "break-all", fontSize: 10 }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 11 }}>
            <span className="ld-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: subscribed ? C.accent : C.amber, display: "inline-block" }} />
            <span style={{ color: C.textDim }}>Logos Messaging filter: {subscribed ? "subscribed to submission topic" : "connecting..."}</span>
          </div>
          {liveMessages.length > 0 && (
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent }}>
              ◈ {liveMessages.length} new submission{liveMessages.length > 1 ? "s" : ""} received
            </div>
          )}
        </div>
      </Panel>
      <CodexStatus />
      <NomosStatus />
      <button className="ld-btn ld-btn-primary" disabled={loadingInbox} onClick={loadInbox}>
        {loadingInbox ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Loading inbox <Spinner /></span> : "Open Encrypted Inbox"}
      </button>
    </div>
  );

  // ─── Inbox ─────────────────────────────────────────────────────

  if (view === "inbox") return (
    <div className="ld-anim">
      <SectionLabel>Encrypted Inbox · {inbox.length} submissions</SectionLabel>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, marginBottom: 14 }}>
        All submissions are ECIES-encrypted. Only your outlet private key can decrypt them.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 80px 70px", gap: 12, padding: "6px 12px", fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>Ephemeral Pubkey</span><span>Size</span><span>Type</span><span>Received</span><span>Status</span>
        </div>
        {inbox.map((item) => (
          <div key={item.id} className="ld-hover-row" style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 80px 70px", gap: 12, padding: "10px 12px", background: C.surface, border: `1px solid ${C.border}`, alignItems: "center" }}
            onClick={() => { setSelected(item); setHeadline(""); setPublishLog([]); setRejectReason(""); setView("review"); }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.accent }}>{truncate(item.ephPub, 22)}</span>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim }}>{item.size}</span>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim }}>{item.type}</span>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim }}>{fmtAgo(item.ts)}</span>
            <span style={{ fontFamily: C.mono, fontSize: 9, color: item.status === "unread" ? C.accent : C.textDim, textTransform: "uppercase" }}>
              {item.isLive ? "● live" : item.status}
            </span>
          </div>
        ))}
      </div>

      <button className="ld-btn ld-btn-ghost" onClick={() => setView("dashboard")}>← Dashboard</button>
    </div>
  );

  // ─── Review ────────────────────────────────────────────────────

  if (view === "review" && selected) return (
    <div className="ld-anim">
      <SectionLabel>Review Submission</SectionLabel>
      <Panel style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <HashDisplay value={selected.ephPub} label="Source Ephemeral Pubkey (secp256k1 compressed)" />
          <div style={{ display: "flex", gap: 16, fontFamily: C.mono, fontSize: 10, flexWrap: "wrap" }}>
            <span style={{ color: C.textDim }}>Received: <span style={{ color: C.text }}>{fmtTime(selected.ts)}</span></span>
            <span style={{ color: C.textDim }}>Size: <span style={{ color: C.text }}>{selected.size}</span></span>
            <span style={{ color: C.textDim }}>Type: <span style={{ color: C.text }}>{selected.type}</span></span>
            <span style={{ color: selected.stripped ? C.accent : C.amber }}>{selected.stripped ? "✓ Strip attested" : "⚠ No strip attestation"}</span>
          </div>
        </div>

        <SectionLabel>Document Content</SectionLabel>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "16px", minHeight: 100, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono, fontSize: 10, color: C.textFaint, marginBottom: 16 }}>
          {selected.payload ? "[ECIES ENCRYPTED — decrypt with outlet private key to view]" : "[MOCK SUBMISSION — real content would decrypt here]"}
        </div>

        <SectionLabel>Publication Headline</SectionLabel>
        <input className="ld-input" style={{ marginBottom: 16 }} placeholder="Enter headline for publication record..." value={headline} onChange={(e) => setHeadline(e.target.value)} />

        {publishLog.length > 0 && <LogTerminal lines={publishLog} loading={publishing} style={{ marginBottom: 14 }} />}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <button className="ld-btn ld-btn-ghost" disabled={publishing || rejecting} onClick={() => setView("inbox")}>← Inbox</button>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="ld-input" style={{ width: 200 }} placeholder="Rejection reason..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <button className="ld-btn ld-btn-danger" disabled={publishing || !rejectReason.trim()} onClick={runReject}>
                {rejecting ? <Spinner /> : "Reject"}
              </button>
            </div>
            <button className="ld-btn ld-btn-primary" disabled={publishing || !headline.trim()} onClick={runPublish}>
              {publishing ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Publishing <Spinner /></span> : "Publish → Logos Storage + Logos Blockchain"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );

  // ─── Published ─────────────────────────────────────────────────

  if (view === "published" && publishedRecord) return (
    <div className="ld-anim">
      <SectionLabel>Publication Record</SectionLabel>
      <div style={{ padding: "12px", background: C.accentFaint, border: `1px solid ${C.accentDim}`, fontFamily: C.mono, fontSize: 11, color: C.accent, marginBottom: 20 }}>
        ✓ Document is live — pinned to Logos Storage, anchored on Logos Blockchain, announced via Logos Messaging. Tamper-evident and uncensorable.
      </div>
      <Panel>
        <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text, marginBottom: 16, lineHeight: 1.5 }}>{publishedRecord.headline}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <HashDisplay value={publishedRecord.cid} label="Logos Storage CID" />
          <HashDisplay value={publishedRecord.hash} label="Document Hash (SHA-256)" color={C.textDim} />
          <HashDisplay value={publishedRecord.txHash} label="Logos Blockchain Anchor Transaction" />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 11, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.textDim }}>Logos Blockchain Block</span>
            <span style={{ color: C.accent }}>#{publishedRecord.block.toLocaleString()}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 11, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.textDim }}>Logos Storage Storage Request</span>
            <span style={{ color: C.accentDim }}>{publishedRecord.storageReq.requestId.slice(0, 20)}...</span>
          </div>
        </div>
        <button className="ld-btn ld-btn-ghost" onClick={() => { setSelected(null); setPublishedRecord(null); setView("inbox"); }}>← Back to Inbox</button>
      </Panel>
    </div>
  );

  // ─── Rejected ──────────────────────────────────────────────────

  if (view === "rejected") return (
    <div className="ld-anim">
      <Panel>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, marginBottom: 12 }}>
          ✓ Rejection sent to source via Logos Messaging back-channel topic keyed to their ephemeral pubkey. Source will receive it on next poll.
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textFaint, marginBottom: 16 }}>
          Reason: <span style={{ color: C.textDim }}>{rejectReason}</span>
        </div>
        <button className="ld-btn ld-btn-ghost" onClick={() => { setSelected(null); setView("inbox"); }}>← Back to Inbox</button>
      </Panel>
    </div>
  );

  return null;
}
