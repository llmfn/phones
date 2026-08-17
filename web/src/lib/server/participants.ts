import { isValidSlug, MAX_SLUG_LENGTH } from './hosts';
import type { Database } from './database';
import { ensureSite } from './revisions';

export type ParticipantStatus = 'active' | 'deleted';

export interface Participant {
  id: number;
  group_id: number;
  name: string | null;
  email: string;
  subdomain: string;
  status: ParticipantStatus;
  created_at: string;
}

export class SubdomainConflict extends Error {}

export function participantName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function participantEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

export function participantSubdomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const subdomain = value.trim().toLowerCase();
  return isValidSlug(subdomain) ? subdomain : null;
}

export function generatedSubdomain(name: string | null, email: string): string | null {
  const source = name || email.slice(0, email.lastIndexOf('@'));
  const subdomain = source
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_SLUG_LENGTH);
  return isValidSlug(subdomain) ? subdomain : null;
}

function suffixedSubdomain(base: string, suffix: number): string {
  if (suffix === 1) return base;
  const ending = `-${suffix}`;
  return `${base.slice(0, MAX_SLUG_LENGTH - ending.length)}${ending}`;
}

async function participantSubdomainExists(db: Database, subdomain: string): Promise<boolean> {
  return Boolean(
    await db.prepare('SELECT id FROM participants WHERE subdomain = ?').bind(subdomain).first()
  );
}

async function subdomainExists(db: Database, subdomain: string): Promise<boolean> {
  return Boolean(
    await db
      .prepare(
        `SELECT slug FROM (
           SELECT subdomain AS slug FROM participants
           UNION ALL
           SELECT subdomain AS slug FROM participant_subdomain_history
           UNION ALL
           SELECT slug FROM site
         ) WHERE slug = ? LIMIT 1`
      )
      .bind(subdomain)
      .first()
  );
}

export async function createParticipant(
  db: Database,
  groupId: number,
  name: string | null,
  email: string
): Promise<Participant> {
  const normalizedEmail = participantEmail(email);
  if (!normalizedEmail) throw new Error('A valid email is required');
  const normalizedName = participantName(name);
  const base = generatedSubdomain(normalizedName, normalizedEmail);
  if (!base) throw new Error('A subdomain could not be generated');

  for (let suffix = 1; ; suffix += 1) {
    const subdomain = suffixedSubdomain(base, suffix);
    if (await subdomainExists(db, subdomain)) continue;

    let participant: Participant | null;
    try {
      participant = await db
        .prepare(
          `INSERT INTO participants (group_id, name, email, subdomain, status, created_at)
           VALUES (?, ?, ?, ?, 'active', datetime('now'))
           RETURNING id, group_id, name, email, subdomain, status, created_at`
        )
        .bind(groupId, normalizedName, normalizedEmail, subdomain)
        .first<Participant>();
    } catch (cause) {
      // Another request can claim the candidate between the check and insert.
      if (await participantSubdomainExists(db, subdomain)) continue;
      throw cause;
    }
    if (!participant) throw new Error('Could not create participant');
    await ensureSite(db, subdomain);
    return participant;
  }
}

export async function listParticipants(db: Database, groupId: number): Promise<Participant[]> {
  const { results } = await db
    .prepare(
      `SELECT id, group_id, name, email, subdomain, status, created_at
         FROM participants WHERE group_id = ?
        ORDER BY status = 'deleted', id DESC`
    )
    .bind(groupId)
    .all<Participant>();
  return results;
}

export async function getParticipant(
  db: Database,
  groupId: number,
  id: number
): Promise<Participant | null> {
  return db
    .prepare(
      `SELECT id, group_id, name, email, subdomain, status, created_at
         FROM participants WHERE group_id = ? AND id = ?`
    )
    .bind(groupId, id)
    .first<Participant>();
}

export async function updateParticipant(
  db: Database,
  groupId: number,
  id: number,
  values: { name: string | null; email: string; subdomain: string }
): Promise<Participant | null> {
  const email = participantEmail(values.email);
  const subdomain = participantSubdomain(values.subdomain);
  if (!email) throw new Error('A valid email is required');
  if (!subdomain) throw new Error('A valid subdomain is required');

  const current = await getParticipant(db, groupId, id);
  if (!current || current.status !== 'active') return null;
  if (subdomain !== current.subdomain && (await subdomainExists(db, subdomain))) {
    throw new SubdomainConflict('Subdomain is already assigned');
  }

  try {
    return await db
      .prepare(
        `UPDATE participants SET name = ?, email = ?, subdomain = ?
          WHERE group_id = ? AND id = ? AND status = 'active'
          RETURNING id, group_id, name, email, subdomain, status, created_at`
      )
      .bind(participantName(values.name), email, subdomain, groupId, id)
      .first<Participant>();
  } catch (cause) {
    if (subdomain !== current.subdomain && (await subdomainExists(db, subdomain))) {
      throw new SubdomainConflict('Subdomain is already assigned');
    }
    throw cause;
  }
}

export async function resolveParticipantSite(
  db: Database,
  subdomain: string
): Promise<ParticipantStatus | 'self-signup' | null> {
  const participant = await db
    .prepare('SELECT status FROM participants WHERE subdomain = ?')
    .bind(subdomain)
    .first<{ status: ParticipantStatus }>();
  if (participant) return participant.status;

  const retired = await db
    .prepare('SELECT participant_id FROM participant_subdomain_history WHERE subdomain = ?')
    .bind(subdomain)
    .first();
  return retired ? null : 'self-signup';
}

export async function getParticipantBySubdomain(
  db: Database,
  subdomain: string
): Promise<Participant | null> {
  return db
    .prepare(
      `SELECT id, group_id, name, email, subdomain, status, created_at
         FROM participants WHERE subdomain = ?`
    )
    .bind(subdomain)
    .first<Participant>();
}

export async function getParticipantEmail(db: Database, subdomain: string): Promise<string | null> {
  const participant = await getParticipantBySubdomain(db, subdomain);
  return participant?.status === 'active' ? participant.email : null;
}

export async function setParticipantStatus(
  db: Database,
  groupId: number,
  id: number,
  status: ParticipantStatus
): Promise<Participant | null> {
  return db
    .prepare(
      `UPDATE participants SET status = ? WHERE group_id = ? AND id = ?
       RETURNING id, group_id, name, email, subdomain, status, created_at`
    )
    .bind(status, groupId, id)
    .first<Participant>();
}
