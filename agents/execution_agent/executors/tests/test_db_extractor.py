"""
Tests for DBExtractor.

SQLite queries use an in-memory database created per-test so there is no
dependency on a real file and tests are fully isolated.

Test envelope is modelled on the Leave Checker (agent 4):
  - HR department, leave_checker agent
  - requester: Sara Ahmed, leave_type: annual
"""
import os
import sys
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from steps.extractors.db_extractor import DBExtractor


# ------------------------------------------------------------------
# Shared fixture — Leave Checker envelope (agent 4)
# ------------------------------------------------------------------

LEAVE_CHECKER_ENVELOPE = {
    "envelope_id": "ENV-LC-001",
    "raw_text":    "Sara Ahmed is requesting annual leave from 2026-05-10 to 2026-05-14.",
    "received_at": "2026-05-02T08:00:00Z",
    "intake": {
        "department":   "HR",
        "task_type":    "leave_request",
        "isAutonomous": True,
        "confidence":   0.95,
        "processed_at": "2026-05-02T08:01:00Z",
    },
    "task": {
        "task_id":         "TASK-LC-001",
        "title":           "Annual leave request — Sara Ahmed",
        "description":     "Sara Ahmed is requesting 5 days of annual leave.",
        "department":      "HR",
        "isAutonomous":    True,
        "task_type":       "leave_request",
        "requester_name":  "Sara Ahmed",
        "stated_deadline": "2026-05-09",
        "action_required": "Check leave balance and confirm or deny.",
        "success_criteria": "Reply sent with approval or denial and remaining balance.",
        "structured_at":   "2026-05-02T08:02:00Z",
        # Domain-specific field written by the intake agent for leave tasks.
        "employee_name":   "Sara Ahmed",
        "leave_type":      "annual",
    },
    "priority": {
        "priority_score":  2,
        "priority_label":  "medium",
        "confidence":      0.88,
        "model_version":   "v1",
        "scored_at":       "2026-05-02T08:03:00Z",
    },
    "execution": {
        "agent_name":    "leave_checker",
        "agent_version": "v1",
        "status":        "running",
        "started_at":    "2026-05-02T08:04:00Z",
        "completed_at":  None,
        "approval":      "none",
        "result":        {},
        "agent_calls":   {},
        "errors":        [],
        "steps":         {},
    },
}


def _make_envelope(**overrides):
    import copy
    env = copy.deepcopy(LEAVE_CHECKER_ENVELOPE)
    for key, val in overrides.items():
        env[key] = val
    return env


def _seed_db(db_path: str):
    """Create and populate hr_leave_balances in a temp SQLite file."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE hr_leave_balances (
            employee_name TEXT,
            leave_type    TEXT,
            balance_days  INTEGER,
            year          INTEGER
        )
        """
    )
    conn.execute(
        "INSERT INTO hr_leave_balances VALUES (?, ?, ?, ?)",
        ("Sara Ahmed", "annual", 12, 2026),
    )
    conn.execute(
        "INSERT INTO hr_leave_balances VALUES (?, ?, ?, ?)",
        ("Sara Ahmed", "sick", 5, 2026),
    )
    conn.execute(
        "INSERT INTO hr_leave_balances VALUES (?, ?, ?, ?)",
        ("John Doe", "annual", 8, 2026),
    )
    conn.commit()
    conn.close()


# ------------------------------------------------------------------
# Tests — service mock path
# ------------------------------------------------------------------

class TestDBExtractorServiceMock(unittest.TestCase):

    def test_calendar_api_returns_mock(self):
        extractor = DBExtractor()
        config = {"service": "calendar_api"}
        result = extractor.run(_make_envelope(), config)

        self.assertTrue(result.success)
        self.assertIsNone(result.error)
        self.assertIn("available_slots", result.data)

    def test_compliance_checker_returns_mock(self):
        extractor = DBExtractor()
        config = {"service": "compliance_checker"}
        result = extractor.run(_make_envelope(), config)

        self.assertTrue(result.success)
        self.assertIn("compliant", result.data)

    def test_unknown_service_returns_generic_mock(self):
        extractor = DBExtractor()
        config = {"service": "mystery_service"}
        result = extractor.run(_make_envelope(), config)

        self.assertTrue(result.success)
        self.assertEqual(result.data.get("service"), "mystery_service")
        self.assertTrue(result.data.get("mocked"))


# ------------------------------------------------------------------
# Tests — SQLite query path
# ------------------------------------------------------------------

class TestDBExtractorSQLite(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.db_path = self.tmp.name
        _seed_db(self.db_path)
        self.env_patch = patch.dict(os.environ, {"DB_PATH": self.db_path})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        Path(self.db_path).unlink(missing_ok=True)

    def test_match_on_task_fields_returns_correct_row(self):
        extractor = DBExtractor()
        config = {
            "table":    "hr_leave_balances",
            "match_on": ["employee_name", "leave_type"],
        }
        result = extractor.run(_make_envelope(), config)

        self.assertTrue(result.success)
        self.assertIsNone(result.error)
        rows = result.data["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["employee_name"], "Sara Ahmed")
        self.assertEqual(rows[0]["leave_type"], "annual")
        self.assertEqual(rows[0]["balance_days"], 12)

    def test_match_on_prefers_step_data_over_task(self):
        """Values from a prior step shadow task-block values for match_on columns."""
        env = _make_envelope()
        env["execution"]["steps"]["extract_intent"] = {
            "data": {"employee_name": "John Doe", "leave_type": "annual"}
        }
        extractor = DBExtractor()
        config = {
            "table":    "hr_leave_balances",
            "match_on": ["employee_name", "leave_type"],
        }
        result = extractor.run(env, config)

        self.assertTrue(result.success)
        rows = result.data["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["employee_name"], "John Doe")

    def test_no_match_returns_empty_rows(self):
        env = _make_envelope()
        env["task"]["employee_name"] = "Nobody Here"
        extractor = DBExtractor()
        config = {
            "table":    "hr_leave_balances",
            "match_on": ["employee_name"],
        }
        result = extractor.run(env, config)

        self.assertTrue(result.success)
        self.assertEqual(result.data["rows"], [])
        self.assertEqual(result.data["row_count"], 0)

    def test_empty_match_on_returns_all_rows(self):
        extractor = DBExtractor()
        config = {"table": "hr_leave_balances", "match_on": []}
        result = extractor.run(_make_envelope(), config)

        self.assertTrue(result.success)
        self.assertEqual(result.data["row_count"], 3)

    def test_missing_db_returns_empty_rows(self):
        with patch.dict(os.environ, {"DB_PATH": "/nonexistent/path/db.sqlite"}):
            extractor = DBExtractor()
            config = {
                "table":    "hr_leave_balances",
                "match_on": ["employee_name"],
            }
            result = extractor.run(_make_envelope(), config)

        self.assertTrue(result.success)
        self.assertEqual(result.data["rows"], [])


# ------------------------------------------------------------------
# Tests — error handling contract
# ------------------------------------------------------------------

class TestDBExtractorNeverRaises(unittest.TestCase):

    def test_missing_table_returns_failure(self):
        extractor = DBExtractor()
        config = {"match_on": ["employee_name"]}
        result = extractor.run(_make_envelope(), config)

        self.assertFalse(result.success)
        self.assertIn("table", result.error)
        self.assertEqual(result.data, {})

    def test_bad_table_name_returns_failure_not_exception(self):
        """OperationalError from SQLite must be caught and returned as failure."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        # Create an empty DB — no tables.
        sqlite3.connect(db_path).close()

        with patch.dict(os.environ, {"DB_PATH": db_path}):
            extractor = DBExtractor()
            config = {"table": "nonexistent_table", "match_on": []}
            result = extractor.run(_make_envelope(), config)

        Path(db_path).unlink(missing_ok=True)
        self.assertFalse(result.success)
        self.assertIsNotNone(result.error)
        self.assertEqual(result.data, {})

    def test_result_has_rows_and_row_count(self):
        """StepResult.data always has both 'rows' and 'row_count' keys on success."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        _seed_db(db_path)

        with patch.dict(os.environ, {"DB_PATH": db_path}):
            extractor = DBExtractor()
            config = {"table": "hr_leave_balances", "match_on": []}
            result = extractor.run(_make_envelope(), config)

        Path(db_path).unlink(missing_ok=True)
        self.assertIn("rows", result.data)
        self.assertIn("row_count", result.data)
        self.assertEqual(result.data["row_count"], len(result.data["rows"]))


if __name__ == "__main__":
    unittest.main()
