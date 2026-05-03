# smoke_leave_checker.py
import json, pathlib, sys, os
sys.path.insert(0, ".")
os.environ["DB_PATH"] = "data/office.db"

from core.step_registry import STEP_REGISTRY

# Exact envelope shape from the design doc (Agent 4 example)
envelope = {
    "raw_text": "Hi, can you check how many annual leave days I have left this year?",
    "intake": {"department": "HR", "task_type": "leave_balance_inquiry", "isAutonomous": True},
    "task": {
        "task_id": "TASK-2301",
        "title": "Annual leave balance inquiry",
        "requester_name": "Ali Abdallah",
        "stated_deadline": "none stated",
        "action_required": "Query HR system and return leave balance for requester",
        "success_criteria": "Requester receives accurate leave balance by reply email",
    },
    "priority": {"priority_score": 1, "priority_label": "low", "confidence": 0.92},
    "execution": {"agent_name": "leave_checker", "steps": {}},
}

# Step 1: NLPExtractor
nlp = STEP_REGISTRY["extractor"]["NLPExtractor"]()
r1 = nlp.run(envelope, {"fields_to_extract": ["employee_name", "leave_type", "date_range"]})
print("NLP result:", r1)
assert r1.success, f"NLPExtractor failed: {r1.error}"

# Write step result manually (mimicking what base_agent does)
envelope["execution"]["steps"]["extract_intent"] = {"data": r1.data}

# Step 2: DBExtractor
db = STEP_REGISTRY["extractor"]["DBExtractor"]()
r2 = db.run(envelope, {"table": "hr_leave_balances", "match_on": ["employee_name", "leave_type"]})
print("DB result:", r2)
assert r2.success, f"DBExtractor failed: {r2.error}"
assert len(r2.data["rows"]) > 0, "No rows returned — check seed and match_on resolution"

print("\nAll steps passed.")