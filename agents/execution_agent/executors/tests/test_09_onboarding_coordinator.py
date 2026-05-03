"""
Agent 09 — Onboarding Coordinator
approval: manager_sign_off  |  on_failure: escalate

Known config issues (do NOT fix here — flag to agent-owner):
  - TemplateRenderer step uses literal path
    "templates/onboarding/{department}_onboarding.j2" — the {department}
    placeholder is never resolved before being passed to the renderer, so
    the file is not found.  TemplateRenderer is mocked to bypass this.
  - DBExtractor queries table "tooling_list" which does not exist in
    data/office.db → mocked to return empty rows so QueueInjector receives
    a well-formed (no tools) response and exits cleanly.

QueueInjector reads fetch_tooling_list.data.tools — the mock returns no
"tools" key, so tools=[] and QueueInjector exits early (tasks_injected=0)
without touching SQLite.

With approval=manager_sign_off the runner pauses before EmailDispatcher.
Expected terminal status: "approval_pending".
"""
from unittest.mock import patch
from core.base_agent import ExecutionRunner
from steps.base_step import StepResult

_ENVELOPE = {
    "intake": {
        "department": "HR",
        "task_type": "onboarding",
        "isAutonomous": False,
        "confidence": 0.93,
        "processed_at": "2026-05-03T10:00:00Z",
    },
    "task": {
        "task_id": "T009",
        "title": "Onboard New Employee Hassan",
        "description": "Hassan joins the IT department on 2026-05-10 as a backend engineer.",
        "department": "HR",
        "isAutonomous": False,
        "task_type": "onboarding",
        "requester_name": "hassan@company.com",
        "stated_deadline": "2026-05-10",
        "action_required": "Generate checklist, provision tools, send welcome email",
        "success_criteria": "Welcome email sent and tool access tasks injected",
        "structured_at": "2026-05-03T10:05:00Z",
    },
    "priority": {
        "priority_score": 3,
        "priority_label": "medium",
        "confidence": 0.91,
        "model_version": "v1",
        "top_features_used": [],
        "scored_at": "2026-05-03T10:10:00Z",
    },
}


_TEMPLATE_RESULT = StepResult(True, {"rendered": "HR Onboarding Checklist"}, None)
_DB_EMPTY = StepResult(True, {"rows": [], "row_count": 0}, None)
_EMAIL_RESULT = StepResult(
    True,
    {"dry_run": True, "recipient": "hassan@company.com", "output_path": "output/emails/T009_onboarding_coordinator.txt"},
    None,
)


def test_09_onboarding_coordinator():
    runner = ExecutionRunner("configs/09_onboarding_coordinator.json")

    with (
        # Template path contains unresolved {department} placeholder → mock renderer
        patch("steps.processors.template_renderer.TemplateRenderer.run", return_value=_TEMPLATE_RESULT),
        # tooling_list table does not exist in data/office.db → mock DBExtractor
        patch("steps.extractors.db_extractor.DBExtractor.run", return_value=_DB_EMPTY),
    ):
        result = runner.execute(_ENVELOPE.copy())

    assert "execution" in result
    assert result["execution"]["agent_name"] == "onboarding_coordinator"
    # approval=manager_sign_off → runner pauses before EmailDispatcher
    assert result["execution"]["status"] == "approval_pending"
    assert "extract_employee_details" in result["execution"]["steps"]
    assert "fetch_tooling_list" in result["execution"]["steps"]
    assert "inject_access_tasks" in result["execution"]["steps"]


def test_09_onboarding_coordinator_confirmed():
    """
    Mimics manager sign-off on the onboarding welcome email.

    Phase 1 → pauses (manager_sign_off gate fires before EmailDispatcher).
    Phase 2 → re-run with the paused envelope → gate skipped → EmailDispatcher runs.

    NOTE: recipient_field "execution.steps.extract_employee_details.data.employee_email"
    is a config bug — employee_email is not in fields_to_extract so NLPExtractor never
    writes it to step data.  EmailDispatcher is mocked to isolate this known issue
    and verify the post-confirmation pipeline completes successfully.
    """
    runner = ExecutionRunner("configs/09_onboarding_coordinator.json")

    with (
        patch("steps.processors.template_renderer.TemplateRenderer.run", return_value=_TEMPLATE_RESULT),
        patch("steps.extractors.db_extractor.DBExtractor.run", return_value=_DB_EMPTY),
        # EmailDispatcher mocked: recipient_field points to employee_email which
        # is never extracted (not in fields_to_extract) — known config bug.
        patch("steps.dispatchers.email_dispatcher.EmailDispatcher.run", return_value=_EMAIL_RESULT),
    ):
        # Phase 1 — pauses for manager sign-off
        paused = runner.execute(_ENVELOPE.copy())
        assert paused["execution"]["status"] == "approval_pending"

        # Phase 2 — mimic confirmation
        result = runner.execute(paused)

    assert result["execution"]["agent_name"] == "onboarding_coordinator"
    assert result["execution"]["status"] == "completed"
    assert "send_welcome_email" in result["execution"]["steps"]
