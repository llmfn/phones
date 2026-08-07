"""Pages that explain a retrieval mechanism by running it.

Each page is a markdown template rendered per request: Jinja fills it from a
live scoring of the reader's query, then markdown turns it into the page. The
prose and the numbers therefore live in one file and cannot drift apart -- no
figure is ever typed into the text.

Registered on ``Application`` as a blueprint. Nothing here is imported by the
app being built; it is read alongside it.
"""

from dataclasses import dataclass

from flask import Blueprint, jsonify, render_template, request, url_for
from markdown_it import MarkdownIt

from . import bm25

playground = Blueprint(
    "playground", __name__, template_folder="pages", url_prefix="/playground"
)


@dataclass(frozen=True)
class Page:
    """One mechanism. ``endpoint`` is None until its page exists."""

    slug: str
    title: str
    blurb: str
    endpoint: str | None = None


# The nav, the index, and the "what's next" line all read from here, so adding
# a mechanism is adding a row plus its route.
PAGES = [
    Page(
        "bm25",
        "BM25",
        "how keyword search weighs words, ranks records, and falls over on a"
        " sentence a person would actually say.",
        "playground.bm25_page",
    ),
    Page(
        "semantic",
        "Semantic search",
        "what sits near a query in embedding space, and what the catalogue has"
        " nothing near.",
    ),
]

# ``html=True`` lets the macros' tables and controls through untouched; the
# templates are ours, so there is nothing here to sanitize.
markdown = MarkdownIt("commonmark", {"html": True, "typographer": True}).enable("table")


def render_page(template: str, title: str, current: str = "", **context) -> str:
    """Jinja, then markdown, then the shell."""
    body = markdown.render(render_template(template, pages=PAGES, **context))
    return render_template("base.html", title=title, body=body, pages=PAGES, current=current)


@playground.get("/")
def index():
    return render_page("index.md", "Playground")


@playground.get("/bm25")
def bm25_page():
    explanation, link, link_default = _bm25_request()
    whiff = _whiff(explanation)
    context = dict(e=explanation, link=link, link_default=link_default, whiff=whiff)
    return render_page("bm25.md", "How BM25 ranks", current="bm25", **context)


@playground.get("/bm25.json")
def bm25_json():
    explanation, _, _ = _bm25_request()
    return jsonify(explanation.as_dict())


def _bm25_request():
    """One query string, read the same way by all three views."""
    query = request.args.get("q") or bm25.CURATED[0][0]
    k1 = bm25.clamp(request.args.get("k1"), 0.0, 3.0, bm25.DEFAULT_K1)
    b = bm25.clamp(request.args.get("b"), 0.0, 1.0, bm25.DEFAULT_B)
    row = int(bm25.clamp(request.args.get("row"), 0, 1e6, 0))
    token = request.args.get("token", "")
    explanation = bm25.explain(query, k1=k1, b=b, focus=row, focus_token=token)

    def link(**overrides):
        args = dict(q=query, k1=k1, b=b, row=row, token=token) | overrides
        return url_for("playground.bm25_page", **args)

    return explanation, link, url_for("playground.bm25_page", q=query)


def _whiff(explanation):
    """The closing section, unless the reader is already looking at that query."""
    query = bm25.CURATED[-1][0]
    return None if explanation.query == query else bm25.explain(query)
