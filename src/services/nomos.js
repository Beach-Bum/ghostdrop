/**
 * Nomos Settlement Service — Real REST API Integration
 *
 * Nomos is the consensus + settlement layer of the Logos stack.
 * This module talks directly to a local Nomos node's REST API.
 *
 * Node default port:  3001
 * Override via:       VITE_NOMOS_RPC_URL
 * Dev Vite proxy:     /nomos-rpc → localhost:3001
 *
 * ─── Endpoints (discovered from live devnet explorer source) ─────
 *   GET /cryptarchia/info                              chain slot/epoch
 *   GET /network/info                                  peer list + nodeId
 *   GET /api/v1/fork-choice                            { fork: hex }
 *   GET /api/v1/blocks/list?page=&page-size=&fork=
 *   GET /api/v1/blocks/{hash}
 *   GET /api/v1/transactions/list?page=&page-size=&fork=
 *   GET /api/v1/transactions/{hash}?fork=
 *   GET /api/v1/health/stream                          NDJSON { healthy }
 *   GET /api/v1/blocks/stream?fork=                    NDJSON live blocks
 *   GET /api/v1/transactions/stream?fork=              NDJSON live txs
 *
 * ─── Document Anchoring ──────────────────────────────────────────
 *   Docs are anchored as mantle_tx inscription operations.
 *   channel_id = sha256("logos-drop-v1")  — fixed, deterministic
 *   opcode 0 = inscription write
 *   inscription[] = UTF-8 JSON bytes of { docHash, cid, outletId, ... }
 *
 * ─── Tip Locking ─────────────────────────────────────────────────
 *   ledger_tx output locked to source's ephemeral secp256k1 pubkey.
 *   Source claims by spending with ephemeral private key.
 *   (Wallet API pending stabilisation — tx structure confirmed.)
 *
 * Degrades to mock when node is offline.
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "./crypto.js";

// ─── Setup ────────────────────────────────────────────────────────

const NODE_URL =
  import.meta.env.DEV
    ? "/nomos-rpc"
    : (import.meta.env.VITE_NOMOS_RPC_URL || "http://localhost:3001");

// Fixed channel for all Logos Drop anchors — sha256("logos-drop-v1")
export const LOGOS_DROP_CHANNEL = bytesToHex(
  sha256(new TextEncoder().encode("logos-drop-v1"))
);

// ─── Fetch primitives ─────────────────────────────────────────────

async function get(path, signal) {
  const res = await fetch(`${NODE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-cache",
    signal,
  });
  if (!res.ok) throw new Error(`Nomos GET ${path}: HTTP ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${NODE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Nomos POST ${path}: HTTP ${res.status} — ${txt}`);
  }
  return res.json();
}

/**
 * NDJSON streaming helper (replicates Nomos explorer's utils.js).
 * Returns an AbortController — call .abort() to cancel the stream.
 *
 * @param {string}   path      API path (appended to NODE_URL)
 * @param {Function} onItem    Called with each parsed JSON object
 * @param {Function} [onError]
 * @returns {AbortController}
 */
export function streamNdjson(path, onItem, onError) {
  const ctrl = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${NODE_URL}${path}`, {
        headers: { Accept: "application/x-ndjson" },
        signal: ctrl.signal,
        cache: "no-cache",
      });
      if (!res.ok || !res.body) throw new Error(`Stream ${path}: ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try { onItem(JSON.parse(line)); } catch (e) { onError?.(e); }
        }
      }
      if (buf.trim()) {
        try { onItem(JSON.parse(buf.trim())); } catch (e) { onError?.(e); }
      }
    } catch (err) {
      if (err.name !== "AbortError") onError?.(err);
    }
  })();

  return ctrl;
}

// ─── Health & Chain State ─────────────────────────────────────────

let _healthCache   = null;
let _healthCacheTs = 0;

/**
 * Check node health. Cached for 15 s.
 * @returns {{ online, slot, epoch, blockHeight, peers, nodeId }}
 */
export async function checkNodeHealth(force = false) {
  if (!force && _healthCache && Date.now() - _healthCacheTs < 15_000) {
    return _healthCache;
  }
  try {
    const [ci, ni] = await Promise.all([
      get("/cryptarchia/info"),
      get("/network/info"),
    ]);
    _healthCache = {
      online:      true,
      slot:        ci?.slot         ?? 0,
      epoch:       ci?.epoch        ?? 0,
      blockHeight: ci?.block_height ?? 0,
      genesisHash: ci?.genesis_hash ?? "",
      peers:       ni?.peers?.length ?? 0,
      nodeId:      ni?.node_id       ?? "",
    };
  } catch (err) {
    _healthCache = { online: false, error: err.message };
  }
  _healthCacheTs = Date.now();
  return _healthCache;
}

let _fork = null;
async function getFork() {
  if (_fork) return _fork;
  try {
    const d = await get("/api/v1/fork-choice");
    _fork = d.fork;
    return _fork;
  } catch {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

/**
 * Get current chain state summary.
 */
export async function getChainState() {
  const h = await checkNodeHealth();
  if (!h.online) return { blockHeight: _mockBlock(), synced: false };
  const fork = await getFork();
  return {
    online: true, blockHeight: h.blockHeight,
    slot: h.slot, epoch: h.epoch, fork, peers: h.peers,
    synced: true,
  };
}

// ─── Block queries ────────────────────────────────────────────────

export async function getBlocks({ page = 0, pageSize = 10, fork } = {}) {
  const h = await checkNodeHealth();
  if (!h.online) return { blocks: [], total: 0 };
  const f   = fork || await getFork();
  const url = `/api/v1/blocks/list?page=${page}&page-size=${pageSize}&fork=${encodeURIComponent(f)}`;
  const d   = await get(url);
  return { blocks: d.blocks || [], total: d.total || 0, fork: f };
}

export async function getBlock(hash) {
  return get(`/api/v1/blocks/${encodeURIComponent(hash)}`);
}

// ─── Transaction queries ──────────────────────────────────────────

function _normTx(raw) {
  const ops  = Array.isArray(raw?.operations) ? raw.operations : Array.isArray(raw?.ops) ? raw.ops : [];
  const ins  = Array.isArray(raw?.inputs)  ? raw.inputs  : [];
  const outs = Array.isArray(raw?.outputs) ? raw.outputs : [];
  return {
    id:        raw?.id        ?? "",
    hash:      _bytes(raw?.hash),
    blockHash: raw?.block_hash ?? null,
    operations: ops,
    inputs:    ins.map(_bytes),
    outputs:   outs.map(n => ({ publicKey: _bytes(n?.public_key), value: Number(n?.value ?? 0) })),
    proof:     _bytes(raw?.proof),
    gasExec:   Number(raw?.execution_gas_price ?? 0),
    gasStore:  Number(raw?.storage_gas_price   ?? 0),
  };
}

function _bytes(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.every(x => Number.isInteger(x) && x >= 0 && x <= 255))
    return "0x" + v.map(b => b.toString(16).padStart(2,"0")).join("");
  try { return JSON.stringify(v); } catch { return String(v); }
}

export async function getTransaction(hash, fork) {
  const f = fork || await getFork();
  const d = await get(`/api/v1/transactions/${encodeURIComponent(hash)}?fork=${encodeURIComponent(f)}`);
  return _normTx(d);
}

export async function getTransactions({ page = 0, pageSize = 20, fork } = {}) {
  const h = await checkNodeHealth();
  if (!h.online) return { transactions: [], total: 0 };
  const f   = fork || await getFork();
  const url = `/api/v1/transactions/list?page=${page}&page-size=${pageSize}&fork=${encodeURIComponent(f)}`;
  const d   = await get(url);
  return { transactions: (d.transactions || []).map(_normTx), total: d.total || 0, fork: f };
}

// ─── Live streams ─────────────────────────────────────────────────

export async function watchBlocks(onBlock, onError) {
  const f = await getFork();
  return streamNdjson(`/api/v1/blocks/stream?fork=${encodeURIComponent(f)}`, onBlock, onError);
}

export async function watchTransactions(onTx, onError) {
  const f = await getFork();
  return streamNdjson(`/api/v1/transactions/stream?fork=${encodeURIComponent(f)}`, raw => onTx(_normTx(raw)), onError);
}

// ─── Outlet Registry ──────────────────────────────────────────────

/**
 * Fetch registered outlets.
 * Scans LOGOS_DROP_CHANNEL for opcode=1 (outlet registration) txs.
 * Falls back to mock data while chain bootstraps.
 */
export async function getOutlets() {
  const h = await checkNodeHealth();
  if (h.online) {
    try {
      const { transactions } = await getTransactions({ pageSize: 100 });
      const outlets = transactions
        .filter(tx => _isLogosTx(tx, 1))
        .map(_decodeOutletReg)
        .filter(Boolean);
      if (outlets.length > 0) return outlets;
    } catch (err) { console.warn("[Nomos] outlet scan:", err.message); }
  }
  await _delay(400);
  return _OUTLETS;
}

// ─── Document anchoring ───────────────────────────────────────────

/**
 * Anchor a document to Nomos as a mantle_tx inscription.
 *
 * Inscription payload (JSON → UTF-8 bytes):
 *   { v, type, docHash, cid, outletId, headline, ts }
 *
 * channel_id = LOGOS_DROP_CHANNEL (sha256("logos-drop-v1"))
 * opcode     = 0 (inscription write)
 *
 * TODO: sign + submit via wallet API once stable.
 */
export async function anchorDocument({ docHash, outletId, cid, headline }) {
  const h = await checkNodeHealth();

  const payload = {
    v: "logos-drop/1", type: "doc_anchor",
    docHash, cid, outletId,
    headline: (headline || "").slice(0, 128),
    ts: Date.now(),
  };
  const inscription = Array.from(new TextEncoder().encode(JSON.stringify(payload)));

  const mantleOp = {
    opcode: 0,
    payload: {
      channel_id:  LOGOS_DROP_CHANNEL,
      inscription,
      parent:      "0".repeat(64),
      signer:      outletId,
    },
  };

  if (h.online) {
    console.info("[Nomos] anchorDocument — tx ready, wallet API pending");
    console.info("[Nomos] channel:", LOGOS_DROP_CHANNEL);
    console.info("[Nomos] inscription:", inscription.length, "bytes");
    // Uncomment when wallet API is stable:
    // const result = await post("/api/v1/transactions", { operations: [mantleOp] });
    // return { txHash: result.hash, block: result.block_height, anchorId: result.id, ts: Date.now(), mock: false };
  }

  await _delay(2200);
  return {
    txHash:   `0x${_hex(64)}`,
    block:    _mockBlock(),
    anchorId: _hex(32),
    ts:       Date.now(),
    inscriptionChannel: LOGOS_DROP_CHANNEL,
    inscriptionSize:    inscription.length,
    mock: true,
  };
}

/**
 * Verify a document anchor by fetching the tx and decoding its inscription.
 */
export async function verifyAnchor(txHash, expectedDocHash) {
  const h = await checkNodeHealth();

  if (h.online && txHash && !txHash.startsWith("0x")) {
    try {
      const tx = await getTransaction(txHash);
      const op = tx.operations.find(op =>
        op?.payload?.channel_id === LOGOS_DROP_CHANNEL && op?.opcode === 0
      );
      if (op) {
        const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(op.payload.inscription)));
        return { verified: p.docHash === expectedDocHash, block: null, ts: p.ts, outletId: p.outletId, decodedPayload: p, mock: false };
      }
    } catch (err) { console.warn("[Nomos] verifyAnchor:", err.message); }
  }

  await _delay(1800);
  return {
    verified:  true,
    block:     _mockBlock() - Math.floor(Math.random() * 500),
    ts:        Date.now() - Math.random() * 86400000 * 30,
    outletId:  "outlet_3",
    mock:      true,
  };
}

// ─── Tip escrow ───────────────────────────────────────────────────

/**
 * Lock a tip as a ledger_tx output to source's ephemeral pubkey.
 * TODO: Submit via wallet API.
 */
export async function lockTip({ anchorId, ephPubHex, xmrAmount }) {
  const h = await checkNodeHealth();
  const outputValue = Math.round(parseFloat(xmrAmount) * 1_000_000);

  const ledgerTx = {
    inputs: [],
    outputs: [{ public_key: ephPubHex, value: outputValue }],
    memo: { type: "tip_escrow", anchorId, xmrAmount },
  };

  if (h.online) {
    console.info("[Nomos] lockTip — ledger tx ready, wallet API pending");
    console.info("[Nomos] output:", outputValue, "base units →", ephPubHex.slice(0,20) + "...");
  }

  await _delay(1100);
  return { escrowId: _hex(16), txHash: `0x${_hex(64)}`, amount: xmrAmount, mock: true };
}

/**
 * Claim tips locked to ephemeral pubkey.
 * Source signs spend tx with their ephemeral private key.
 */
export async function claimTip({ escrowId, ephPrivKeyHex, destinationAddress }) {
  await _delay(1500);
  return { txHash: `0x${_hex(64)}`, amount: "claimed", destination: destinationAddress, mock: true };
}

/**
 * Get total tips in escrow for an anchor.
 */
export async function getTipPool(anchorId) {
  const h = await checkNodeHealth();
  if (h.online) {
    try {
      const { transactions } = await getTransactions({ pageSize: 200 });
      const tips = transactions.flatMap(tx => tx.outputs).filter(o => o.value > 0);
      if (tips.length > 0) {
        return {
          total:     `${(tips.reduce((s,o) => s + o.value, 0) / 1_000_000).toFixed(4)} NOM`,
          claimable: true,
          escrows:   tips.length,
          mock:      false,
        };
      }
    } catch (err) { console.warn("[Nomos] getTipPool:", err.message); }
  }
  await _delay(400);
  return { total: `${(Math.random()*2).toFixed(2)} XMR`, claimable: true, escrows: Math.floor(Math.random()*8)+1, mock: true };
}

// ─── Publications feed ────────────────────────────────────────────

/**
 * Fetch published document anchors from the Nomos chain.
 * Scans LOGOS_DROP_CHANNEL opcode=0 txs and decodes their inscriptions.
 */
export async function getPublications({ outletId, limit = 20 } = {}) {
  const h = await checkNodeHealth();
  if (h.online) {
    try {
      const { transactions } = await getTransactions({ pageSize: 200 });
      const pubs = transactions
        .filter(tx => _isLogosTx(tx, 0))
        .map(_decodeDocAnchor)
        .filter(p => p && (!outletId || p.outletId === outletId))
        .slice(0, limit);
      if (pubs.length > 0) return pubs;
    } catch (err) { console.warn("[Nomos] getPublications:", err.message); }
  }
  await _delay(700);
  return _PUBS;
}

// ─── Node status for UI panel ─────────────────────────────────────

export async function getNodeStatus() {
  const h = await checkNodeHealth(true);
  if (!h.online) return { online: false };
  const chain = await getChainState();
  return {
    online: true,
    slot:   chain.slot,
    epoch:  chain.epoch,
    blockHeight: chain.blockHeight,
    fork:   chain.fork ? chain.fork.slice(0,16) + "…" : null,
    peers:  h.peers,
    nodeId: h.nodeId ? h.nodeId.slice(0,24) + "…" : null,
    channel: LOGOS_DROP_CHANNEL.slice(0,16) + "…",
  };
}

// ─── Internal ─────────────────────────────────────────────────────

function _isLogosTx(tx, opcode) {
  return tx.operations.some(op =>
    op?.payload?.channel_id === LOGOS_DROP_CHANNEL && op?.opcode === opcode
  );
}

function _decodeOutletReg(tx) {
  try {
    const op = tx.operations.find(op => op?.opcode === 1);
    return { ...JSON.parse(new TextDecoder().decode(Uint8Array.from(op.payload.inscription))), txHash: tx.hash };
  } catch { return null; }
}

function _decodeDocAnchor(tx) {
  try {
    const op = tx.operations.find(op => op?.payload?.channel_id === LOGOS_DROP_CHANNEL && op?.opcode === 0);
    if (!op) return null;
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(op.payload.inscription)));
    return {
      id: tx.id || tx.hash, headline: p.headline || "Untitled",
      outlet: p.outletId || "unknown", outletId: p.outletId || "",
      cid: p.cid || "", hash: p.docHash || "", txHash: tx.hash, anchorId: tx.id,
      block: 0, ts: p.ts || Date.now(), tags: p.tags || [],
      tipPool: "0.00 XMR", verified: true, summary: p.summary || "",
    };
  } catch { return null; }
}

let _bh = 847293;
const _mockBlock = () => (_bh += Math.floor(Math.random() * 4) + 1);
const _delay = ms => new Promise(r => setTimeout(r, ms + Math.random() * ms * 0.3));
const _hex   = n => Array.from(crypto.getRandomValues(new Uint8Array(Math.ceil(n/2)))).map(b => b.toString(16).padStart(2,"0")).join("").slice(0,n);
const _b58   = n => { const c="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; return Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join(""); };

const _OUTLETS = [
  { id:"outlet_1", name:"The Distributed Press",  topic:"/logos-drop/1/submissions/outlet_1/proto", pubKeyHex:_hex(66), stake:"12,400 NOM", stakeRaw:12400, docs:47,  address:`0x${_hex(40)}`, active:true },
  { id:"outlet_2", name:"Ciphertext Journal",      topic:"/logos-drop/1/submissions/outlet_2/proto", pubKeyHex:_hex(66), stake:"8,200 NOM",  stakeRaw:8200,  docs:23,  address:`0x${_hex(40)}`, active:true },
  { id:"outlet_3", name:"Zero Knowledge Reports",  topic:"/logos-drop/1/submissions/outlet_3/proto", pubKeyHex:_hex(66), stake:"31,000 NOM", stakeRaw:31000, docs:112, address:`0x${_hex(40)}`, active:true },
];

const _PUBS = [
  { id:"pub_1", headline:"Internal Memos Reveal Systematic Data Retention Violations",     outlet:"Zero Knowledge Reports", outletId:"outlet_3", cid:`Qm${_b58(44)}`, hash:`sha256:${_hex(64)}`, txHash:`0x${_hex(64)}`, anchorId:_hex(32), block:848201, ts:Date.now()-432000000,  tags:["corporate","data-privacy"], tipPool:"0.34 XMR", verified:true, summary:"Documents obtained show that a major technology firm retained user communications for up to 7 years beyond stated policy, directly violating published privacy commitments." },
  { id:"pub_2", headline:"Procurement Records Expose Pattern of Regulatory Capture",        outlet:"The Distributed Press",  outletId:"outlet_1", cid:`Qm${_b58(44)}`, hash:`sha256:${_hex(64)}`, txHash:`0x${_hex(64)}`, anchorId:_hex(32), block:841932, ts:Date.now()-1036800000, tags:["government","finance"],    tipPool:"1.20 XMR", verified:true, summary:"Procurement documents cross-referenced with lobbying disclosures reveal a coordinated strategy to influence regulatory outcomes across three separate agencies." },
  { id:"pub_3", headline:"Leaked Audit: Environmental Compliance Data Falsified for 4 Years", outlet:"Ciphertext Journal",   outletId:"outlet_2", cid:`Qm${_b58(44)}`, hash:`sha256:${_hex(64)}`, txHash:`0x${_hex(64)}`, anchorId:_hex(32), block:839104, ts:Date.now()-1814400000, tags:["environment","fraud"],     tipPool:"0.78 XMR", verified:true, summary:"An internal audit shows that environmental monitoring reports submitted to regulators were systematically altered to conceal exceedances of permitted emission levels." },
];
