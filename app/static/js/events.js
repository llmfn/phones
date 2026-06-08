// Event binding and user-interaction handlers.

import { recommend } from "./api.js";
import {
  state,
  activeLayers,
  setCurrentLayer,
  addMessage,
  resetDefaults,
  buildPayload,
} from "./state.js";
import { renderMessage, renderHistory, renderTrace, renderControls } from "./render.js";

function refreshControls() {
  renderControls(state.currentLayer, activeLayers());
}

async function handleSend(query) {
  const text = query.trim();
  if (!text) return;

  const userMsg = { role: "user", content: text };
  addMessage(userMsg);
  renderMessage(userMsg);

  const payload = buildPayload(text);
  // Simulate-failure is one-shot: consume it for this request only.
  state.simulateFailureNext = false;

  try {
    const data = await recommend(payload);
    const assistantMsg = {
      role: "assistant",
      content: data.answer ?? "",
      products: data.products ?? [],
    };
    addMessage(assistantMsg);
    renderMessage(assistantMsg);
    state.lastTrace = data.trace ?? [];
    renderTrace(state.lastTrace);
  } catch (err) {
    const errMsg = { role: "error", content: err.message };
    addMessage(errMsg);
    renderMessage(errMsg);
    state.lastTrace = [];
    renderTrace(state.lastTrace);
  }
}

export function bindEvents() {
  const composer = document.getElementById("composer");
  const queryInput = document.getElementById("query");
  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = queryInput.value;
    queryInput.value = "";
    handleSend(value);
  });

  document.getElementById("layer-select").addEventListener("change", (e) => {
    setCurrentLayer(Number(e.target.value));
    refreshControls();
  });

  document.getElementById("reset").addEventListener("click", () => {
    resetDefaults();
    document.getElementById("simulate-failure").classList.remove("armed");
    renderHistory(state.chatHistory);
    renderTrace(state.lastTrace);
    refreshControls();
  });

  const simBtn = document.getElementById("simulate-failure");
  simBtn.addEventListener("click", () => {
    state.simulateFailureNext = !state.simulateFailureNext;
    simBtn.classList.toggle("armed", state.simulateFailureNext);
  });

  document.getElementById("copy-trace").addEventListener("click", async () => {
    const json = JSON.stringify(state.lastTrace, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // Clipboard API can be blocked (insecure context); fall back to a prompt.
      window.prompt("Copy trace JSON:", json);
    }
  });
}
