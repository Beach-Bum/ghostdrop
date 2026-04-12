```
⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣦⠀
⠀⠀⠀⠀⣰⣿⡟⢻⣿⡟⢻⣧
⠀⠀⠀⣰⣿⣿⣇⣸⣿⣇⣸⣿
⠀⠀⣴⣿⣿⣿⣿⠟⢻⣿⣿⣿
⣠⣾⣿⣿⣿⣿⣿⣤⣼⣿⣿⠇
⢿⡿⢿⣿⣿⣿⣿⣿⣿⣿⡿⠀
⠀⠀⠈⠿⠿⠋⠙⢿⣿⡿⠁⠀
```

# GhostDrop

**Decentralised, censorship-resistant whistleblower publishing platform built on the [Logos](https://logos.co) stack.**

No server to seize. No nonprofit to pressure. No identity to leak.

> SecureDrop rebuilt from first principles — Logos Messaging for anonymous messaging, Logos Storage for permanent storage, Logos Blockchain for tamper-evident settlement.

**[▶ Try the interactive demo](https://htmlpreview.github.io/?https://github.com/Beach-Bum/ghostdrop/blob/main/demo.html)**

---

## Features

| Feature | Description |
| --- | --- |
| **ECIES Encryption** | Every document is encrypted to the outlet's secp256k1 key before it leaves your browser |
| **Logos Messaging Gossip** | Submissions route through a p2p gossip network — your IP is never sent directly to the outlet |
| **Logos Storage** | Published documents are content-addressed and replicated across decentralised storage nodes |
| **Logos Blockchain Anchoring** | Document hashes are permanently anchored on-chain as tamper-evident proofs of publication |
| **Metadata Stripping** | PDF, JPEG, DOCX and more are automatically stripped of author, GPS, timestamps and other identifying fields |
| **OpSec Advisor** | Built-in Tor Browser detection, WebRTC IP leak check, and 6-point operational security assessment |
| **Anonymous Tips** | Readers can lock XMR tips in Logos Blockchain escrow — claimable only by the source's 12-word ephemeral key |
| **Back-Channel** | Sources poll the Logos Messaging Store for outlet replies — no persistent connection, no call-home |

---

## Architecture

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
      │  5. Logos Messaging LightPush ──────►│                   │
      │  6. Save 12-word key      │  6. Filter sub receives      │
      │                           │  7. Decrypt + review         │
      │                           │  8. Upload → Logos Storage   │
      │                           │  9. Anchor → Logos Blockchain│
      │                           │ 10. Announce → Logos Messaging────────►│
      │  ◄────────────────────────│                         11. Fetch Logos Storage
      │  11. Poll back-channel    │                         12. Verify Logos Blockchain
      │      (Logos Messaging Store)                        13. Tip → escrow
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

### Logos Blockchain document anchor

```
channel_id  = sha256("logos-drop-v1")   ← fixed, deterministic
opcode      = 0                          ← inscription write
inscription = UTF-8 JSON bytes:
  { v, type, docHash, cid, outletId, headline, ts }
```

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/Beach-Bum/ghostdrop.git
cd ghostdrop
npm install
```

### 2. Run in dev mode

```bash
npm run dev
# → http://localhost:3000
```

Logos Messaging connects to the public fleet automatically. Logos Storage and Logos Blockchain run in **mock mode** until you connect local nodes (see below).

### 3. Build for production

```bash
npm run build
# Output in ./dist — deploy anywhere static files are served
```

---

## 🔧 Connecting Real Nodes

The app degrades gracefully — each layer works independently in mock mode.

### Logos Messaging — Live by default

Connects automatically to the Logos Messaging public fleet on load. No config needed.

### Logos Storage

```bash
# Option A: Docker (easiest)
docker run -p 8080:8080 codexstorage/nim-codex

# Option B: Binary
# Download from https://github.com/codex-storage/nim-codex/releases
./codex --api-port=8080
```

### Logos Blockchain

```bash
git clone https://github.com/logos-co/nomos-node
cd nomos-node/testnet && docker compose up
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env.local` and edit:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_CODEX_NODE_URL` | `http://localhost:8080` | Logos Storage node REST API |
| `VITE_NOMOS_RPC_URL` | `http://localhost:3001` | Logos Blockchain node RPC |
| `VITE_WAKU_BOOTSTRAP_PEERS` | Logos Messaging public fleet | Optional custom bootstrap peers |

---

## Project Structure

```
ghostdrop/
├── src/
│   ├── App.jsx                  # GhostDrop UI (source, outlet, reader views)
│   ├── main.jsx                 # React entry point
│   ├── services/
│   │   ├── crypto.js            # ECIES encryption, key generation, mnemonic
│   │   ├── waku.js              # Logos Messaging: LightPush, Filter, Store
│   │   ├── codex.js             # Logos Storage: upload, retrieve, marketplace
│   │   ├── nomos.js             # Logos Blockchain REST: anchoring, tx queries, tip escrow
│   │   ├── strip.js             # Metadata stripping: PDF, image, DOCX/XLSX
│   │   └── transport.js         # Tor detection, WebRTC leak check, OpSec
│   ├── components/
│   │   ├── CodexStatus.jsx      # Live Logos Storage node health panel
│   │   └── NomosStatus.jsx      # Live Logos Blockchain chain panel + block ticker
│   └── utils/
│       └── useWaku.js           # React hooks for Logos Messaging node lifecycle
├── demo.html                    # Interactive demo (Doomslayer-UI)
├── .env.example
├── vite.config.js
└── README.md
```

---

## Metadata Stripping Reference

| Format | Technique | Fields Removed |
| --- | --- | --- |
| **PDF** | pdf-lib rewrite | Title, Author, Subject, Keywords, Creator, Producer, Dates, XMP stream |
| **JPEG / PNG / TIFF / WebP** | Canvas redraw | EXIF, GPS, MakerNotes, IPTC, XMP, ICC profile, Thumbnail |
| **DOCX / XLSX / PPTX** | ZIP/XML patch | creator, lastModifiedBy, dates, revision, Company, Manager, Template |
| **Plain text** | Passthrough | n/a |

---

## OpSec Guidance

The built-in OpSec advisor checks:

1. **Tor Browser** — routes all connections through Tor, hiding your IP from bootstrap peers
2. **WebRTC leak** — detects real IP leakage through STUN even behind a VPN
3. **Browser fingerprinting** — warns if your browser has a distinctive fingerprint
4. **Device security** — reminder not to submit from managed/work devices
5. **Printer steganography** — colour laser printers embed invisible tracking dots
6. **Network timing** — ISP-level traffic correlation warning for non-Tor users

**Recommended setup for high-risk sources:**

```
1. Boot Tails OS (https://tails.boum.org)
2. Connect to public WiFi away from your usual location
3. Open GhostDrop in Tor Browser (included in Tails)
4. Submit — all connections go through Tor automatically
```

---

## Roadmap

- [ ] Wallet tx signing — real Logos Blockchain transactions once wallet API stabilises
- [ ] Outlet keystore — encrypted local keystore for outlet private key management
- [ ] Companion app — Electron/Tauri app with bundled Tor daemon
- [ ] Logos Storage incentives — paid marketplace storage for long-term replication
- [ ] Onion bootstrap peers — dedicated `.onion` Logos Messaging nodes
- [ ] ZK tip claims — zero-knowledge proof of ephemeral key for anonymous tip withdrawal
- [ ] Multi-outlet broadcast — submit to multiple outlets simultaneously

---

## Stack

| Layer | Technology |
| --- | --- |
| Messaging | @waku/sdk |
| Storage | @codex-storage/sdk-js |
| Settlement | Logos Blockchain REST API |
| Encryption | @noble/curves + @noble/ciphers |
| PDF stripping | pdf-lib |
| EXIF scanning | exifr |
| ZIP manipulation | fflate |
| UI framework | React 18 |
| Build tool | Vite 5 |

---

## Licence

MIT

---

## Contributing

Pull requests welcome. Please open an issue first for significant changes.

For security issues, contact via [Logos Messaging back-channel](https://waku.org) rather than public GitHub issues.
