import type { Database } from './database';

export type GroupStatus = 'active' | 'archived';

export interface Group {
  id: number;
  name: string;
  status: GroupStatus;
  created_at: string;
}

export interface GroupSummary extends Group {
  participant_count: number;
}

export function groupName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name || null;
}

export async function createGroup(db: Database, name: string): Promise<Group> {
  const normalized = groupName(name);
  if (!normalized) throw new Error('Group name is required');

  const group = await db
    .prepare(
      `INSERT INTO groups (name, status, created_at)
       VALUES (?, 'active', datetime('now'))
       RETURNING id, name, status, created_at`
    )
    .bind(normalized)
    .first<Group>();
  if (!group) throw new Error('Could not create group');
  return group;
}

export async function listGroups(db: Database): Promise<GroupSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT groups.id, groups.name, groups.status, groups.created_at,
              COUNT(participants.id) AS participant_count
         FROM groups
         LEFT JOIN participants
           ON participants.group_id = groups.id AND participants.status = 'active'
        GROUP BY groups.id
        ORDER BY groups.id DESC`
    )
    .all<GroupSummary>();
  return results;
}

export async function getGroup(db: Database, id: number): Promise<Group | null> {
  return db
    .prepare('SELECT id, name, status, created_at FROM groups WHERE id = ?')
    .bind(id)
    .first<Group>();
}

export async function renameGroup(db: Database, id: number, name: string): Promise<Group | null> {
  const normalized = groupName(name);
  if (!normalized) throw new Error('Group name is required');

  return db
    .prepare(
      `UPDATE groups SET name = ? WHERE id = ?
       RETURNING id, name, status, created_at`
    )
    .bind(normalized, id)
    .first<Group>();
}
