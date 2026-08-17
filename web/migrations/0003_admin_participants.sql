-- Participants assigned to instructor-managed training groups.
CREATE TABLE participants (
  id         INTEGER PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES groups(id),
  name       TEXT,
  email      TEXT NOT NULL,
  subdomain  TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TEXT NOT NULL
);

CREATE INDEX participants_group_id ON participants(group_id);

CREATE TABLE participant_subdomain_history (
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  subdomain      TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL
);

-- A retired managed hostname must not become an unmanaged self-signup site.
CREATE TRIGGER participant_subdomain_retire
BEFORE UPDATE OF subdomain ON participants
WHEN OLD.subdomain != NEW.subdomain
BEGIN
  INSERT INTO participant_subdomain_history (participant_id, subdomain, created_at)
  VALUES (OLD.id, OLD.subdomain, datetime('now'));
END;

-- Keep an existing site's revisions attached when its managed hostname changes.
CREATE TRIGGER participant_subdomain_update
AFTER UPDATE OF subdomain ON participants
WHEN OLD.subdomain != NEW.subdomain
BEGIN
  UPDATE site SET slug = NEW.subdomain WHERE slug = OLD.subdomain;
END;
