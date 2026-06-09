-- Schema for the phone catalogue (Layer 1: search).
--
-- A typed `phones` table holds the catalogue; an external-content FTS5 index
-- `phones_fts` provides full-text search over the text columns. Keeping a real
-- table (rather than stuffing everything into one FTS table) means later layers
-- can do structured SQL over typed columns (price as INTEGER, room for ram/os/
-- storage), while search stays a single MATCH against the index.

DROP TABLE IF EXISTS phones_fts;
DROP TABLE IF EXISTS phones;

CREATE TABLE phones (
  id          TEXT PRIMARY KEY,
  brand       TEXT NOT NULL,
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,
  image       TEXT NOT NULL,
  description TEXT NOT NULL
);

-- External-content FTS index: `content` points at `phones`, so the index stores
-- no duplicate copy of the rows -- it returns matching rowids that join back to
-- `phones` for the display fields. The import rebuilds it after loading rows
-- (`INSERT INTO phones_fts(phones_fts) VALUES('rebuild')`); no sync triggers,
-- because the app only ever reads.
CREATE VIRTUAL TABLE phones_fts USING fts5(
  name, brand, description,
  content='phones',
  content_rowid='rowid'
);
