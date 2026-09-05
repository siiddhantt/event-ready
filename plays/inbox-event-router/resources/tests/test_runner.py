import importlib.util
import argparse
import io
from contextlib import redirect_stdout
import json
import os
from pathlib import Path
import sys
import subprocess
sys.dont_write_bytecode = True
import tempfile
import unittest
from unittest.mock import patch

RESOURCES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RESOURCES))
import runner as run_inbox


class RunnerTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == "linux", "requires the real systemd unit parser")
    def test_schedule_units_pass_systemd_verification(self):
        with tempfile.TemporaryDirectory(prefix="event-ready-units-") as temp:
            state = Path(temp) / "state with spaces 100%"
            state.mkdir()
            for minutes in [5, 10, 15, 20, 30, 60]:
                service, timer = run_inbox.unit_contents(state, "primary", minutes)
                service_path = Path(temp) / "event-ready-inbox.service"
                timer_path = Path(temp) / "event-ready-inbox.timer"
                service_path.write_text(service)
                timer_path.write_text(timer)
                result = subprocess.run(["systemd-analyze", "--user", "verify", str(service_path), str(timer_path)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_idle_never_calls_classifier_or_apply(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(run_inbox, "command", return_value='{"status":"idle"}') as cmd, patch.object(run_inbox, "classify") as classify:
            result = run_inbox.process_batches("rote", "codex", {}, Path(temp), "primary", 7, 25, 4, None)
            self.assertEqual(result["status"], "idle")
            self.assertEqual(cmd.call_count, 1)
            self.assertIn(run_inbox.PLAY_REFERENCE, cmd.call_args.args[0])
            self.assertIn("--yes", cmd.call_args.args[0])
            classify.assert_not_called()

    def test_history_queries_confirmed_changes_and_keeps_distinct_milestones(self):
        record = {"at": "2026-09-05T12:00:00Z", "action": "apply", "status": "applied", "run_token": "t", "results": [
            {"message_id": "m", "event_key": "gmail.t.submit", "outcome": "created", "title": "Submit project", "start": {"date": "2026-09-08"}},
            {"message_id": "m", "event_key": "gmail.t.demo", "outcome": "updated", "title": "Project demo", "start": {"date": "2026-09-09"}},
            {"message_id": "other", "outcome": "ignored", "reason": "Newsletter"}]}
        with tempfile.TemporaryDirectory() as temp:
            (Path(temp) / "audit.jsonl").write_text(json.dumps(record) + "\n" + json.dumps(record) + "\n")
            self.assertEqual(len(run_inbox.history_rows(temp)), 3)
            args = argparse.Namespace(state_dir=temp, action_filter=None, all=False, since="2026-09-05T00:00:00Z", search="project", limit=20, json=True)
            output = io.StringIO()
            with redirect_stdout(output):
                run_inbox.history(args)
            self.assertEqual([r["action"] for r in json.loads(output.getvalue())], ["created", "updated"])
            args.action_filter, args.search = "ignored", "newsletter"
            output = io.StringIO()
            with redirect_stdout(output):
                run_inbox.history(args)
            self.assertEqual(json.loads(output.getvalue())[0]["reason"], "Newsletter")

    def test_legacy_history_counts_only_successful_applies(self):
        result = {"message_id": "m", "event_id": "e", "outcome": "create_planned"}
        with tempfile.TemporaryDirectory() as temp:
            (Path(temp) / "audit.jsonl").write_text("\n".join(json.dumps(r) for r in [
                {"at": "2026-09-05T12:00:00Z", "action": "apply", "status": "applied", "results": [result]},
                {"at": "2026-09-05T12:01:00Z", "action": "plan", "results": [result]}]))
            rows = run_inbox.history_rows(temp)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["action"], "created")

    def test_incomplete_collection_never_reaches_calendar_writes(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(run_inbox, "command", return_value='{"status":"incomplete"}') as cmd, patch.object(run_inbox, "classify") as classify:
            with self.assertRaisesRegex(RuntimeError, "Collection incomplete"):
                run_inbox.process_batches("rote", "codex", {}, Path(temp), "primary", 7, 25, 4, None)
            self.assertEqual(cmd.call_count, 1)
            classify.assert_not_called()

    def test_failed_apply_is_not_reported_as_processed(self):
        outputs = ['{"status":"needs_agent_decision","messages":[{"message_id":"a"}],"run_token":"t"}', '{"status":"rejected"}']
        with tempfile.TemporaryDirectory() as temp, patch.object(run_inbox, "command", side_effect=outputs), patch.object(run_inbox, "classify", return_value=Path(temp) / "decisions.json"):
            with self.assertRaisesRegex(RuntimeError, "did not commit"):
                run_inbox.process_batches("rote", "codex", {}, Path(temp), "primary", 7, 25, 4, None)

    def test_command_timeout_terminates_the_process(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                run_inbox.command([sys.executable, "-c", "import time;time.sleep(60)"], env=dict(os.environ), cwd=temp, timeout=0.1)

    def test_zero_exit_with_non_json_is_a_failure(self):
        with self.assertRaisesRegex(RuntimeError, "JSON receipt"):
            run_inbox.result_json("error: not logged in")

    def test_classifier_cannot_forge_source_timestamp(self):
        collection = {"run_token": "t", "messages": [{"message_id": "m", "thread_id": "thread", "internal_date_ms": 1788609600000}]}
        for stamp, valid in [("2026-09-05T12:00:00Z", True), ("2026-09-06T12:00:00Z", False), ("2026-09-05T12:00:00", False)]:
            with self.subTest(timestamp=stamp), tempfile.TemporaryDirectory() as temp:
                output = Path(temp) / "decisions.json"
                output.write_text(json.dumps({"run_token": "t", "decisions": [{"message_id": "m", "action": "upsert", "source_thread_id": "thread", "source_received_at": stamp}]}))
                with patch.object(run_inbox, "command", return_value=""):
                    if valid:
                        self.assertEqual(run_inbox.classify(collection, env={}, cwd=temp, codex="codex"), output)
                    else:
                        with self.assertRaisesRegex(RuntimeError, "received timestamp"):
                            run_inbox.classify(collection, env={}, cwd=temp, codex="codex")

    def test_calendar_scope_fix_preserves_pkce_and_callback(self):
        spec = importlib.util.spec_from_file_location("authorize", RESOURCES / "authorize-calendar.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        from urllib.parse import parse_qs, urlparse
        original = "https://accounts.google.com/o/oauth2/v2/auth?state=test&code_challenge=challenge&client_id=client&redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fcallback&scope=profile"
        query = parse_qs(urlparse(module.consent_url(original)).query)
        self.assertEqual(query["state"], ["test"])
        self.assertEqual(query["code_challenge"], ["challenge"])
        self.assertEqual(query["redirect_uri"], ["http://localhost:8765/callback"])
        self.assertIn("https://www.googleapis.com/auth/calendar.events.owned", query["scope"][0])
        with self.assertRaises(ValueError):
            module.consent_url(original.replace("accounts.google.com", "example.test"))


if __name__ == "__main__":
    unittest.main()
