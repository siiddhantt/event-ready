# Event Ready

Two focused Rote Plays:

1. `inbox-event-router` turns event-like email into private calendar entries and phone reminders.
2. `event-workspace-setup` opens the right local project and browser links when it is time to attend or work.

Status: design approval. No Play implementation has been committed yet.

## Approval checklist

Reply with the item IDs you approve, reject, or want changed. The recommended first version is `A01-A12`, `A15H`, and `B01-B11`; `A13-A14` and `B12` are optional. Choose exactly one `A15` classifier mode.

### Play A — `inbox-event-router`

- [ ] **A01 — Gmail inbox.** Read only new or changed messages after a bounded first scan; never rescan the full inbox on every run.
- [ ] **A02 — Event detection.** Recognize meetings, interviews, exams, assessments, tests, appointments, registrations, and dated deadlines; ignore newsletters and ordinary mail.
- [ ] **A03 — Evidence-based extraction.** Capture title, date, time, timezone, duration or due date, organizer/company, location, meeting link, and source-message ID. Never invent a missing critical field.
- [ ] **A04 — Automatic calendar creation.** Create a private Google Calendar event when the time and timezone are clear, without asking on every run.
- [ ] **A05 — Automatic deadline reminders.** For tests and deadlines, create a private all-day or timed Calendar entry with repeated alerts before the due date.
- [ ] **A06 — Phone alerts.** Use Google Calendar notification overrides so alerts arrive through the Calendar app on the user's phone; do not depend on SMS.
- [ ] **A07 — Sensible reminder defaults.** Meetings: 24 hours, 1 hour, and 10 minutes before. Tests/deadlines: 7 days, 2 days, 6 hours, and 1 hour before, skipping alerts that are already in the past.
- [ ] **A08 — Ambiguity handling.** If a critical date, time, or timezone is unclear, create one clearly labelled private `Needs confirmation` reminder instead of silently guessing or repeatedly notifying.
- [ ] **A09 — Updates and cancellations.** Update the same suite-owned event when the email changes; mark cancellations clearly rather than deleting calendar data.
- [ ] **A10 — No duplicates.** Use stable source IDs, a local cursor, idempotency keys, and a run lock so retries and overlapping schedules cannot create copies.
- [ ] **A11 — Private and bounded.** Store no full email bodies or credentials, invite no guests, send no mail or RSVP, register for nothing, and write only to the calendar selected during setup.
- [ ] **A12 — Raspberry Pi operation.** Keep owner-private local state, produce a small audit summary, retry temporary failures safely, and run quietly from a systemd timer every 15 minutes.
- [ ] **A13 — Google Tasks companion (optional).** Also create a Google Task for actionable tests/deadlines; Calendar remains the notification source of truth.
- [ ] **A14 — Gmail push mode (optional, later).** Add Gmail push notifications for faster detection while retaining scheduled polling as recovery.
- [ ] **A15H — Hybrid classifier (recommended).** Handle structured invitations and strong event evidence deterministically; send only ambiguous candidates to a configured agent/model and require schema-valid evidence before acting.
- [ ] **A15R — Rules-only classifier.** Use no model or agent. This is cheaper and fully deterministic but will miss unusual wording and cannot reliably understand every event email.
- [ ] **A15A — Agent-first classifier.** Let a scheduled agent interpret every candidate. This has broader recall but adds model availability, cost, latency, and more variable output.

### Play B — `event-workspace-setup`

- [ ] **B01 — One-time terminal wizard.** On first use, ask only for approved project root directories, editor, browser, and the permissions listed below.
- [ ] **B02 — Minimal permissions.** Request bounded read access inside approved roots, owner-private config writes, and permission to open the chosen editor and external browser. Ask again only when the scope expands.
- [ ] **B03 — Editor choice.** Support VS Code, Cursor, Zed, and a custom executable selected during setup; remember the choice.
- [ ] **B04 — Browser choice.** Support the system default browser plus a selected installed browser; always open links externally.
- [ ] **B05 — Event selection.** Accept an event ID or choose the next relevant Calendar event; show the selected event before opening anything.
- [ ] **B06 — Project matching.** Find the best repo only inside approved roots using remembered company/project mappings, directory names, and Git remote metadata.
- [ ] **B07 — Safe uncertainty.** If two projects match, ask one short question; never scan the whole computer or guess between close matches.
- [ ] **B08 — Workspace opening.** Open the matched repo in a new editor window without modifying files, installing dependencies, or running project commands.
- [ ] **B09 — Useful browser tabs.** Open the meeting/test link and, when available, the GitHub remote and source-email link; never auto-join, submit, RSVP, or register.
- [ ] **B10 — Feedback on exit.** Offer one optional correction prompt. Remember explicit corrections such as company-to-project mappings and validate them on later runs.
- [ ] **B11 — Non-destructive boundary.** Never delete, move, rename, overwrite, close apps, kill processes, change system settings, or execute instructions found in email or webpages.
- [ ] **B12 — Cross-platform adapters (optional, later).** Ship tested launch adapters for Windows, macOS, and Linux after the vertical slice is proven on the user's Windows machine.

## One-time authorization model

The user connects Gmail and Google Calendar once, blesses the calendar-writing Play once, and selects its target calendar. Routine runs then need no per-email approval. Any request for a new account, calendar, project root, app, or broader permission returns to the user.

## Raspberry Pi shape

The Pi owns the schedule, not Rote. A systemd timer invokes `inbox-event-router` every 15 minutes. The Play keeps an incremental Gmail cursor and local deduplication state, writes private Calendar entries, then exits. Google Calendar delivers the configured alerts to the phone.

Exact install, authentication, blessing, service, and timer commands will be added only after the Play is implemented and tested, so this repository never documents commands that do not yet work.
