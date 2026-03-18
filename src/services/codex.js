/**
 * Codex Storage Service — Real @codex-storage/sdk-js Integration
 *
 * Codex is the decentralised storage layer of the Logos stack.
 * Documents are content-addressed (CID) and replicated across nodes.
 *
 * SDK:  @codex-storage/sdk-js  v0.1.3
 * Docs: https://github.com/codex-storage/codex-js
 *
 * Local node: Codex runs as a local daemon the user operates.
 * Default API endpoint: http://localhost:8080
 * Override via:  VITE_CODEX_NODE_URL environment variable
 *
 * In dev, Vite proxies /codex-api → localhost:8080 to avoid CORS.
 * In production, set VITE_CODEX_NODE_URL to the node's address.
 *
 * All public functions degrade to a mock when no local node is
 * reachable — the app stays fully usable without a running node.
 *
 * ─── API surface ─────────────────────────────────────────────────
 *   checkNodeHealth()                   → node info + space stats
 *   upload(data, mime, filename, onPrg) → { cid, size, mock }
 *   retrieve(cid, onProgress)           → Uint8Array
 *   fetchManifest(cid)                  → { exists, manifest }
 *   listLocalCIDs()                     → [{ cid, manifest }]
 *   requestStorage(cid, opts)           → { purchaseId, mock }
 *   getStorageStatus(purchaseId)        → { state, nodes, ... }
 *   verifyCID(cid, expectedHash)        → { verified, actualHash }
 *   getSpaceStats()                     → { totalBytes, freeBytes, ... }
 */

import { Codex } from "@codex-storage/sdk-js";
import { BrowserUploadStrategy } from "@codex-storage/sdk-js/browser";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "./crypto.js";

// ─── Client Setup ─────────────────────────────────────────────────

// Dev: Vite proxy /codex-api → http://localhost:8080 (sidesteps CORS)
// Prod: VITE_CODEX_NODE_URL env var, or direct localhost fallback
const CODEX_NODE_URL =
  import.meta.env.DEV
    ? "/codex-api"
    : (import.meta.env.VITE_CODEX_NODE_URL || "http://localhost:8080");

let _client = null;
let _nodeOnline = null;

function getClient() {
  if (!_client) _client = new Codex(CODEX_NODE_URL);
  return _client;
}

// ─── Node Health ──────────────────────────────────────────────────

let _healthCacheTs = 0;
let _healthCache   = null;

/**
 * Check whether the local Codex node is reachable.
 * Result is cached for 30 s. Pass force=true to bypass.
 *
 * @returns {{ online, version, peerId, addrs, spaceTotal, spaceFree, spaceUsed }}
 */
export async function checkNodeHealth(force = false) {
  if (!force && _healthCache && Date.now() - _healthCacheTs < 30_000) {
    return _healthCache;
  }

  try {
    const client = getClient();
    const [infoRes, spaceRes] = await Promise.all([
      client.debug.info(),
      client.data.space(),
    ]);

    if (infoRes.error) throw new Error(infoRes.data?.message || "debug/info failed");

    const info  = infoRes.data;
    const space = spaceRes.error ? null : spaceRes.data;

    _healthCache = {
      online:     true,
      version:    info.version  || "unknown",
      peerId:     info.id       || "unknown",
      addrs:      info.addrs    || [],
      spaceTotal: space?.totalBytes    || 0,
      spaceFree:  space?.freeBytes     || 0,
      spaceUsed:  space?.usedBytes     || 0,
    };
  } catch (err) {
    _healthCache = { online: false, error: err.message };
  }

  _nodeOnline  = _healthCache.online;
  _healthCacheTs = Date.now();
  return _healthCache;
}

// ─── Upload ───────────────────────────────────────────────────────

/**
 * Upload document bytes to Codex. Returns content-addressed CID.
 *
 * Uses BrowserUploadStrategy (XHR + progress events) when node is up.
 * Falls back to a deterministic mock CID derived from the content hash.
 *
 * @param {Uint8Array|Blob} data
 * @param {string}   mimeType
 * @param {string}   [filename]
 * @param {Function} [onProgress]  (bytesLoaded, bytesTotal) => void
 *
 * @returns {{ cid: string, size: number, mock: boolean }}
 */
export async function upload(data, mimeType = "application/octet-stream", filename, onProgress) {
  const blob   = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const health = await checkNodeHealth();

  if (health.online) {
    const client   = getClient();
    const strategy = new BrowserUploadStrategy(
      blob,
      onProgress || null,
      { filename: filename || "document", mimetype: mimeType }
    );

    const { result } = client.data.upload(strategy);
    const res        = await result;

    if (res.error) throw new Error(res.data?.message || "Codex upload failed");

    // res.data is the raw CID string returned by the node
    const cid = res.data.trim();
    return { cid, size: blob.size, mock: false };
  }

  // ── Offline fallback ─────────────────────────────────────────────
  console.warn("[Codex] Node offline — using deterministic mock CID");
  await _mockDelay(1800);
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
  const cid   = `Qm${_b58(sha256(bytes), 44)}`;
  return { cid, size: blob.size, mock: true };
}

// ─── Retrieve ─────────────────────────────────────────────────────

/**
 * Download content from Codex by CID.
 *
 * Tries the local node cache first (fast path). If the CID isn't local,
 * triggers a network retrieval — may take time as node locates peers.
 *
 * @param {string}   cid
 * @param {Function} [onProgress]  (bytesReceived, total) => void
 * @returns {Uint8Array}
 */
export async function retrieve(cid, onProgress) {
  const health = await checkNodeHealth();

  if (health.online) {
    const client = getClient();

    // Fast path: try local cache
    const localRes = await client.data.localDownload(cid);
    if (!localRes.error) {
      const buf = await localRes.data.arrayBuffer();
      return new Uint8Array(buf);
    }

    // Slow path: trigger network fetch, then stream
    const netRes = await client.data.networkDownload(cid);
    if (netRes.error) throw new Error(netRes.data?.message || "Network retrieval failed");

    const streamRes = await client.data.networkDownloadStream(cid);
    if (streamRes.error) throw new Error(streamRes.data?.message || "Stream failed");

    const reader = streamRes.data.body.getReader();
    const chunks = [];
    let   received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(received, -1); // total unknown without manifest
    }

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out   = new Uint8Array(total);
    let   off   = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  console.warn("[Codex] Node offline — returning mock bytes for", cid);
  await _mockDelay(600);
  return new TextEncoder().encode(`[MOCK CODEX CONTENT — CID: ${cid}]`);
}

// ─── Manifest ─────────────────────────────────────────────────────

/**
 * Fetch Codex manifest for a CID (proves existence on the network).
 * Returns metadata: rootHash, blockCount, blockSize, filename, mimetype.
 *
 * @param {string} cid
 * @returns {{ exists: boolean, manifest?: Object }}
 */
export async function fetchManifest(cid) {
  const health = await checkNodeHealth();

  if (health.online) {
    const client = getClient();
    const res    = await client.data.fetchManifest(cid);
    if (res.error) return { exists: false };
    return { exists: true, manifest: res.data };
  }

  await _mockDelay(400);
  return { exists: true, manifest: { cid, mock: true } };
}

// ─── List Local CIDs ──────────────────────────────────────────────

/**
 * List CIDs currently held by the local Codex node.
 * @returns {Array<{ cid: string, manifest: Object }>}
 */
export async function listLocalCIDs() {
  const health = await checkNodeHealth();
  if (!health.online) return [];
  const res = await getClient().data.cids();
  if (res.error) return [];
  return res.data.content || [];
}

// ─── Storage Request (Marketplace Pinning) ────────────────────────

/**
 * Create a Codex Marketplace storage request for paid, long-term replication.
 * Pays storage node operators to hold the content for `duration` seconds.
 *
 * Requires: local node running with marketplace enabled + funded wallet.
 * Degrades gracefully if marketplace is unavailable.
 *
 * @param {string} cid
 * @param {Object} opts
 * @param {number} opts.duration              seconds (default 1 year)
 * @param {string} opts.pricePerBytePerSecond token units as string (default "1")
 * @param {string} opts.proofProbability      bigint string (default "1")
 * @param {number} opts.nodes                 storage nodes (default 5)
 * @param {number} opts.tolerance             allowed failures (default 2)
 * @param {string} opts.collateralPerByte     bigint string (default "1")
 * @param {number} opts.expiry                seconds until request expires (default 3600)
 *
 * @returns {{ purchaseId: string, cid: string, mock: boolean }}
 */
export async function requestStorage(cid, {
  duration             = 365 * 24 * 3600,
  pricePerBytePerSecond = "1",
  proofProbability     = "1",
  nodes                = 5,
  tolerance            = 2,
  collateralPerByte    = "1",
  expiry               = 3600,
} = {}) {
  const health = await checkNodeHealth();

  if (health.online) {
    const client = getClient();
    const res    = await client.marketplace.createStorageRequest({
      cid,
      duration,
      pricePerBytePerSecond: BigInt(pricePerBytePerSecond),
      proofProbability:      BigInt(proofProbability),
      nodes,
      tolerance,
      collateralPerByte:     BigInt(collateralPerByte),
      expiry,
    });

    if (!res.error) {
      return { purchaseId: res.data.trim(), cid, mock: false };
    }

    // Marketplace may not be enabled — warn and fall through to mock
    console.warn("[Codex] Marketplace storage request failed:", res.data?.message);
  }

  await _mockDelay(1200);
  return { purchaseId: `mock_purchase_${_rHex(16)}`, cid, mock: true };
}

// ─── Storage Status ───────────────────────────────────────────────

/**
 * Poll a storage purchase for replication state.
 *
 * State transitions: submitted → started → finished
 *                                        → cancelled | error | errored
 *
 * @param {string} purchaseId
 * @returns {{ state, requestId, nodes?, tolerance?, error? }}
 */
export async function getStorageStatus(purchaseId) {
  if (purchaseId.startsWith("mock_")) {
    await _mockDelay(300);
    return { state: "started", requestId: purchaseId, nodes: 5, tolerance: 2 };
  }

  const health = await checkNodeHealth();

  if (health.online) {
    const res = await getClient().marketplace.purchaseDetail(purchaseId);
    if (res.error) throw new Error(res.data?.message || "purchaseDetail failed");
    const p = res.data;
    return {
      state:     p.state     || "unknown",
      requestId: p.requestId || purchaseId,
      error:     p.error,
      nodes:     p.request?.ask?.slots,
      tolerance: p.request?.ask?.tolerance,
    };
  }

  return { state: "unknown", requestId: purchaseId };
}

// ─── Verify CID ───────────────────────────────────────────────────

/**
 * Verify content at a CID matches an expected SHA-256 hash.
 * Downloads content and hashes locally.
 * Falls back to manifest check if download isn't possible.
 *
 * @param {string} cid
 * @param {string} expectedHash  "sha256:<64 hex chars>"
 * @returns {{ verified: boolean, actualHash: string|null, manifestOnly?: boolean }}
 */
export async function verifyCID(cid, expectedHash) {
  try {
    const bytes      = await retrieve(cid);
    const actualHash = `sha256:${bytesToHex(sha256(bytes))}`;
    return { verified: actualHash === expectedHash, actualHash };
  } catch {
    // Fallback: just check the CID exists on the network
    const { exists } = await fetchManifest(cid);
    return { verified: exists, actualHash: null, manifestOnly: true };
  }
}

// ─── Space Stats ──────────────────────────────────────────────────

/**
 * Get local node storage allocation numbers.
 * @returns {{ totalBytes, freeBytes, usedBytes, reservedBytes }}
 */
export async function getSpaceStats() {
  const health = await checkNodeHealth();
  if (health.online) {
    const res = await getClient().data.space();
    if (!res.error) return res.data;
  }
  return { totalBytes: 0, freeBytes: 0, usedBytes: 0, reservedBytes: 0 };
}

// ─── Internal helpers ─────────────────────────────────────────────

const _mockDelay = (ms) =>
  new Promise(r => setTimeout(r, ms + Math.random() * ms * 0.3));

const _rHex = (n) =>
  Array.from(crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2))))
    .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, n);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function _b58(bytes, n) {
  let out = "";
  for (let i = 0; i < n; i++) out += B58[bytes[i % bytes.length] % 58];
  return out;
}
