/**
 * ECIES Encryption Service
 * Elliptic Curve Integrated Encryption Scheme
 * secp256k1 ECDH key agreement + AES-256-GCM symmetric encryption
 *
 * Flow:
 *   Encrypt: ephemeral privkey + recipient pubkey → ECDH → AES-GCM
 *   Decrypt: recipient privkey + ephemeral pubkey (in payload) → ECDH → AES-GCM
 *
 * Wire format: [ephPubKey(33)] [nonce(12)] [ciphertext+tag(n+16)]
 */

import { gcm } from "@noble/ciphers/aes";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { hkdf } from "@noble/hashes/hkdf";

// ─── Key Generation ────────────────────────────────────────────────

/**
 * Generate a secp256k1 keypair.
 * Returns: { privKey: Uint8Array(32), pubKey: Uint8Array(33) }
 */
export function generateKeyPair() {
  const privKey = secp256k1.utils.randomPrivateKey();
  const pubKey = secp256k1.getPublicKey(privKey, true); // compressed
  return { privKey, pubKey };
}

/**
 * Derive a human-readable mnemonic from a private key.
 * Not BIP39 — a simpler 12-word scheme for UX.
 */
const WORD_LIST = [
  "access","arctic","arrow","audit","basin","beacon","border","carbon",
  "cipher","codex","commit","delta","deploy","derive","domain","echo",
  "epoch","error","field","forge","ghost","grant","harbor","index",
  "kernel","layer","limit","logic","matrix","mirror","nomos","orbit",
  "parse","phase","prime","proof","proxy","quorum","relay","route",
  "scope","seal","segment","signal","stake","state","store","stream",
  "token","trace","trust","vault","verify","waku","yield","zero",
  "anchor","bridge","chain","cipher","cloud","core","crypt","curve",
  "datum","edge","event","fiber","flag","flash","flow","frame",
  "gate","graph","grid","guard","hash","heap","hook","host",
  "input","ionic","iris","join","jump","keystone","leaf","lens",
  "link","loop","mesh","mode","mount","node","null","open",
  "pack","path","peer","pipe","pixel","plan","port","pulse",
  "query","queue","rack","ram","ring","root","rule","run",
  "salt","scan","seed","set","shard","shift","slab","slot",
  "snap","sort","span","spec","spin","split","stack","tag",
  "tap","task","term","test","text","thread","tick","tide",
  "tier","time","tip","tone","top","tree","trim","type",
  "unit","use","valve","view","void","wake","wall","wave",
  "web","wire","word","work","wrap","write","zone","zoom",
];

export function privKeyToMnemonic(privKey) {
  const words = [];
  for (let i = 0; i < 12; i++) {
    const byte = privKey[i * 2] ^ privKey[i * 2 + 1];
    const idx = Math.floor((byte / 256) * WORD_LIST.length);
    words.push(WORD_LIST[idx]);
  }
  return words.join(" ");
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex) {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

// ─── ECIES Encrypt ────────────────────────────────────────────────

/**
 * Encrypt a message to a recipient's compressed secp256k1 public key.
 *
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} recipientPubKey  33-byte compressed secp256k1 pubkey
 * @returns {Uint8Array} wire payload: [ephPub(33)][nonce(12)][ciphertext+tag]
 */
export function eciesEncrypt(plaintext, recipientPubKey) {
  // 1. Generate ephemeral keypair
  const ephPriv = secp256k1.utils.randomPrivateKey();
  const ephPub = secp256k1.getPublicKey(ephPriv, true);

  // 2. ECDH: shared secret from ephemeral priv + recipient pub
  const sharedPoint = secp256k1.getSharedSecret(ephPriv, recipientPubKey);

  // 3. HKDF to derive 32-byte AES key from shared secret
  const aesKey = hkdf(sha256, sharedPoint.slice(1), undefined, "logos-drop-v1", 32);

  // 4. AES-256-GCM encrypt
  const nonce = randomBytes(12);
  const cipher = gcm(aesKey, nonce);
  const ciphertext = cipher.encrypt(plaintext);

  // 5. Concatenate: ephPub(33) + nonce(12) + ciphertext
  const out = new Uint8Array(33 + 12 + ciphertext.length);
  out.set(ephPub, 0);
  out.set(nonce, 33);
  out.set(ciphertext, 45);
  return out;
}

/**
 * Decrypt a payload using recipient's private key.
 *
 * @param {Uint8Array} payload  wire format as produced by eciesEncrypt
 * @param {Uint8Array} recipientPrivKey  32-byte secp256k1 private key
 * @returns {Uint8Array} plaintext
 */
export function eciesDecrypt(payload, recipientPrivKey) {
  // 1. Parse wire format
  const ephPub = payload.slice(0, 33);
  const nonce = payload.slice(33, 45);
  const ciphertext = payload.slice(45);

  // 2. ECDH
  const sharedPoint = secp256k1.getSharedSecret(recipientPrivKey, ephPub);

  // 3. HKDF
  const aesKey = hkdf(sha256, sharedPoint.slice(1), undefined, "logos-drop-v1", 32);

  // 4. AES-256-GCM decrypt
  const cipher = gcm(aesKey, nonce);
  return cipher.decrypt(ciphertext);
}

// ─── Document Hashing ─────────────────────────────────────────────

/**
 * Hash document bytes using SHA-256.
 * @param {Uint8Array} data
 * @returns {string}  "sha256:<hex>"
 */
export function hashDocument(data) {
  const digest = sha256(data);
  return `sha256:${bytesToHex(digest)}`;
}

// ─── Submission Envelope ──────────────────────────────────────────

/**
 * Build a signed submission envelope.
 * Envelope JSON: { version, ts, docHash, docSize, mimeType, ephPubHex, coverNote }
 * Full payload: encrypted(JSON envelope + document bytes)
 *
 * @returns {{ payload: Uint8Array, ephKeys: {privKey, pubKey}, docHash: string }}
 */
export function buildSubmissionEnvelope(docBytes, mimeType, outletPubKey, coverNote = "") {
  const ephKeys = generateKeyPair();
  const docHash = hashDocument(docBytes);

  const envelope = {
    version: "logos-drop/1",
    ts: Date.now(),
    docHash,
    docSize: docBytes.length,
    mimeType,
    ephPubHex: bytesToHex(ephKeys.pubKey),
    coverNote,
  };

  // Plaintext = envelope JSON (as length-prefixed) + raw doc bytes
  const envelopeBytes = new TextEncoder().encode(JSON.stringify(envelope));
  const lenPrefix = new Uint8Array(4);
  new DataView(lenPrefix.buffer).setUint32(0, envelopeBytes.length, false);

  const plaintext = new Uint8Array(4 + envelopeBytes.length + docBytes.length);
  plaintext.set(lenPrefix, 0);
  plaintext.set(envelopeBytes, 4);
  plaintext.set(docBytes, 4 + envelopeBytes.length);

  const payload = eciesEncrypt(plaintext, outletPubKey);
  return { payload, ephKeys, docHash, envelope };
}

/**
 * Decode a received submission payload.
 * @returns {{ envelope: Object, docBytes: Uint8Array }}
 */
export function decodeSubmission(payload, outletPrivKey) {
  const plaintext = eciesDecrypt(payload, outletPrivKey);

  const envelopeLen = new DataView(plaintext.buffer, plaintext.byteOffset, 4).getUint32(0, false);
  const envelopeBytes = plaintext.slice(4, 4 + envelopeLen);
  const docBytes = plaintext.slice(4 + envelopeLen);
  const envelope = JSON.parse(new TextDecoder().decode(envelopeBytes));

  return { envelope, docBytes };
}
