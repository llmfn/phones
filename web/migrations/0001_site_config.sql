-- Sites and their configuration revisions.
-- Apply with: npx wrangler d1 migrations apply phones --local (or --remote)
CREATE TABLE site (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE siteconfig (
  id         INTEGER PRIMARY KEY,
  site_id    INTEGER NOT NULL REFERENCES site(id),
  revision   INTEGER NOT NULL,
  config     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (site_id, revision)
);
