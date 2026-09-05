# Raspberry Pi setup and operations

Tested on an aarch64 Debian Raspberry Pi with Rote 0.80.0, Codex CLI 0.153.4,
Deno 2.7.5 and Python 3.13.5. The inbox runs on the Pi; the workspace Play runs on
the desktop where your editor is installed. The service expects this checkout
at `~/event-ready`.

## Install and authenticate

Install Rote from `https://getrote.dev/install` and the matching official
[Codex CLI release](https://github.com/openai/codex/releases). Inspect downloaded
installers before running them. Install the aarch64 Linux Codex binary on the Pi,
not the macOS binary. Keep `rote`, `codex` and `deno` on PATH:

```sh
export PATH="$HOME/.local/bin:$HOME/.rote/bin:$PATH"
rote deno install
rote login --provider github
codex login --device-auth
rote registry adapter pull modiqo/gmail --yes
rote registry adapter pull modiqo/calendar --yes
```

Complete Codex's device sign-in using your ChatGPT account. A desktop login alone
does not authenticate the Pi. Do not copy credentials into this repository or
the systemd files. For Rote on a headless machine, you can alternatively use
`rote provision --ttl 10` on an authenticated machine and `rote claim` on the Pi;
treat the short-lived provisioning token as a password.

Google's callback uses port 8765. From your desktop, open an SSH session with a
local forward (replace `pi@pi.local` if your account or hostname differs):

```sh
ssh -t -L 8765:127.0.0.1:8765 pi@pi.local
export PATH="$HOME/.local/bin:$HOME/.rote/bin:$PATH"
rote oauth setup google --adapter gmail --scopes gmail.readonly
```

Open the consent URL on the same desktop that owns the SSH tunnel. Keep the SSH
session open until the CLI confirms success. If automatic browser opening is
unavailable, use Rote's displayed URL or a browser handler that prints it.

### Calendar scope correction for Rote 0.80.0

Rote 0.80.0's Google setup shorthand silently drops `calendar.events.owned`.
Passing full scope URLs also does not fix the setup command. A green adapter
health check only proves the token is fresh; it does not prove write permission.

Use the included local browser handler in the forwarded SSH session:

```sh
python3 ~/event-ready/plays/inbox-event-router/resources/authorize-calendar.py --print-url
```

Open the printed Google consent link on your desktop and allow access to events
on calendars you own. The helper adds the official `calendar.events.owned` and
`calendar.events.readonly` scopes to Rote's consent URL. It preserves Rote's
client, callback, state and PKCE challenge. Google handles consent and Rote
handles token exchange, refresh and storage; the helper never reads tokens.
The printed URL belongs to that running attempt and expires with it.

Google currently shows **“Google hasn't verified this app”** for this Modiqo
client and Calendar grant. Continue through Advanced only if you trust Modiqo
with the requested access; otherwise stop and configure an OAuth client you
control. This warning is not proof of Google approval, and Event Ready cannot
remove it. See [Google's explanation of unverified apps](https://support.google.com/googleapi/answer/7454865).

If the browser has no screen, use the printed link directly. If the callback
cannot connect, check that port 8765 is forwarded and that the Rote process is
still waiting. Start a fresh attempt after an expired or denied consent.

## Verify before scheduling

```sh
cd ~/event-ready
deno task test
python3 -m unittest discover -s tests -v
python3 scripts/check_classifier.py
python3 scripts/run_inbox.py --max-batches 1
cat ~/.local/state/event-ready/inbox-event-router/last-run.json
```

The classifier check uses synthetic email and your actual Codex account, without
Gmail or Calendar calls. The final runner command uses real email and may write
private events. Inspect its resulting Calendar records before enabling the
timer. An all-ignore batch verifies classification and cursor handling but does
not establish Calendar write permission.

## Enable the timer

```sh
mkdir -p ~/.config/systemd/user
cp deploy/event-ready-inbox.service deploy/event-ready-inbox.timer ~/.config/systemd/user/
systemd-analyze --user verify ~/.config/systemd/user/event-ready-inbox.service ~/.config/systemd/user/event-ready-inbox.timer
loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user start event-ready-inbox.service
systemctl --user enable --now event-ready-inbox.timer
systemctl --user list-timers event-ready-inbox.timer
```

The timer runs every 15 minutes with up to 30 seconds of jitter. `Persistent=true`
catches a missed timer after downtime. Lingering keeps the user service manager
alive without an SSH session. If your system denies enabling linger, its
administrator must enable it for your user before unattended deployment is ready.

Each invocation processes at most four pages of 25 messages. An OS lock prevents
overlapping runner invocations. Each external command has a timeout, and systemd
limits the complete invocation to 14 minutes. Work remaining after the limit is
retried on the next run. A failed run exits nonzero and writes a private summary.
It does not itself send push notifications about operational failures.

To choose a Calendar, model, or batch limit, use `systemctl --user edit
event-ready-inbox.service` and replace `ExecStart` in a `[Service]` section (first
set an empty `ExecStart=`). Keep the same state directory for a given Gmail
account and Calendar. A different pair needs a separate state directory.

## Inspect, pause and recover

```sh
systemctl --user status event-ready-inbox.service event-ready-inbox.timer
journalctl --user -u event-ready-inbox.service -n 20 --no-pager
cat ~/.local/state/event-ready/inbox-event-router/last-run.json
systemctl --user disable --now event-ready-inbox.timer
```

Disabling the timer does not interrupt an already running invocation. Stop the
service too if you need it to stop immediately. The pending batch remains
recoverable; Calendar writes already completed are discovered on retry.

On an OAuth, quota, network or classifier failure, fix the cause and rerun the
service. **Do not clear the pending batch or advance the cursor by hand.** The
Play rechecks Calendar before retrying writes, and verifies the returned event
IDs before committing. An uncertain reply from Google cannot discard email work.

If a Gmail page token has expired, first preserve a copy of the stopped service's
state directory. A separate `--state-dir` and `--lookback` run can replay the
relevant recent window against the same Calendar with duplicate checks, without
destroying the original pending evidence. This is also the explicit recovery
path for unusually late imported mail outside the five-minute cursor overlap.
Choose a lookback covering the affected dates (maximum 30 days). Do not claim
older mail was processed merely because a new scan completed.

The journal and `last-run.json` contain compact counts and failure summaries.
Detailed Rote traces under `~/.rote/workspaces` can contain full email bodies,
Calendar details and decisions. Keep that directory owner-private (`chmod 700
~/.rote/workspaces`), inspect locally, and exclude it from demos and Git. Cursor
state and audit files live under `~/.local/state/event-ready/inbox-event-router`.
Back up that directory securely with the service stopped before moving hosts.

Phone reminders require Google Calendar sync and notifications on the phone.
Check one actual upcoming event's reminder settings there; successful API writes
alone cannot verify delivery on another device.
