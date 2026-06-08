// App bootstrap and top-level orchestration.

import { state, activeLayers } from "./state.js";
import { renderHistory, renderTrace, renderControls } from "./render.js";
import { bindEvents } from "./events.js";

function init() {
  renderControls(state.currentLayer, activeLayers());
  renderHistory(state.chatHistory);
  renderTrace(state.lastTrace);
  bindEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
