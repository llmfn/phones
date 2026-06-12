// App bootstrap. The URL fragment is the source of truth: a #q=… fragment
// restores that search, a bare URL boots into the zero state.

import { bindEvents, applyUrl } from "./events.js";

function init() {
  bindEvents();
  applyUrl();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
