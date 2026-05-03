# PROJECT_ANALYSIS.md — Autonomous Office Workflow Agent System
**Last updated:** April 2026  
**Author:** Ali Abdallah  
**Purpose:** Full project context document. If continuing this project in a new chat, paste this file first. It contains everything needed to understand the system, the current state, and what comes next.

---

## 0. How to use this document

This file is the single source of truth for anyone (human or AI) picking up this project mid-way. Read all sections before asking questions or writing code. Section 10 contains the spec that all AI code generation must follow without exception.

---

## 1. Project Identity

**Project name:** Autonomous Office Workflow Agent System  
**Type:** Multi-agent AI pipeline for office automation  
**Course:** Multi-Agent Systems — Misr International University (MIU) 2026  
**Team:** Ali Abdallah, Ismail Hesham, Abubakr Hegazy, Mena Khaled, Ahmed Samer  
**Supervisor:** Dr. Walaa Hassan | TA: Mohamed Afify  
**Repo:** https://github.com/Samortchy/Agentic-Workflow-Operations-Manager

---

## 2. What the system does

The system takes raw employee requests — emails, help-desk messages, form submissions — and routes them through a pipeline of AI agents that classify, structure, prioritise, and ultimately execute or escalate each request autonomously.

**Phase 1 (complete):** Three-agent classification pipeline that produces a structured JSON envelope.  
**Phase 2 (in progress):** Nine execution agents built on top of a shared Agent Factory that carry out the actual work — sending emails, booking meetings, generating reports, checking leave balances, etc.

**The core idea:** Every workplace request is either autonomous (the system handles it end-to-end without human involvement) or non-autonomous (the system structures it and routes it to the right human with a full brief). The pipeline decides which category, structures the task, scores urgency, and dispatches accordingly.

---

## 3. Phase 1 — Complete pipeline (do not modify)

### 3.1 What it produces

Every request becomes a cumulative JSON envelope with three sections written by three agents in sequence:

```json
{
  "envelope_id": "ENV-001",
  "raw_text": "I need a laptop replacement urgently",
  "received_at": "2026-04-30T09:00:00Z",
  "intake": {
    "department": "IT",
    "task_type": "hardware_procurement",
    "isAutonomous": false,
    "confidence": 0.94,
    "processed_at": "2026-04-30T09:00:02Z"
  },
  "task": {
    "task_id": "TASK-8821",
    "title": "Laptop screen replacement request",
    "description": "Employee reports a broken laptop screen and requires a replacement device",
    "department": "IT",
    "isAutonomous": false,
    "task_type": "hardware_procurement",
    "requester_name": "unknown",
    "stated_deadline": "urgent — no specific date given",
    "action_required": "Procure and deliver a replacement laptop to the requester",
    "success_criteria": "Requester confirms working laptop returned within agreed SLA",
    "structured_at": "2026-04-30T09:00:05Z"
  },
  "priority": {
    "priority_score": 4,
    "priority_label": "high",
    "confidence": 0.81,
    "model_version": "gbc_v1",
    "top_features_used": [],
    "scored_at": "2026-04-30T09:00:06Z"
  }
}
```

### 3.2 Phase 1 agents

**Agent 1 — Intake Agent** (`intake_agent/`)  
Uses Groq LLM. Classifies department (IT / Finance / HR), task type, and autonomy flag from raw text. Uses a fixed taxonomy embedded in the system prompt — no training data required. Retries once at temperature=0 on malformed JSON. Flags confidence < 0.60 to human review regardless of isAutonomous.

**Agent 2 — Task Structuring Agent** (`task_agent/`)  
Uses OpenRouter LLM. Extracts title, description, deadline, action_required, success_criteria from raw text. Does NOT re-classify department or isAutonomous — copies from intake. Falls back to a manual-review task on total LLM failure. Append-only — never modifies intake section.

**Agent 3 — Priority Agent** (`priority_agent/`)  
ML model: TF-IDF + Gradient Boosting Classifier trained on ~200+ synthetic labelled emails. Scores priority 1–4 with label (low / medium / high / critical). Two trained models: `email_priority_pipeline.joblib` (priority score) and `email_proximity_pipeline.joblib` (deadline proximity in hours). Falls back to rule-based scoring if model file is missing.

### 3.3 Pipeline entry point

```bash
python main_pipeline/pipeline.py
```

`run_pipeline(raw_text)` in `main_pipeline/pipeline.py` chains all three agents and returns the complete envelope. `main_pipeline/adapter.py` bridges the intake agent's plain dict output to the typed `Envelope` dataclass that the task agent expects.

### 3.4 Autonomy taxonomy (embedded in Intake Agent system prompt)

| Task type | Dept | isAutonomous | Reason |
|-----------|------|-------------|--------|
| Password reset / access request | IT | true | Fully automatable |
| Software info / FAQ lookup | IT | true | Informational |
| Laptop / equipment procurement | IT | false | Physical action needed |
| Server outage / critical failure | IT | false | Human judgment required |
| Expense report status check | Finance | true | Read-only DB lookup |
| Budget inquiry / policy question | Finance | true | Informational |
| Invoice approval / payment release | Finance | false | Financial authority needed |
| Payroll / salary dispute | Finance | false | Legal implications |
| Leave balance inquiry | HR | true | Read-only HR lookup |
| Onboarding info request | HR | true | Standard automatable process |
| Hiring / termination / promotion | HR | false | Management approval needed |
| Payroll change / raise request | HR | false | Financial + legal |
| Workplace complaint / dispute | HR | false | Requires human mediation |

### 3.5 Known remaining issues in Phase 1

- `top_features_used` is always `[]` — needs SHAP for per-prediction attribution
- sklearn version mismatch warning: models built on 1.8.x, runs on 1.6.1 — functional but noisy. Fix: retrain with `priority_agent/tests/training_script_for_the_two_models.py`
- `PrioritySection` docstring says "stub" and "1–5" — should say "1–4"
- `isAutonomous=false` envelopes are produced correctly but nothing yet dispatches them to a human reviewer — that is the Escalation Router's job in Phase 2

---

## 4. Phase 2 — Agent Factory + Execution Agents (in progress)

### 4.1 The Agent Factory concept

Instead of writing 9 execution agents as 9 separate custom scripts, Phase 2 uses a shared factory pattern. Each agent is described as a JSON config file. A single runner (`core/base_agent.py`) reads the config and executes the steps in sequence. This means:
- Shared error handling, approval logic, and outcome signalling — written once in `core/`
- Each agent is a config + small step classes, not a full custom script
- One bug fix in `core/` propagates to all 9 agents for free

### 4.2 The 7-day factory pre-build plan

The team must complete this before writing any execution agent:

**Days 1–2 — Contract alignment (no code)**  
Whole team agrees on: envelope schema extension, step interface method signatures, config file schema. Output: a shared `spec.md` document. No ambiguity allowed past Day 2.

**Days 3–5 — Parallel build**  
- P1 (Ali): builds `core/` — runner loop, step registry, envelope helpers, approval gate, outcome emitter
- P2: builds extractor step classes + configs 01 and 04
- P3: builds processor step classes + configs 02, 03, 05
- P4: builds dispatcher step classes + configs 03, 07
- P5: builds custom step classes + configs 06, 08, 09

**Days 6–7 — Validate on Leave Checker (agent 04)**  
Whole team wires Leave Checker end-to-end. Find every wrong assumption. Fix in `core/` not in workarounds. Leave Checker must be green before anyone splits off to build the other agents.

**After Day 7:** Team splits. Everyone builds their agents in parallel against a proven stable factory. No changes to `core/` without a full team review.

### 4.3 Phase 2 folder structure

```
execution_agents/
├── core/
│   ├── base_agent.py          ← P1 — runner loop
│   ├── step_registry.py       ← P1 — config type → class mapping
│   ├── envelope.py            ← P1 — resolve_path() and write_step_result()
│   ├── approval_gate.py       ← P1 — approval logic
│   └── outcome_emitter.py     ← P1 — signals outcome tracker
├── steps/
│   ├── base_step.py           ← P1 — abstract base, FROZEN after Day 2
│   ├── extractors/            ← P2
│   │   ├── nlp_extractor.py
│   │   ├── file_extractor.py
│   │   └── db_extractor.py
│   ├── processors/            ← P3
│   │   ├── llm_generator.py
│   │   ├── template_renderer.py
│   │   └── db_fetcher.py
│   ├── dispatchers/           ← P4
│   │   ├── email_dispatcher.py
│   │   ├── file_dispatcher.py
│   │   └── calendar_dispatcher.py
│   └── custom/                ← P5 (WRITTEN — see section 5)
│       ├── anomaly_checker.py
│       ├── slot_ranker.py
│       ├── queue_injector.py
│       └── pptx_writer.py
├── configs/
│   ├── 01_escalation_router.json
│   ├── 02_document_summarizer.json
│   ├── 03_report_generator.json
│   ├── 04_leave_checker.json
│   ├── 05_email_agent.json
│   ├── 06_powerpoint_agent.json
│   ├── 07_meeting_scheduler.json
│   ├── 08_expense_tracker.json
│   └── 09_onboarding_coordinator.json
├── templates/
│   ├── email/
│   ├── pptx/
│   ├── reports/
│   └── onboarding/
├── data/
│   ├── routing_table.json
│   └── tooling_list.json
├── output/                    ← gitignored
└── tests/
```

---

## 5. The 9 execution agents

### Risk tiers and approval model

| Tier | Approval | Agents |
|------|----------|--------|
| Low | None — dispatches immediately | 1, 2, 3, 4 |
| Medium | Single confirm before dispatch | 5, 6, 7, 8, 9 |
| High | Two-key harness + human sign-off | 10, 11, 12 (NOT in factory — hand-built separately) |

Agents 10, 11, 12 (Account Manager, Software Provisioner, Invoice Router) are HIGH risk and must NEVER be built using the factory pattern. They are hand-built individually with their own security harness.

### Agent registry

| # | Name | Dept | Risk | Est. Build | Custom step |
|---|------|------|------|-----------|-------------|
| 1 | Escalation Router | Cross-dept | Low | 3–4 days | None |
| 2 | Document Summarizer | Cross-dept | Low | 4–5 days | None |
| 3 | Report Generator | Cross-dept | Low | 5–6 days | None |
| 4 | Leave Checker | HR | Low | 2–3 days | None — validation agent |
| 5 | Email Agent | Cross-dept | Medium | 5–7 days | None |
| 6 | PowerPoint Agent | Cross-dept | Medium | 6–8 days | PPTXWriter |
| 7 | Meeting Scheduler | Cross-dept | Medium | 5–7 days | SlotRanker |
| 8 | Expense Tracker | Finance | Medium | 4–6 days | AnomalyChecker |
| 9 | Onboarding Coordinator | HR | Medium | 7–9 days | QueueInjector |

### Recommended build order

```
Phase 2A (~2 weeks)  — Agent 1 (Escalation Router) + Agent 14 (Outcome Tracker)
Phase 2B (~4 weeks)  — Agent 5 (Email Agent) + Agent 13 (Compliance Checker) + Agent 2 (Document Summarizer)
Phase 2C (~6 weeks)  — Agents 4, 8, 3 (Leave Checker, Expense Tracker, Report Generator)
Phase 2D (~8 weeks)  — Agents 6, 7 (PowerPoint Agent, Meeting Scheduler)
Phase 2E (~9 weeks)  — Agent 9 (Onboarding Coordinator)
Phase 2F (~11 weeks) — Agent 10 (Account Manager — read-only mode first)
Phase 2G (~13 weeks) — Agents 11, 12 (Software Provisioner, Invoice Router)
Phase 2H (~14 weeks) — Model Updater + full retraining loop
```

---

## 6. P5 custom steps — written and in repo

The four custom steps that cannot be config-only have been written and committed to `execution_agents/steps/custom/`. All four comply fully with the spec in Section 10.

### anomaly_checker.py — Expense Tracker (Agent 08)
Reads expense record from `execution.steps.fetch_expense_record.data`. Runs three checks: (1) duplicate submission — same employee, same amount within `duplicate_window_days` via SQLite query; (2) missing receipt — amount exceeds `receipt_threshold_egp` and no receipt attached; (3) line item policy violations — non-reimbursable categories and single items above 10,000 EGP. Fails open on DB connectivity issues. Returns `anomaly: bool` and `anomaly_reasons: list[str]`.

### slot_ranker.py — Meeting Scheduler (Agent 07)
Reads calendar availability from `execution.steps.fetch_availability.data`. Scores every slot by `free_participants / total_participants`. Breaks ties by working-hour preference (earlier in working day = higher rank, outside working hours = penalised). Strips internal `_tiebreaker` field before returning. Returns top N ranked slots with `overlap_score`, `partial` flag, and `busy_participants`.

### queue_injector.py — Onboarding Coordinator (Agent 09)
The only step permitted to write to SQLite — to the `task_queue` table only, never the envelopes table. Reads employee details from `execution.steps.extract_employee_details.data` and tooling list from `execution.steps.fetch_tooling_list.data`. Builds a fully valid Phase 1-style envelope per tool (with `intake`, `task`, `priority` all populated per spec Section 3.1). One tool failing to insert does not kill the others. Returns `tasks_injected`, `tools_queued`, `tools_failed`.

### pptx_writer.py — PowerPoint Agent (Agent 06)
Reads structured slide JSON from `execution.steps.generate_slide_json.data`. Two security gates: template paths must start with `templates/pptx/`, output paths must start with `output/`. Checks `paused_for_clarification` in LLM output — if true, returns `status: paused` without writing any file. Writes .pptx using python-pptx with template or blank fallback. Output filename: `{task_id}_{date}_{short_title}.pptx`.

---

## 7. Inter-agent connections

Two patterns only — never invent others.

### Synchronous — agent_call step
One agent needs the other's result before continuing. Runner blocks until called agent completes. Result written to `execution.agent_calls.{step_name}`. Current uses: Email Agent calls Document Summarizer when attachments are present.

```json
{
  "name":   "summarise_attachment",
  "type":   "agent_call",
  "class":  "DocumentSummarizer",
  "config": { "run_if": "task.has_attachments == true" }
}
```

### Asynchronous — QueueInjector custom step
Calling agent does not need to wait. QueueInjector writes new envelope rows to SQLite task queue and returns immediately. Current use: Onboarding Coordinator injects access tasks for Account Manager.

---

## 8. Gru — The Orchestrator (not yet built)

Gru is the central LLM-powered dispatcher. It reads the Phase 1 envelope output, manages the priority queue, and routes tasks to the correct execution agent. It handles `pending_user_input` states when agents pause mid-execution.

**Critical rule:** Gru must be built AFTER all 9 agents are complete. Gru routes to agents — if the agents don't exist yet, Gru has nothing to route to and its routing logic cannot be tested against real behavior. Building Gru first means rewriting its routing table every time an agent turns out to behave differently than assumed.

---

## 9. Shared services (agents 13 and 14)

### Compliance Checker (Agent 13) — Cross-dept, Shared
Called by every medium and high risk agent before dispatching any output. Returns ALLOW / DENY / ESCALATE. Never executes anything itself. DENY decisions cannot be overridden by any agent. Build alongside Email Agent (first medium-risk agent).

### Outcome Tracker (Agent 14) — Cross-dept, Shared  
Subscribes to a signal bus. Converts raw signals (follow-up emails, file access events, auth logs) into outcome verdicts: `success / failure / unknown`. Feeds verdicts to the Model Updater for priority model retraining. The `unknown` verdict is intentional and valid training data — do not skip it.

---

## 10. The spec — AI code generation must follow this

> **If you are using AI to generate code for this project, this section is mandatory. Paste it before writing a single line.**

### 10.1 Step interface — frozen, no exceptions

```python
# steps/base_step.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class StepResult:
    success: bool
    data:    dict
    error:   str | None

class BaseStep(ABC):
    @abstractmethod
    def run(self, envelope: dict, config: dict) -> StepResult:
        pass
```

**Rules every step must follow:**
- Always inherit from `BaseStep`
- Always implement `run(self, envelope: dict, config: dict) -> StepResult`
- Never raise an exception out of `run()` — always catch and return `StepResult(success=False, data={}, error=str(e))`
- Never modify the envelope dict directly inside a step — return data in `StepResult.data`, the runner writes it
- Never add fields to `StepResult` — exactly three fields: `success`, `data`, `error`
- Never write to SQLite from inside a step — only the runner does that (exception: QueueInjector writes to `task_queue` table only)

### 10.2 Envelope contract

**Sections from Phase 1 (read-only — never modify):**
- `envelope_id`, `raw_text`, `received_at`
- `intake` — department, task_type, isAutonomous, confidence, processed_at
- `task` — task_id, title, description, department, isAutonomous, task_type, requester_name, stated_deadline, action_required, success_criteria, structured_at
- `priority` — priority_score (1–4), priority_label, confidence, model_version, top_features_used, scored_at

**Execution section (written by the runner — never write to it directly from a step):**
```json
{
  "execution": {
    "agent_name": "string",
    "agent_version": "string",
    "status": "see allowed values",
    "started_at": "ISO8601",
    "completed_at": "ISO8601 | null",
    "approval": "string",
    "result": {},
    "agent_calls": {},
    "errors": []
  }
}
```

**Allowed status values — complete list, no additions without team review:**

| Value | When |
|-------|------|
| `completed` | Agent finished all steps successfully |
| `paused` | Agent waiting for user input mid-execution |
| `pending_human_review` | Escalation Router handed off to a human |
| `approval_pending` | Approval gate fired, waiting for confirm |
| `escalated` | Anomaly or compliance issue, routed to human |
| `failed` | Agent hit an unrecoverable error |

**Error object — exactly these three fields, nothing else:**
```json
{ "step": "step_name", "message": "description", "timestamp": "ISO8601" }
```

### 10.3 Config file contract

**Required top-level fields — all must be present:**
```
agent_name, agent_version, department, risk_tier, approval, steps, on_failure, outcome_signal
```

**Allowed step type values:**

| Type | Who | Purpose |
|------|-----|---------|
| `extractor` | P2 | Pull data from DB, file, or NLP |
| `processor` | P3 | Transform or generate via LLM or template |
| `dispatcher` | P4 | Send output — email, file, calendar |
| `custom` | P5 | Logic that cannot be config-only |
| `agent_call` | P1 registers | Run another agent inline, synchronously |

**Allowed approval values:**

| Value | Behaviour |
|-------|-----------|
| `none` | Dispatch immediately |
| `single_confirm` | Pause before any dispatcher step |
| `single_confirm_if_low_confidence` | Pause only if `draft_confidence` < threshold |
| `manager_sign_off` | Email manager, wait for reply |

**run_if syntax — dot-notation with comparison, no compound logic:**
```
"run_if": "task.has_attachments == true"
"run_if": "execution.steps.check_anomalies.data.anomaly == false"
```
Supported operators: `==`, `!=`, `>`, `<`. No `and` / `or`.

**Envelope path reference syntax — exact, no variations:**
```
"execution.steps.{step_name}.data.{field_name}"
```

### 10.4 What AI must never do

- Invent new step types not in the allowed list
- Invent new status values not in the allowed list
- Add fields to `StepResult`
- Modify any file in `core/` — frozen
- Modify `steps/base_step.py` — frozen
- Write custom path resolution logic — use `resolve_path()` from `core/envelope.py`
- Write directly to SQLite from inside a step
- Use `and` / `or` in `run_if` conditions
- Write to `intake`, `task`, or `priority` envelope sections
- Access the DB from a step for anything other than reading (exception: QueueInjector)

### 10.5 Utility functions P1 provides — use these, do not reimplement

```python
# core/envelope.py

def resolve_path(envelope: dict, path: str):
    # Resolves dot-notation path against envelope dict
    # Raises KeyError with clear message if path not found
    # Example: resolve_path(env, "execution.steps.fetch_record.data.employee_id")

def write_step_result(envelope: dict, step_name: str, step_type: str, data: dict):
    # Writes step result to correct envelope location
    # agent_call steps → execution.agent_calls.{step_name}
    # all other steps  → execution.steps.{step_name}.data
    # Never call from inside a step — the runner calls this
```

---

## 11. Current progress status

| Item | Status |
|------|--------|
| Phase 1 pipeline | ✅ Complete and running |
| Phase 1 envelope schema | ✅ Defined and stable |
| Phase 2 folder structure | ✅ Defined in spec |
| Phase 2 spec.md | ✅ Written — in repo |
| Agent configs (all 9) | ✅ Written — in repo as JSON files |
| Example envelopes (all 9) | ✅ Written — in agent_configs_and_envelopes.pdf |
| P5 custom steps (all 4) | ✅ Written and committed to repo |
| P1 core/ files | ❌ Not yet written — Day 3 task |
| P2 extractor steps | ❌ Not yet written — Day 3 task |
| P3 processor steps | ❌ Not yet written — Day 3 task |
| P4 dispatcher steps | ❌ Not yet written — Day 3 task |
| 7-day factory plan | ⏳ Not started — team alignment pending |
| Leave Checker validation | ⏳ Day 6–7 milestone |
| Gru orchestrator | ❌ Not started — built after all 9 agents |
| Agents 10–12 (High risk) | ❌ Not started — hand-built, not factory |

---

## 12. Key rules that must never be broken

1. **Factory applies to agents 1–9 only.** Agents 10 (Account Manager), 11 (Software Provisioner), 12 (Invoice Router) are HIGH risk and must be hand-built individually with their own two-key security harness. The factory pattern must never be extended to cover these three.

2. **No changes to `core/` without full team review.** `base_agent.py`, `step_registry.py`, `envelope.py`, `approval_gate.py`, `outcome_emitter.py`, and `base_step.py` are frozen after Day 2. A change log entry is required for any post-lock modification.

3. **The spec document is the source of truth.** If the spec and any code conflict, the spec wins. Propose a spec change first, then change the code.

4. **Day 7 rule.** Any bug found during Leave Checker validation on Day 6 is fixed in `core/`, not in the Leave Checker config or step classes. A fix in `core/` propagates to all 9 agents for free. A fix in a workaround costs 9x later.

5. **Gru is built last.** The orchestrator is built only after all 9 factory agents are complete and validated. Building it earlier means writing routing logic for agents that don't exist yet.

6. **The unknown verdict from Outcome Tracker is valid training data.** Do not discard `unknown` verdicts. Weight them by `task_type` and `department` when retraining the priority model.

---

*End of PROJECT_ANALYSIS.md — version 2.0*