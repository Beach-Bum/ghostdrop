/**
 * Waku Service — Real @waku/sdk Integration
 *
 * Architecture:
 *   - Light node (browser-friendly, no full relay)
 *   - LightPush for sending (source → outlet)
 *   - Filter for receiving (outlet subscribes to topic)
 *   - Store for back-channel polling (source checks replies)
 *
 * Content Topic Schema:
 *   /logos-drop/1/submissions/{outletId}/proto   — source → outlet
 *   /logos-drop/1/backchannel/{ephPubHex}/proto  — outlet → source
 *   /logos-drop/1/announcements/{outletId}/proto — outlet → readers
 *
 * Message Format: raw bytes (ECIES encrypted payload from crypto.js)
 */

import {
  createLightNode,
  waitForRemotePeer,
  createEncoder,
  createDecoder,
  Protocols,
  bytesToUtf8,
  utf8ToBytes,
} from "@waku/sdk";

// ─── Topic Helpers ────────────────────────────────────────────────

export const Topics = {
  submissions: (outletId) => `/logos-drop/1/submissions/${outletId}/proto`,
  backChannel: (ephPubHex) => `/logos-drop/1/backchannel/${ephPubHex.slice(0, 32)}/proto`,
  announcements: (outletId) => `/logos-drop/1/announcements/${outletId}/proto`,
};

// ─── Node State ───────────────────────────────────────────────────

let _node = null;
let _status = "disconnected"; // disconnected | connecting | connected | error
const _statusListeners = new Set();
const _subscriptions = new Map(); // topic → unsubscribe fn
const _messageQueues = new Map(); // topic → Message[]

function setStatus(s) {
  _status = s;
  _statusListeners.forEach((fn) => fn(s));
}

export function getStatus() {
  return _status;
}

export function onStatusChange(fn) {
  _statusListeners.add(fn);
  return () => _statusListeners.delete(fn);
}

// ─── Node Lifecycle ───────────────────────────────────────────────

/**
 * Initialize and connect the Waku light node.
 * Safe to call multiple times — idempotent.
 */
export async function connect() {
  if (_node && _status === "connected") return _node;
  if (_status === "connecting") {
    // Wait for existing connection attempt
    return new Promise((resolve, reject) => {
      const unsub = onStatusChange((s) => {
        if (s === "connected") { unsub(); resolve(_node); }
        if (s === "error") { unsub(); reject(new Error("Waku connection failed")); }
      });
    });
  }

  setStatus("connecting");

  try {
    _node = await createLightNode({
      defaultBootstrap: true,
      // Use Waku's public fleet for bootstrapping
      // In production, point to Logos-operated bootstrap nodes
    });

    await _node.start();

    // Wait until we have at least one peer that supports our required protocols
    await waitForRemotePeer(_node, [
      Protocols.LightPush,
      Protocols.Filter,
      Protocols.Store,
    ]);

    setStatus("connected");
    console.log("[Waku] Connected. Peer count:", _node.libp2p.getPeers().length);
    return _node;

  } catch (err) {
    setStatus("error");
    console.error("[Waku] Connection failed:", err);
    throw err;
  }
}

/**
 * Gracefully disconnect and clean up.
 */
export async function disconnect() {
  if (!_node) return;
  for (const unsub of _subscriptions.values()) await unsub();
  _subscriptions.clear();
  await _node.stop();
  _node = null;
  setStatus("disconnected");
}

// ─── LightPush — Send ─────────────────────────────────────────────

/**
 * Send bytes on a content topic via LightPush.
 * Used by source to submit encrypted document payload.
 *
 * @param {string}     topic   Content topic string
 * @param {Uint8Array} payload Raw bytes (ECIES ciphertext)
 * @returns {{ msgId: string, topic: string, ts: number }}
 */
export async function send(topic, payload) {
  const node = await connect();
  const encoder = createEncoder({ contentTopic: topic, ephemeral: false });

  const result = await node.lightPush.send(encoder, { payload });

  if (result.failures?.length > 0) {
    throw new Error(`LightPush failures: ${JSON.stringify(result.failures)}`);
  }

  // Derive a deterministic msgId from payload hash for receipts
  const msgId = await crypto.subtle.digest("SHA-256", payload)
    .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32));

  return { msgId, topic, ts: Date.now() };
}

// ─── Filter — Subscribe (Outlet Inbox) ───────────────────────────

/**
 * Subscribe to a content topic and receive new messages.
 * Used by outlet to receive incoming encrypted submissions.
 *
 * @param {string}   topic     Content topic
 * @param {Function} onMessage Called with each { payload, timestamp, msgId }
 * @returns {Function} unsubscribe
 */
export async function subscribe(topic, onMessage) {
  if (_subscriptions.has(topic)) {
    // Already subscribed — return existing unsub
    return _subscriptions.get(topic);
  }

  const node = await connect();
  const decoder = createDecoder(topic);

  const { error, subscription } = await node.filter.createSubscription();
  if (error) throw new Error(`Filter subscription error: ${error}`);

  await subscription.subscribe([decoder], (msg) => {
    if (!msg.payload) return;
    const msgId = `${msg.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    onMessage({ payload: msg.payload, timestamp: msg.timestamp || Date.now(), msgId });
  });

  const unsubscribe = async () => {
    await subscription.unsubscribe([decoder]);
    _subscriptions.delete(topic);
  };

  _subscriptions.set(topic, unsubscribe);
  return unsubscribe;
}

// ─── Store — Poll (Source Back-Channel) ──────────────────────────

/**
 * Query the Waku Store for historical messages on a topic.
 * Used by source to check outlet replies via back-channel.
 * Source only polls — never opens a persistent connection.
 *
 * @param {string} topic        Content topic (back-channel for ephemeral pubkey)
 * @param {number} [since]      Unix ms — only retrieve messages after this time
 * @returns {Array<{ payload: Uint8Array, timestamp: number }>}
 */
export async function pollStore(topic, since = 0) {
  const node = await connect();
  const decoder = createDecoder(topic);

  const messages = [];
  const startTime = since ? new Date(since) : undefined;

  try {
    for await (const msgPage of node.store.queryGenerator([decoder], {
      timeFilter: startTime ? { startTime, endTime: new Date() } : undefined,
      pageDirection: "BACKWARD",
      pageSize: 25,
    })) {
      for await (const msg of msgPage) {
        if (msg?.payload) {
          messages.push({
            payload: msg.payload,
            timestamp: msg.timestamp ? Number(msg.timestamp) : Date.now(),
          });
        }
      }
    }
  } catch (err) {
    console.warn("[Waku Store] Query failed:", err.message);
  }

  return messages.reverse(); // chronological order
}

// ─── Back-Channel ────────────────────────────────────────────────

/**
 * Outlet sends a reply to a source's ephemeral pubkey back-channel.
 * Message is plaintext JSON (already encrypted at app layer if needed).
 *
 * @param {string} ephPubHex   Source's ephemeral pubkey as hex
 * @param {Object} msg         { status, text, ts }
 */
export async function sendBackChannel(ephPubHex, msg) {
  const topic = Topics.backChannel(ephPubHex);
  const payload = utf8ToBytes(JSON.stringify(msg));
  return send(topic, payload);
}

/**
 * Source polls its back-channel for outlet responses.
 *
 * @param {string} ephPubHex   Source's ephemeral pubkey as hex
 * @param {number} [since]     Only retrieve messages after this time
 * @returns {Array<Object>}    Decoded message objects
 */
export async function pollBackChannel(ephPubHex, since = 0) {
  const topic = Topics.backChannel(ephPubHex);
  const rawMsgs = await pollStore(topic, since);

  return rawMsgs.map(({ payload, timestamp }) => {
    try {
      return { ...JSON.parse(bytesToUtf8(payload)), timestamp };
    } catch {
      return { text: bytesToUtf8(payload), timestamp };
    }
  });
}

// ─── Announcements ────────────────────────────────────────────────

/**
 * Outlet broadcasts a publication announcement to readers.
 *
 * @param {string} outletId
 * @param {Object} announcement  { headline, cid, txHash, block, ts, tags }
 */
export async function announcePublication(outletId, announcement) {
  const topic = Topics.announcements(outletId);
  const payload = utf8ToBytes(JSON.stringify(announcement));
  return send(topic, payload);
}

/**
 * Reader subscribes to outlet announcements.
 */
export async function subscribeAnnouncements(outletId, onAnnouncement) {
  const topic = Topics.announcements(outletId);
  return subscribe(topic, ({ payload }) => {
    try {
      onAnnouncement(JSON.parse(bytesToUtf8(payload)));
    } catch (err) {
      console.warn("[Waku] Failed to parse announcement:", err);
    }
  });
}

// ─── Diagnostics ─────────────────────────────────────────────────

export function diagnostics() {
  if (!_node) return { status: "disconnected", peers: 0 };
  const peers = _node.libp2p.getPeers();
  return {
    status: _status,
    peers: peers.length,
    peerIds: peers.map((p) => p.toString().slice(0, 24) + "..."),
    subscriptions: [..._subscriptions.keys()],
    nodeId: _node.libp2p.peerId.toString().slice(0, 24) + "...",
  };
}
