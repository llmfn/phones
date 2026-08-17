---
status: ready
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

### [TODO] login: password-gated admin session

Password-gated session for the admin console, same pattern as
llmfn.com/admin.

- Password field, same gate pattern as llmfn.com/admin
- Session cookie on successful login

### [TODO] groups: create, list, edit

Create, list, and rename training groups.

- Create a group (name)
- List groups with status
- Edit a group's name

### [TODO] participants: add, list, edit, restore, soft-delete

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

### [TODO] group-archive: archive a group

Archive a group, making its participant sites read-only.

- Flip group status to `archived`
- All active participants' sites become read-only (studio writes rejected,
  viewing still works)

## Handover