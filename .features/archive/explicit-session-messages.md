---
created: 2026-08-08
---

# Explicit Session Messages (explicit-session-messages) — archived

Archived 2026-08-17, when the Python app was retired in favour of the Worker
in `web/`. It shipped complete; this is the record of what was built and why.
The Worker has no chat pipeline yet, so the rule it established — a chat
implementation writes its own messages — is not yet owned by anything.

Chat pipelines write user and assistant messages themselves so conversation
state changes are visible where each response is produced.

## Tasks

### [DONE] chat-ownership: move transcript writes into chat implementations

Remove request-layer transcript mutation and make taught chat pipelines append
both sides of each successful turn. The default acknowledgement remains
stateless.

**Acceptance Criteria:**

- [x] Custom chat hooks receive an unchanged transcript
- [x] Layers 5-7 explicitly append user and assistant messages
- [x] Failed replies are not stored as assistant messages

### [DONE] contract-tests: document and verify message ownership

Update the public guidance and automated tests to describe and enforce the
explicit chat lifecycle.

**Acceptance Criteria:**

- [x] Session documentation shows the complete chat lifecycle
- [x] Conversation and trace tests cover explicit writes and failure behavior
