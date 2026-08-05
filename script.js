/* ============================================================
   CrowdFlow AI — script.js
   Tab switching · Crowd Map · Wait Times · Smart Alerts
   AI Assistant — connected to Node.js backend via:
     • Socket.io  → real-time crowd telemetry (stadium-update)
     • fetch POST → /api/ai-assistant  (Gemini structured JSON)
   ============================================================ */
"use strict";

/* ── BACKEND URL ─────────────────────────────────────────── */
const BACKEND = "http://localhost:3001";

/* ================================================================
   1. TAB SWITCHING
   ================================================================ */
function switchTab(id, btn) {
  // Hide all panels
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  // Deactivate all nav-tab buttons (navbar) and legacy .tab buttons
  document.querySelectorAll(".nav-tab, .tab").forEach(b => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  // Show target panel
  document.getElementById("tab-" + id).classList.add("active");
  // Activate clicked button
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");
}

/* ================================================================
   2. CROWD MAP — helpers + manual refresh
   ================================================================ */

/**
 * Gate config: maps each backend gate key to the DOM ids that
 * control its zone card fill bar, percentage label, status badge,
 * status text, recommendation text, and the card wrapper itself.
 *
 * fill ids  → g1fill / g2fill / fcfill / parfill (existing)
 * pct  ids  → g1pct  / g2pct  / fcpct  / parpct  (existing)
 * badge/status/rec ids added to index.html (zbadge-Gate-X etc.)
 */
const GATE_CARD_MAP = {
  "Gate-A": { fillId: "g1fill", pctId: "g1pct",  waitId: "wg1"   },
  "Gate-B": { fillId: "g2fill", pctId: "g2pct",  waitId: "wg2"   },
  "Gate-C": { fillId: "fcfill", pctId: "fcpct",  waitId: "wfc"   },
  "Gate-D": { fillId: "parfill",pctId: "parpct", waitId: null     },
};

/** Simulator max queue length — used to compute a 0-100 % fill. */
const MAX_QUEUE = 300;

/**
 * Returns CSS variable and label text for a given gate status.
 */
function statusStyle(status) {
  switch (status) {
    case "CRITICAL": return { color: "var(--red)",   label: "Critical — avoid", badgeClass: "red-zbadge",   cardClass: "red-zcard",   gcCard: "gate-card gc-red",   gcSt: "gc-status gcst-red"   };
    case "BUSY":     return { color: "var(--red)",   label: "High congestion",  badgeClass: "red-zbadge",   cardClass: "red-zcard",   gcCard: "gate-card gc-red",   gcSt: "gc-status gcst-red"   };
    case "OPEN":     return { color: "var(--green)", label: "Low congestion",   badgeClass: "green-zbadge", cardClass: "green-zcard", gcCard: "gate-card gc-green", gcSt: "gc-status gcst-green" };
    default:         return { color: "var(--amber)", label: "Moderate crowd",   badgeClass: "amber-zbadge", cardClass: "amber-zcard", gcCard: "gate-card gc-amber", gcSt: "gc-status gcst-amber" };
  }
}

/**
 * Updates a single gate's zone card, fill bar, and wait-time row
 * from a live gate data object coming from the backend.
 *
 * @param {string} gateName   - e.g. "Gate-A"
 * @param {{ queueLength: number, waitTimeMins: number, status: string }} data
 */
function updateGateCard(gateName, data) {
  const map = GATE_CARD_MAP[gateName];
  if (!map) return;

  const pct        = Math.round((data.queueLength / MAX_QUEUE) * 100);
  const style      = statusStyle(data.status);

  // ── Fill bar + percentage label ──────────────────────────────
  const fillEl = document.getElementById(map.fillId);
  const pctEl  = document.getElementById(map.pctId);
  if (fillEl) fillEl.style.width = pct + "%";
  if (pctEl)  pctEl.textContent  = pct + "%";

  // ── Zone card colour class (new gate-card or legacy zcard) ───
  const card = document.getElementById("zcard-" + gateName);
  if (card) {
    card.className = card.classList.contains("gate-card")
      ? style.gcCard
      : "zcard " + style.cardClass;
  }

  // ── Status badge text + colour class ─────────────────────────
  const badge = document.getElementById("zbadge-" + gateName);
  if (badge) {
    badge.textContent = data.status;
    const isGcBadge  = badge.classList.contains("gc-badge");
    const gcMap = { "red-zbadge": "gc-badge-red", "green-zbadge": "gc-badge-green", "amber-zbadge": "gc-badge-amber" };
    badge.className   = isGcBadge
      ? "gc-badge " + (gcMap[style.badgeClass] || "gc-badge-green")
      : "zbadge " + style.badgeClass;
  }

  // ── Status description text ───────────────────────────────────
  const statusEl = document.getElementById("zstatus-" + gateName);
  if (statusEl) {
    statusEl.textContent = style.label;
    if (statusEl.classList.contains("gc-status")) {
      statusEl.className = style.gcSt;
    } else {
      statusEl.style.color = style.color;
    }
  }

  // ── Recommendation text ───────────────────────────────────────
  const recEl = document.getElementById("zrec-" + gateName);
  if (recEl) {
    recEl.textContent = data.waitTimeMins + " min wait";
  }

  // ── Wait Times panel ──────────────────────────────────────────
  if (map.waitId) {
    const waitEl = document.getElementById(map.waitId);
    if (waitEl) waitEl.textContent = data.waitTimeMins;
  }
}

/**
 * Updates all summary hero stats from the state snapshot.
 */
function updateHeroStats(state) {
  const total = state.summary.totalQueuedPeople;
  const hero  = document.getElementById("heroAttendees");
  if (hero) hero.textContent = total.toLocaleString();

  // Update header attendee count
  const hstat = document.querySelector(".hstat-val");
  if (hstat) hstat.textContent = total.toLocaleString();

  // Update best-wait-time stat in hero strip
  const waitEls = document.querySelectorAll(".sstat-num");
  // 3rd .sstat-num is "Best Wait Time"
  if (waitEls[2]) {
    waitEls[2].textContent = state.summary.averageWaitMins + " min";
  }
}

/**
 * Manual refresh: applies random mock values when backend is offline.
 * When the Socket.io connection is live this is effectively a no-op
 * visual refresh since the live values just re-render.
 */
function refreshMap() {
  const zones = [
    { fill: "g1fill", pct: "g1pct",  min: 10, max: 35 },
    { fill: "g2fill", pct: "g2pct",  min: 65, max: 95 },
    { fill: "fcfill", pct: "fcpct",  min: 40, max: 70 },
    { fill: "parfill",pct: "parpct", min: 20, max: 50 },
  ];
  zones.forEach(z => {
    const val    = Math.floor(Math.random() * (z.max - z.min + 1)) + z.min;
    const fillEl = document.getElementById(z.fill);
    const pctEl  = document.getElementById(z.pct);
    if (fillEl) fillEl.style.width = val + "%";
    if (pctEl)  pctEl.textContent  = val + "%";
  });
  showToast("Crowd data refreshed!");
}

/* ================================================================
   3. WAIT TIMES — manual refresh (fallback when backend offline)
   ================================================================ */
function refreshWait() {
  const times = [
    { id: "wg1",   min: 2,  max: 10 },
    { id: "wg2",   min: 15, max: 30 },
    { id: "wfc",   min: 5,  max: 18 },
    { id: "wrest", min: 1,  max: 4  },
    { id: "wmerch",min: 5,  max: 15 },
    { id: "wtkt",  min: 2,  max: 8  },
  ];
  times.forEach(t => {
    const el = document.getElementById(t.id);
    if (el) el.textContent = Math.floor(Math.random() * (t.max - t.min + 1)) + t.min;
  });
  showToast("Wait times updated!");
}

/* ================================================================
   4. SMART ALERTS
   ================================================================ */
const heroAlerts = [
  "Gate B is getting heavily congested — switch to Gate A now for faster entry.",
  "Food court rush detected on Level 2. Best to visit in 15–20 minutes.",
  "Excellent time to enter! Gate A is clear with only a 5-minute estimated wait.",
  "Avoid Gate D near South entrance — crowd density is critical. Gate A is your best option.",
  "Parking Lot A is filling up fast. Consider alternate lot via the east road.",
  "Restrooms on Level 3 are fully clear. No wait expected across all sections.",
  "Merchandise stall queue has reduced significantly. Great opportunity to pick up gear!",
];

function generateAlert() {
  const msg = heroAlerts[Math.floor(Math.random() * heroAlerts.length)];
  const el  = document.getElementById("alertHeroMsg");
  if (!el) return;
  el.style.opacity = "0";
  setTimeout(() => {
    el.textContent        = msg;
    el.style.transition   = "opacity 0.3s";
    el.style.opacity      = "1";
  }, 200);
}

function addAlert(type, title, desc, timestamp) {
  const feed = document.getElementById("alertFeed");
  if (!feed) return;

  const colors = {
    green: { dot: "#22c55e", border: "rgba(34,197,94,0.4)"  },
    red:   { dot: "#ef4444", border: "rgba(239,68,68,0.4)"  },
    amber: { dot: "#f59e0b", border: "rgba(245,158,11,0.4)" },
  };
  const c = colors[type] || colors.green;

  const item = document.createElement("div");
  item.className      = "afeed-item";
  item.style.borderLeft = "3px solid " + c.border;
  item.innerHTML = `
    <div class="afeed-dot" style="background:${c.dot}"></div>
    <div class="afeed-body">
      <div class="afeed-title">${title}</div>
      <div class="afeed-desc">${desc}</div>
    </div>
    <div class="afeed-time">${timestamp || "Just now"}</div>
  `;
  feed.insertBefore(item, feed.firstChild);

  /* Bump older timestamps */
  feed.querySelectorAll(".afeed-time").forEach((t, i) => {
    if (i === 0) return;
    t.textContent = (i * 3) + " min ago";
  });
}

/* ================================================================
   5. SOCKET.IO — real-time crowd telemetry
   ================================================================ */

/**
 * Sets the header LIVE pill to reflect connection state.
 * @param {"connected"|"disconnected"|"connecting"} state
 */
function setConnectionStatus(state) {
  const pill = document.getElementById("connPill");
  if (!pill) return;

  pill.className = "live-pill conn-" + state;

  const labels = {
    connected:    '<span class="pulse"></span>LIVE',
    disconnected: '<span class="pulse pulse-off"></span>OFFLINE',
    connecting:   '<span class="pulse pulse-amber"></span>CONNECTING',
  };
  pill.innerHTML = labels[state] || labels.connecting;
}

// Only attempt Socket.io if the library loaded (backend is running)
if (typeof io !== "undefined") {
  setConnectionStatus("connecting");

  const socket = io(BACKEND, {
    transports:       ["websocket", "polling"],
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
  });

  socket.on("connect", () => {
    setConnectionStatus("connected");
    showToast("Connected to live backend ✓");
  });

  socket.on("disconnect", () => {
    setConnectionStatus("disconnected");
    showToast("Backend disconnected — showing last known data");
  });

  socket.on("connect_error", () => {
    setConnectionStatus("disconnected");
  });

  /**
   * stadium-update — fired by the backend every 5 s.
   * Payload shape:
   * {
   *   timestamp: string,
   *   gates: {
   *     "Gate-A": { queueLength, waitTimeMins, status },
   *     "Gate-B": { ... }, "Gate-C": { ... }, "Gate-D": { ... }
   *   },
   *   summary: { leastCongested, mostCongested, averageWaitMins, totalQueuedPeople }
   * }
   */
  socket.on("stadium-update", (data) => {
    // Update every gate card
    for (const [gateName, gateData] of Object.entries(data.gates)) {
      updateGateCard(gateName, gateData);
    }

    // Update hero summary strip
    updateHeroStats(data);

    // Push a live alert to the alerts feed for critical gates
    for (const [gateName, gateData] of Object.entries(data.gates)) {
      if (gateData.status === "CRITICAL") {
        addAlert(
          "red",
          gateName + " — Critical Congestion",
          gateData.queueLength + " people queued · " + gateData.waitTimeMins + " min wait · redirect advised",
          "Just now"
        );
      }
    }
  });

} else {
  // Socket.io script failed to load (backend not running)
  setConnectionStatus("disconnected");
  console.warn("[CrowdFlow] Socket.io unavailable — backend may be offline.");
}

/* ================================================================
   6. AI ASSISTANT — Gemini API via backend
   ================================================================ */

/**
 * Renders the structured Gemini recommendation card below the
 * AI Assistant panel header.
 *
 * @param {{
 *   suggestedGate:     string,
 *   estimatedWaitMins: number,
 *   alertLevel:        "LOW"|"MODERATE"|"CRITICAL",
 *   actionRequired:    string,
 *   emergencyProtocol: boolean
 * }} rec
 */
function renderResponseCard(rec) {
  const card = document.getElementById("aiResponseCard");
  if (!card) return;

  // ── Alert level badge ─────────────────────────────────────────
  const alertBadge = document.getElementById("aiAlertBadge");
  if (alertBadge) {
    alertBadge.textContent  = rec.alertLevel;
    alertBadge.className    = "airc-alert-badge airc-alert-" + rec.alertLevel.toLowerCase();
  }

  // ── Suggested gate ────────────────────────────────────────────
  const gateEl = document.getElementById("aiSuggestedGate");
  if (gateEl) gateEl.textContent = rec.suggestedGate;

  // ── Estimated wait ────────────────────────────────────────────
  const waitEl = document.getElementById("aiEstWait");
  if (waitEl) waitEl.textContent = rec.estimatedWaitMins + " min";

  // ── Action required ───────────────────────────────────────────
  const actionEl = document.getElementById("aiAction");
  if (actionEl) {
    const actionLabels = {
      NONE:                "No action needed",
      REROUTE_TRAFFIC:     "Reroute traffic",
      OPEN_EMERGENCY_EXIT: "Open emergency exit",
    };
    actionEl.textContent = actionLabels[rec.actionRequired] || rec.actionRequired;
  }

  // ── Emergency protocol banner (inline, inside AI card) ───────
  const emergEl = document.getElementById("aiEmergency");
  if (emergEl) {
    emergEl.style.display = rec.emergencyProtocol ? "flex" : "none";
  }

  // ── Full-page strobe banner (top of viewport) ─────────────────
  const strobeBanner = document.getElementById("emergencyBanner");
  if (strobeBanner) {
    if (rec.emergencyProtocol) {
      const msg = document.getElementById("emergencyBannerMsg");
      if (msg) {
        msg.textContent =
          "⚠ EMERGENCY PROTOCOL ACTIVE — Gate " + rec.suggestedGate +
          " recommended. Estimated wait: " + rec.estimatedWaitMins +
          " min. Follow security instructions immediately.";
      }
      strobeBanner.style.display = "block";
    }
    // Do NOT auto-hide — user must dismiss with ✕ button
  }

  // Show the recommendation card (starts hidden)
  card.style.display = "block";
}

/** Adds a message bubble to the chat window. */
function addChatMessage(text, role) {
  const win = document.getElementById("chatWindow");
  if (!win) return;

  const wrap   = document.createElement("div");
  wrap.className = "cmsg " + role + "-cmsg";

  const ava  = document.createElement("div");
  ava.className = "cava " + role + "-cava";
  ava.textContent = role === "bot" ? "AI" : "ME";

  const bubble = document.createElement("div");
  bubble.className = "cbubble " + role + "-cbubble";
  bubble.innerHTML = text.replace(/\n/g, "<br/>");

  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  win.appendChild(wrap);
  win.scrollTop = win.scrollHeight;

  return wrap; // returned so the caller can remove a typing indicator
}

/**
 * Sends the user query to the backend Gemini endpoint.
 * Falls back to the local KB on network / API error.
 */
async function sendAI() {
  const input = document.getElementById("aiInput");
  const text  = input ? input.value.trim() : "";
  if (!text) return;

  addChatMessage(text, "user");
  if (input) input.value = "";

  // Hide quick-chips after the first real message
  const chips = document.getElementById("qchips");
  if (chips) chips.style.display = "none";

  // ── Typing indicator ─────────────────────────────────────────
  const typingEl = addChatMessage("…", "bot");
  typingEl && typingEl.querySelector(".cbubble").classList.add("typing-bubble");

  // ── Update panel badge ────────────────────────────────────────
  const badge = document.getElementById("aiPanelBadge");
  if (badge) badge.textContent = "Thinking…";

  try {
    const res = await fetch(BACKEND + "/api/ai-assistant", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query: text }),
    });

    // Remove typing indicator
    if (typingEl && typingEl.parentNode) typingEl.remove();

    if (!res.ok) {
      // Rate-limited or server error — fall through to KB
      throw new Error("HTTP " + res.status);
    }

    const json = await res.json();
    const rec  = json.recommendation;

    // ── Display Gemini userMessage in chat ────────────────────
    addChatMessage(rec.userMessage, "bot");

    // ── Render structured response card ───────────────────────
    renderResponseCard(rec);

    // ── Update panel badge with alert level ───────────────────
    if (badge) badge.textContent = "Alert: " + rec.alertLevel;

    // ── If emergency, also inject a critical alert feed item ──
    if (rec.emergencyProtocol) {
      addAlert(
        "red",
        "🚨 Emergency Protocol Active",
        "Proceed to " + rec.suggestedGate + " immediately. Follow security instructions.",
        "Just now"
      );
    }

  } catch (err) {
    // Remove typing indicator if still present
    if (typingEl && typingEl.parentNode) typingEl.remove();

    // Fall back to local KB
    addChatMessage(getAIReply(text), "bot");

    if (badge) badge.textContent = "CrowdFlow Intelligence";

    console.warn("[CrowdFlow] Backend AI unavailable, used local KB:", err.message);
  }
}

/** Called by quick-chip buttons */
function quickAsk(text) {
  const input = document.getElementById("aiInput");
  if (input) input.value = text;
  sendAI();
}

/* ================================================================
   7. LOCAL KNOWLEDGE BASE (fallback when backend is offline)
   ================================================================ */
const KB = [
  {
    keys: ["least crowd","least congested","less crowd","best gate","which gate","recommend","gate a","north entrance","fast entry","quick entry"],
    reply: "Gate A (North Entrance) is typically your best option — low capacity with a short estimated wait. Head there for the fastest entry! ✅",
  },
  {
    keys: ["gate b","south entrance","busy gate","crowded gate","avoid gate"],
    reply: "Gate B (South Entrance) tends to get heavily congested — expect a longer wait. I strongly recommend using Gate A instead. 🔴",
  },
  {
    keys: ["food","eat","stall","snack","drink","hungry","restaurant","court","meal","lunch","dinner"],
    reply: "The Food Court on Level 2 has about a 10-minute wait right now (moderate crowd). For faster service, try visiting in 15–20 minutes when the peak rush eases. 🍽️",
  },
  {
    keys: ["park","car","lot","vehicle","drive","parking"],
    reply: "Parking Lot A (near Gate A) is your best bet — only 35% full and very accessible. 🅿️",
  },
  {
    keys: ["toilet","restroom","bathroom","wc","washroom","loo"],
    reply: "All restrooms across every level are clear right now — roughly 2-minute wait or less. 🚻",
  },
  {
    keys: ["exit","leave","out","end of event","after event","go home"],
    reply: "For post-event exit, use Gate A (North) — it clears fastest. Plan to leave 5 minutes early if possible! 🚪",
  },
  {
    keys: ["merchandise","merch","shop","store","buy","souvenir","gear","t-shirt"],
    reply: "The Merchandise Stall currently has about an 8-minute wait (moderate). 🛒",
  },
  {
    keys: ["ticket","ticketing","counter","pass","entry pass"],
    reply: "The Ticketing Counter has a very short wait right now — low crowd and fast processing. 🎫",
  },
  {
    keys: ["capacity","how many","total","attendee","crowd overall","venue","overall"],
    reply: "Overall crowd levels are manageable with Gate A being the least congested area. 📊",
  },
  {
    keys: ["emergency","help","danger","security","lost","medical","first aid","accident"],
    reply: "For emergencies, contact venue security immediately! First Aid stations are at Gate A and Gate B. Security staff in blue vests are stationed across all zones. 🚨",
  },
  {
    keys: ["wifi","internet","network","connectivity","signal"],
    reply: 'Free venue WiFi available! Connect to "StadiumGuest" — no password needed. 📶',
  },
  {
    keys: ["hi","hello","hey","hola","namaste","sup","good morning","good afternoon"],
    reply: "Hey! Welcome to CrowdFlow AI 🏟️ Ask me about gates, wait times, parking, food, exits, or emergency help!",
  },
  {
    keys: ["thank","thanks","thx","great","helpful","nice","good job","awesome"],
    reply: "Happy to help! Enjoy the event! 🎉",
  },
];

function getAIReply(input) {
  const q = input.toLowerCase().trim();
  for (const entry of KB) {
    if (entry.keys.some(k => q.includes(k))) return entry.reply;
  }
  return "I'm not sure about that one! Try asking me about: gates & entry, wait times, parking, food, restrooms, exits, or emergency help. 😊";
}

/* ================================================================
   8. TOAST NOTIFICATION
   ================================================================ */
function showToast(msg) {
  const existing = document.getElementById("cfToast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id    = "cfToast";
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:#10141c; color:#eef0f7;
    border:1px solid rgba(255,255,255,0.13);
    font-family:'DM Sans',sans-serif; font-size:13px;
    padding:10px 20px; border-radius:99px;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    z-index:9999; animation:fadeUp 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

/* ================================================================
   9. AUTO-REFRESH NUDGE (every 45 s — only when backend offline)
   Silently skipped when Socket.io is delivering live values.
   ================================================================ */
setInterval(() => {
  // Only nudge if the pill is NOT showing "connected" (backend online)
  const pill = document.getElementById("connPill");
  if (pill && pill.classList.contains("conn-connected")) return;

  const liveFields = ["wg1","wg2","wfc","wrest","wmerch","wtkt"];
  liveFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent, 10) || 5;
    const delta   = Math.floor(Math.random() * 3) - 1;
    el.textContent = Math.max(1, current + delta);
  });
}, 45000);

/* ================================================================
   10. KEYBOARD SHORTCUT — Ctrl+K focuses the AI input
   ================================================================ */
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    const aiTab = document.querySelector("[onclick*=\"'ai'\"], [onclick*=\"ai,\"]")
      || document.querySelector("#navtab-ai");
    if (aiTab) aiTab.click();
    setTimeout(() => {
      const inp = document.getElementById("aiInput");
      if (inp) inp.focus();
    }, 100);
  }
});
