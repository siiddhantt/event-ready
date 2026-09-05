# Verification ledger

Checked September 5, 2026. These are observed results, not a promise of zero bugs.

| Check | Result |
| --- | --- |
| Clone into the requested empty project | Passed; `siiddhantt/event-ready`, branch `harden-event-ready` |
| macOS Deno suite | 51 tests passed |
| Raspberry Pi Deno suite | 51 tests passed on aarch64 Linux |
| Runner and OAuth helper tests | 7 tests passed |
| Real Codex synthetic classification on Pi | 9/9 assertions: all six messages covered; two milestones; exact times; confirmed interview; irrelevant, ambiguous, tentative and injection messages ignored; Play schema accepted |
| Rote structural validation | Both Plays passed, static quality score 1.00 |
| Workspace presentation lint | Passed in human, summary and JSON modes |
| Inbox presentation lint | Passed with Rote's informational single-item fan-out coverage limitation; live multi-message runs additionally exercised the path |
| Live Gmail collect on macOS | Passed |
| Full collect → Codex → all-ignore apply on macOS | Passed; five real messages processed, zero Calendar writes |
| Fresh workspace setup through Rote | Passed: cloned a missing repository, cached Deno dependencies, opened VS Code and three HTTPS links, saved explicit mapping |
| Repeat workspace preview | Passed: reused the clone, no second clone planned, dependency setup retained |
| Google OAuth from Pi | Gmail passed; corrected Calendar consent completed and Rote stored a refreshable token |
| Pi Calendar write retry | Passed at 02:42:21 UTC: 25 messages, one private deadline inserted and one interview rescheduled, pending batch committed |
| Unattended systemd service | Passed at 02:45:27 UTC: 41 further messages across three batches, zero extra writes, caught up |
| Repeat service invocation | Idle at 02:46:13 UTC: zero messages and zero writes |
| Independent Calendar verification | Fresh get/list calls confirmed the revised time and three reminders, exactly one record per key, original ID preserved on update |
| Systemd timer | Enabled every 15 minutes with up to 30 seconds jitter; unit files validated, lingering enabled; next trigger observed as 08:30:20 IST |
| Public Plays | Not published yet |

The baseline repository had 42 passing tests and one macOS temporary-path failure.
This revision adds coverage for page/restart recovery, account and Calendar
binding, bad Calendar acknowledgments, truncated lookups, multiple milestones,
cancellations, deleted events, protected clone destinations and failing setup
commands. The wrapper tests cover idle/incomplete runs, rejected apply, command
timeouts, malformed receipts and preserving OAuth PKCE/callback fields.

The first Pi apply correctly failed on Google's `ACCESS_TOKEN_SCOPE_INSUFFICIENT`.
Its pending batch remained intact and no cursor advance was recorded. The
corrected consent preserved Rote's OAuth state, PKCE and callback. Google showed
the Modiqo client's unverified-app warning; the account owner chose to approve.
The subsequent real write and independent readback passed. This is why structural
validation and a successful Calendar read are insufficient release checks.

The service was exercised under its actual systemd environment. Timer enablement
and the computed next trigger were checked; this ledger does not claim a reboot
test or verified phone notification delivery. The newly found date-only deadline
was already on the current day, so it has no retroactive popup. The future
interview has one-day, one-hour and ten-minute popup reminders.

Both v0.2.0 package dry-runs passed. The router archive contains 53 files and
the workspace archive 39, including their setup instructions and synthetic
fixtures. Python bytecode was removed from the router archive. No private
execution trace, credential or real email is included. Public URI execution is
the remaining release check.
