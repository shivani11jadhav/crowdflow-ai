/* ================================================================
   server.js — CrowdFlow AI Backend
   Express + Socket.io server.
   • Broadcasts live gate telemetry every 5 s via WebSocket.
   • Exposes POST /api/ai-assistant for Gemini-powered recommendations.

   Security hardening (this file):
   • express-rate-limit  — 30 req / 1 min per IP on AI endpoint,
                           100 req / 1 min globally.
   • CORS whitelist      — driven by FRONTEND_ORIGIN env var; defaults
                           to localhost:3000 in production-like mode.
   • GEMINI_API_KEY leak guard — key never appears in any response body.
   • Sanitize-before-AI  — sanitizeQuery() called before analyzeCrowdState.
   ================================================================ */

import "dotenv/config";
import express            from "express";
import cors               from "cors";
import { createServer }   from "http";
import { Server }         from "socket.io";
import rateLimit          from "express-rate-limit";
import { startSimulator, getCrowdState } from "./crowdSimulator.js";
import { analyzeCrowdState }             from "./agent.js";
import { sanitizeQuery, SanitizationError } from "./sanitize.js";

// ── Guard: fail fast if critical secrets are missing ───────────
if (!process.env.GEMINI_API_KEY) {
  console.error(
    "[server.js] FATAL: GEMINI_API_KEY is not set. " +
    "Copy .env.example → .env and add your key."
  );
  process.exit(1);
}

// ── Configuration ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// CORS: in production set FRONTEND_ORIGIN to your exact Netlify URL.
// Default falls back to localhost for local dev only.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

// ── Rate limiters ──────────────────────────────────────────────

/**
 * Global limiter — applied to every route.
 * 100 requests per minute per IP.
 */
const globalLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              100,
  standardHeaders:  true,    // Return rate-limit info in RateLimit-* headers
  legacyHeaders:    false,
  message: {
    error:   "Too Many Requests",
    message: "You have exceeded the request limit. Please wait before retrying.",
  },
});

/**
 * Strict limiter — applied only to the AI endpoint.
 * 30 requests per minute per IP to prevent Gemini API abuse.
 */
const aiLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              30,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    error:   "Too Many Requests",
    message: "AI assistant rate limit reached (30 req/min). Please wait a moment.",
  },
});

// ── Express setup ──────────────────────────────────────────────
const app = express();

// Trust proxy headers (needed for correct IP when behind Netlify/Render/Railway)
app.set("trust proxy", 1);

// CORS: explicit whitelist — never wildcard in production
const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (e.g. curl, server-to-server, mobile apps)
    if (!origin) return callback(null, true);
    if (FRONTEND_ORIGIN === "*" || origin === FRONTEND_ORIGIN) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin '${origin}' not allowed.`));
  },
  methods: ["GET", "POST"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "16kb" }));  // Prevent oversized payload attacks
app.use(globalLimiter);

// Remove the default X-Powered-By header to avoid fingerprinting
app.disable("x-powered-by");

// ── HTTP + Socket.io setup ─────────────────────────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN, methods: ["GET", "POST"] },
});

// ── Socket.io connection log ───────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[Socket.io] Client connected   → ${socket.id}`);

  // Send the current state immediately on connection so the client
  // doesn't have to wait up to 5 seconds for the first broadcast.
  socket.emit("stadium-update", getCrowdState());

  socket.on("disconnect", (reason) => {
    console.log(`[Socket.io] Client disconnected ← ${socket.id} (${reason})`);
  });
});

// ── Start crowd simulator — broadcast every tick ───────────────
startSimulator((updatedState) => {
  io.emit("stadium-update", updatedState);
  console.log(
    `[Simulator] Broadcast → leastCongested=${updatedState.summary.leastCongested}` +
    ` | avgWait=${updatedState.summary.averageWaitMins}m` +
    ` | totalQueued=${updatedState.summary.totalQueuedPeople}`
  );
});

// ── REST Routes ────────────────────────────────────────────────

/**
 * GET /health
 * Simple liveness probe — never exposes env vars or internals.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * GET /api/crowd-state
 * Returns the current in-memory crowd telemetry snapshot.
 */
app.get("/api/crowd-state", (_req, res) => {
  res.json(getCrowdState());
});

/**
 * POST /api/ai-assistant
 * Body: { query: string }
 *
 * Pipeline:
 *   1. Validate body shape
 *   2. Sanitize query (prompt injection shield)
 *   3. Fetch fresh telemetry
 *   4. Call Gemini agent
 *   5. Return recommendation — NEVER reflect API key or system internals
 */
app.post("/api/ai-assistant", aiLimiter, async (req, res) => {
  const { query } = req.body ?? {};

  // ── 1. Shape validation ──────────────────────────────────────
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({
      error:   "Bad Request",
      message: "Request body must include a non-empty 'query' string.",
    });
  }

  // ── 2. Prompt injection sanitization ────────────────────────
  let safeQuery;
  try {
    safeQuery = sanitizeQuery(query);
  } catch (err) {
    if (err instanceof SanitizationError) {
      // Log the reason code only (never the raw user input in error paths)
      console.warn(`[Security] Query rejected — ${err.reason}`);
      return res.status(400).json({
        error:   "Bad Request",
        message: "Your query contains disallowed content and could not be processed.",
      });
    }
    throw err; // Unexpected — re-throw so the 502 handler catches it
  }

  console.log(`[AI] Request → "${safeQuery}"`);

  // ── 3. Fetch telemetry ───────────────────────────────────────
  const liveState = getCrowdState();

  // ── 4. Call Gemini ───────────────────────────────────────────
  try {
    const recommendation = await analyzeCrowdState(safeQuery, liveState);

    console.log(
      `[AI] Response → alertLevel=${recommendation.alertLevel}` +
      ` | suggestedGate=${recommendation.suggestedGate}` +
      ` | waitMins=${recommendation.estimatedWaitMins}` +
      ` | emergency=${recommendation.emergencyProtocol}`
    );

    // ── 5. Return — no secrets in the response body ──────────
    return res.json({
      ok:             true,
      query:          safeQuery,   // Return cleaned query, never raw input
      liveState,
      recommendation,
    });
  } catch (err) {
    // Scrub any potential secret leakage from error messages before logging
    const safeMessage = err.message
      ?.replace(/AIza[A-Za-z0-9_-]{35}/g, "[REDACTED]")  // Gemini key pattern
      ?.replace(process.env.GEMINI_API_KEY ?? "__NO_KEY__", "[REDACTED]");

    console.error("[AI] Gemini error:", safeMessage);

    // Never expose raw error details to the client in production
    return res.status(502).json({
      error:   "AI Service Error",
      message: "The AI assistant encountered an error. Please try again.",
      ...(process.env.NODE_ENV === "development" && { detail: safeMessage }),
    });
  }
});

// ── 404 fallback ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// ── Start server ───────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║       CrowdFlow AI — Backend Server          ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  HTTP   → http://localhost:${PORT}               ║`);
  console.log(`║  WS     → ws://localhost:${PORT}                 ║`);
  console.log(`║  CORS   → ${FRONTEND_ORIGIN.padEnd(33)}║`);
  console.log("║  Press Ctrl+C to stop                        ║");
  console.log("╚══════════════════════════════════════════════╝");
});

// ── Graceful shutdown ──────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully…`);
  httpServer.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
