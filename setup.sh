#!/bin/bash
set -e

echo "👻 GhostDrop Setup"
echo "=================="

# Check Node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org (v18+)"
  exit 1
fi

NODE_VER=$(node -v | cut -c2- | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js v18+ required (found $(node -v))"
  exit 1
fi

echo "✓ Node $(node -v)"

# Install deps
echo "→ Installing dependencies..."
npm install

# Copy env
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✓ Created .env.local (edit to point at your nodes)"
fi

echo ""
echo "✅ Ready! Run:  npm run dev"
echo ""
echo "📡 Optional — connect real nodes:"
echo "   Codex: docker run -p 8080:8080 codexstorage/nim-codex"
echo "   Nomos: cd testnet && docker compose up  (in nomos-node repo)"
echo ""
echo "🧅 For maximum anonymity: open http://localhost:3000 in Tor Browser"
