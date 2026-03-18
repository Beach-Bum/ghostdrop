# GhostDrop — Claude Code Configuration
## Project
Decentralised whistleblower platform built on the Logos stack.
- Web app: React/Vite in `src/`
- Native Logos Basecamp module: `logos-ghostdrop-module/` (C++) + `logos-ghostdrop-ui/` (QML)
- Build: `./build_and_deploy.sh` deploys to `/Applications/LogosApp.app`
- Dev server: `npm run dev`
## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /review, /ship, /browse, /qa, /qa-only, /qa-design-review,
/setup-browser-cookies, /retro, /document-release.
If gstack skills aren't working, run: cd ~/.claude/skills/gstack && ./setup
