import type { Database } from './database';

export type GroupStatus = 'active' | 'archived';

export interface Group {
  id: number;
  name: string;
  status: GroupStatus;
  created_at: string;
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

export async function listGroups(db: Database): Promise<Group[]> {
  const { results } = await db
    .prepare('SELECT id, name, status, created_at FROM groups ORDER BY id DESC')
    .all<Group>();
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
