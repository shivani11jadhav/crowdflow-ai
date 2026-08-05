/* ================================================================
   crowdSimulator.js — CrowdFlow AI
   Maintains live in-memory telemetry for 4 stadium gates.
   Randomly mutates metrics every 5 seconds to simulate real
   match-day crowd fluctuations at gate entry points.
   ================================================================ */

// ── Initial state ──────────────────────────────────────────────
const gateState = {
  "Gate-A": { queueLength: 42,  waitTimeMins: 5,  status: "OPEN"   },
  "Gate-B": { queueLength: 180, waitTimeMins: 22, status: "BUSY"   },
  "Gate-C": { queueLength: 95,  waitTimeMins: 11, status: "OPEN"   },
  "Gate-D": { queueLength: 230, waitTimeMins: 28, status: "CRITICAL"},
};

// ── Helpers ────────────────────────────────────────────────────

/**
 * Returns a random integer between min and max (inclusive).
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Derives a human-readable status label from the current queue length.
 */
function deriveStatus(queueLength) {
  if (queueLength <= 60)  return "OPEN";
  if (queueLength <= 140) return "OPEN";
  if (queueLength <= 200) return "BUSY";
  return "CRITICAL";
}

/**
 * Mutate gate metrics slightly to simulate live fluctuation.
 * Queue sizes shift by ±10–30 people and wait times are recalculated
 * at roughly 1 minute per 8 people in queue.
 */
function tickSimulation() {
  for (const gate of Object.keys(gateState)) {
    const current = gateState[gate];

    // Delta between -25 and +30 (slight upward bias to simulate pre-match rush)
    const delta = randInt(-25, 30);
    const newQueue = Math.max(5, Math.min(300, current.queueLength + delta));
    const newWait  = Math.max(1, Math.round(newQueue / 8));
    const newStatus = deriveStatus(newQueue);

    gateState[gate] = {
      queueLength:  newQueue,
      waitTimeMins: newWait,
      status:       newStatus,
    };
  }
}

// ── Start the simulator loop ───────────────────────────────────
let simulatorHandle = null;

/**
 * Starts the background simulation interval.
 * Safe to call multiple times — only one interval will run.
 * @param {Function} [onTick] - Optional callback invoked after each tick
 *                              with the updated state snapshot.
 * @returns {NodeJS.Timeout} The interval handle.
 */
export function startSimulator(onTick) {
  if (simulatorHandle) return simulatorHandle;

  simulatorHandle = setInterval(() => {
    tickSimulation();
    if (typeof onTick === "function") {
      onTick(getCrowdState());
    }
  }, 5000);

  return simulatorHandle;
}

/**
 * Stops the background simulation interval.
 */
export function stopSimulator() {
  if (simulatorHandle) {
    clearInterval(simulatorHandle);
    simulatorHandle = null;
  }
}

/**
 * Returns a deep-cloned snapshot of the current gate state plus
 * a convenience summary object used by the AI agent and REST clients.
 *
 * @returns {{
 *   timestamp: string,
 *   gates: Object.<string, {queueLength: number, waitTimeMins: number, status: string}>,
 *   summary: {
 *     leastCongested: string,
 *     mostCongested: string,
 *     averageWaitMins: number,
 *     totalQueuedPeople: number
 *   }
 * }}
 */
export function getCrowdState() {
  const gatesCopy = structuredClone(gateState);
  const entries   = Object.entries(gatesCopy);

  // Sort ascending by queueLength
  const sorted = [...entries].sort((a, b) => a[1].queueLength - b[1].queueLength);

  const totalQueued    = entries.reduce((s, [, g]) => s + g.queueLength,  0);
  const averageWait    = Math.round(entries.reduce((s, [, g]) => s + g.waitTimeMins, 0) / entries.length);

  return {
    timestamp:  new Date().toISOString(),
    gates:      gatesCopy,
    summary: {
      leastCongested:   sorted[0][0],
      mostCongested:    sorted[sorted.length - 1][0],
      averageWaitMins:  averageWait,
      totalQueuedPeople: totalQueued,
    },
  };
}
