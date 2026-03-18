# 👻 GhostDrop

**Decentralised, censorship-resistant whistleblower publishing platform built on the [Logos](https://logos.co) stack.**

No server to seize. No nonprofit to pressure. No identity to leak.

> SecureDrop rebuilt from first principles — Logos Messaging for anonymous transport, Logos Storage for permanent storage, Logos Blockchain for tamper-evident settlement.

---

## ✨ Features

| Feature | Description |
| --- | --- |
| 🔒 **ECIES Encryption** | Every document is encrypted to the outlet's secp256k1 key before it leaves your device |
| 👻 **Logos Messaging** | Submissions route through a p2p gossip network — your IP is never sent directly to the outlet |
| 🗄️ **Logos Storage** | Published documents are content-addressed and replicated across decentralised storage nodes |
| ⛓️ **Logos Blockchain** | Document hashes are permanently anchored on-chain as tamper-evident proofs of publication |
| 🧹 **Metadata Stripping** | PDF, JPEG, DOCX and more are automatically stripped of author, GPS, timestamps and other identifying fields |
| 🕵️ **OpSec Advisor** | Built-in Tor Browser detection, WebRTC IP leak check, and operational security assessment |
| 💰 **Anonymous Tips** | Readers can lock tips in Logos Blockchain escrow — claimable only by the source's 12-word ephemeral key |
| 📡 **Back-Channel** | Sources poll the Logos Messaging Store for outlet replies — no persistent connection, no call-home |

---

## 🏗️ Architecture

```
SOURCE                        OUTLET                        READER
  │                              │                              │
  │  1. Upload file              │                              │
  │  2. Scan metadata            │                              │
  │  3. Strip metadata           │                              │
  │  4. ECIES encrypt            │                              │
  │     secp256k1 + AES-GCM     │                              │
  │  5. Logos Messaging LightPush ──────►                       │
  │  6. Save 12-word key         │  Decrypt + review            │
  │                              │  Upload → Logos Storage      │
  │                              │  Anchor → Logos Blockchain   │
  │                              │  Announce → Logos Messaging ──────►
  │  ◄─────────────────────      │                         Fetch Logos Storage
  │  Poll back-channel           │                         Verify Logos Blockchain
  │  (Logos Messaging Store)     │                         Tip → escrow
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

---

## 🚀 Quick Start — Web App

```bash
git clone https://github.com/Beach-Bum/ghostdrop
cd ghostdrop
npm install
npm run dev
```

Logos Messaging connects to the public fleet automatically. Logos Storage and Logos Blockchain run in **mock mode** until you connect local nodes.

---

## 📦 Installing GhostDrop into Logos Basecamp

GhostDrop runs as a **native Logos Basecamp module** — a first-class Qt/QML plugin loaded directly by the Logos kernel. Once installed, it appears as a tile in the Logos Basecamp launcher alongside the built-in wallet, chat, and storage apps.

### Prerequisites

| Requirement | Version | Install |
| --- | --- | --- |
| [Logos Basecamp](https://github.com/logos-co/logos-basecamp/releases/tag/v0.1) | v0.1+ | Download from the Logos Builder Hub |
| Xcode Command Line Tools | latest | `xcode-select --install` |
| Homebrew | latest | https://brew.sh |
| Qt 6 | 6.4+ | `brew install qt@6` |
| CMake | 3.16+ | `brew install cmake` |
| logos-core-poc | latest | See step 2 below |

### Step 1 — Install Logos Basecamp

Download and install **LogosApp.app** from the [Logos Basecamp v0.1 release](https://github.com/logos-co/logos-basecamp/releases/tag/v0.1). Move it to your `/Applications` folder.

Verify the install:

```bash
ls /Applications/LogosApp.app/Contents/Frameworks/liblogos_core.dylib
```

You should see the file listed. If not, the app is not in the right place.

### Step 2 — Install build tools

```bash
xcode-select --install
brew install qt@6 cmake ninja
echo 'export PATH="/opt/homebrew/opt/qt@6/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Step 3 — Clone the Logos core workspace

GhostDrop's native module links against the Logos C++ SDK. You need a local copy:

```bash
git clone https://github.com/logos-co/logos-core-poc ~/logos-core-poc
cd ~/logos-core-poc
git config --global url."https://github.com/".insteadOf "git@github.com:"
git submodule update --init --recursive
```

Build the code generator (required once):

```bash
cd ~/logos-core-poc/logos-cpp-sdk
bash cpp-generator/compile.sh
cd ~/logos-core-poc
```

### Step 4 — Clone GhostDrop and build

```bash
git clone https://github.com/Beach-Bum/ghostdrop ~/ghostdrop
cd ~/ghostdrop
chmod +x build_and_deploy.sh
./build_and_deploy.sh
```

The script will:
1. Configure and build `logos-ghostdrop-module` (C++ backend)
2. Configure and build `logos-ghostdrop-ui` (QML frontend)
3. Copy both `.dylib` files into `LogosApp.app/Contents/Frameworks/`

Expected output:

```
╔══════════════════════════════════════════════════════╗
║       GhostDrop Native Module — Build & Deploy       ║
╚══════════════════════════════════════════════════════╝

→ [1/4] Configuring ghostdrop-module…
→ [2/4] Building ghostdrop-module…
→ [3/4] Configuring & building ghostdrop-ui…
→ [4/4] Deploying to LogosApp.app…

✓ Deployed:
  /Applications/LogosApp.app/Contents/Frameworks/ghostdrop_module_plugin.dylib
  /Applications/LogosApp.app/Contents/Frameworks/ghostdrop_ui.dylib

Launch LogosApp — GhostDrop will appear as a module tile.
```

### Step 5 — Launch Logos Basecamp

Open **LogosApp** from your Applications folder. GhostDrop will appear as a module tile in the Basecamp launcher. Click it to open the full GhostDrop interface — Submit Document, Outlet Inbox, and Publications.

### Verifying the install

To confirm the plugins are in place:

```bash
ls /Applications/LogosApp.app/Contents/Frameworks/ | grep ghostdrop
```

You should see:

```
ghostdrop_module_plugin.dylib
ghostdrop_ui.dylib
```

### Updating GhostDrop

To update to a newer version:

```bash
cd ~/ghostdrop
git pull
./build_and_deploy.sh
```

Then relaunch LogosApp.

### Troubleshooting

**`cmake: command not found`**
```bash
brew install cmake
```

**`logos-cpp-generator: No such file or directory`**
```bash
cd ~/logos-core-poc/logos-cpp-sdk
bash cpp-generator/compile.sh
```

**`lgx.h: file not found`**
The `liblgx.dylib` header is not public. The build is pre-configured to link against the dylib inside LogosApp.app directly. Make sure LogosApp v0.1 is installed at `/Applications/LogosApp.app`.

**GhostDrop tile doesn't appear in Basecamp**
Check the plugins landed correctly:
```bash
ls /Applications/LogosApp.app/Contents/Frameworks/ | grep ghostdrop
```
If missing, re-run `./build_and_deploy.sh`. If present, restart LogosApp fully (quit from the menu bar, not just closing the window).

---

## 🔧 Connecting Real Nodes

### Logos Messaging — Live by default
Connects automatically to the Logos Messaging public fleet on load. No config needed.

### Logos Storage

```bash
# Docker (easiest)
docker run -p 8080:8080 codexstorage/nim-codex

# Or download binary from:
# https://github.com/codex-storage/nim-codex/releases
```

### Logos Blockchain

```bash
git clone https://github.com/logos-co/nomos-node
cd testnet && docker compose up
```

---

## 🛡️ Metadata Stripping Reference

| Format | Technique | Fields Removed |
| --- | --- | --- |
| **PDF** | InfoDict patch + XMP removal | Author, Creator, Dates, Keywords, XMP stream |
| **JPEG / PNG / TIFF / WebP** | Qt image re-render | EXIF, GPS, MakerNotes, IPTC, XMP, ICC, Thumbnail |
| **DOCX / XLSX / PPTX** | ZIP/XML patch | creator, lastModifiedBy, dates, revision, Company |
| **Plain text** | Passthrough | n/a |

---

## 📁 Repository Structure

```
ghostdrop/
├── src/                           # Web app (React/JS)
│   ├── App.jsx                    # Main UI — Source, Outlet, Reader views
│   ├── services/
│   │   ├── crypto.js              # ECIES encryption (compatible with C++ port)
│   │   ├── waku.js                # Logos Messaging SDK: LightPush, Filter, Store
│   │   ├── codex.js               # Logos Storage SDK: upload, retrieve
│   │   ├── nomos.js               # Logos Blockchain REST: anchor, verify, tip
│   │   ├── strip.js               # Metadata stripping: PDF, image, DOCX
│   │   └── transport.js           # Tor detection, WebRTC leak check, OpSec
│   └── views/
│       ├── SourceView.jsx         # Submit flow (5 steps)
│       ├── OutletView.jsx         # Outlet inbox + publish pipeline
│       └── ReaderView.jsx         # Browse + verify + tip
│
├── logos-ghostdrop-module/        # Native C++ backend plugin (Logos Basecamp)
│   ├── src/
│   │   ├── CryptoService.cpp/h   # ECIES secp256k1+AES-GCM (OpenSSL)
│   │   ├── StripService.cpp/h    # PDF/image/DOCX metadata stripping (Qt)
│   │   ├── NetworkService.cpp/h  # Logos Storage + Logos Blockchain REST clients
│   │   └── GhostDropCore.cpp/h   # Logos Messaging via Logos kernel IPC
│   ├── ghostdrop_module_plugin.cpp
│   ├── metadata.json
│   └── CMakeLists.txt
│
├── logos-ghostdrop-ui/            # Native QML UI plugin (Logos Basecamp)
│   ├── GhostDropUIComponent.cpp/h # IComponent — creates QQuickWidget
│   ├── GhostDropBridge.cpp/h      # QObject bridge injected as "ghostDrop" in QML
│   ├── src/
│   │   ├── GhostDropRoot.qml      # Root layout: sidebar + nav
│   │   ├── views/
│   │   │   ├── SourceView.qml     # Submit flow (5 steps)
│   │   │   ├── OutletView.qml     # Inbox + publish pipeline
│   │   │   └── ReaderView.qml     # Browse + verify + tip
│   │   └── components/
│   │       └── Components.qml     # GButton, GAlert, HashDisplay, LogTerminal
│   ├── metadata.json
│   └── CMakeLists.txt
│
├── build_and_deploy.sh            # One-shot build + deploy to LogosApp.app
├── package.json
└── README.md
```

---

## 🗺️ Roadmap

- [x] Web app with full Logos stack integration
- [x] WebView wrapper for Logos Basecamp
- [x] Native Qt/QML Logos Basecamp module
- [x] Full installation documentation
- [ ] Logos Messaging routing through Logos Mixnet (AnonComms) for IP metadata privacy
- [ ] Outlet keystore — encrypted local keystore for outlet private key management
- [ ] Logos Storage marketplace incentives — paid storage for long-term replication
- [ ] Onion bootstrap peers — dedicated `.onion` Logos Messaging nodes for Tor-native routing
- [ ] ZK tip claims — zero-knowledge proof of ephemeral key for anonymous tip withdrawal

---

## 📄 Licence

MIT — see [LICENSE](LICENSE)
