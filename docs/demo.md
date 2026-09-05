# A two-minute Event Ready demo

Use a browser profile with private email tabs hidden. Show only a consented test
message or synthetic fixture, masked account identifiers and the relevant
Calendar entry. Do not expose Rote traces, tokens or unrelated inbox content.

1. **Problem, 15 seconds.** “A changed interview time or deadline is buried in
   email. Event Ready keeps my Calendar current and gets my project ready.”
2. **Classification, 25 seconds.** Run `python3 scripts/check_classifier.py`.
   Explain that these six messages are synthetic, but the classifier is real
   Codex. Show the nine assertions: two milestones, correct interview time,
   incomplete evidence ignored, embedded malicious instructions ignored.
3. **Real scheduled change, 35 seconds.** Show the Pi service receipt and one
   actual changed event with source link, timezone and popup reminders. Show its
   original ID and updated ID are the same. If no real change is pending, say
   “idle” and use the recorded verified change; do not fabricate a new email.
4. **Recovery, 20 seconds.** Show the test where a write fails, the pending batch
   survives, and the cursor advances only after confirmation. The genuine
   Google scope failure from development is an effective correction to narrate.
5. **Workspace, 20 seconds.** Preview the explicit clone URL, destination and
   dependency command. Run the workspace Play for a relevant event. Show the
   new repo, completed setup and editor. Rerun: it reuses the repository.
6. **Close, 5 seconds.** Show the two public versioned Play links once published
   and the command a stranger can run.

Useful live commands on the Pi:

```sh
systemctl --user status event-ready-inbox.timer --no-pager
journalctl --user -u event-ready-inbox.service -n 5 --no-pager
cat ~/.local/state/event-ready/inbox-event-router/last-run.json
```

Use a disposable directory **you explicitly chose** for the fresh clone. Do not
remove a user's existing repository to make the demo look repeatable. A second
empty destination is enough for another take.

Draft social post, to edit and post manually:

> I built Event Ready for #RotePlayoffs: two Rote Plays that turn event email into
> private Calendar reminders, then clone and prepare the right repository.
> The always-on part runs on a Raspberry Pi. My favourite test was the failed
> Calendar write: the pending inbox batch survived and retried without losing
> the cursor. Here is the actual run, including the correction.

Tag Modiqo and WeMakeDevs using their verified platform handles. Add the public
Play links and a real clip after publication; do not claim a win or unmeasured
adoption.
