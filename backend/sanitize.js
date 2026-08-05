/* ================================================================
   sanitize.js — CrowdFlow AI
   Prompt injection shield for all user-supplied query strings.

   Defence-in-depth strategy:
     1. Length cap         — truncate before any processing.
     2. Pattern blocklist  — regex patterns that match classic prompt
                             injection payloads, jailbreaks, and role-
                             override attempts.
     3. Control-character  — strip non-printable / zero-width chars
                             used to hide injected instructions.
     4. Output normalise   — collapse whitespace, trim.

   Returns the cleaned string.  Throws SanitizationError (extends
   Error) when the input is rejected outright rather than cleaned —
   the caller must treat this as a 400 Bad Request.
   ================================================================ */

// ── Constants ──────────────────────────────────────────────────

/** Hard ceiling on raw query length (characters). */
const MAX_QUERY_LENGTH = 500;

/**
 * Patterns that reliably signal prompt injection / jailbreak intent.
 * Tested against common LLM attack vectors:
 *   - Role / persona overrides  ("ignore previous", "you are now")
 *   - Instruction delimiter abuse ("[INST]", "###", "<|system|>")
 *   - Data exfiltration attempts  ("print your instructions", "reveal your prompt")
 *   - Markdown / HTML injection   (script tags, embedded links)
 */
const INJECTION_PATTERNS = [
  // Role / instruction overrides
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|rules?)/i,
  /forget\s+(everything|all|your|prior|previous)/i,
  /you\s+are\s+now\s+(a|an|the)\s+/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+/i,
  /pretend\s+(you\s+(are|were)|to\s+be)/i,
  /your\s+new\s+(role|persona|identity|instruction|task|purpose)\s+is/i,
  /disregard\s+(your|all|any|the)\s+(previous|prior|earlier|safety|guidelines?|rules?|instructions?)/i,
  /override\s+(your|all|any|safety|system)\s+(instructions?|rules?|guidelines?|constraints?)/i,
  /override\s+(?:your\s+)?(?:safety|security|ethical|content)\s+/i,
  /new\s+instructions?:/i,
  /system\s*:\s*you\s+are/i,

  // Delimiter injection (model-specific special tokens)
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,
  /###\s*(instruction|system|human|assistant|prompt)/i,
  /<<SYS>>/i,

  // Prompt exfiltration
  /print\s+(your|the)\s+(system\s+)?(prompt|instructions?|context)/i,
  /reveal\s+(your|the)\s+(hidden\s+)?(prompt|instructions?|context|rules?)/i,
  /show\s+me\s+(your|the)\s+(prompt|instructions?)/i,
  /repeat\s+(everything|all|the\s+text)\s+(above|before)/i,
  /what\s+(are|were)\s+your\s+(instructions?|system\s+prompt|rules?)/i,
  /output\s+your\s+(raw\s+)?(prompt|instructions?|context)/i,

  // HTML / script injection
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["']/i,   // onclick=, onerror= etc.

  // Multi-turn manipulation
  /simulate\s+(a\s+)?(conversation|dialogue|chat)\s+where/i,
  /roleplay\s+as/i,
  /in\s+this\s+(hypothetical|fictional|imaginary)\s+(scenario|situation)/i,
];

// ── Custom error ───────────────────────────────────────────────

export class SanitizationError extends Error {
  /**
   * @param {string} reason - Short reason code (no user data, safe to log/return).
   */
  constructor(reason) {
    super(`Query rejected by sanitizer: ${reason}`);
    this.name  = "SanitizationError";
    this.reason = reason;
  }
}

// ── Core sanitizer ─────────────────────────────────────────────

/**
 * Sanitizes a raw user query string before it is forwarded to the
 * Gemini model.  Call this on every value that originates from a
 * client request before it enters the prompt.
 *
 * @param {string} raw - The untrusted user input.
 * @returns {string}   - The cleaned, safe query string.
 * @throws {SanitizationError} - When the query is rejected outright.
 */
export function sanitizeQuery(raw) {
  // ── 1. Type guard ────────────────────────────────────────────
  if (typeof raw !== "string") {
    throw new SanitizationError("INPUT_NOT_STRING");
  }

  // ── 2. Strip non-printable / zero-width / control characters ─
  //    Removes: NUL, BEL, BS, VT, SO, SI, ESC, zero-width spaces,
  //    bidirectional overrides (U+202A–U+202E, U+2066–U+2069),
  //    and other invisible Unicode tricks.
  let cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")   // C0 controls (keep \t \n \r)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "") // zero-width + bidi
    .replace(/[\u2066-\u2069]/g, "");                                 // bidi isolates

  // ── 3. Length cap (after stripping) ──────────────────────────
  if (cleaned.length > MAX_QUERY_LENGTH) {
    cleaned = cleaned.slice(0, MAX_QUERY_LENGTH);
  }

  // ── 4. Blank check ───────────────────────────────────────────
  const trimmed = cleaned.trim();
  if (trimmed.length === 0) {
    throw new SanitizationError("EMPTY_AFTER_CLEAN");
  }

  // ── 5. Injection pattern match ───────────────────────────────
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new SanitizationError("INJECTION_PATTERN_DETECTED");
    }
  }

  // ── 6. Collapse excessive whitespace ─────────────────────────
  return trimmed.replace(/\s{3,}/g, "  ");
}
