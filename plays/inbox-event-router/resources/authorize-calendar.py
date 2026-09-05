#!/usr/bin/env python3
"""Authorize Event Ready Calendar scopes with Rote 0.80's built-in Google client.

Rote 0.80's setup shorthand drops calendar.events.owned. This local browser
handler adds that documented Google scope to the consent request; Google still
asks the user for approval and Rote owns PKCE, callback and token storage.
"""
import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import webbrowser
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

SCOPES = ("https://www.googleapis.com/auth/calendar.events.owned",
          "https://www.googleapis.com/auth/calendar.events.readonly")


def consent_url(raw):
    parsed = urlparse(raw)
    if parsed.scheme != "https" or parsed.netloc != "accounts.google.com" or parsed.path != "/o/oauth2/v2/auth":
        raise ValueError("Expected the official Google OAuth authorization endpoint")
    query = parse_qs(parsed.query)
    if not query.get("state") or not query.get("code_challenge"):
        raise ValueError("OAuth state and PKCE are required")
    scopes = set(query.get("scope", [""])[0].split())
    scopes.update(SCOPES)
    query["scope"] = [" ".join(sorted(scopes))]
    return urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in query.items()})))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--open", help=argparse.SUPPRESS)
    parser.add_argument("--print-url", action="store_true", help="Print the consent URL for a headless host. Forward localhost:8765 over SSH first.")
    args = parser.parse_args()
    if args.open:
        url = consent_url(args.open)
        if os.environ.get("EVENT_READY_OAUTH_PRINT") == "1":
            # Rote hides browser subprocess stdout; use the terminal directly.
            with open("/dev/tty", "w") as terminal:
                terminal.write("\nAuthorize Calendar in your browser:\n" + url + "\n\n")
        else:
            os.environ.pop("BROWSER", None)
            webbrowser.open(url)
        return 0
    rote = shutil.which("rote") or str(Path.home() / ".local/bin/rote")
    with tempfile.TemporaryDirectory(prefix="event-ready-oauth-") as temp:
        handler = Path(temp) / "open-google-consent"
        handler.write_text("#!/bin/sh\nexec " + shlex.join([sys.executable, str(Path(__file__).resolve()), "--open"]) + ' "$1"\n')
        handler.chmod(0o700)
        env = dict(os.environ, BROWSER=str(handler), EVENT_READY_OAUTH_PRINT="1" if args.print_url else "0")
        result = subprocess.run([rote, "oauth", "setup", "google", "--adapter", "calendar", "--scopes", "calendar.events.readonly"], env=env)
        return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
