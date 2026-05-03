"""
Agent 02 — Document Summarizer
approval: none  |  on_failure: return_partial

FileExtractor is mocked (no real file on disk).
LLMGenerator._call is mocked to return canned text for map, reduce, and entity passes.
FileDispatcher writes to output/summaries/ in dry-run mode — no assertions on file content.
"""
from unittest.mock import patch
from core.base_agent import ExecutionRunner
from steps.base_step import StepResult

_ENVELOPE = {
    "intake": {
        "department": "Finance",
        "task_type": "document_summary",
        "isAutonomous": False,
        "confidence": 0.88,
        "processed_at": "2026-05-03T10:00:00Z",
    },
    "task": {
        "task_id": "T002",
        "title": "Summarise Q1 Report",
        "description": "Summarise the attached quarterly finance report.",
        "department": "Finance",
        "isAutonomous": False,
        "task_type": "document_summary",
        "requester_name": "bob@company.com",
        "stated_deadline": "2026-05-04",
        "action_required": "Produce summary and extract key entities",
        "success_criteria": "Summary and entities saved to output",
        "structured_at": "2026-05-03T10:05:00Z",
        "has_attachments": True,
        "attachment_path": "data/q1_report.txt",
    },
    "priority": {
        "priority_score": 3,
        "priority_label": "medium",
        "confidence": 0.9,
        "model_version": "v1",
        "top_features_used": [],
        "scored_at": "2026-05-03T10:10:00Z",
    },
}

# LLMGenerator._call side-effects:
#   calls 1-2 → map phase (one per chunk)
#   call  3   → reduce phase
#   call  4   → extract_entities single-pass (returns JSON so _try_json parses it)
_LLM_RESPONSES = [
    "Chunk 1 partial summary: revenue increased in Q1.",
    "Chunk 2 partial summary: expenses were within budget.",
    "Final summary: Q1 revenue up, expenses in budget.",
    '{"people": ["Alice", "Bob"], "dates": ["Q1 2026"], "amounts": ["12.4M EGP"], "departments": ["Finance"]}',
]


def test_02_document_summarizer():
    runner = ExecutionRunner("configs/02_document_summarizer.json")

    with (
        patch(
            "steps.extractors.file_extractor.FileExtractor.run",
            return_value=StepResult(
                True,
                {"chunks": ["chunk one text", "chunk two text"], "format": "txt", "total_chunks": 2},
                None,
            ),
        ),
        patch(
            "steps.processors.llm_generator.LLMGenerator._call",
            side_effect=_LLM_RESPONSES,
        ),
    ):
        result = runner.execute(_ENVELOPE.copy())

    assert "execution" in result
    assert result["execution"]["agent_name"] == "document_summarizer"
    assert result["execution"]["status"] == "completed"
    assert "summarise_chunks" in result["execution"]["steps"]
    assert "extract_entities" in result["execution"]["steps"]
    assert "store_summary" in result["execution"]["steps"]
