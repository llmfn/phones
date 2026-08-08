import { closeStep, openStep, reframe, renderTrace } from "./js/render.js";


const runButton = document.getElementById("run-evals");
const list = document.getElementById("eval-list");
const status = document.getElementById("eval-status");
const rows = [...list.querySelectorAll(".eval-case")];
const results = new Array(rows.length);
let visibleTrace = [];

bindEvalTraceEvents();
renderTrace(visibleTrace);

list.addEventListener("click", (event) => {
  const row = event.target.closest(".eval-case");
  if (!row || row.disabled) return;

  const index = Number(row.dataset.index);
  for (const other of rows) other.classList.toggle("is-selected", other === row);
  visibleTrace = results[index]?.trace ? [results[index].trace] : [];
  renderTrace(visibleTrace);
});

runButton?.addEventListener("click", async () => {
  runButton.disabled = true;
  list.setAttribute("aria-busy", "true");
  visibleTrace = [];
  renderTrace(visibleTrace);

  for (const row of rows) resetRow(row);

  let passed = 0;
  for (const [position, row] of rows.entries()) {
    row.classList.add("is-running");
    row.querySelector(".eval-verdict").textContent = "running";
    status.textContent = `Running ${position + 1} of ${rows.length}...`;

    let result;
    try {
      const response = await fetch(`/api/evals/${row.dataset.index}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Eval failed");
      result = data;
    } catch (error) {
      result = {
        passed: false,
        reason: error instanceof Error ? error.message : "Eval failed",
        trace: null,
      };
    }

    results[position] = result;
    row.classList.remove("is-running");
    row.classList.add(result.passed ? "is-passed" : "is-failed");
    row.disabled = false;
    row.querySelector(".eval-verdict").textContent = result.passed ? "yes" : "no";
    const reason = row.querySelector(".eval-reason");
    reason.textContent = result.reason;
    reason.hidden = false;
    if (result.passed) passed += 1;
  }

  list.setAttribute("aria-busy", "false");
  status.textContent = `${passed} of ${rows.length} passed. Select a case to inspect its trace.`;
  runButton.disabled = false;
  runButton.textContent = "Run again";
});


function resetRow(row) {
  row.disabled = true;
  row.classList.remove("is-running", "is-passed", "is-failed", "is-selected");
  row.querySelector(".eval-verdict").textContent = "waiting";
  const reason = row.querySelector(".eval-reason");
  reason.textContent = "";
  reason.hidden = true;
}


function bindEvalTraceEvents() {
  document.getElementById("copy-trace").addEventListener("click", async () => {
    const json = JSON.stringify(visibleTrace, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      window.prompt("Copy trace JSON:", json);
    }
  });

  document.getElementById("trace").addEventListener("click", (event) => {
    const tab = event.target.closest(".step-tab");
    if (tab) {
      showPane(tab);
      return;
    }
    const schema = event.target.closest(".schema-toggle");
    if (schema) {
      showSchema(schema);
      return;
    }
    const text = event.target.closest(".text-toggle");
    if (text) {
      showLiteral(text);
      return;
    }
    const record = event.target.closest(".doc-name");
    if (record) {
      showRecord(record);
      return;
    }
    const row = event.target.closest(".step-row");
    if (row) toggleStep(row);
  });

  window.addEventListener("resize", reframe);
  document.getElementById("trace-width").addEventListener("click", () => {
    const app = document.getElementById("app");
    const wide = app.dataset.traceWidth !== "full";
    app.dataset.traceWidth = wide ? "full" : "rail";
    const button = document.getElementById("trace-width");
    button.textContent = wide ? "collapse" : "expand";
    button.setAttribute("aria-pressed", wide ? "true" : "false");
    button.setAttribute("aria-label", wide ? "Shrink trace to the rail" : "Grow trace to full width");
    reframe();
  });
}


function toggleStep(row) {
  if (row.closest(".step-item").classList.contains("is-open")) closeStep();
  else openStep(row);
}


function showSchema(button) {
  const [tree, json] = button.closest(".detail-block").querySelector(".schema-view").children;
  const raw = tree.hidden;
  tree.hidden = !raw;
  json.hidden = raw;
  button.textContent = raw ? "json" : "types";
  button.title = raw ? "show the JSON Schema as sent" : "show the type view";
}


function showLiteral(button) {
  const input = button.closest(".detail-block").querySelector(".detail-input");
  const folded = input.querySelector(".folded-text");
  const literal = input.querySelector(":scope > .detail-text");
  const raw = folded.hidden;
  folded.hidden = !raw;
  literal.hidden = raw;
  button.textContent = raw ? "text" : "folded";
  button.title = raw ? "show the input as sent" : "show the folded view";
}


function showRecord(button) {
  const item = button.closest(".doc-item");
  const open = !item.classList.contains("is-open");
  item.classList.toggle("is-open", open);
  button.setAttribute("aria-expanded", open ? "true" : "false");
  item.querySelector("pre").hidden = !open;
}


function showPane(tab) {
  const detail = tab.closest(".step-detail");
  for (const other of detail.querySelectorAll(".step-tab")) {
    const active = other === tab;
    other.classList.toggle("is-active", active);
    other.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const pane of detail.querySelectorAll(".step-pane")) {
    pane.hidden = pane.dataset.pane !== tab.dataset.pane;
  }
}
