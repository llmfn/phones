"""Hand-rolled BM25 over in-memory token lists.

Hand-rolled rather than a library (or SQLite FTS5) so the scoring is fully
inspectable: ``token_scores`` returns each query token's contribution per
document, which is what lets the X-Ray trace show *why* a query matched -- or
why a token like "mom" matched nothing. FTS5 only exposes a final rank.
"""

import math
import re
from collections import Counter

# Split on non-alphanumerics: lowercase word and number tokens, no punctuation.
# Both the indexer and the query side must use this.
_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


class BM25Index:
    """BM25 (Okapi) scoring over a fixed list of token documents."""

    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_counts = [Counter(tokens) for tokens in docs]
        self.doc_lens = [len(tokens) for tokens in docs]
        self.avg_len = sum(self.doc_lens) / len(docs) if docs else 0.0
        # Document frequency: how many docs contain each token.
        self.df: Counter[str] = Counter()
        for counts in self.doc_counts:
            self.df.update(counts.keys())

    def idf(self, token: str) -> float:
        df = self.df.get(token, 0)
        return math.log(1 + (len(self.doc_counts) - df + 0.5) / (df + 0.5))

    def token_scores(self, tokens: list[str]) -> list[dict[str, float]]:
        """Per document, each query token's BM25 contribution.

        Tokens absent from a document are omitted from its dict, so callers can
        both rank (sum the values) and explain (see which tokens hit where).
        """
        results = []
        for counts, length in zip(self.doc_counts, self.doc_lens):
            scores: dict[str, float] = {}
            for token in tokens:
                tf = counts.get(token, 0)
                if tf == 0:
                    continue
                norm = tf + self.k1 * (1 - self.b + self.b * length / self.avg_len)
                scores[token] = self.idf(token) * tf * (self.k1 + 1) / norm
            results.append(scores)
        return results
