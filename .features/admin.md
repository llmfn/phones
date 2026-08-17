---
status: in-progress
created: 2026-08-17
---

# Admin Console (admin)

Password-gated console for phones.llmfn.com where an instructor creates
training groups, adds participants to each, and manages their subdomains.
Login page mirrors llmfn.com/admin.

## Design / Approach

`groups(id, name, status, created_at)`, `participants(id, group_id, name,
email, subdomain, status, created_at)`. Both use soft status, not hard delete:
`groups.status: active | archived`, `participants.status: active | deleted`.

Subdomain is a slug column on participant, looked up via wildcard DNS +
Worker routing. Renaming or restoring it is a plain column update — no
redirect or alias needed, the old value just stops (or starts) matching a row.

Subdomain assignment: slugify the participant's name if given, else the local
part of the email — lowercase, strip non-alphanumerics. On collision, append
`-2`, `-3`, etc. This differs from the adjective-noun scheme used for
self-signup elsewhere; two slug strategies coexist depending on how the
participant was created.

Archiving a group makes all its active participants' sites read-only: studio
write endpoints reject, viewing still works.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  phones.llmfn.com/admin                    [logout]      │
├─────────────────────────────────────────────────────────┤
│  Groups                                    [+ New Group] │
│                                                            │
│  Name                    Status      Participants         │
│  ─────────────────────────────────────────────────────    │
│  edition-03               active         12      [Edit]   │
│  edition-02               archived       15      [View]   │
│  edition-01               archived       10      [View]   │
└─────────────────────────────────────────────────────────┘

           │ click "edition-03"
           ▼

┌─────────────────────────────────────────────────────────┐
│  ← Groups  /  edition-03                                  │
├─────────────────────────────────────────────────────────┤
│  edition-03                    active   [Rename] [Archive]│
│                                                            │
│  Participants                          [+ Add Participant]│
│                                                            │
│  Name       Email               subdomain    Status         │
│  ──────────────────────────────────────────────────────    │
│  Anand      anand@x.com         anand        active  [Edit][×]  │
│  Amit       amit@x.com          amit         active  [Edit][×]  │
│  Bargava    bargava@x.com       bargava      deleted [Restore]  │
└─────────────────────────────────────────────────────────┘
```

Archived group: same table, but no Edit/×/Restore actions, status banner
instead.

## Tasks

### [DONE] login: password-gated admin session

Password-gated session for the admin console, same pattern as
llmfn.com/admin.

- Password field, same gate pattern as llmfn.com/admin
- Session cookie on successful login

**Acceptance Criteria:**

- [x] Tests cover successful and failed login, invalid sessions, apex-only
      route protection, and logout
- [x] Tests, type checks, and the production build pass

### [DONE] groups: create, list, edit

Create, list, and rename training groups.

- Create a group (name)
- List groups with status
- Edit a group's name

**Acceptance Criteria:**

- [x] An existing site-config database accepts the groups migration without
      changing its revisions
- [x] Tests cover creating, listing, and renaming groups and refusing invalid
      names and unknown IDs
- [x] The list and detail surfaces work at desktop and phone widths

### [DONE] participants: add, list, edit, restore, soft-delete

Add, list, edit, restore, and soft-delete participants within a group.

- Add participant(s) to a group with name and email; subdomain
  auto-assigned from name (or email local part if no name), lowercased,
  collisions get a numeric suffix
- List participants per group (active and deleted both shown, deleted rows
  visually distinct)
- Edit a participant's name, email, or subdomain
- Soft-delete: status → `deleted`, row stays, drops out of active use,
  subdomain stops resolving
- Restore: status → `active` again, subdomain resolves again

**Acceptance Criteria:**

- [x] An existing site and group database accepts the participant migration
      without changing saved site revisions
- [x] Tests cover generated and colliding subdomains, editing, group isolation,
      soft-delete, restore, host resolution, and participant email login
- [x] Group lists show active participant counts and group detail works at
      desktop and phone widths

### [TODO] group-archive: archive a group

Archive a group, making its participant sites read-only.

- Flip group status to `archived`
- All active participants' sites become read-only (studio writes rejected,
  viewing still works)

## Handover

The admin gate, groups, and participant management are complete. Migrations
`0003_admin_participants.sql` and `0004_participant_subdomain_history.sql` add
participants and preserve a site's revisions when its subdomain changes; `0004`
also repairs databases that applied an earlier form of `0003`.
`/admin/groups/[id]` creates, lists, edits,
soft-deletes, and restores participants; `/admin` counts active participants.
Managed subdomains resolve only while active and studio codes go to the stored
participant email. Existing unmanaged self-signup sites remain available, while
retired managed subdomains stay unavailable.

Next is `admin.group-archive`. Group status is present, but there is no archive
action or read-only enforcement yet.
