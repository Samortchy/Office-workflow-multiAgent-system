# PROJECT_ANALYSIS.md — Autonomous Office Workflow Agent System

> Last updated: 2026-04-22. Reflects current codebase after pipeline integration was completed.
> Original analysis recorded bugs and missing pieces; this version reflects the fixed state.

---

## 1. Project Overview and Purpose

This project is a **multi-agent pipeline for autonomous office workflow management**. The system ingests raw employee requests (emails, help-desk tickets, etc.), passes them through three sequential AI agents, and produces a fully-structured, prioritized task object.

The central idea is that some workplace requests can be handled without human intervention ("autonomous"), while others need to be routed to a human reviewer. The pipeline decides which category a request falls into, structures it as a formal task, and scores its urgency so it can be queued appropriately.

**System inputs:** Free-text employee requests (e.g., "I forgot my password", "I want to file a complaint").

**System outputs:** A JSON "envelope" with three agent-populated sections:
- `intake` — department classification + autonomy decision (Intake Agent)
- `task` — structured task fields: title, description, deadline, action, success criteria (Task Structuring Agent)
- `priority` — priority score 1–4, label, confidence, and metadata (Priority Agent)

**Entry point:** `python main_pipeline/pipeline.py` from the project root.

---

## 2. Folder Structure

```
Root/
├── .env                            API keys (OpenRouter + Groq) — gitignored
├── .gitignore                      Only ignores .env
├── requirements.txt                All third-party dependencies with pinned versions
├── SETUP_AND_TESTING.md            Setup guide and usage instructions for new contributors
├── PROJECT_ANALYSIS.md             This file
├── task_agent.zip                  ZIP archive of the task_agent/ folder (redundant artifact)
│
├── inbox/                          Five sample email .txt files used as pipeline inputs
│   ├── email_001.txt               Broken laptop (IT / not autonomous)
│   ├── email_002.txt               Password reset (IT / autonomous)
│   ├── email_003.txt               Expense report status (Finance / autonomous)
│   ├── email_004.txt               Leave balance inquiry (HR / autonomous)
│   └── email_005.txt               Workplace complaint (HR / not autonomous)
│
├── intake_agent/                   AGENT 1 — Classifies requests via Groq LLM
│   ├── agents/
│   │   ├── __init__.py             Exports create_envelope and run
│   │   ├── envelope.py             Simple dict-based envelope factory (used internally only)
│   │   └── intake_agent.py         Groq LLM classifier with retry + confidence logic
│   └── main.py                     Standalone test runner (13 test cases)
│
├── main_pipeline/                  ORCHESTRATION LAYER — wires all three agents together
│   ├── __init__.py                 Empty (package marker)
│   ├── pipeline.py                 ✅ Entry point — run_pipeline() chains all three agents
│   ├── adapter.py                  ✅ dict_to_envelope() bridges intake dict → typed Envelope
│   ├── intake_agent.py             Thin wrapper: calls intake_agent and returns plain dict
│   ├── priority_agent.py           Thin wrapper: calls priority_prediction and returns result
│   └── task_agent.py               Thin wrapper: build_agent() + run() around TaskStructuringAgent
│
├── priority_agent/                 AGENT 3 — ML-based priority scoring
│   ├── __init__.py                 Exports priority_prediction
│   ├── validation.py               Full priority scoring logic (LLM + ML + fallback)
│   ├── email_priority_pipeline.joblib     Trained GBC model (priority 1–4)
│   ├── email_proximity_pipeline.joblib    Trained GBR model (deadline hours)
│   ├── data/
│   │   ├── synthetic_emails.json          ~200+ labelled training emails
│   │   └── test_synthetic_emails.json     Held-out evaluation emails
│   ├── email_priority_model/       GradientBoostingClassifier — priority 1–4
│   │   ├── __init__.py
│   │   ├── pipeline.py             EmailPriorityPipeline — fit/predict/predict_proba/save/load
│   │   ├── feature_union.py        Combines TF-IDF + text features + structured features
│   │   ├── text_features.py        Handcrafted text features: urgency, softening, time, impact
│   │   └── structured_features.py  One-hot encoding: department, role, urgency style, flags
│   ├── email_proximity_hours_model/  GradientBoostingRegressor — deadline proximity in hours
│   │   ├── __init__.py
│   │   ├── pipeline_proximity.py   ProximityHoursPipeline — fit/predict/save/load
│   │   ├── feature_union.py        Same architecture as priority model's feature union
│   │   ├── text_features.py        Identical to priority model's text_features.py
│   │   └── structured_features.py  Same as priority model but excludes deadline_proximity_hours
│   └── tests/                      Development scripts (not pytest — bare Python files)
│       ├── preprocessing.py        Early prototype; has hardcoded absolute path (broken)
│       ├── priority_pipeline.py    Production wrapper prototype with Pydantic validation
│       ├── training_script_for_the_two_models.py  Trains and saves both joblib models
│       └── usage_test.py           Evaluates model accuracy against test_synthetic_emails.json
│
└── task_agent/                     AGENT 2 — Structures classified requests into tasks
    ├── envelope.py                 Authoritative envelope contract (Envelope, IntakeSection,
    │                               TaskSection, PrioritySection dataclasses)
    ├── llm_provider.py             OpenRouter LLM abstraction (LLMProvider ABC + OpenRouterProvider)
    ├── task_structuring_agent.py   Main agent logic with retry, fallback, append-only design
    └── test_task_structuring_agent.py  Standalone test runner (5 test cases)
```

---

## 3. Architecture and Component Relationships

### System Design

```
                    ┌──────────────────────────────────────────────────────┐
                    │              main_pipeline/pipeline.py                │
                    │                  run_pipeline(raw_text)               │
                    └──────────────────────┬───────────────────────────────┘
                                           │
                    ┌──────────────────────▼───────────────────────────────┐
                    │              INTAKE AGENT (Agent 1)                   │
                    │     intake_agent/agents/intake_agent.py               │
                    │  Groq LLM → department / task_type / isAutonomous     │
                    │  Output: plain dict                                    │
                    └──────────────────────┬───────────────────────────────┘
                                           │ plain dict
                    ┌──────────────────────▼───────────────────────────────┐
                    │              main_pipeline/adapter.py                 │
                    │              dict_to_envelope()                        │
                    │  Converts plain dict → typed Envelope with            │
                    │  populated IntakeSection                               │
                    └──────────────────────┬───────────────────────────────┘
                                           │ typed Envelope
                    ┌──────────────────────▼───────────────────────────────┐
                    │         TASK STRUCTURING AGENT (Agent 2)              │
                    │     task_agent/task_structuring_agent.py              │
                    │  OpenRouter LLM → title / description / deadline /    │
                    │  requester_name / action_required / success_criteria   │
                    │  Envelope gains .task section                          │
                    └──────────────────────┬───────────────────────────────┘
                                           │ typed Envelope (with .task)
                    ┌──────────────────────▼───────────────────────────────┐
                    │             PRIORITY AGENT (Agent 3)                  │
                    │         priority_agent/validation.py                  │
                    │  OpenRouter LLM → sender_role / urgency_style /       │
                    │  has_deadline / is_blocking                            │
                    │  ML GBR → deadline_proximity_hours                    │
                    │  ML GBC → priority score 1–4                          │
                    │  LLM fallback if ML confidence ≤ 0.50                 │
                    └──────────────────────┬───────────────────────────────┘
                                           │ priority dict → PrioritySection → Envelope.priority
                                           ▼
                              envelope.to_dict() — final JSON output
```

### The Envelope Contract

The `task_agent/envelope.py` dataclass is the **authoritative contract** for the data object that travels through the pipeline. It is append-only: each agent adds its section and never modifies another agent's section.

```
Envelope
├── envelope_id     (str) — unique ID, e.g. "ENV-F9A3F6"
├── raw_text        (str) — original request text
├── received_at     (str) — ISO-8601 timestamp
├── errors          (list) — accumulated error records from any agent
├── intake          (IntakeSection | None) — populated by Intake Agent
├── task            (TaskSection | None) — populated by Task Structuring Agent
└── priority        (PrioritySection | None) — populated by Priority Agent
```

The intake agent (`intake_agent/agents/envelope.py`) produces a plain `dict` rather than a typed `Envelope`. The `main_pipeline/adapter.py` module bridges this: `dict_to_envelope()` takes the intake dict and constructs a typed `Envelope` with a populated `IntakeSection`, preserving the original `envelope_id` and `received_at`. From that point forward the typed `Envelope` object travels through the rest of the pipeline unchanged.

---

## 4. Tech Stack and Dependencies

| Category | Technology | Version | Used By |
|---|---|---|---|
| Language | Python | 3.12.3 | Entire project |
| LLM — Intake | Groq API (`llama-3.3-70b-versatile`) | groq 1.2.0 | intake_agent |
| LLM — Task + Priority | OpenRouter API (`meta-llama/llama-3.3-70b-instruct`) | openai 2.32.0 | task_agent, priority_agent |
| ML Classifier | `sklearn.GradientBoostingClassifier` | scikit-learn 1.6.1 | email_priority_model |
| ML Regressor | `sklearn.GradientBoostingRegressor` | scikit-learn 1.6.1 | email_proximity_hours_model |
| Feature Engineering | `TfidfVectorizer`, `StandardScaler`, custom transformers | scikit-learn 1.6.1 | priority_agent |
| Sparse matrices | `scipy.sparse.hstack`, `csr_matrix` | scipy 1.15.3 | feature_union |
| Data handling | `pandas`, `numpy` | 2.2.3 / 2.3.2 | priority_agent |
| Model persistence | `joblib` | 1.5.0 | priority_agent |
| Input validation | `pydantic` v2 | 2.13.3 | tests/priority_pipeline.py only |
| Env vars | `python-dotenv` | 1.2.2 | intake_agent, task_agent, priority_agent |

All dependencies are pinned in `requirements.txt`.

---

## 5. Data Flow / Execution Flow

### End-to-end flow (current working state):

```
1. Raw text arrives (e.g., the contents of inbox/email_001.txt)

2. INTAKE AGENT  [intake_agent/agents/intake_agent.py]
   - Wraps text in envelope dict: {envelope_id, raw_text, received_at}
   - Calls Groq LLM with taxonomy-based system prompt (13 autonomy categories)
   - Extracts: department, task_type, isAutonomous, reasoning, confidence
   - If confidence < 0.60 → forces isAutonomous = false
   - On rate limit: exponential backoff (30s, 60s, 120s, 240s), up to 4 retries
   - On JSON parse error: retries once at temperature=0.0
   - Returns: plain dict with "intake" key

3. ADAPTER  [main_pipeline/adapter.py]
   - dict_to_envelope(intake_dict) creates a typed Envelope
   - Preserves original envelope_id and received_at from intake dict
   - Maps isAutonomous (camelCase) → is_autonomous (snake_case)
   - Returns: Envelope with .intake populated

4. TASK STRUCTURING AGENT  [task_agent/task_structuring_agent.py]
   - Validates intake section is present
   - Prevents overwrite if .task already set (append-only contract)
   - Calls OpenRouter LLM at temperature=0.2 with extraction prompt
   - Extracts: title, description, requester_name, stated_deadline,
               action_required, success_criteria
   - On malformed JSON: retries once at temperature=0.0
   - On total failure: generates fallback TaskSection (forces is_autonomous=False)
   - Returns: Envelope with .task populated

5. PRIORITY AGENT  [priority_agent/validation.py]
   - Accepts envelope.to_dict() as input
   - Calls OpenRouter LLM to extract 4 features:
       sender_role, urgency_style, has_deadline, is_blocking
   - If has_deadline=true: ML regressor predicts deadline_proximity_hours
   - If has_deadline=false: deadline_proximity_hours = 0.0
   - ML classifier predicts priority (1–4) with class probabilities
   - If max class probability ≤ 0.50: LLM fallback assigns priority directly
   - Returns: dict with full envelope + "priority" sub-dict

6. PIPELINE  [main_pipeline/pipeline.py]
   - Unpacks priority_result["priority"] → PrioritySection(**...)
   - Attaches to envelope.priority
   - Returns: envelope.to_dict()

7. Final envelope JSON:
   {
     "envelope_id": "ENV-XXXXXX",
     "raw_text": "...",
     "received_at": "...",
     "errors": [],
     "intake": {
       "department": "IT",
       "task_type": "laptop_procurement",
       "isAutonomous": false,
       "reasoning": "...",
       "confidence": 0.9,
       "processed_at": "..."
     },
     "task": {
       "task_id": "TASK-XXXXXX",
       "title": "Laptop Replacement Needed",
       "description": "...",
       "department": "IT",
       "isAutonomous": false,
       "task_type": "laptop_procurement",
       "requester_name": "Ahmed Hassan",
       "stated_deadline": "none stated",
       "action_required": "...",
       "success_criteria": "...",
       "structured_at": "..."
     },
     "priority": {
       "priority_score": 4,
       "priority_label": "critical",
       "confidence": 0.784,
       "model_version": "1.0.0",
       "top_features_used": [],
       "scored_at": "..."
     }
   }
```

### Runnable commands:

```bash
# Full pipeline — processes email_001.txt and email_002.txt
python main_pipeline/pipeline.py

# Intake Agent standalone — 13 hardcoded test cases
cd intake_agent && python main.py

# Task Agent standalone — 5 test cases, all departments
cd task_agent && python test_task_structuring_agent.py [--case N] [--model X]

# Priority Agent standalone — single hardcoded envelope
cd priority_agent && python validation.py
```

---

## 6. What Is Fully Implemented and Working

### Intake Agent (`intake_agent/`)
- LLM classification using Groq API
- Complete autonomy taxonomy (13 categories across IT/Finance/HR)
- Confidence threshold: below 0.60 overrides to human review
- Rate limit retry: exponential backoff up to 4 attempts
- JSON parse error recovery: retries at temperature=0.0
- Standalone test runner with 13 diverse test cases

### Task Structuring Agent (`task_agent/`)
- Full dataclass-based envelope contract (`Envelope`, `IntakeSection`, `TaskSection`, `PrioritySection`)
- Clean LLM abstraction layer (`LLMProvider` ABC, `OpenRouterProvider` implementation)
- Factory function `get_provider()` for future backend extension
- LLM extraction with JSON validation and retry at temperature=0.0
- Fallback task section generated on total LLM failure (routes to human review)
- Append-only envelope design: won't overwrite existing task section
- Proper Python logging throughout
- Working test runner with 5 cases covering all departments and autonomy modes

### Priority Agent (`priority_agent/`)
- Two trained, saved ML models (`.joblib` files present and loadable)
- `EmailPriorityPipeline`: GradientBoostingClassifier, outputs priority 1–4
- `ProximityHoursPipeline`: GradientBoostingRegressor, outputs deadline proximity in hours
- Custom `FeatureUnion` combining TF-IDF (sparse) + handcrafted text features + structured one-hot features
- LLM-based feature pre-extraction (sender_role, urgency_style, has_deadline, is_blocking)
- Confidence-based LLM fallback when ML confidence ≤ 0.50
- `sys.modules` patching to fix pickle path resolution for both models
- Training scripts, evaluation scripts, and synthetic dataset all present

### Main Pipeline (`main_pipeline/`)
- `pipeline.py` — `run_pipeline(raw_text: str) -> dict` wires all three agents end-to-end; verified working against sample emails
- `adapter.py` — `dict_to_envelope()` bridges the intake dict output to the typed `Envelope` contract; correctly maps `isAutonomous` → `is_autonomous`
- `task_agent.py` — `build_agent()` validates API key, instantiates LLM provider and `TaskStructuringAgent`; `run()` delegates to `agent.run(envelope)`
- `priority_agent.py` — `predict_priority()` correctly returns the result of `priority_prediction()`
- `intake_agent.py` — thin wrapper, unchanged, functional

### Project Housekeeping
- `requirements.txt` — all 9 third-party dependencies pinned to exact installed versions
- `SETUP_AND_TESTING.md` — complete setup guide covering prerequisites, venv, API keys, running the pipeline, testing individual agents, and troubleshooting

---

## 7. What Is Still Incomplete or Has Known Issues

### `priority_agent/tests/preprocessing.py` — Hardcoded absolute path
```python
with open("D:\College\Agents\synthetic_emails.json") as f:
```
This file is permanently broken on any machine other than the original developer's laptop. It's a development prototype that has never been cleaned up. Not used by the main pipeline.

### `priority_agent/tests/usage_test.py` — Broken bare imports
```python
from email_priority_model import EmailPriorityPipeline
from email_proximity_hours_model import ProximityHoursPipeline
```
These bare module names don't exist on `sys.path` when the script is run from the project root. The script must be run from inside `priority_agent/` to work, and even then the joblib paths need adjustment. Not used by the main pipeline.

### `priority_agent/tests/priority_pipeline.py` — Module-level execution
```python
predictor = ProductionPredictor("pipeline.joblib")   # runs at import time
result = predictor.run({...})                         # also runs at import time
```
Top-level code outside of `if __name__ == "__main__":`. If this file is ever imported as a module it will immediately try to load `pipeline.joblib` from CWD and make live API calls. Not used by the main pipeline.

### `priority_agent/tests/training_script_for_the_two_models.py` — Mislabelled metric
```python
rmse = mean_squared_error(y_test, y_pred)    # squared=False is commented out
print(f"RMSE : {rmse:.2f} hours")            # this is actually MSE, not RMSE
```
`squared=False` was removed when it was deprecated in newer sklearn versions, but the print label was not updated. The reported number is MSE. Only matters if someone is evaluating model performance from this output.

### `task_agent/envelope.py` — Stale comment on PrioritySection
```python
@dataclass
class PrioritySection:
    """Populated by the Priority Agent (stub — not implemented yet)."""
    priority_score: int      # 1 (lowest) – 5 (critical)
```
Two issues in the docstring: (1) the stub comment is outdated — `PrioritySection` is now fully populated by the pipeline; (2) the range comment says 1–5 but the actual priority scale is 1–4.

### sklearn version mismatch warning
The `.joblib` model files were serialised with scikit-learn 1.8.x but the current environment runs 1.6.1. sklearn emits `InconsistentVersionWarning` on load for each estimator in the pipeline. The models still load and produce valid predictions at this version gap, but the warning is present on every run. Fix: retrain the models on the current version using `priority_agent/tests/training_script_for_the_two_models.py`.

### `top_features_used` is always an empty list
`PrioritySection.top_features_used` is hardcoded to `[]` in `validation.py`. `GradientBoostingClassifier` exposes `feature_importances_` globally (not per-prediction), so extracting the top features contributing to a specific prediction requires SHAP or manual inspection of the decision path — neither is implemented.

### No autonomous action execution
The pipeline correctly classifies `isAutonomous=true` requests and routes `isAutonomous=false` to human review in the envelope output, but there is no downstream handler that *acts* on either case. The autonomy decision is a field in the JSON — nothing reads it and does something with it.

---

## 8. Bugs Fixed in Current Version

The following bugs were present in the original codebase and have been resolved:

| Bug | File | Fix Applied |
|---|---|---|
| Return value discarded | `main_pipeline/priority_agent.py:4` | Added `return` before `priority_prediction(input_json)` |
| Missing imports + dead `build_agent()` | `main_pipeline/task_agent.py` | Full rewrite: added imports, fixed `build_agent()`, added `run()` |
| Hardcoded Windows backslash joblib paths | `priority_agent/validation.py:28-34` | Replaced with `os.path.join(os.path.dirname(__file__), "...")` |
| PrioritySection schema mismatch | `priority_agent/validation.py` | Rewrote `building_expected_output()` to produce `priority_score`, `priority_label: "critical"`, `model_version`, `top_features_used` |
| Label "urgent" instead of "critical" | `priority_agent/validation.py:265` | Changed `case 4: label = "urgent"` → `label = "critical"` |
| Dead example code in production module | `priority_agent/validation.py:109–166` | Removed all three bare string literals and the stale `main()` function |
| Two incompatible envelope systems | Gap between `intake_agent/` and `task_agent/` | Created `main_pipeline/adapter.py` with `dict_to_envelope()` |
| Pipeline orchestration missing | `main_pipeline/pipeline.py` (was empty) | Implemented `run_pipeline()` end-to-end |
| No `requirements.txt` | project root | Created with all 9 packages pinned to installed versions |
| `sys.path` collision when running `pipeline.py` as script | `main_pipeline/pipeline.py` | Script directory is removed from `sys.path` before any imports |

---

## 9. Remaining Open Items

These items are known but were not in scope for the pipeline integration work:

1. **Autonomous action handler** — The pipeline identifies autonomous tasks but takes no action on them. An autonomous task resolver (e.g., auto-reply, ticket creation, API call) would need to be added as a fourth stage or a post-pipeline router.

2. **Human review routing** — `isAutonomous=false` produces a complete envelope but nothing enqueues it, notifies a reviewer, or sends it to a ticketing system.

3. **`top_features_used`** — Currently hardcoded to `[]`. Implementing this would require per-prediction feature attribution (SHAP or decision-path analysis on the GradientBoostingClassifier).

4. **Model retraining on current sklearn** — The `.joblib` files were built on sklearn 1.8.x. Retraining on 1.6.1 would eliminate the `InconsistentVersionWarning` on every run. Script is ready: `priority_agent/tests/training_script_for_the_two_models.py`.

5. **`tests/` folder cleanup** — `preprocessing.py`, `usage_test.py`, and `priority_pipeline.py` are broken development scripts that cannot be run from the project root. They should either be fixed with proper imports and path handling or removed.

6. **`PrioritySection` docstring** — The stale comment `(stub — not implemented yet)` and the wrong range `1 (lowest) – 5 (critical)` should be updated to `1 (lowest) – 4 (critical)`.

---

## 10. The Task Structuring Agent — Deep Dive

### What It Is
`task_agent/task_structuring_agent.py` is the second stage of the pipeline. It receives a typed `Envelope` with a populated `IntakeSection` and uses an LLM to extract structured task information from the raw request text.

### What It Does
1. Validates that `.intake` is present — adds error and returns if not
2. Checks for existing `.task` section — skips silently to preserve append-only contract
3. Logs a warning if intake confidence is below 0.60
4. Sends `{raw_text, department, task_type}` to OpenRouter LLM at temperature=0.2
5. Parses JSON response; strips markdown fences if model ignores the formatting instruction
6. On malformed JSON: retries once at temperature=0.0
7. On total LLM failure: generates a fallback `TaskSection` (forces `is_autonomous=False`, `title="Request requires manual review"`)
8. Logs missing or unexpected keys from the LLM response but handles them with safe defaults
9. Attaches the constructed `TaskSection` to the envelope and returns

### What It Does Well
- Clean separation of concerns — LLM provider is fully abstracted behind `LLMProvider` ABC
- Robust fallback path ensures the pipeline never stalls on LLM failure
- Append-only contract is explicitly enforced
- `get_provider()` factory makes swapping LLM backends a one-line change
- Logging is present at every meaningful decision point

### Remaining Limitations
- **No autonomous/non-autonomous distinction in output.** The task section carries `is_autonomous` but the agent processes both modes identically. An autonomous task handler would need to be a downstream stage.
- **Intake confidence not forwarded.** The confidence score from the intake agent influences only a warning log inside the task agent — it is not stored in `TaskSection` or otherwise surfaced downstream.
- **Bare imports inside `task_structuring_agent.py`.** The file uses `from envelope import ...` and `from llm_provider import ...` (bare module names, not package paths). This works because `task_agent/` is added to `sys.path` by the pipeline wrappers before import. This is an implicit coupling — the file cannot be imported cleanly without that path manipulation being done first.

---

## 11. Summary Assessment

| Component | Status |
|---|---|
| Intake Agent (standalone) | ✅ Fully working |
| Task Structuring Agent (standalone) | ✅ Fully working |
| Priority Agent (standalone) | ✅ Fully working |
| ML models trained and saved | ✅ Present (two .joblib files) |
| Training + evaluation scripts | ✅ Present (minor metric labelling bug in training script) |
| Sample email data | ✅ Present (inbox/ + synthetic JSON datasets) |
| `main_pipeline/pipeline.py` | ✅ Implemented — `run_pipeline()` verified end-to-end |
| `main_pipeline/adapter.py` | ✅ Implemented — bridges intake dict to typed Envelope |
| `main_pipeline/task_agent.py` | ✅ Fixed — correct imports, functional `build_agent()` and `run()` |
| `main_pipeline/priority_agent.py` | ✅ Fixed — return value bug corrected |
| Envelope compatibility between agents | ✅ Resolved via adapter.py |
| `priority_agent/validation.py` paths | ✅ Fixed — OS-agnostic, CWD-independent |
| PrioritySection schema alignment | ✅ Fixed — validation.py output matches dataclass exactly |
| `requirements.txt` | ✅ Present — 9 packages pinned |
| `SETUP_AND_TESTING.md` | ✅ Present |
| End-to-end runnable pipeline | ✅ Works — `python main_pipeline/pipeline.py` |
| sklearn version warning on model load | ⚠️ Present — models built on 1.8.x, running on 1.6.1; functional but noisy |
| `top_features_used` populated | ⚠️ Always `[]` — needs SHAP or equivalent |
| `tests/` folder scripts | ⚠️ Three of four broken (wrong paths / bare imports / top-level execution) |
| `PrioritySection` docstring accuracy | ⚠️ Stale — says "stub" and "1–5", should be "1–4" |
| Autonomous action execution | ❌ Not implemented — decision is made but not acted on |
| Human review routing | ❌ Not implemented — envelope is produced but not dispatched |
