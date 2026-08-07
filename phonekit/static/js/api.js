// fetch wrapper for the backend. Same-origin: the Flask app serves both UI and API.
// Identity is carried in the Authorization header as a dummy bearer token (the
// stable user id), per docs/specs.md — not in the request body.

import { state } from "./state.js";

// The run id every action carries, so the trace panel can watch the work while
// it happens (see traceSince). It is the only thing tying the two requests
// together — the request that does the work, and the one that watches it.
const RUN_ID_HEADER = "X-Run-Id";

export async function recommend(payload, runId) {
  let res;
  try {
    res = await fetch("/api/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.userId}`,
        [RUN_ID_HEADER]: runId,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Network-level failure (server down, offline, ...).
    throw new Error(`Network error: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`Server responded ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function sendConversationMessage(sessionId, message, runId) {
  let res;
  try {
    res = await fetch("/api/conversation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.userId}`,
        [RUN_ID_HEADER]: runId,
      },
      body: JSON.stringify({ session_id: sessionId, message }),
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`Server responded ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// What a run has recorded past the version we already hold. The request hangs
// until the pipeline moves (or the server gives up waiting), so following a
// query costs roughly one request per step instead of one per tick. The signal
// is how a settled turn drops its parked connection.
export async function traceSince(runId, since, signal) {
  const res = await fetch(`/api/trace/${encodeURIComponent(runId)}?since=${since}`, {
    headers: { Authorization: `Bearer ${state.userId}` },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Server responded ${res.status} ${res.statusText}`);
  }

  return res.json();
}
