# 👻 GhostDrop

**Decentralised, censorship-resistant whistleblower publishing platform built on the [Logos](https://logos.co) stack.**

No server to seize. No nonprofit to pressure. No identity to leak.

> SecureDrop rebuilt from first principles — Waku for anonymous messaging, Codex for permanent storage, Nomos for tamper-evident settlement.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔒 **ECIES Encryption** | Every document is encrypted to the outlet's secp256k1 key before it leaves your browser |
| 👻 **Waku Gossip** | Submissions route through a p2p gossip network — your IP is never sent directly to the outlet |
| 🗄️ **Codex Storage** | Published documents are content-addressed and replicated across decentralised storage nodes |
| ⛓️ **Nomos Anchoring** | Document hashes are permanently anchored on-chain as tamper-evident proofs of publication |
| 🧹 **Metadata Stripping** | PDF, JPEG, DOCX and more are automatically stripped of author, GPS, timestamps and other identifying fields |
| 🕵️ **OpSec Advisor** | Built-in Tor Browser detection, WebRTC IP leak check, and 6-point operational security assessment |
| 💰 **Anonymous Tips** | Readers can lock XMR tips in Nomos escrow — claimable only by the source's 12-word ephemeral key |
| 📡 **Back-Channel** | Sources poll the Waku Store for outlet replies — no persistent connection, no call-home |

---

## 🏗️ Architecture

```
SOURCE BROWSER                OUTLET                        READER
      │                          │                              │
      │  1. Upload file           │                              │
      │  2. Scan metadata         │                              │
      │  3. Strip metadata        │                              │
      │     ├─ PDF  → pdf-lib     │                              │
      │     ├─ JPEG → Canvas      │                              │
      │     └─ DOCX → ZIP patch   │                              │
      │  4. ECIES encrypt         │                              │
      │     secp256k1 + AES-GCM   │                              │
      │  5. Waku LightPush ──────►│                              │
      │  6. Save 12-word key      │  6. Filter sub receives      │
      │                           │  7. Decrypt + review         │
      │                           │  8. Upload → Codex           │
      │                           │  9. Anchor → Nomos           │
      │                           │     mantle_tx inscription    │
      │                           │ 10. Announce → Waku ────────►│
      │  ◄────────────────────────│                         11. Fetch Codex
      │  11. Poll back-channel    │                         12. Verify Nomos
      │      (Waku Store)         │                         13. Tip → escrow
```

### Crypto primitives

```
Ephemeral keypair:  secp256k1.randomPrivateKey()
ECDH shared secret: secp256k1.getSharedSecret(ephPriv, outletPubKey)
AES key derivation: HKDF-SHA256(sharedSecret, "logos-drop-v1", 32)
Encryption:         AES-256-GCM(key, nonce, plaintext)
Wire format:        [ephPub(33)] [nonce(12)] [ciphertext+tag]
Claim key:          12-word mnemonic from ephemeral private key bytes
```

### Nomos document anchor

```
channel_id  = sha256("logos-drop-v1")   ← fixed, deterministic
opcode      = 0                          ← inscription write
inscription = UTF-8 JSON bytes:
  { v, type, docHash, cid, outletId, headline, ts }
```

---

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/YOUR_USERNAME/ghostdrop.git
cd ghostdrop
npm install
```

### 2. Run in dev mode

```bash
npm run dev
# → http://localhost:3000
```

Waku connects to the public fleet automatically. Codex and Nomos run in **mock mode** until you connect local nodes (see below).

### 3. Build for production

```bash
npm run build
# Output in ./dist — deploy anywhere static files are served
```

---

## 🔧 Connecting Real Nodes

The app degrades gracefully — each layer works independently in mock mode.

### Waku (messaging) — Live by default
Connects automatically to the Waku public fleet on load. No config needed.

### Codex (storage)

```bash
# Option A: Docker (easiest)
docker run -p 8080:8080 codexstorage/nim-codex

# Option B: Binary
# Download from https://github.com/codex-storage/nim-codex/releases
./codex --api-port=8080
```

Once running, Codex status in the sidebar turns green automatically.

### Nomos (settlement)

```bash
# Clone the node
git clone https://github.com/logos-co/nomos-node
cd nomos-node

# Run the local devnet
cd testnet && docker compose up

# Or build from source
cargo build -p nomos-node --release
```

Once running, Nomos status turns green and document anchors are submitted as real on-chain transactions.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env.local` and edit:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|---|---|---|
| `VITE_CODEX_NODE_URL` | `http://localhost:8080` | Codex node REST API |
| `VITE_NOMOS_RPC_URL` | `http://localhost:3001` | Nomos node RPC |
| `VITE_WAKU_BOOTSTRAP_PEERS` | Waku public fleet | Optional custom bootstrap peers |

---

## 📁 Project Structure

```
ghostdrop/
├── src/
│   ├── App.jsx                  # GhostDrop UI (source, outlet, reader views)
│   ├── main.jsx                 # React entry point
│   ├── services/
│   │   ├── crypto.js            # ECIES encryption, key generation, mnemonic
│   │   ├── waku.js              # Waku SDK: LightPush, Filter, Store
│   │   ├── codex.js             # Codex SDK: upload, retrieve, marketplace
│   │   ├── nomos.js             # Nomos REST: anchoring, tx queries, tip escrow
│   │   ├── strip.js             # Metadata stripping: PDF, image, DOCX/XLSX
│   │   └── transport.js         # Tor detection, WebRTC leak check, OpSec
│   ├── components/
│   │   ├── CodexStatus.jsx      # Live Codex node health panel
│   │   └── NomosStatus.jsx      # Live Nomos chain panel + block ticker
│   └── utils/
│       └── useWaku.js           # React hooks for Waku node lifecycle
├── .env.example                 # Environment variable template
├── vite.config.js               # Vite config with CORS proxies
└── README.md
```

---

## 🛡️ Metadata Stripping Reference

| Format | Technique | Fields Removed |
|---|---|---|
| **PDF** | pdf-lib rewrite | Title, Author, Subject, Keywords, Creator, Producer, Dates, XMP stream, Page actions |
| **JPEG / PNG / TIFF / WebP** | Canvas redraw | EXIF, GPS, MakerNotes, IPTC, XMP, ICC profile, Thumbnail |
| **DOCX / XLSX / PPTX** | ZIP/XML patch | creator, lastModifiedBy, dates, revision, Company, Manager, Template |
| **Plain text** | Passthrough | n/a (no embedded metadata) |

Every strip operation produces a **StripReport** containing SHA-256 hashes of the original and stripped document. This attestation is embedded in the submission envelope so the outlet can verify stripping occurred.

---

## 🔒 OpSec Guidance

The built-in OpSec advisor checks:

1. **Tor Browser** — Tor Browser routes all connections (including Waku WebSockets) through Tor, hiding your IP from bootstrap peers. Strongly recommended.
2. **WebRTC leak** — Detects real IP leakage through STUN even behind a VPN.
3. **Browser fingerprinting** — Warns if your browser has a distinctive plugin/canvas fingerprint.
4. **Device security** — Reminder not to submit from managed/work devices.
5. **Printer steganography** — Colour laser printers embed invisible tracking dots. Photocopy on B&W before scanning.
6. **Network timing** — ISP-level traffic correlation warning for non-Tor users.

**Recommended setup for high-risk sources:**
```
1. Boot Tails OS (https://tails.boum.org) — amnesic, leaves no traces
2. Connect to public WiFi away from your usual location
3. Open GhostDrop in Tor Browser (included in Tails)
4. Submit — all connections go through Tor automatically
```

---

## 🗺️ Roadmap

- [ ] **Wallet tx signing** — Submit real Nomos transactions once wallet API stabilises
- [ ] **Outlet keystore** — Encrypted local keystore for outlet private key management
- [ ] **Companion app** — Electron/Tauri app with bundled Tor daemon (removes browser limitations)
- [ ] **Codex incentives** — Paid marketplace storage for long-term replication guarantees
- [ ] **Onion bootstrap peers** — Dedicated `.onion` Waku nodes for Tor-native routing
- [ ] **ZK tip claims** — Zero-knowledge proof of ephemeral key for anonymous tip withdrawal
- [ ] **Multi-outlet broadcast** — Submit to multiple outlets simultaneously

---

## 🧱 Stack

| Layer | Technology | Version |
|---|---|---|
| Messaging | [@waku/sdk](https://www.npmjs.com/package/@waku/sdk) | 0.0.27 |
| Storage | [@codex-storage/sdk-js](https://www.npmjs.com/package/@codex-storage/sdk-js) | 0.1.3 |
| Settlement | [Nomos REST API](https://github.com/logos-co/nomos-node) | devnet |
| Encryption | [@noble/curves](https://github.com/paulmillr/noble-curves) + [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) | latest |
| PDF stripping | [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 |
| EXIF scanning | [exifr](https://github.com/MikeKovarik/exifr) | 7.1.3 |
| ZIP manipulation | [fflate](https://github.com/101arrowz/fflate) | 0.8.2 |
| UI framework | [React](https://react.dev) | 18.3.1 |
| Build tool | [Vite](https://vitejs.dev) | 5.4 |

---

## 📄 Licence

MIT — see [LICENSE](LICENSE)

---

## 🤝 Contributing

Pull requests welcome. Please open an issue first for significant changes.

For security issues, please contact via [Waku back-channel](https://waku.org) rather than public GitHub issues.
