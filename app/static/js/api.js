// fetch wrapper for the backend. Same-origin: the Flask app serves both UI and API.

export async function recommend(payload) {
  let res;
  try {
    res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
