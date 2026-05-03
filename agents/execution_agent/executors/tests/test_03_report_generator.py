from core.base_agent import ExecutionRunner

def test_03_report_generator():
    runner = ExecutionRunner("configs/03_report_generator.json")
    
    envelope = {
        "intake": {"department": "cross-dept", "task_type": "test", "isAutonomous": False, "confidence": 0.9, "processed_at": "2026-05-03T10:00:00Z"},
        "task": {"task_id": "T003", "title": "Test Task", "description": "Test description", "department": "cross-dept", "isAutonomous": False, "task_type": "test", "requester_name": "John Doe", "stated_deadline": "2026-05-04", "action_required": "action", "success_criteria": "success", "structured_at": "2026-05-03T10:05:00Z"},
        "priority": {"priority_score": 2, "priority_label": "low", "confidence": 0.95, "model_version": "v1", "top_features_used": [], "scored_at": "2026-05-03T10:10:00Z"}
    }
    
    result = runner.execute(envelope)
    assert "execution" in result
    assert result["execution"]["agent_name"] == runner.config["agent_name"]
