-- Repair databases that applied the participants migration before subdomain
-- history was added to it.
CREATE TABLE IF NOT EXISTS participant_subdomain_history (
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  subdomain      TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL
);

DROP TRIGGER IF EXISTS participant_subdomain_retire;
CREATE TRIGGER participant_subdomain_retire
BEFORE UPDATE OF subdomain ON participants
WHEN OLD.subdomain != NEW.subdomain
BEGIN
  INSERT INTO participant_subdomain_history (participant_id, subdomain, created_at)
  VALUES (OLD.id, OLD.subdomain, datetime('now'));
END;

DROP TRIGGER IF EXISTS participant_subdomain_update;
CREATE TRIGGER participant_subdomain_update
AFTER UPDATE OF subdomain ON participants
WHEN OLD.subdomain != NEW.subdomain
BEGIN
  UPDATE site SET slug = NEW.subdomain WHERE slug = OLD.subdomain;
END;
