"""
Tests for NLPExtractor.

All tests run without a real LLM — the OpenRouter client is patched out via
unittest.mock so the suite is fully offline and deterministic.

Test envelope is modelled on the Leave Checker (agent 4) from the spec:
  - HR department, leave_checker agent
  - requester: Sara Ahmed requesting annual leave
"""
import sys
import os
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from steps.extractors.nlp_extractor import NLPExtractor


# ------------------------------------------------------------------
# Shared fixture — Leave Checker envelope (agent 4)
# ------------------------------------------------------------------

LEAVE_CHECKER_ENVELOPE = {
    "envelope_id": "ENV-LC-001",
    "raw_text": (
        "Hi, I'm Sara Ahmed from HR. I'd like to request 5 days of annual leave "
        "from 2026-05-10 to 2026-05-14. My employee ID is EMP-442. "
        "Please confirm whether I have enough balance."
    ),
    "received_at": "2026-05-02T08:00:00Z",
    "intake": {
        "department":    "HR",
        "task_type":     "leave_request",
        "isAutonomous":  True,
        "confidence":    0.95,
        "processed_at":  "2026-05-02T08:01:00Z",
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
    },
    "priority": {
        "priority_score":  2,
        "priority_label":  "medium",
        "confidence":      0.88,
        "model_version":   "v1",
        "top_features_used": ["deadline", "department"],
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
    """Return a deep-ish copy of the base envelope with optional overrides applied."""
    import copy
    env = copy.deepcopy(LEAVE_CHECKER_ENVELOPE)
    for key, val in overrides.items():
        env[key] = val
    return env


# ------------------------------------------------------------------
# Tests
# ------------------------------------------------------------------

class TestNLPExtractorEnvelopeLookup(unittest.TestCase):
    """Fields that exist in the envelope — no LLM should be called."""

    def setUp(self):
        self.extractor = NLPExtractor()

    def test_extracts_task_fields(self):
        env = _make_envelope()
        config = {"fields_to_extract": ["requester_name", "stated_deadline", "task_id"]}
        result = self.extractor.run(env, config)

        self.assertTrue(result.success)
        self.assertIsNone(result.error)
        self.assertEqual(result.data["requester_name"], "Sara Ahmed")
        self.assertEqual(result.data["stated_deadline"], "2026-05-09")
        self.assertEqual(result.data["task_id"], "TASK-LC-001")

    def test_extracts_intake_fields(self):
        env = _make_envelope()
        config = {"fields_to_extract": ["department", "task_type", "isAutonomous"]}
        result = self.extractor.run(env, config)

        self.assertTrue(result.success)
        self.assertEqual(result.data["department"], "HR")
        self.assertEqual(result.data["task_type"], "leave_request")
        self.assertTrue(result.data["isAutonomous"])

    def test_extracts_priority_fields(self):
        env = _make_envelope()
        config = {"fields_to_extract": ["priority_score", "priority_label"]}
        result = self.extractor.run(env, config)

        self.assertTrue(result.success)
        self.assertEqual(result.data["priority_score"], 2)
        self.assertEqual(result.data["priority_label"], "medium")

    def test_empty_fields_list_returns_empty_data(self):
        env = _make_envelope()
        config = {"fields_to_extract": []}
        result = self.extractor.run(env, config)

        self.assertTrue(result.success)
        self.assertEqual(result.data, {})

    def test_prefers_step_data_over_task_for_custom_field(self):
        """A field written by a prior step should shadow any task-block value."""
        env = _make_envelope()
        env["execution"]["steps"]["earlier_step"] = {
            "data": {"employee_name": "Sara Ahmed (from step)"}
        }
        env["task"]["employee_name"] = "Sara Ahmed (from task)"

        config = {"fields_to_extract": ["employee_name"]}
        result = self.extractor.run(env, config)

        self.assertTrue(result.success)
        self.assertEqual(result.data["employee_name"], "Sara Ahmed (from step)")


def _make_mock_client(json_response: str) -> MagicMock:
    """Return a mock OpenAI client whose completions.create returns json_response."""
    mock_choice = MagicMock()
    mock_choice.message.content = json_response
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response
    return mock_client


class TestNLPExtractorLLMFallback(unittest.TestCase):
    """Fields not in the envelope trigger an LLM call.

    The client is now module-level (_client / _get_client), so tests patch
    'steps.extractors.nlp_extractor._get_client' to inject the mock.
    """

    def test_llm_called_for_unknown_field(self):
        env = _make_envelope()
        mock_client = _make_mock_client(
            '{"leave_type": "annual", "date_range": "2026-05-10 to 2026-05-14"}'
        )
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            result = NLPExtractor().run(env, {"fields_to_extract": ["leave_type", "date_range"]})

        self.assertTrue(result.success)
        self.assertEqual(result.data["leave_type"], "annual")
        self.assertEqual(result.data["date_range"], "2026-05-10 to 2026-05-14")
        mock_client.chat.completions.create.assert_called_once()

    def test_llm_not_called_when_all_fields_resolved(self):
        env = _make_envelope()
        mock_client = _make_mock_client("{}")
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            NLPExtractor().run(env, {"fields_to_extract": ["requester_name", "department"]})

        mock_client.chat.completions.create.assert_not_called()

    def test_llm_null_for_unresolvable_field(self):
        env = _make_envelope()
        mock_client = _make_mock_client('{"mystery_field": null}')
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            result = NLPExtractor().run(env, {"fields_to_extract": ["mystery_field"]})

        self.assertTrue(result.success)
        self.assertIsNone(result.data["mystery_field"])

    def test_llm_json_parse_failure_returns_none(self):
        """If the LLM returns non-JSON, fields are set to None — never raises."""
        env = _make_envelope()
        mock_client = _make_mock_client("I cannot extract that.")
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            result = NLPExtractor().run(env, {"fields_to_extract": ["leave_type"]})

        self.assertTrue(result.success)
        self.assertIsNone(result.data["leave_type"])

    def test_llm_markdown_fenced_json_parsed_correctly(self):
        """LLM sometimes wraps JSON in ```json ... ``` — must still parse."""
        env = _make_envelope()
        mock_client = _make_mock_client('```json\n{"leave_type": "sick"}\n```')
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            result = NLPExtractor().run(env, {"fields_to_extract": ["leave_type"]})

        self.assertTrue(result.success)
        self.assertEqual(result.data["leave_type"], "sick")

    def test_empty_raw_text_skips_llm_and_returns_none(self):
        env = _make_envelope()
        env["raw_text"] = ""
        mock_client = _make_mock_client("{}")
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            result = NLPExtractor().run(env, {"fields_to_extract": ["leave_type"]})

        self.assertTrue(result.success)
        self.assertIsNone(result.data["leave_type"])
        mock_client.chat.completions.create.assert_not_called()


class TestNLPExtractorNeverRaises(unittest.TestCase):
    """run() must return StepResult(success=False) instead of raising."""

    def test_client_exception_returns_failure(self):
        env = _make_envelope()
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = RuntimeError("network timeout")
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            result = NLPExtractor().run(env, {"fields_to_extract": ["leave_type"]})

        self.assertFalse(result.success)
        self.assertIn("network timeout", result.error)
        self.assertEqual(result.data, {})

    def test_missing_envelope_keys_do_not_raise(self):
        """Envelope missing intake/task/priority sections — must not crash."""
        mock_client = _make_mock_client('{"x": null}')
        with patch("steps.extractors.nlp_extractor._get_client", return_value=mock_client):
            result = NLPExtractor().run({}, {"fields_to_extract": ["x"]})

        self.assertIsInstance(result.success, bool)


if __name__ == "__main__":
    unittest.main()
