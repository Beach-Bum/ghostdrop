/**
 * ReaderView — Browse publications, verify integrity, tip sources
 */

import { useState, useEffect } from "react";
import { Panel, SectionLabel, HashDisplay, Spinner, Tag, C, fmtAgo } from "../components/ui.jsx";
import { getPublications, verifyAnchor, getTipPool, lockTip } from "../services/nomos.js";
import { verifyCID } from "../services/codex.js";

export default function ReaderView() {
  const [publications, setPublications] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState(null);
  const [verifying,    setVerifying]    = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [tipAmount,    setTipAmount]    = useState("");
  const [tipping,      setTipping]      = useState(false);
  const [tipResult,    setTipResult]    = useState(null);
  const [filterTag,    setFilterTag]    = useState(null);
  const [tipPool,      setTipPool]      = useState(null);

  // Load publications from Nomos chain (or mock)
  useEffect(() => {
    getPublications().then((pubs) => {
      setPublications(pubs);
      setLoading(false);
    });
  }, []);

  // Load tip pool when selecting a document
  useEffect(() => {
    if (!selected) return;
    setTipPool(null);
    setVerifyResult(null);
    setTipResult(null);
    setTipAmount("");
    getTipPool(selected.anchorId).then(setTipPool);
  }, [selected]);

  const allTags = [...new Set(publications.flatMap((d) => d.tags || []))];
  const filtered = filterTag
    ? publications.filter((d) => (d.tags || []).includes(filterTag))
    : publications;

  // Two-layer verification: Nomos anchor + Codex content hash
  const runVerify = async () => {
    setVerifying(true);
    try {
      const [nomosResult, codexResult] = await Promise.all([
        verifyAnchor(selected.txHash, selected.hash),
        verifyCID(selected.cid, selected.hash),
      ]);
      setVerifyResult({
        nomosVerified: nomosResult.verified,
        codexVerified: codexResult.verified,
        block:         nomosResult.block,
        ts:            nomosResult.ts,
        nomosMock:     nomosResult.mock,
        codexMock:     codexResult.manifestOnly,
        actualHash:    codexResult.actualHash,
      });
    } catch (err) {
      setVerifyResult({ error: err.message });
    } finally {
      setVerifying(false);
    }
  };

  const runTip = async () => {
    if (!tipAmount || isNaN(parseFloat(tipAmount))) return;
    setTipping(true);
    try {
      const result = await lockTip({
        anchorId:   selected.anchorId,
        ephPubHex:  selected.id,
        xmrAmount:  tipAmount,
      });
      setTipResult(result);
    } catch (err) {
      console.error("Tip failed:", err);
    } finally {
      setTipping(false);
    }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20 }}>
      <Spinner />
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim }}>
        Querying Nomos chain for publication records…
      </span>
    </div>
  );

  // ── Feed ────────────────────────────────────────────────────────
  if (!selected) return (
    <div className="ld-anim">
      <SectionLabel>Published Documents</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          className={`ld-btn ${!filterTag ? "ld-btn-primary" : "ld-btn-ghost"}`}
          style={{ padding: "4px 12px" }}
          onClick={() => setFilterTag(null)}
        >All</button>
        {allTags.map((t) => (
          <button
            key={t}
            className={`ld-btn ${filterTag === t ? "ld-btn-primary" : "ld-btn-ghost"}`}
            style={{ padding: "4px 12px" }}
            onClick={() => setFilterTag(t)}
          >{t}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {filtered.map((doc) => (
          <div
            key={doc.id}
            className="ld-hover-row"
            style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "16px", cursor: "pointer" }}
            onClick={() => setSelected(doc)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, flex: 1, marginRight: 16, lineHeight: 1.5 }}>
                {doc.headline}
              </div>
              <span style={{ fontFamily: C.mono, fontSize: 9, color: C.accent, flexShrink: 0 }}>✓ ANCHORED</span>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>
              {doc.summary?.slice(0, 140)}…
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim }}>{doc.outlet}</span>
                {(doc.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
              <div style={{ display: "flex", gap: 16, fontFamily: C.mono, fontSize: 10, color: C.textDim }}>
                <span style={{ color: C.accentDim }}>tip pool: <span style={{ color: C.accent }}>{doc.tipPool}</span></span>
                <span>{fmtAgo(doc.ts)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Document Detail ────────────────────────────────────────────
  return (
    <div className="ld-anim">
      <button className="ld-btn ld-btn-ghost" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>
        ← All Documents
      </button>

      <div style={{ fontFamily: C.mono, fontSize: 15, color: C.text, marginBottom: 8, lineHeight: 1.5 }}>
        {selected.headline}
      </div>
      <div style={{ display: "flex", gap: 12, fontFamily: C.mono, fontSize: 10, color: C.textDim, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <span>{selected.outlet}</span>
        <span>·</span>
        <span>{fmtAgo(selected.ts)}</span>
        <span>·</span>
        {(selected.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
      </div>

      <Panel style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, lineHeight: 1.9 }}>{selected.summary}</div>
        <div style={{ marginTop: 14, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 10, color: C.textFaint }}>
          Full document at Codex CID: {selected.cid?.slice(0, 30)}…
        </div>
      </Panel>

      {/* ── Verification ─────────────────────────────────────────── */}
      <Panel style={{ marginBottom: 14 }}>
        <SectionLabel>Two-Layer Verification</SectionLabel>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim, marginBottom: 12 }}>
          Verifies (1) the Nomos chain anchor and (2) the Codex content hash independently.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <HashDisplay value={selected.hash}   label="Document Hash (SHA-256)"        color={C.textDim} />
          <HashDisplay value={selected.cid}    label="Codex CID"                                        />
          <HashDisplay value={selected.txHash} label="Nomos Anchor Transaction"                         />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 11, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.textDim }}>Anchored at Block</span>
            <span style={{ color: C.text }}>#{selected.block?.toLocaleString()}</span>
          </div>
        </div>

        {!verifyResult ? (
          <button className="ld-btn ld-btn-ghost" disabled={verifying} onClick={runVerify}>
            {verifying
              ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Verifying Nomos + Codex <Spinner /></span>
              : "Verify Document Integrity"}
          </button>
        ) : verifyResult.error ? (
          <div style={{ padding: "10px 12px", background: C.redFaint, border: `1px solid ${C.red}`, fontFamily: C.mono, fontSize: 11, color: C.red }}>
            ✗ Verification error: {verifyResult.error}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ padding: "10px 12px", background: verifyResult.nomosVerified ? C.accentFaint : C.redFaint, border: `1px solid ${verifyResult.nomosVerified ? C.accentDim : C.red}`, fontFamily: C.mono, fontSize: 11, color: verifyResult.nomosVerified ? C.accent : C.red }}>
              {verifyResult.nomosVerified ? "✓" : "✗"} Nomos anchor{verifyResult.nomosMock ? " (mock)" : ` verified at block #${verifyResult.block?.toString()?.slice(0,10) ?? "?"}`}
            </div>
            <div style={{ padding: "10px 12px", background: verifyResult.codexVerified ? C.accentFaint : C.redFaint, border: `1px solid ${verifyResult.codexVerified ? C.accentDim : C.red}`, fontFamily: C.mono, fontSize: 11, color: verifyResult.codexVerified ? C.accent : C.red }}>
              {verifyResult.codexVerified ? "✓" : "✗"} Codex content hash{verifyResult.codexMock ? " (manifest only)" : " — document unmodified"}
            </div>
          </div>
        )}
      </Panel>

      {/* ── Tip Escrow ───────────────────────────────────────────── */}
      <Panel>
        <SectionLabel>Tip the Source</SectionLabel>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, marginBottom: 12 }}>
          Tips are locked as UTXO outputs on Nomos, keyed to the source's ephemeral pubkey.
          Only the holder of the matching private key can spend them. No identity revealed.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10, marginBottom: 8, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}` }}>
          <span style={{ color: C.textDim }}>Current tip pool</span>
          <span style={{ color: C.accent }}>{tipPool ? tipPool.total : "…"}</span>
        </div>
        {tipPool && (
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10, marginBottom: 14, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.textDim }}>Tippers</span>
            <span style={{ color: C.textDim }}>{tipPool.escrows}{tipPool.mock ? " (mock)" : ""}</span>
          </div>
        )}

        {!tipResult ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                className="ld-input"
                placeholder="0.00"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                style={{ paddingRight: 40 }}
                type="number" step="0.01" min="0"
              />
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontFamily: C.mono, fontSize: 10, color: C.textDim }}>XMR</span>
            </div>
            <button className="ld-btn ld-btn-primary" disabled={tipping || !tipAmount} onClick={runTip}>
              {tipping
                ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Locking <Spinner /></span>
                : "Lock in Nomos Escrow"}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ padding: "10px 12px", background: C.accentFaint, border: `1px solid ${C.accentDim}`, fontFamily: C.mono, fontSize: 11, color: C.accent, marginBottom: 10 }}>
              ✓ {tipAmount} XMR locked as Nomos UTXO{tipResult.mock ? " (mock)" : ""}. Source claims anonymously with 12-word key.
            </div>
            <HashDisplay value={tipResult.txHash} label="Escrow Transaction" />
          </div>
        )}
      </Panel>
    </div>
  );
}
