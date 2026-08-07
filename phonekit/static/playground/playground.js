// Dragging a slider re-requests the same page and swaps its body in. There is
// no second renderer: what a drag produces and what a reload produces are the
// same HTML from the same templates, so they cannot drift. Without JS the form
// still submits and the page still works -- this only removes the round trip
// from feeling like one.

const page = document.getElementById("pg-page");
let pending = null;

document.body.classList.add("pg-live");

function outputs(form) {
  for (const input of form.querySelectorAll('input[type="range"]')) {
    const output = input.parentElement.querySelector("output");
    if (output) output.textContent = Number(input.value).toFixed(input.step < 0.1 ? 2 : 1);
  }
}

async function rescore(form) {
  const url = `${location.pathname}?${new URLSearchParams(new FormData(form))}`;
  history.replaceState(null, "", url);
  const response = await fetch(url, { headers: { "X-Requested-With": "fetch" } });
  const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
  const fresh = parsed.getElementById("pg-page");
  if (fresh) page.innerHTML = fresh.innerHTML;
}

page.addEventListener("input", (event) => {
  const form = event.target.closest("form[data-live]");
  if (!form || event.target.type !== "range") return;
  outputs(form);
  clearTimeout(pending);
  pending = setTimeout(() => rescore(form), 120);
});
