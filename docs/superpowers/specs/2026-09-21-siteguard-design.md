# SiteGuard — Construction Site Risk Assessment: Design Spec

**Date:** 2026-09-21
**Status:** Approved

## 1. Goal

A small, professional web app where a user uploads one image or video of a construction site and receives an AI-generated safety risk report: a risk percentage, what hazards were seen, what to fix, what equipment to use, and how much the risk drops if the recommendations are applied. Past analyses are kept so the dashboard can show trends.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Users | Single-user, no login | Smallest scope for v1 |
| History | SQLite via SQLAlchemy | Reopen reports, trend charts, no external DB |
| Report language | English | Most reliable Gemini output |
| Export | In-browser report + browser print-to-PDF | Zero extra deps; Recharts renders SVG so charts print crisp |
| Upload scope | One file per analysis | Clear cost per call; batch can come later |
| Backend | FastAPI | Pydantic validation of Gemini output, BackgroundTasks, auto docs |
| Video handling | Native video via Gemini Files API | Keeps motion context; short clips are cheap (~300 tokens/sec) |
| Scoring | Gemini finds hazards; our code computes scores | Deterministic and unit-testable |
| Long jobs | BackgroundTasks + status polling | No Redis/Celery needed for single user |
| Model | `gemini-2.5-flash` | Fast, cheap, handles video + structured JSON |

## 3. Architecture

```
React (Vite + TS)  ──HTTP/JSON──▶  FastAPI  ──▶  Gemini 2.5 Flash (google-genai SDK)
                                     │
                                     ├─▶ SQLite  (data/siteguard.db)
                                     └─▶ data/uploads/  (original media)
```

### Backend layers

| Layer | Responsibility | Depends on |
|---|---|---|
| `app/api/` | HTTP routes, multipart validation, status codes | services |
| `app/services/analyzer.py` | Orchestrates one analysis: store file → Gemini → scoring → persist | gemini_client, scoring, storage, repository |
| `app/services/gemini_client.py` | `GeminiAnalyzer` protocol; `GoogleGeminiAnalyzer` (real); `FakeAnalyzer` (tests) | google-genai |
| `app/services/storage.py` | Save/delete uploaded files under `data/uploads/{id}.{ext}` | filesystem |
| `app/domain/models.py` | Pydantic `Finding`, `AnalysisResult`, `RiskCategory`, `RiskLevel` — pure | nothing |
| `app/domain/scoring.py` | Pure functions: findings → `ScoreSummary` | domain/models |
| `app/db/` | SQLAlchemy `Analysis` model, session factory, `AnalysisRepository` | SQLite |
| `app/config.py` | `Settings` via pydantic-settings, loaded from `.env` | — |

Every unit answers: what it does, how to use it, what it depends on. The API never imports `google-genai`; the domain never imports FastAPI or SQLAlchemy.

## 4. Gemini contract

The prompt instructs Gemini to act as a certified construction safety inspector and return JSON matching `AnalysisResult` (passed as `response_schema`, `response_mime_type="application/json"`).

```
AnalysisResult
  scene_summary: str
  positive_observations: list[str]
  findings: list[Finding]

Finding
  category: RiskCategory  # fall_protection | ppe | scaffolding | electrical | excavation |
                          # struck_by | housekeeping | machinery | fire | structural | other
  title: str
  description: str            # what was observed
  evidence: str               # where/when it was seen
  timestamp_seconds: float | None   # video only
  severity: int (1–5)         # consequence if it happens
  likelihood: int (1–5)       # probability given what is visible
  recommendation: str         # what to do
  required_equipment: list[str]
  mitigation_effectiveness: float (0–1)   # how much the recommendation reduces this finding's risk
```

- **Image:** sent inline as bytes.
- **Video:** uploaded with `client.files.upload`, polled until `state == ACTIVE` (max 120 s), then passed by reference.
- Token counts from `usage_metadata` are stored on the analysis.
- If the response fails Pydantic validation, the call is retried once; a second failure marks the analysis `failed`.

## 5. Scoring (`domain/scoring.py`)

```
finding_risk_i   = severity_i × likelihood_i                        # 1..25
site_score       = 100 × (0.6 × max(r)/25 + 0.4 × mean(r)/25)       # 0..100, rounded to int
residual_risk_i  = finding_risk_i × (1 − mitigation_effectiveness_i)
residual_score   = same formula over residual_risk_i
reduction        = site_score − residual_score
level(score)     = Low 0–24 | Moderate 25–49 | High 50–74 | Critical 75–100
```

No findings → `site_score = residual_score = 0`, level `Low`. Weighting rationale: one critical hazard dominates the score; many minor ones still raise it.

`ScoreSummary` = `{risk_score, residual_score, reduction, risk_level, residual_level, findings_by_category: dict[RiskCategory, int], per_finding: [{index, risk, residual_risk}]}`.

## 6. Data model

Table `analyses`:

| Column | Type | Notes |
|---|---|---|
| `id` | str (uuid4) | PK |
| `created_at` | datetime (UTC) | |
| `site_name` | str, nullable | optional user label |
| `filename` | str | original name |
| `media_type` | enum `image` / `video` | |
| `mime_type` | str | |
| `storage_path` | str | relative to data dir |
| `status` | enum `pending` / `processing` / `completed` / `failed` | |
| `error_message` | str, nullable | |
| `result_json` | JSON, nullable | full `AnalysisResult` |
| `risk_score`, `residual_score` | int, nullable | denormalized for list/stats queries |
| `risk_level` | str, nullable | |
| `model` | str, nullable | |
| `input_tokens`, `output_tokens` | int, nullable | |

## 7. API

Base path `/api`. All errors return `{"detail": "<human readable>"}`.

| Method | Path | Request | Response |
|---|---|---|---|
| `POST` | `/analyses` | multipart `file`, optional `site_name` | `202 {id, status: "pending"}`; schedules background analysis |
| `GET` | `/analyses` | — | `200 [AnalysisSummary]` newest first |
| `GET` | `/analyses/{id}` | — | `200 AnalysisDetail` (includes `result`, `scores`, `status`) or `404` |
| `POST` | `/analyses/{id}/retry` | — | `202` re-runs analysis on stored file; `409` if not `failed` |
| `DELETE` | `/analyses/{id}` | — | `204`; removes row and file |
| `GET` | `/analyses/{id}/media` | — | streams original file with correct content-type |
| `GET` | `/stats` | — | `{total, completed, average_score, critical_count, findings_by_category, trend: [{date, score}]}` |
| `GET` | `/health` | — | `{status: "ok", gemini_configured: bool}` |

Validation: max upload 100 MB (`413`), allowed MIME `image/jpeg, image/png, image/webp, video/mp4, video/quicktime, video/webm` (`400`). Frontend polls `GET /analyses/{id}` every 2 s while status is `pending`/`processing`.

## 8. Frontend

Stack: React 18, Vite, TypeScript, Tailwind, React Router, Recharts, Lucide icons, TanStack Query for fetching/polling.

### Routes

- `/` **Dashboard** — KPI row (total analyses, average risk, critical count), score-trend line chart, findings-by-category bar chart, table of past analyses (date, site, file, level badge, score) → click opens report. Empty state with a "Run your first analysis" CTA.
- `/new` **Upload** — drag-and-drop zone with visible label and accepted formats, optional site-name input, selected-file preview (image thumbnail or video element), inline validation errors under the field, single primary CTA "Analyze". On success navigates to `/analyses/:id`.
- `/analyses/:id` **Report** —
  - Processing state: skeleton layout + "Analyzing… video usually takes 20–60 s".
  - Failed state: error message + **Retry** button.
  - Completed: header (media preview, site name, date, model, tokens); **Risk gauge** (radial, numeric score + level label + icon); **Current vs after mitigation** bullet bars with "reduce by N points" callout; **5×5 severity × likelihood matrix** with findings plotted; **findings by category** horizontal bar; **findings list** sorted by risk desc, each card: category icon, severity/likelihood chips, evidence (with timestamp for video), recommendation, required equipment tags, "−X% after fix"; **positive observations**; **Download PDF** button → `window.print()` with a print stylesheet (nav hidden, page breaks between sections, charts as SVG).

### Design tokens

- Neutrals: background `#F8FAFC`, foreground `#334155`, muted `#EBF0F5`, border `#E2E8F0`; dark mode variants via `class` strategy.
- Accent / primary CTA: safety orange `#EA580C` (white text).
- Risk levels: Low green-600, Moderate amber-500, High orange-600, Critical red-600 — always paired with a text label and an icon, never color alone.
- Typography: Inter (body/headings), JetBrains Mono with `tabular-nums` for scores and numbers. Base 16 px, line-height 1.5.
- Style: data-dense dashboard, 8 px spacing scale, cards with a single consistent shadow level, 150–250 ms transitions, `prefers-reduced-motion` respected.
- Accessibility: 4.5:1 text contrast, visible focus rings, 44 px touch targets, labelled inputs, chart data also available as text (score value, table under charts on the report).

### Frontend structure

```
frontend/src/
  api/        client.ts (fetch wrapper), types.ts (mirrors backend schemas)
  pages/      DashboardPage, UploadPage, ReportPage
  components/ layout/AppShell, upload/Dropzone, report/{RiskGauge, MitigationBars,
              RiskMatrix, CategoryBar, FindingCard, PositiveList}, dashboard/{KpiCard, TrendChart}
  hooks/      useAnalysis (query + polling), useAnalyses, useStats
  lib/        risk.ts (level → label/color/icon), format.ts
```

## 9. Error handling

| Situation | Behaviour |
|---|---|
| Wrong file type / too large | `400`/`413`; message shown under the dropzone |
| Gemini API error or invalid JSON | one automatic retry; then `status=failed` with `error_message`; report page offers Retry |
| Video never becomes `ACTIVE` | 120 s timeout → `failed` |
| API key missing | `/health.gemini_configured=false`; upload page shows a warning banner, Analyze disabled |
| Backend unreachable | frontend toast with retry |

## 10. Testing

**Backend — pytest**
- `tests/unit/test_scoring.py`: no findings; single critical; many minor; residual math; level boundaries (24/25, 49/50, 74/75).
- `tests/unit/test_models.py`: valid fixture parses; out-of-range severity, unknown category, missing fields rejected.
- `tests/api/test_analyses.py`: with `FakeAnalyzer` via dependency override and a temp SQLite: upload → poll → completed; upload → failure → retry → completed; invalid MIME `400`; oversize `413`; `404`s; delete removes file; list ordering; stats aggregation.
- `tests/integration/test_gemini_live.py`: marked `integration`, skipped without `GEMINI_API_KEY`; analyzes one clip from `samples/` and asserts the result parses.

**Frontend — Vitest + React Testing Library + MSW**
- `risk.ts` level mapping; `useAnalysis` polling stops on `completed`; Dropzone rejects bad type with visible error; ReportPage renders fixture (score, level text, findings count); DashboardPage empty state.

**Smoke script** `scripts/smoke_analyze.py`: loops over every clip in `samples/`, calls the API, waits, prints `filename | score | level | findings | tokens` and a total token count.

## 11. Repository layout

```
building-site-risk-assessment/
├── backend/
│   ├── app/{main.py, config.py, api/, domain/, services/, db/, prompts/}
│   ├── tests/{unit,api,integration}
│   ├── pyproject.toml
│   └── .env.example        # GEMINI_API_KEY=, GEMINI_MODEL=gemini-2.5-flash, DATA_DIR=./data
├── frontend/               # Vite React TS app
├── scripts/smoke_analyze.py
├── samples/                # clips extracted from Archive.zip (git-ignored)
├── data/                   # SQLite + uploads (git-ignored)
├── docs/superpowers/{specs,plans}
├── .gitignore
└── README.md               # setup, run, test, rotate-key note
```

## 12. Out of scope (v1)

Auth, multi-file analyses, server-side PDF generation, Arabic output, real-time camera feeds, deployment config.
