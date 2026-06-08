// DOM rendering: chat bubbles, product cards, error bubbles, and the trace timeline.

const chatEl = () => document.getElementById("chat");
const traceEl = () => document.getElementById("trace");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function scrollChatToBottom() {
  const chat = chatEl();
  chat.scrollTop = chat.scrollHeight;
}

// --- Chat ---

export function renderMessage(message) {
  const chat = chatEl();

  if (message.role === "error") {
    chat.appendChild(el("div", "bubble error", message.content));
  } else {
    chat.appendChild(el("div", `bubble ${message.role}`, message.content));
  }

  if (message.products && message.products.length) {
    chat.appendChild(renderProducts(message.products));
  }
  scrollChatToBottom();
}

export function renderHistory(history) {
  chatEl().innerHTML = "";
  history.forEach(renderMessage);
}

function renderProducts(products) {
  const wrap = el("div", "products");
  for (const p of products) {
    const card = el("div", "product-card");
    if (p.image) {
      const img = el("img");
      img.src = p.image;
      img.alt = p.name || "";
      card.appendChild(img);
    }
    card.appendChild(el("div", "name", p.name ?? ""));
    if (p.price !== undefined) card.appendChild(el("div", "price", String(p.price)));
    if (p.match_score !== undefined)
      card.appendChild(el("div", "score", `match ${p.match_score}`));
    wrap.appendChild(card);
  }
  return wrap;
}

// --- Trace ---

const KNOWN_STATUSES = ["success", "fallback", "error", "skipped"];

export function renderTrace(trace) {
  const list = traceEl();
  list.innerHTML = "";

  if (!trace || !trace.length) {
    list.appendChild(el("li", "active-hint", "No trace yet — send a query."));
    return;
  }

  for (const step of trace) {
    const status = KNOWN_STATUSES.includes(step.status) ? step.status : "success";

    const row = el("details", `trace-row ${status}`);
    const summary = el("summary");
    summary.appendChild(el("span", "layer-badge", String(step.layer)));
    summary.appendChild(el("span", "layer-name", step.name ?? `Layer ${step.layer}`));
    const latency = status === "skipped" ? "skipped" : `${step.latency_ms ?? 0} ms`;
    summary.appendChild(el("span", "latency", latency));
    row.appendChild(summary);

    const detail = el("div", "trace-detail");
    detail.appendChild(el("div", "io-label", "input"));
    detail.appendChild(el("pre", null, JSON.stringify(step.input ?? {}, null, 2)));
    detail.appendChild(el("div", "io-label", "output"));
    detail.appendChild(el("pre", null, JSON.stringify(step.output ?? {}, null, 2)));
    row.appendChild(detail);

    list.appendChild(row);
  }
}

// --- Controls ---

export function renderControls(currentLayer, active) {
  const select = document.getElementById("layer-select");
  if (select) select.value = String(currentLayer);

  const hint = document.getElementById("active-hint");
  if (hint) hint.textContent = `Active layers: ${active.join(", ")}`;
}
