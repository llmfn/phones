"""The page's numbers must be the index's numbers, not a retelling of them."""

import pytest

from phonekit import playground
from phonekit.app import Application
from phonekit.playground import bm25
from phonekit.search.bm25 import tokenize
from phonekit.search.index import catalog_index


@pytest.fixture
def client(tmp_path):
    return Application(__name__, session_root=tmp_path).test_client()


def test_row_totals_come_from_the_index():
    index, _ = catalog_index()
    scores = index.token_scores(tokenize("pink phone"))
    for row in bm25.explain("pink phone").rows:
        assert row.total == pytest.approx(sum(scores[row.index].values()))


def test_the_worked_example_lands_on_the_score_it_explains():
    derivation = bm25.explain("pink phone").derivation
    assert derivation.steps[-1].value == pytest.approx(derivation.value)


def test_length_stops_counting_when_b_is_zero():
    """The payoff of the sliders: the wordy record is no longer penalised."""
    default = [row.name for row in bm25.explain("pink phone").rows]
    flattened = [row.name for row in bm25.explain("pink phone", b=0.0).rows]
    assert default != flattened


def test_a_query_of_absent_words_still_returns_a_ranking():
    """Layer 1's wall: nothing meaningful matched, and answers came back anyway."""
    explanation = bm25.explain("something for my mom who struggles with technology")
    absent = [t.token for t in explanation.tokens if t.absent]
    assert {"something", "my", "mom", "struggles"} <= set(absent)
    assert explanation.matched == explanation.corpus.documents


def test_the_page_serves_and_carries_its_query(client):
    page = client.get("/playground/bm25?q=pink+phone").data.decode()
    assert "OnePlus 13s" in page
    assert "<h2>3. What actually ranks</h2>" in page


def test_a_page_offers_a_way_back_and_a_way_across(client):
    page = client.get("/playground/bm25").data.decode()
    assert 'class="pg-back" href="/"' in page
    for entry in playground.PAGES:
        assert entry.title in page
    assert "Playground</a>" in client.get("/").data.decode()


def test_an_unbuilt_mechanism_is_named_but_not_linked(client):
    """The nav advertises what is coming without pretending it is there."""
    page = client.get("/playground/").data.decode()
    assert "Semantic search" in page
    assert "/playground/semantic" not in page


def test_a_query_matching_nothing_still_renders(client):
    """The free-text box makes this reachable in a minute of use."""
    page = client.get("/playground/bm25?q=zzzz").data.decode()
    assert page.count("<h2>") >= 3
    assert "Nothing." in page


def test_a_focused_score_survives_a_parameter_change(client):
    focused = "/playground/bm25?q=pink+phone&row=18&token=pink&b=0"
    assert "in iPhone 15" in client.get(focused).data.decode()
