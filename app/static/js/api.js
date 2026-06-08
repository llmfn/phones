// fetch wrapper for the backend. Same-origin: the Flask app serves both UI and API.
// Identity is carried in the Authorization header as a dummy bearer token (the
// stable user id), per docs/specs.md — not in the request body.

import { state } from "./state.js";

export async function recommend(payload) {
  let res;
  try {
    res = await fetch("/api/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.userId}`,
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
