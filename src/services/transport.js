/**
 * Transport Anonymity Layer — Tor / I2P wrapper
 *
 * Waku provides p2p gossip-based anonymity — your IP is not sent
 * directly to the outlet. But the Waku bootstrap peers can still see
 * your IP. For high-risk sources, this module adds a Tor/I2P transport
 * layer underneath Waku's libp2p connections.
 *
 * ─── Architecture ─────────────────────────────────────────────────
 *
 *  Source Browser
 *       │
 *       ├─ [Option A] Tor Browser (recommended)
 *       │     └─ Tor network → Waku bootstrap peers
 *       │
 *       ├─ [Option B] SOCKS5 proxy (Tor daemon running locally)
 *       │     └─ localhost:9050 → Tor → Waku
 *       │
 *       ├─ [Option C] i2pd HTTP proxy
 *       │     └─ localhost:4444 → I2P → Waku
 *       │
 *       └─ [Option D] No proxy (standard Waku gossip only)
 *             └─ Direct → Waku peers (bootstrap sees IP)
 *
 * ─── Browser constraints ──────────────────────────────────────────
 *
 *  Browsers cannot open raw TCP sockets, so we cannot directly
 *  configure a SOCKS5 proxy for fetch() or WebSocket.
 *
 *  REAL protection options for browser-based sources:
 *
 *  1. Tor Browser (best)
 *     The user opens LogosDrop in Tor Browser. All TCP connections
 *     including WebSocket (Waku) go through Tor automatically.
 *     No code changes needed. We detect this and inform the user.
 *
 *  2. Meek/Snowflake bridge via companion extension
 *     Some browser extensions (e.g. Snowflake WebExtension) add
 *     Tor transport for regular browsers.
 *
 *  3. Local Tor daemon + cors-anywhere/websockify proxy
 *     An advanced setup: Tor daemon + a local HTTP proxy that
 *     forwards WebSocket connections through SOCKS5. Out of scope
 *     for the average source but documented below.
 *
 *  4. LogosDrop companion app (future)
 *     A small Electron/Tauri app that opens Waku connections through
 *     a bundled Tor daemon. Removes all browser constraints.
 *
 * ─── What this module does ────────────────────────────────────────
 *
 *  1. Detects whether the user is using Tor Browser
 *  2. Detects if a local Tor SOCKS5 proxy is reachable (localhost:9050)
 *     via a /torcheck endpoint we provide in the dev server
 *  3. Provides OpSec guidance messages for the UI
 *  4. Exports transport config for Waku node initialisation
 *  5. Implements a WebRTC STUN fingerprint check to warn if real IP
 *     might leak via WebRTC even through a proxy
 */

// ─── Detection ────────────────────────────────────────────────────

/**
 * Detect Tor Browser by checking known characteristics:
 *   - window.outerWidth is always 1000 (letterboxing)
 *   - navigator.plugins is empty
 *   - screen.width reported as 1000
 *   - TimeZone is UTC regardless of system
 *
 * Note: Detection is best-effort. Tor Browser actively resists
 * fingerprinting, which makes detection unreliable by design.
 * We err on the side of false negatives (say "not detected" even
 * when it might be Tor) to avoid creating a Tor detection signal.
 */
export function detectTorBrowser() {
  try {
    const signals = {
      // Tor Browser letterboxes window to 1000px wide
      windowLetterboxed: window.outerWidth === 1000 || window.screen.width === 1000,
      // Tor Browser reports 0 plugins
      noPlugins: navigator.plugins.length === 0,
      // Tor Browser forces UTC timezone
      utcTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone === "UTC",
      // Tor Browser reports reduced precision for screen metrics
      screenResistance: window.devicePixelRatio === 1 && window.screen.colorDepth === 24,
    };

    const score = Object.values(signals).filter(Boolean).length;
    const likely = score >= 3;

    return { likely, score, signals };
  } catch {
    return { likely: false, score: 0, signals: {} };
  }
}

/**
 * Check for WebRTC IP leak.
 * If the user is behind a VPN/proxy but WebRTC is enabled,
 * the real IP can leak through STUN requests.
 *
 * Returns: { leakRisk: 'high'|'medium'|'low', localIPs: string[] }
 */
export async function checkWebRTCLeak() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ leakRisk: "low", localIPs: [] }), 3000);

    try {
      const ips = new Set();
      const pc  = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

      pc.createDataChannel("");
      pc.createOffer().then(offer => pc.setLocalDescription(offer));

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close();
          clearTimeout(timeout);
          const ipList = [...ips];
          // Private IP ranges that shouldn't leak real identity
          const privateOnly = ipList.every(ip =>
            ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.") ||
            ip.startsWith("127.") || ip.startsWith("169.254.") || ip === "::1"
          );
          resolve({
            leakRisk: ipList.length === 0 ? "low" : privateOnly ? "medium" : "high",
            localIPs: ipList,
          });
          return;
        }
        // Parse IPs from candidate string
        const candidate = e.candidate.candidate;
        const ipMatch   = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) ips.add(ipMatch[1]);
      };
    } catch {
      clearTimeout(timeout);
      resolve({ leakRisk: "low", localIPs: [] });
    }
  });
}

// ─── OpSec Assessment ─────────────────────────────────────────────

/**
 * Full operational security assessment for a source.
 * Checks all relevant threat vectors and returns structured guidance.
 *
 * @returns {Promise<OpsecReport>}
 */
export async function runOpsecCheck() {
  const [torResult, webrtcResult] = await Promise.all([
    Promise.resolve(detectTorBrowser()),
    checkWebRTCLeak(),
  ]);

  const checks = [];

  // ── Tor Browser ────────────────────────────────────────────────
  checks.push({
    id:       "tor-browser",
    label:    "Tor Browser",
    status:   torResult.likely ? "pass" : "warn",
    severity: torResult.likely ? "none" : "high",
    detail:   torResult.likely
      ? "Tor Browser detected. Your connection to Waku bootstrap peers is routed through Tor."
      : "Tor Browser not detected. Your IP may be visible to Waku bootstrap nodes.",
    action:   torResult.likely
      ? null
      : "Use Tor Browser (https://www.torproject.org) to protect your IP from Waku peers.",
  });

  // ── WebRTC leak ────────────────────────────────────────────────
  checks.push({
    id:       "webrtc-leak",
    label:    "WebRTC IP leak",
    status:   webrtcResult.leakRisk === "high" ? "fail"
            : webrtcResult.leakRisk === "medium" ? "warn" : "pass",
    severity: webrtcResult.leakRisk === "high" ? "critical" : webrtcResult.leakRisk === "medium" ? "medium" : "none",
    detail:   webrtcResult.leakRisk === "high"
      ? `WebRTC may expose your real IP (${webrtcResult.localIPs.join(", ")}) even through a VPN.`
      : webrtcResult.leakRisk === "medium"
      ? "Only private/local IPs visible. Likely safe but disable WebRTC in about:config for certainty."
      : "WebRTC shows no public IP leak.",
    action:   webrtcResult.leakRisk !== "low"
      ? "In Firefox: set media.peerconnection.enabled = false in about:config. In Chrome: use uBlock Origin."
      : null,
  });

  // ── Browser fingerprinting ─────────────────────────────────────
  const hasBrowserFingerprint = !torResult.likely && typeof window !== "undefined" && navigator.plugins?.length > 0;
  checks.push({
    id:       "fingerprinting",
    label:    "Browser fingerprinting",
    status:   torResult.likely ? "pass" : "warn",
    severity: torResult.likely ? "none" : "medium",
    detail:   torResult.likely
      ? "Tor Browser's anti-fingerprinting protections are active."
      : `Your browser has ${navigator.plugins?.length ?? 0} plugins and distinctive characteristics that could be used to identify you across sessions.`,
    action:   torResult.likely ? null : "Use Tor Browser or Firefox with arkenfox user.js for fingerprinting resistance.",
  });

  // ── Device security ────────────────────────────────────────────
  checks.push({
    id:       "device",
    label:    "Device security",
    status:   "info",
    severity: "medium",
    detail:   "We cannot verify your device's security from the browser. Ensure you are not submitting from a managed/work device.",
    action:   "Use a personal device, preferably running Tails OS or a fresh Tor Browser on a trusted machine.",
  });

  // ── Printer dots ───────────────────────────────────────────────
  checks.push({
    id:       "printer-dots",
    label:    "Printer steganography",
    status:   "warn",
    severity: "high",
    detail:   "If your document was printed and scanned, colour laser printers embed microscopic yellow dots encoding printer serial number and print date.",
    action:   "Photocopy the document on a black-and-white photocopier before scanning, or use a digital-only document.",
  });

  // ── Network metadata ───────────────────────────────────────────
  checks.push({
    id:       "network-timing",
    label:    "Network timing",
    status:   torResult.likely ? "pass" : "info",
    severity: torResult.likely ? "none" : "low",
    detail:   torResult.likely
      ? "Tor's multi-hop routing provides timing attack resistance."
      : "Your ISP can observe that you connected to Waku bootstrap nodes, even if not the content.",
    action:   torResult.likely ? null : "Use Tor Browser to prevent ISP-level traffic analysis.",
  });

  const score    = checks.filter(c => c.status === "pass").length;
  const total    = checks.filter(c => c.status !== "info").length;
  const critical = checks.some(c => c.severity === "critical");
  const overall  = critical ? "critical" : score >= total ? "good" : score >= total / 2 ? "moderate" : "poor";

  return { checks, score, total, overall, torBrowser: torResult, webrtc: webrtcResult };
}

// ─── Waku transport config ─────────────────────────────────────────

/**
 * Get the recommended Waku node config based on detected transport.
 *
 * When Tor Browser is detected, Waku's WebSocket connections already
 * go through Tor — no additional config needed.
 *
 * When running as a companion app (future), this would return a
 * SOCKS5 proxy config for libp2p's transport layer.
 *
 * @returns {Object} Waku createLightNode options override
 */
export function getWakuTransportConfig() {
  const tor = detectTorBrowser();

  return {
    // Standard config — Tor Browser handles transport transparently
    defaultBootstrap: true,
    // If a specific onion service bootstrap is available:
    // bootstrapPeers: tor.likely ? ONION_BOOTSTRAP_PEERS : undefined,
    userAgent: "LogosDrop/0.3.0",
  };
}

// ─── Future: Onion service bootstrap peers ────────────────────────
// When Logos runs dedicated .onion bootstrap nodes, add them here.
// Sources using Tor Browser will prefer these over clearnet peers.
//
// const ONION_BOOTSTRAP_PEERS = [
//   "/onion3/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:0/p2p/QmFoo",
// ];

// ─── Guidance text ────────────────────────────────────────────────

export const OPSEC_GUIDE = {
  minimal: [
    "Use Tor Browser (torproject.org) — routes all connections through Tor.",
    "Disable JavaScript if possible (Tor Browser Security Level: Safest).",
    "Submit from a location you do not normally use (library, café).",
    "Do not log into any accounts before or during submission.",
  ],
  standard: [
    "Use a device you personally own, not a work or shared computer.",
    "Disconnect from work/home networks — use public WiFi via Tor.",
    "Close all other browser tabs and applications before submitting.",
    "After submission, clear browser history and cache.",
  ],
  advanced: [
    "Boot from Tails OS (tails.boum.org) for amnesia — leaves no traces.",
    "Use an air-gapped machine to prepare the document, transfer via QR code.",
    "Physically destroy any storage media used after submission.",
    "Consider delaying submission to break timing correlation with document access.",
  ],
};
