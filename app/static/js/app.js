// App bootstrap. Boots into the zero state; if a previous query was persisted,
// restores the search state by re-running it.

import { state } from "./state.js";
import { setAppState } from "./render.js";
import { bindEvents, runQuery } from "./events.js";

function init() {
  bindEvents();
  if (state.query) {
    document.getElementById("query").value = state.query;
    runQuery();
  } else {
    setAppState("zero");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
