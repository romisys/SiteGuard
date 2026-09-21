# SiteGuard Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A FastAPI backend that accepts one image/video of a construction site, sends it to Gemini 2.5 Flash, validates the structured findings (workers + PPE + site hazards), computes deterministic risk scores, persists everything in SQLite, and exposes it over a small JSON API.

**Architecture:** Layered, dependency-injected: `api/` (HTTP) → `services/` (orchestration, Gemini client, file storage) → `domain/` (pure Pydantic models + scoring) and `db/` (SQLAlchemy). The Gemini client is behind a `Protocol` so every API test runs against a `FakeAnalyzer`; only one `integration`-marked test touches the real API. Long analyses run as FastAPI `BackgroundTasks`; the frontend polls status.

**Tech Stack:** Python 3.11 (`/usr/local/opt/python@3.11/bin/python3.11`), FastAPI, SQLAlchemy 2, Pydantic 2, pydantic-settings, google-genai, pytest, httpx, ruff.

**Spec:** `docs/superpowers/specs/2026-09-21-siteguard-design.md`

**Conventions for every task:**
- Run all commands from `backend/` with the venv active: `cd "/Users/apple/Desktop/building site risk assesment/backend" && source .venv/bin/activate`
- Commit from the repo root. Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Tests use `pytest -q`; expected outputs below show only the relevant line.

---

## File structure

```
backend/
├── pyproject.toml
├── .env.example
├── app/
│   ├── __init__.py
│   ├── main.py                    # create_app() factory, CORS, routers
│   ├── config.py                  # Settings (env / .env)
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py                # FastAPI dependencies pulling from app.state
│   │   ├── schemas.py             # response models + to_summary()/to_detail()
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── analyses.py        # /api/analyses*
│   │       ├── stats.py           # /api/stats
│   │       └── health.py          # /api/health
│   ├── domain/
│   │   ├── __init__.py
│   │   ├── models.py              # Gemini contract: AnalysisResult, Finding, WorkerAssessment, enums
│   │   └── scoring.py             # pure: score(result) -> ScoreSummary
│   ├── services/
│   │   ├── __init__.py
│   │   ├── errors.py              # service-level exceptions
│   │   ├── storage.py             # FileStorage: save/absolute/delete
│   │   ├── gemini_client.py       # GeminiAnalyzer protocol, GoogleGeminiAnalyzer, FakeAnalyzer
│   │   └── analysis_service.py    # AnalysisService: create/run/retry/get/list/delete
│   ├── prompts/
│   │   └── inspector.md           # the Gemini prompt
│   └── db/
│       ├── __init__.py
│       ├── models.py              # SQLAlchemy Analysis row
│       ├── session.py             # engine + session factory + init_db
│       └── repository.py          # AnalysisRepository
└── tests/
    ├── conftest.py                # settings/app/client fixtures
    ├── factories.py               # make_result(), make_finding(), make_outcome()
    ├── unit/
    │   ├── test_models.py
    │   ├── test_scoring.py
    │   ├── test_storage.py
    │   ├── test_repository.py
    │   ├── test_fake_analyzer.py
    │   └── test_analysis_service.py
    ├── api/
    │   ├── test_analyses.py
    │   ├── test_stats.py
    │   └── test_health.py
    └── integration/
        └── test_gemini_live.py
scripts/
└── smoke_analyze.py
samples/                           # extracted from Archive.zip (git-ignored)
```

---

### Task 1: Project scaffold, venv, samples

**Files:**
- Create: `backend/pyproject.toml`, `backend/.env.example`, `backend/app/__init__.py`, `backend/app/api/__init__.py`, `backend/app/api/routes/__init__.py`, `backend/app/domain/__init__.py`, `backend/app/services/__init__.py`, `backend/app/db/__init__.py`, `backend/tests/__init__.py`, `backend/tests/unit/__init__.py`, `backend/tests/api/__init__.py`, `backend/tests/integration/__init__.py`
- Create: `samples/` (extracted clips)

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "siteguard-backend"
version = "0.1.0"
description = "SiteGuard construction site risk assessment API"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "python-multipart>=0.0.9",
  "sqlalchemy>=2.0",
  "pydantic>=2.7",
  "pydantic-settings>=2.3",
  "google-genai>=1.0",
]

[project.optional-dependencies]
dev = ["pytest>=8", "httpx>=0.27", "ruff>=0.5"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]

[tool.setuptools.package-data]
app = ["prompts/*.md"]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = ["integration: hits the real Gemini API (needs GEMINI_API_KEY)"]
addopts = "-m 'not integration'"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
```

- [ ] **Step 2: Create `backend/.env.example`**

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
DATA_DIR=./data
```

- [ ] **Step 3: Create package `__init__.py` files (all empty)**

```bash
cd "/Users/apple/Desktop/building site risk assesment"
mkdir -p backend/app/api/routes backend/app/domain backend/app/services backend/app/db backend/app/prompts \
         backend/tests/unit backend/tests/api backend/tests/integration scripts samples
touch backend/app/__init__.py backend/app/api/__init__.py backend/app/api/routes/__init__.py \
      backend/app/domain/__init__.py backend/app/services/__init__.py backend/app/db/__init__.py \
      backend/tests/__init__.py backend/tests/unit/__init__.py backend/tests/api/__init__.py \
      backend/tests/integration/__init__.py
```

- [ ] **Step 4: Create venv and install**

```bash
cd "/Users/apple/Desktop/building site risk assesment/backend"
/usr/local/opt/python@3.11/bin/python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
python -c "import fastapi, sqlalchemy, google.genai; print('ok')"
```
Expected: `ok`

- [ ] **Step 5: Extract sample clips and create `.env` with the real key**

```bash
cd "/Users/apple/Desktop/building site risk assesment"
unzip -j -o Archive.zip "*.mov" -x "__MACOSX/*" -d samples/
ls samples | wc -l
```
Expected: `13`

Create `backend/.env` (git-ignored) by copying `.env.example` and filling `GEMINI_API_KEY=` with the key the user provided in chat. Do not commit it.

- [ ] **Step 6: Verify pytest runs with zero tests**

```bash
cd backend && source .venv/bin/activate && pytest -q
```
Expected: `no tests ran`

- [ ] **Step 7: Commit**

```bash
cd "/Users/apple/Desktop/building site risk assesment"
git add backend/pyproject.toml backend/.env.example backend/app backend/tests
git commit -m "chore(backend): scaffold FastAPI project

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Settings

**Files:**
- Create: `backend/app/config.py`
- Test: `backend/tests/unit/test_config.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_config.py
from pathlib import Path

from app.config import Settings


def test_defaults_without_env_file(tmp_path: Path):
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.gemini_api_key is None
    assert s.gemini_configured is False
    assert s.gemini_model == "gemini-2.5-flash"
    assert s.database_url == f"sqlite:///{tmp_path / 'siteguard.db'}"
    assert s.uploads_dir == tmp_path / "uploads"
    assert s.max_upload_bytes == 100 * 1024 * 1024


def test_key_marks_configured(tmp_path: Path):
    s = Settings(_env_file=None, data_dir=tmp_path, gemini_api_key="abc")
    assert s.gemini_configured is True


def test_reads_env_vars(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-x")
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.gemini_api_key == "from-env"
    assert s.gemini_model == "gemini-x"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_config.py -q`
Expected: `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 3: Implement `backend/app/config.py`**

```python
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables or a .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    data_dir: Path = Path("./data")
    max_upload_bytes: int = 100 * 1024 * 1024
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'siteguard.db'}"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_config.py -q`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/unit/test_config.py
git commit -m "feat(backend): add Settings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Domain models (Gemini contract)

**Files:**
- Create: `backend/app/domain/models.py`
- Create: `backend/tests/factories.py`
- Test: `backend/tests/unit/test_models.py`

- [ ] **Step 1: Write the test factories**

```python
# backend/tests/factories.py
"""Builders for domain objects used across tests."""
from app.domain.models import (
    AnalysisResult,
    Finding,
    FindingSubject,
    PpeCheck,
    PpeItem,
    RiskCategory,
    WorkerAssessment,
)


def make_finding(**overrides) -> Finding:
    data = dict(
        subject=FindingSubject.worker,
        category=RiskCategory.ppe,
        title="Worker without helmet",
        description="One worker on the second floor slab is not wearing a hard hat.",
        evidence="Left side of frame, worker in blue shirt, 0:04",
        timestamp_seconds=4.0,
        severity=4,
        likelihood=3,
        recommendation="Stop work until all workers on the slab wear certified hard hats.",
        required_equipment=["hard hat"],
        mitigation_effectiveness=0.8,
    )
    data.update(overrides)
    return Finding(**data)


def make_workers(**overrides) -> WorkerAssessment:
    data = dict(
        workers_visible=2,
        ppe=[
            PpeCheck(item=PpeItem.helmet, compliant=1, non_compliant=1, notes="one bare head"),
            PpeCheck(item=PpeItem.hi_vis_vest, compliant=2, non_compliant=0, notes=""),
        ],
        unsafe_behaviours=["Worker leaning over unprotected slab edge"],
    )
    data.update(overrides)
    return WorkerAssessment(**data)


def make_result(findings: list[Finding] | None = None, **overrides) -> AnalysisResult:
    data = dict(
        scene_summary="Two workers on a second-floor slab of a concrete frame building.",
        workers=make_workers(),
        positive_observations=["Site perimeter fencing is in place."],
        findings=[make_finding()] if findings is None else findings,
    )
    data.update(overrides)
    return AnalysisResult(**data)
```

- [ ] **Step 2: Write the failing tests**

```python
# backend/tests/unit/test_models.py
import pytest
from pydantic import ValidationError

from app.domain.models import AnalysisResult, Finding
from tests.factories import make_finding, make_result


def test_result_roundtrips_through_json():
    result = make_result()
    dumped = result.model_dump_json()
    assert AnalysisResult.model_validate_json(dumped) == result


def test_finding_risk_is_severity_times_likelihood():
    assert make_finding(severity=4, likelihood=3).risk == 12


def test_timestamp_is_optional():
    f = make_finding(timestamp_seconds=None)
    assert f.timestamp_seconds is None


@pytest.mark.parametrize("field,value", [("severity", 0), ("severity", 6), ("likelihood", 0), ("likelihood", 6)])
def test_out_of_range_severity_or_likelihood_rejected(field, value):
    with pytest.raises(ValidationError):
        make_finding(**{field: value})


@pytest.mark.parametrize("value", [-0.1, 1.1])
def test_mitigation_effectiveness_bounded(value):
    with pytest.raises(ValidationError):
        make_finding(mitigation_effectiveness=value)


def test_unknown_category_rejected():
    with pytest.raises(ValidationError):
        make_finding(category="ghosts")


def test_unknown_subject_rejected():
    with pytest.raises(ValidationError):
        make_finding(subject="manager")


def test_missing_required_field_rejected():
    payload = make_finding().model_dump()
    del payload["recommendation"]
    with pytest.raises(ValidationError):
        Finding(**payload)


def test_result_requires_workers_block():
    payload = make_result().model_dump()
    del payload["workers"]
    with pytest.raises(ValidationError):
        AnalysisResult(**payload)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/unit/test_models.py -q`
Expected: `ModuleNotFoundError: No module named 'app.domain.models'`

- [ ] **Step 4: Implement `backend/app/domain/models.py`**

```python
"""Pure domain models. This is the JSON contract Gemini must satisfy.

No FastAPI, SQLAlchemy or google-genai imports here.
"""
from enum import Enum

from pydantic import BaseModel, Field


class RiskCategory(str, Enum):
    fall_protection = "fall_protection"
    ppe = "ppe"
    scaffolding = "scaffolding"
    electrical = "electrical"
    excavation = "excavation"
    struck_by = "struck_by"
    housekeeping = "housekeeping"
    machinery = "machinery"
    fire = "fire"
    structural = "structural"
    other = "other"


class FindingSubject(str, Enum):
    worker = "worker"
    site = "site"
    equipment = "equipment"


class PpeItem(str, Enum):
    helmet = "helmet"
    hi_vis_vest = "hi_vis_vest"
    harness = "harness"
    gloves = "gloves"
    safety_boots = "safety_boots"
    eye_protection = "eye_protection"


class RiskLevel(str, Enum):
    low = "Low"
    moderate = "Moderate"
    high = "High"
    critical = "Critical"


class MediaType(str, Enum):
    image = "image"
    video = "video"


class AnalysisStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class PpeCheck(BaseModel):
    item: PpeItem
    compliant: int = Field(ge=0, description="Workers wearing this item")
    non_compliant: int = Field(ge=0, description="Workers who should wear it but do not")
    notes: str = ""


class WorkerAssessment(BaseModel):
    workers_visible: int = Field(ge=0)
    ppe: list[PpeCheck] = Field(default_factory=list)
    unsafe_behaviours: list[str] = Field(default_factory=list)


class Finding(BaseModel):
    subject: FindingSubject
    category: RiskCategory
    title: str
    description: str = Field(description="What was observed")
    evidence: str = Field(description="Where in the frame / when it was seen")
    timestamp_seconds: float | None = Field(default=None, description="Video only")
    severity: int = Field(ge=1, le=5, description="Consequence if it happens, 1 first aid .. 5 fatality")
    likelihood: int = Field(ge=1, le=5, description="Probability given what is visible, 1 rare .. 5 almost certain")
    recommendation: str
    required_equipment: list[str] = Field(default_factory=list)
    mitigation_effectiveness: float = Field(
        ge=0, le=1, description="Fraction of this risk removed if the recommendation is applied"
    )

    @property
    def risk(self) -> int:
        return self.severity * self.likelihood


class AnalysisResult(BaseModel):
    scene_summary: str
    workers: WorkerAssessment
    positive_observations: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/unit/test_models.py -q`
Expected: `13 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/app/domain/models.py backend/tests/factories.py backend/tests/unit/test_models.py
git commit -m "feat(backend): add domain models for Gemini contract

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Scoring

**Files:**
- Create: `backend/app/domain/scoring.py`
- Test: `backend/tests/unit/test_scoring.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/unit/test_scoring.py
import pytest

from app.domain.models import FindingSubject, PpeCheck, PpeItem, RiskCategory, RiskLevel
from app.domain.scoring import aggregate, level_for, ppe_compliance_rate, score
from tests.factories import make_finding, make_result, make_workers


@pytest.mark.parametrize(
    "value,expected",
    [(0, RiskLevel.low), (24, RiskLevel.low), (25, RiskLevel.moderate), (49, RiskLevel.moderate),
     (50, RiskLevel.high), (74, RiskLevel.high), (75, RiskLevel.critical), (100, RiskLevel.critical)],
)
def test_level_boundaries(value, expected):
    assert level_for(value) == expected


def test_aggregate_empty_is_zero():
    assert aggregate([]) == 0


def test_aggregate_single_max_is_100():
    assert aggregate([25]) == 100


def test_aggregate_single_minor():
    # 6/25 = 0.24 -> 0.6*0.24 + 0.4*0.24 = 0.24 -> 24
    assert aggregate([6]) == 24


def test_aggregate_one_critical_dominates_but_minor_still_matters():
    assert aggregate([25, 1]) == 81   # 0.6*1 + 0.4*(13/25)
    assert aggregate([25, 25]) == 100


def test_no_findings_scores_zero_low():
    s = score(make_result(findings=[]))
    assert s.risk_score == 0
    assert s.residual_score == 0
    assert s.reduction == 0
    assert s.risk_level == RiskLevel.low
    assert s.residual_level == RiskLevel.low
    assert s.per_finding == []


def test_mixed_findings_scores_and_residual():
    findings = [
        make_finding(severity=5, likelihood=5, mitigation_effectiveness=0.8,
                     subject=FindingSubject.site, category=RiskCategory.fall_protection),
        make_finding(severity=5, likelihood=1, mitigation_effectiveness=0.5,
                     subject=FindingSubject.worker, category=RiskCategory.ppe),
    ]
    s = score(make_result(findings=findings))
    assert s.risk_score == 84          # 0.6*1 + 0.4*(15/25)
    assert s.residual_score == 18      # residual risks 5 and 2.5
    assert s.reduction == 66
    assert s.risk_level == RiskLevel.critical
    assert s.residual_level == RiskLevel.low
    assert [p.risk for p in s.per_finding] == [25, 5]
    assert [p.residual_risk for p in s.per_finding] == [5.0, 2.5]


def test_counts_by_category_and_subject():
    findings = [
        make_finding(subject=FindingSubject.worker, category=RiskCategory.ppe),
        make_finding(subject=FindingSubject.worker, category=RiskCategory.ppe),
        make_finding(subject=FindingSubject.site, category=RiskCategory.housekeeping),
    ]
    s = score(make_result(findings=findings))
    assert s.findings_by_category == {"ppe": 2, "housekeeping": 1}
    assert s.findings_by_subject == {"worker": 2, "site": 1}


def test_ppe_compliance_rate():
    workers = make_workers(ppe=[
        PpeCheck(item=PpeItem.helmet, compliant=3, non_compliant=2),
        PpeCheck(item=PpeItem.hi_vis_vest, compliant=5, non_compliant=0),
    ])
    assert ppe_compliance_rate(workers) == 0.8


def test_ppe_compliance_rate_none_when_no_workers():
    assert ppe_compliance_rate(make_workers(workers_visible=0, ppe=[])) is None
    assert ppe_compliance_rate(make_workers(ppe=[PpeCheck(item=PpeItem.gloves, compliant=0, non_compliant=0)])) is None


def test_score_includes_ppe_rate():
    s = score(make_result())      # factory: helmet 1/2, vest 2/2 -> 3/4
    assert s.ppe_compliance_rate == 0.75
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_scoring.py -q`
Expected: `ModuleNotFoundError: No module named 'app.domain.scoring'`

- [ ] **Step 3: Implement `backend/app/domain/scoring.py`**

```python
"""Deterministic risk scoring. Gemini sees; this module does the math."""
from statistics import mean

from pydantic import BaseModel

from app.domain.models import AnalysisResult, RiskLevel, WorkerAssessment

MAX_FINDING_RISK = 25  # severity 5 x likelihood 5
MAX_WEIGHT = 0.6       # the single worst hazard dominates
MEAN_WEIGHT = 0.4      # ...but many hazards still push the score up


class FindingScore(BaseModel):
    index: int
    risk: int
    residual_risk: float


class ScoreSummary(BaseModel):
    risk_score: int
    residual_score: int
    reduction: int
    risk_level: RiskLevel
    residual_level: RiskLevel
    findings_by_category: dict[str, int]
    findings_by_subject: dict[str, int]
    ppe_compliance_rate: float | None
    per_finding: list[FindingScore]


def level_for(score_value: int) -> RiskLevel:
    if score_value >= 75:
        return RiskLevel.critical
    if score_value >= 50:
        return RiskLevel.high
    if score_value >= 25:
        return RiskLevel.moderate
    return RiskLevel.low


def aggregate(risks: list[float]) -> int:
    """Combine per-finding risks (0..25) into a 0..100 site score."""
    if not risks:
        return 0
    top = max(risks) / MAX_FINDING_RISK
    avg = mean(risks) / MAX_FINDING_RISK
    return round(100 * (MAX_WEIGHT * top + MEAN_WEIGHT * avg))


def ppe_compliance_rate(workers: WorkerAssessment) -> float | None:
    compliant = sum(c.compliant for c in workers.ppe)
    total = compliant + sum(c.non_compliant for c in workers.ppe)
    if total == 0:
        return None
    return round(compliant / total, 3)


def score(result: AnalysisResult) -> ScoreSummary:
    per_finding = [
        FindingScore(
            index=i,
            risk=f.risk,
            residual_risk=round(f.risk * (1 - f.mitigation_effectiveness), 2),
        )
        for i, f in enumerate(result.findings)
    ]
    risk_score = aggregate([p.risk for p in per_finding])
    residual_score = aggregate([p.residual_risk for p in per_finding])

    by_category: dict[str, int] = {}
    by_subject: dict[str, int] = {}
    for f in result.findings:
        by_category[f.category.value] = by_category.get(f.category.value, 0) + 1
        by_subject[f.subject.value] = by_subject.get(f.subject.value, 0) + 1

    return ScoreSummary(
        risk_score=risk_score,
        residual_score=residual_score,
        reduction=risk_score - residual_score,
        risk_level=level_for(risk_score),
        residual_level=level_for(residual_score),
        findings_by_category=by_category,
        findings_by_subject=by_subject,
        ppe_compliance_rate=ppe_compliance_rate(result.workers),
        per_finding=per_finding,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_scoring.py -q`
Expected: `18 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/scoring.py backend/tests/unit/test_scoring.py
git commit -m "feat(backend): add deterministic risk scoring

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Database layer

**Files:**
- Create: `backend/app/db/models.py`, `backend/app/db/session.py`, `backend/app/db/repository.py`
- Test: `backend/tests/unit/test_repository.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/unit/test_repository.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Analysis
from app.db.repository import AnalysisRepository
from app.db.session import init_db


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    init_db(engine)
    factory = sessionmaker(bind=engine)
    with factory() as s:
        yield s


def _row(**overrides) -> Analysis:
    data = dict(
        filename="clip.mov", media_type="video", mime_type="video/quicktime",
        storage_path="uploads/x.mov",
    )
    data.update(overrides)
    return Analysis(**data)


def test_add_assigns_id_and_defaults(session):
    repo = AnalysisRepository(session)
    row = repo.add(_row())
    session.commit()
    assert len(row.id) == 36
    assert row.status == "pending"
    assert row.created_at is not None
    assert repo.get(row.id) is row


def test_get_missing_returns_none(session):
    assert AnalysisRepository(session).get("nope") is None


def test_list_all_is_newest_first(session):
    from datetime import datetime, timedelta, timezone

    repo = AnalysisRepository(session)
    older = repo.add(_row(filename="a", created_at=datetime.now(timezone.utc) - timedelta(days=1)))
    newer = repo.add(_row(filename="b"))
    session.commit()
    assert [r.filename for r in repo.list_all()] == ["b", "a"]
    assert repo.list_all()[0] is newer and repo.list_all()[1] is older


def test_delete_removes_row(session):
    repo = AnalysisRepository(session)
    row = repo.add(_row())
    session.commit()
    repo.delete(row)
    session.commit()
    assert repo.get(row.id) is None


def test_result_json_roundtrip(session):
    repo = AnalysisRepository(session)
    row = repo.add(_row(result_json={"findings": [], "scene_summary": "x"}, risk_score=12))
    session.commit()
    session.expire_all()
    fetched = repo.get(row.id)
    assert fetched.result_json == {"findings": [], "scene_summary": "x"}
    assert fetched.risk_score == 12
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_repository.py -q`
Expected: `ModuleNotFoundError: No module named 'app.db.models'`

- [ ] **Step 3: Implement `backend/app/db/models.py`**

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    site_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)   # image | video
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    residual_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ppe_compliance_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String(50), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

- [ ] **Step 4: Implement `backend/app/db/session.py`**

```python
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base


def make_engine(database_url: str) -> Engine:
    # check_same_thread=False: the background task uses the engine from another thread.
    return create_engine(database_url, connect_args={"check_same_thread": False})


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
```

- [ ] **Step 5: Implement `backend/app/db/repository.py`**

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Analysis


class AnalysisRepository:
    """Thin data-access wrapper. Callers own the transaction (session.commit())."""

    def __init__(self, session: Session):
        self.session = session

    def add(self, analysis: Analysis) -> Analysis:
        self.session.add(analysis)
        self.session.flush()
        return analysis

    def get(self, analysis_id: str) -> Analysis | None:
        return self.session.get(Analysis, analysis_id)

    def list_all(self) -> list[Analysis]:
        stmt = select(Analysis).order_by(Analysis.created_at.desc())
        return list(self.session.scalars(stmt))

    def delete(self, analysis: Analysis) -> None:
        self.session.delete(analysis)
        self.session.flush()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/unit/test_repository.py -q`
Expected: `5 passed`

- [ ] **Step 7: Commit**

```bash
git add backend/app/db backend/tests/unit/test_repository.py
git commit -m "feat(backend): add SQLAlchemy model, session factory and repository

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: File storage

**Files:**
- Create: `backend/app/services/errors.py`, `backend/app/services/storage.py`
- Test: `backend/tests/unit/test_storage.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/unit/test_storage.py
from pathlib import Path

import pytest

from app.services.errors import UnsupportedMediaType
from app.services.storage import ALLOWED_MIME, FileStorage, media_type_for


def test_allowed_mime_table():
    assert ALLOWED_MIME["video/quicktime"] == ".mov"
    assert ALLOWED_MIME["image/jpeg"] == ".jpg"


def test_media_type_for():
    assert media_type_for("image/png") == "image"
    assert media_type_for("video/mp4") == "video"
    with pytest.raises(UnsupportedMediaType):
        media_type_for("application/pdf")


def test_save_writes_file_under_uploads(tmp_path: Path):
    storage = FileStorage(root=tmp_path)
    rel = storage.save("abc", "video/quicktime", b"bytes")
    assert rel == "uploads/abc.mov"
    assert storage.absolute(rel) == tmp_path / "uploads" / "abc.mov"
    assert storage.absolute(rel).read_bytes() == b"bytes"


def test_save_rejects_unknown_mime(tmp_path: Path):
    with pytest.raises(UnsupportedMediaType):
        FileStorage(root=tmp_path).save("abc", "text/plain", b"x")


def test_delete_is_idempotent(tmp_path: Path):
    storage = FileStorage(root=tmp_path)
    rel = storage.save("abc", "image/png", b"x")
    storage.delete(rel)
    assert not storage.absolute(rel).exists()
    storage.delete(rel)  # no error the second time
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_storage.py -q`
Expected: `ModuleNotFoundError: No module named 'app.services.errors'`

- [ ] **Step 3: Implement `backend/app/services/errors.py`**

```python
class ServiceError(Exception):
    """Base for errors the API maps to HTTP status codes."""


class UnsupportedMediaType(ServiceError):
    pass


class FileTooLarge(ServiceError):
    pass


class AnalysisNotFound(ServiceError):
    pass


class InvalidState(ServiceError):
    pass


class AnalyzerError(ServiceError):
    """Gemini call failed (network, quota, file processing)."""


class InvalidModelOutput(AnalyzerError):
    """Gemini answered but the JSON did not match the contract."""
```

- [ ] **Step 4: Implement `backend/app/services/storage.py`**

```python
from pathlib import Path

from app.services.errors import UnsupportedMediaType

ALLOWED_MIME: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
}


def media_type_for(mime_type: str) -> str:
    if mime_type not in ALLOWED_MIME:
        raise UnsupportedMediaType(
            f"Unsupported file type '{mime_type}'. Allowed: {', '.join(sorted(ALLOWED_MIME))}"
        )
    return mime_type.split("/", 1)[0]


class FileStorage:
    """Stores uploaded media on disk under <root>/uploads/<id><ext>."""

    def __init__(self, root: Path):
        self.root = root
        (self.root / "uploads").mkdir(parents=True, exist_ok=True)

    def save(self, analysis_id: str, mime_type: str, data: bytes) -> str:
        media_type_for(mime_type)  # raises if not allowed
        rel = f"uploads/{analysis_id}{ALLOWED_MIME[mime_type]}"
        self.absolute(rel).write_bytes(data)
        return rel

    def absolute(self, rel_path: str) -> Path:
        return self.root / rel_path

    def delete(self, rel_path: str) -> None:
        self.absolute(rel_path).unlink(missing_ok=True)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/unit/test_storage.py -q`
Expected: `5 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/errors.py backend/app/services/storage.py backend/tests/unit/test_storage.py
git commit -m "feat(backend): add file storage and service errors

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Gemini client (protocol, fake, real) and prompt

**Files:**
- Create: `backend/app/prompts/inspector.md`, `backend/app/services/gemini_client.py`
- Modify: `backend/tests/factories.py` (add `make_outcome`)
- Test: `backend/tests/unit/test_fake_analyzer.py`

- [ ] **Step 1: Write the prompt `backend/app/prompts/inspector.md`**

```markdown
You are a certified construction site safety inspector. Analyse the attached {media_kind} of a construction site and report every safety risk you can actually see. Do not invent hazards that are not visible; if something is unclear, lower the likelihood rather than guessing.

Work in two passes.

PASS 1 — PEOPLE
- Count every visible worker.
- For each PPE item you can judge (helmet, hi_vis_vest, harness when working at height, gloves, safety_boots, eye_protection) report how many workers wear it and how many should but do not.
- List unsafe behaviours (standing on the top rung of a ladder, walking under a suspended load, working at an unprotected edge, using a phone while operating machinery, etc.).
- Every missing PPE item and every unsafe act MUST become a finding with subject "worker".

PASS 2 — SITE AND EQUIPMENT
- Structural stability and temporary works.
- Scaffolding: bracing, planks, guardrails, toe boards, base plates, ties.
- Electrical: exposed cables, water near power, damaged tools.
- Excavation: shoring, edge distance, access, water.
- Struck-by: cranes, vehicles, falling objects, unsecured materials at height.
- Housekeeping: debris, trip hazards, blocked access routes.
- Machinery guarding, fire risks, hazardous storage.
- Produce findings with subject "site" or "equipment".

For every finding provide:
- severity 1-5: consequence if it happens (1 first aid, 2 medical treatment, 3 lost-time injury, 4 permanent disability, 5 fatality).
- likelihood 1-5: probability given exactly what is visible (1 rare, 2 unlikely, 3 possible, 4 likely, 5 almost certain).
- a specific, actionable recommendation and the equipment needed to apply it.
- mitigation_effectiveness 0-1: the fraction of this risk removed if the recommendation is fully applied.
- evidence: where in the frame it was seen; for video set timestamp_seconds to the second it is clearest, for images set timestamp_seconds to null.

Also list positive observations — things being done correctly.

Be concise and factual. Return only JSON matching the provided schema.
```

- [ ] **Step 2: Add `make_outcome` to `backend/tests/factories.py`** (append at the end)

```python
from app.services.gemini_client import GeminiOutcome, GeminiUsage  # noqa: E402


def make_outcome(result: AnalysisResult | None = None, **usage_overrides) -> GeminiOutcome:
    usage = dict(model="fake-model", input_tokens=1200, output_tokens=340)
    usage.update(usage_overrides)
    return GeminiOutcome(result=result or make_result(), usage=GeminiUsage(**usage))
```

- [ ] **Step 3: Write the failing tests**

```python
# backend/tests/unit/test_fake_analyzer.py
from pathlib import Path

import pytest

from app.domain.models import MediaType
from app.services.errors import AnalyzerError
from app.services.gemini_client import FakeAnalyzer, load_prompt
from tests.factories import make_outcome


def test_prompt_mentions_both_passes_and_media_kind():
    text = load_prompt(MediaType.video)
    assert "PASS 1" in text and "PASS 2" in text
    assert "video" in text and "{media_kind}" not in text
    assert "image" in load_prompt(MediaType.image)


def test_fake_returns_queued_outcomes_in_order(tmp_path: Path):
    first, second = make_outcome(input_tokens=1), make_outcome(input_tokens=2)
    fake = FakeAnalyzer([first, second])
    assert fake.analyze(tmp_path / "a.mov", "video/quicktime", MediaType.video) is first
    assert fake.analyze(tmp_path / "a.mov", "video/quicktime", MediaType.video) is second
    assert [c.mime_type for c in fake.calls] == ["video/quicktime", "video/quicktime"]


def test_fake_raises_queued_exception(tmp_path: Path):
    fake = FakeAnalyzer([AnalyzerError("boom"), make_outcome()])
    with pytest.raises(AnalyzerError, match="boom"):
        fake.analyze(tmp_path / "a.png", "image/png", MediaType.image)
    assert fake.analyze(tmp_path / "a.png", "image/png", MediaType.image).usage.model == "fake-model"


def test_fake_with_empty_queue_returns_default_outcome(tmp_path: Path):
    fake = FakeAnalyzer()
    outcome = fake.analyze(tmp_path / "a.png", "image/png", MediaType.image)
    assert outcome.result.findings
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pytest tests/unit/test_fake_analyzer.py -q`
Expected: `ImportError` / `ModuleNotFoundError: No module named 'app.services.gemini_client'`

- [ ] **Step 5: Implement `backend/app/services/gemini_client.py`**

```python
"""Gemini integration behind a small Protocol so the rest of the app never imports google-genai."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ValidationError

from app.domain.models import AnalysisResult, MediaType
from app.services.errors import AnalyzerError, InvalidModelOutput

log = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "inspector.md"


def load_prompt(media_type: MediaType) -> str:
    return PROMPT_PATH.read_text(encoding="utf-8").replace("{media_kind}", media_type.value)


class GeminiUsage(BaseModel):
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class GeminiOutcome(BaseModel):
    result: AnalysisResult
    usage: GeminiUsage


class GeminiAnalyzer(Protocol):
    def analyze(self, path: Path, mime_type: str, media_type: MediaType) -> GeminiOutcome: ...


# --------------------------------------------------------------------------- fake


@dataclass
class AnalyzeCall:
    path: Path
    mime_type: str
    media_type: MediaType


@dataclass
class FakeAnalyzer:
    """Returns queued outcomes (or raises queued exceptions) in order; records calls.

    With an empty queue it returns a sensible default result so simple tests need no setup.
    """

    queue: list[GeminiOutcome | Exception] = field(default_factory=list)
    calls: list[AnalyzeCall] = field(default_factory=list)

    def analyze(self, path: Path, mime_type: str, media_type: MediaType) -> GeminiOutcome:
        self.calls.append(AnalyzeCall(path, mime_type, media_type))
        if not self.queue:
            from tests.factories import make_outcome  # test-only helper; fine for a fake

            return make_outcome()
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


# --------------------------------------------------------------------------- real


class GoogleGeminiAnalyzer:
    def __init__(
        self,
        api_key: str,
        model: str,
        poll_interval: float = 2.0,
        file_timeout: float = 120.0,
        temperature: float = 0.2,
    ):
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._poll_interval = poll_interval
        self._file_timeout = file_timeout
        self._temperature = temperature

    def analyze(self, path: Path, mime_type: str, media_type: MediaType) -> GeminiOutcome:
        from google.genai import types

        uploaded = None
        try:
            if media_type is MediaType.video:
                uploaded = self._upload_and_wait(path, mime_type)
                media_part = types.Part.from_uri(file_uri=uploaded.uri, mime_type=uploaded.mime_type)
            else:
                media_part = types.Part.from_bytes(data=path.read_bytes(), mime_type=mime_type)

            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AnalysisResult,
                temperature=self._temperature,
            )
            try:
                response = self._client.models.generate_content(
                    model=self._model,
                    contents=[media_part, load_prompt(media_type)],
                    config=config,
                )
            except Exception as exc:  # SDK raises many types; normalise
                raise AnalyzerError(f"Gemini request failed: {exc}") from exc

            text = response.text or ""
            try:
                result = AnalysisResult.model_validate_json(text)
            except ValidationError as exc:
                log.warning("Gemini returned invalid JSON: %s", text[:500])
                raise InvalidModelOutput(f"Gemini output did not match schema: {exc}") from exc

            usage = response.usage_metadata
            return GeminiOutcome(
                result=result,
                usage=GeminiUsage(
                    model=self._model,
                    input_tokens=getattr(usage, "prompt_token_count", None),
                    output_tokens=getattr(usage, "candidates_token_count", None),
                ),
            )
        finally:
            if uploaded is not None:
                try:
                    self._client.files.delete(name=uploaded.name)
                except Exception:  # best effort cleanup
                    log.debug("Could not delete uploaded file %s", uploaded.name)

    def _upload_and_wait(self, path: Path, mime_type: str):
        from google.genai import types

        try:
            uploaded = self._client.files.upload(
                file=str(path), config=types.UploadFileConfig(mime_type=mime_type)
            )
        except Exception as exc:
            raise AnalyzerError(f"Video upload to Gemini failed: {exc}") from exc

        deadline = time.monotonic() + self._file_timeout
        while uploaded.state and uploaded.state.name == "PROCESSING":
            if time.monotonic() > deadline:
                raise AnalyzerError("Gemini took too long to process the video (timeout)")
            time.sleep(self._poll_interval)
            uploaded = self._client.files.get(name=uploaded.name)
        if uploaded.state and uploaded.state.name == "FAILED":
            raise AnalyzerError("Gemini could not process the video file")
        return uploaded


def build_analyzer(api_key: str | None, model: str) -> GeminiAnalyzer | None:
    if not api_key:
        return None
    return GoogleGeminiAnalyzer(api_key=api_key, model=model)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/unit/test_fake_analyzer.py -q`
Expected: `4 passed`

- [ ] **Step 7: Commit**

```bash
git add backend/app/prompts/inspector.md backend/app/services/gemini_client.py backend/tests/factories.py backend/tests/unit/test_fake_analyzer.py
git commit -m "feat(backend): add Gemini analyzer protocol, real client, fake and prompt

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: AnalysisService (orchestration)

**Files:**
- Create: `backend/app/services/analysis_service.py`
- Test: `backend/tests/unit/test_analysis_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/unit/test_analysis_service.py
from pathlib import Path

import pytest
from sqlalchemy.orm import sessionmaker

from app.db.session import init_db, make_engine, make_session_factory
from app.services.analysis_service import AnalysisService
from app.services.errors import (
    AnalyzerError,
    AnalysisNotFound,
    FileTooLarge,
    InvalidModelOutput,
    InvalidState,
    UnsupportedMediaType,
)
from app.services.gemini_client import FakeAnalyzer
from app.services.storage import FileStorage
from tests.factories import make_finding, make_outcome, make_result


@pytest.fixture
def session_factory(tmp_path: Path) -> sessionmaker:
    engine = make_engine(f"sqlite:///{tmp_path / 't.db'}")
    init_db(engine)
    return make_session_factory(engine)


@pytest.fixture
def fake() -> FakeAnalyzer:
    return FakeAnalyzer()


@pytest.fixture
def service(tmp_path: Path, session_factory, fake) -> AnalysisService:
    return AnalysisService(
        session_factory=session_factory,
        analyzer=fake,
        storage=FileStorage(root=tmp_path),
        max_upload_bytes=1024,
    )


def test_create_persists_pending_row_and_file(service, tmp_path):
    a = service.create(filename="clip.mov", mime_type="video/quicktime", data=b"abc", site_name="Tower A")
    assert a.status == "pending"
    assert a.media_type == "video"
    assert a.site_name == "Tower A"
    assert (tmp_path / a.storage_path).read_bytes() == b"abc"
    assert service.get(a.id).id == a.id


def test_create_rejects_bad_mime(service):
    with pytest.raises(UnsupportedMediaType):
        service.create(filename="x.pdf", mime_type="application/pdf", data=b"abc", site_name=None)


def test_create_rejects_oversize(service):
    with pytest.raises(FileTooLarge):
        service.create(filename="x.png", mime_type="image/png", data=b"x" * 1025, site_name=None)


def test_run_completes_and_stores_scores(service, fake):
    fake.queue.append(make_outcome(make_result(findings=[make_finding(severity=5, likelihood=5, mitigation_effectiveness=0.8)])))
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    done = service.get(a.id)
    assert done.status == "completed"
    assert done.risk_score == 100
    assert done.residual_score == 20
    assert done.risk_level == "Critical"
    assert done.ppe_compliance_rate == 0.75
    assert done.model == "fake-model"
    assert done.input_tokens == 1200 and done.output_tokens == 340
    assert done.result_json["scene_summary"].startswith("Two workers")
    assert fake.calls[0].mime_type == "image/png"


def test_run_retries_once_on_analyzer_error(service, fake):
    fake.queue.extend([InvalidModelOutput("bad json"), make_outcome()])
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    assert service.get(a.id).status == "completed"
    assert len(fake.calls) == 2


def test_run_fails_after_second_error(service, fake):
    fake.queue.extend([AnalyzerError("down"), AnalyzerError("still down")])
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    failed = service.get(a.id)
    assert failed.status == "failed"
    assert failed.error_message == "still down"
    assert len(fake.calls) == 2


def test_run_unknown_id_is_noop(service):
    service.run("missing")  # must not raise from a background task


def test_retry_resets_failed_to_pending(service, fake):
    fake.queue.append(AnalyzerError("a"))
    fake.queue.append(AnalyzerError("b"))
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    assert service.get(a.id).status == "failed"
    retried = service.retry(a.id)
    assert retried.status == "pending"
    assert retried.error_message is None


def test_retry_rejects_non_failed(service):
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    with pytest.raises(InvalidState):
        service.retry(a.id)


def test_retry_unknown_raises(service):
    with pytest.raises(AnalysisNotFound):
        service.retry("missing")


def test_delete_removes_row_and_file(service, tmp_path):
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    path = tmp_path / a.storage_path
    assert path.exists()
    service.delete(a.id)
    assert not path.exists()
    assert service.get(a.id) is None


def test_delete_unknown_raises(service):
    with pytest.raises(AnalysisNotFound):
        service.delete("missing")


def test_list_newest_first(service):
    a = service.create(filename="first.png", mime_type="image/png", data=b"1", site_name=None)
    b = service.create(filename="second.png", mime_type="image/png", data=b"2", site_name=None)
    ids = [r.id for r in service.list()]
    assert ids.index(b.id) < ids.index(a.id)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_analysis_service.py -q`
Expected: `ModuleNotFoundError: No module named 'app.services.analysis_service'`

- [ ] **Step 3: Implement `backend/app/services/analysis_service.py`**

```python
"""Orchestrates one analysis: store file -> Gemini -> scoring -> persist."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Analysis
from app.db.repository import AnalysisRepository
from app.domain.models import AnalysisResult, AnalysisStatus, MediaType
from app.domain.scoring import score
from app.services.errors import AnalysisNotFound, AnalyzerError, FileTooLarge, InvalidState
from app.services.gemini_client import GeminiAnalyzer
from app.services.storage import FileStorage, media_type_for

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 2  # one automatic retry


class AnalysisService:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        analyzer: GeminiAnalyzer | None,
        storage: FileStorage,
        max_upload_bytes: int,
    ):
        self._session_factory = session_factory
        self._analyzer = analyzer
        self._storage = storage
        self._max_upload_bytes = max_upload_bytes

    # ------------------------------------------------------------------ writes

    def create(self, filename: str, mime_type: str, data: bytes, site_name: str | None) -> Analysis:
        media_type = media_type_for(mime_type)  # raises UnsupportedMediaType
        if len(data) > self._max_upload_bytes:
            raise FileTooLarge(
                f"File is {len(data) / 1024 / 1024:.1f} MB; limit is "
                f"{self._max_upload_bytes // 1024 // 1024} MB"
            )
        with self._session_factory() as session:
            repo = AnalysisRepository(session)
            analysis = repo.add(
                Analysis(
                    filename=filename,
                    media_type=media_type,
                    mime_type=mime_type,
                    storage_path="",
                    site_name=site_name or None,
                    status=AnalysisStatus.pending.value,
                )
            )
            analysis.storage_path = self._storage.save(analysis.id, mime_type, data)
            session.commit()
            return analysis

    def run(self, analysis_id: str) -> None:
        """Background job. Never raises: outcome is written to the row's status."""
        with self._session_factory() as session:
            repo = AnalysisRepository(session)
            analysis = repo.get(analysis_id)
            if analysis is None:
                log.warning("run(): analysis %s not found", analysis_id)
                return
            analysis.status = AnalysisStatus.processing.value
            analysis.error_message = None
            session.commit()

            try:
                outcome = self._analyze_with_retry(analysis)
            except Exception as exc:  # noqa: BLE001 - background task must not crash
                log.exception("analysis %s failed", analysis_id)
                analysis.status = AnalysisStatus.failed.value
                analysis.error_message = str(exc)
                session.commit()
                return

            summary = score(outcome.result)
            analysis.result_json = outcome.result.model_dump(mode="json")
            analysis.risk_score = summary.risk_score
            analysis.residual_score = summary.residual_score
            analysis.risk_level = summary.risk_level.value
            analysis.ppe_compliance_rate = summary.ppe_compliance_rate
            analysis.model = outcome.usage.model
            analysis.input_tokens = outcome.usage.input_tokens
            analysis.output_tokens = outcome.usage.output_tokens
            analysis.status = AnalysisStatus.completed.value
            session.commit()

    def retry(self, analysis_id: str) -> Analysis:
        with self._session_factory() as session:
            analysis = AnalysisRepository(session).get(analysis_id)
            if analysis is None:
                raise AnalysisNotFound(analysis_id)
            if analysis.status != AnalysisStatus.failed.value:
                raise InvalidState(f"Only failed analyses can be retried (status is {analysis.status})")
            analysis.status = AnalysisStatus.pending.value
            analysis.error_message = None
            session.commit()
            return analysis

    def delete(self, analysis_id: str) -> None:
        with self._session_factory() as session:
            repo = AnalysisRepository(session)
            analysis = repo.get(analysis_id)
            if analysis is None:
                raise AnalysisNotFound(analysis_id)
            self._storage.delete(analysis.storage_path)
            repo.delete(analysis)
            session.commit()

    # ------------------------------------------------------------------- reads

    def get(self, analysis_id: str) -> Analysis | None:
        with self._session_factory() as session:
            return AnalysisRepository(session).get(analysis_id)

    def list(self) -> list[Analysis]:
        with self._session_factory() as session:
            return AnalysisRepository(session).list_all()

    def media_path(self, analysis: Analysis):
        return self._storage.absolute(analysis.storage_path)

    @staticmethod
    def parse_result(analysis: Analysis) -> AnalysisResult | None:
        if analysis.result_json is None:
            return None
        return AnalysisResult.model_validate(analysis.result_json)

    # ---------------------------------------------------------------- internal

    def _analyze_with_retry(self, analysis: Analysis):
        if self._analyzer is None:
            raise AnalyzerError("Gemini API key is not configured")
        path = self._storage.absolute(analysis.storage_path)
        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return self._analyzer.analyze(path, analysis.mime_type, MediaType(analysis.media_type))
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                log.warning("attempt %d/%d for %s failed: %s", attempt, MAX_ATTEMPTS, analysis.id, exc)
        assert last_error is not None
        raise last_error
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_analysis_service.py -q`
Expected: `13 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analysis_service.py backend/tests/unit/test_analysis_service.py
git commit -m "feat(backend): add AnalysisService orchestration with retry

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: API schemas, app factory, dependencies, health route

**Files:**
- Create: `backend/app/api/schemas.py`, `backend/app/api/deps.py`, `backend/app/api/routes/health.py`, `backend/app/main.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/api/test_health.py`

- [ ] **Step 1: Write `backend/tests/conftest.py`**

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.gemini_client import FakeAnalyzer


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(_env_file=None, data_dir=tmp_path / "data", gemini_api_key="test-key",
                    max_upload_bytes=2 * 1024 * 1024)


@pytest.fixture
def fake_analyzer() -> FakeAnalyzer:
    return FakeAnalyzer()


@pytest.fixture
def client(settings: Settings, fake_analyzer: FakeAnalyzer):
    app = create_app(settings=settings, analyzer=fake_analyzer)
    with TestClient(app) as c:
        yield c
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/api/test_health.py
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_health_ok_when_configured(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "gemini_configured": True}


def test_health_reports_missing_key(tmp_path):
    app = create_app(settings=Settings(_env_file=None, data_dir=tmp_path, gemini_api_key=None), analyzer=None)
    with TestClient(app) as c:
        assert c.get("/api/health").json()["gemini_configured"] is False
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/api/test_health.py -q`
Expected: `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 4: Implement `backend/app/api/schemas.py`**

```python
"""HTTP response models and converters from DB rows."""
from datetime import datetime

from pydantic import BaseModel

from app.db.models import Analysis
from app.domain.models import AnalysisResult
from app.domain.scoring import ScoreSummary, score


class CreatedResponse(BaseModel):
    id: str
    status: str


class AnalysisSummary(BaseModel):
    id: str
    created_at: datetime
    site_name: str | None
    filename: str
    media_type: str
    status: str
    risk_score: int | None
    risk_level: str | None
    ppe_compliance_rate: float | None


class AnalysisDetail(AnalysisSummary):
    mime_type: str
    error_message: str | None
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    result: AnalysisResult | None
    scores: ScoreSummary | None


class TrendPoint(BaseModel):
    date: datetime
    score: int


class StatsResponse(BaseModel):
    total: int
    completed: int
    average_score: float | None
    critical_count: int
    average_ppe_compliance: float | None
    findings_by_category: dict[str, int]
    findings_by_subject: dict[str, int]
    trend: list[TrendPoint]


class HealthResponse(BaseModel):
    status: str
    gemini_configured: bool


def to_summary(a: Analysis) -> AnalysisSummary:
    return AnalysisSummary(
        id=a.id, created_at=a.created_at, site_name=a.site_name, filename=a.filename,
        media_type=a.media_type, status=a.status, risk_score=a.risk_score,
        risk_level=a.risk_level, ppe_compliance_rate=a.ppe_compliance_rate,
    )


def to_detail(a: Analysis) -> AnalysisDetail:
    result = AnalysisResult.model_validate(a.result_json) if a.result_json is not None else None
    return AnalysisDetail(
        **to_summary(a).model_dump(),
        mime_type=a.mime_type, error_message=a.error_message, model=a.model,
        input_tokens=a.input_tokens, output_tokens=a.output_tokens,
        result=result, scores=score(result) if result is not None else None,
    )
```

- [ ] **Step 5: Implement `backend/app/api/deps.py`**

```python
from fastapi import Request

from app.config import Settings
from app.services.analysis_service import AnalysisService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_service(request: Request) -> AnalysisService:
    return request.app.state.service
```

- [ ] **Step 6: Implement `backend/app/api/routes/health.py`**

```python
from fastapi import APIRouter, Depends

from app.api.deps import get_settings
from app.api.schemas import HealthResponse
from app.config import Settings

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", gemini_configured=settings.gemini_configured)
```

- [ ] **Step 7: Implement `backend/app/main.py`**

```python
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health
from app.config import Settings, get_settings
from app.db.session import init_db, make_engine, make_session_factory
from app.services.analysis_service import AnalysisService
from app.services.gemini_client import GeminiAnalyzer, build_analyzer
from app.services.storage import FileStorage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None, analyzer: GeminiAnalyzer | None = None) -> FastAPI:
    """App factory. Tests pass explicit settings and a FakeAnalyzer."""
    settings = settings or get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    engine = make_engine(settings.database_url)
    init_db(engine)
    if analyzer is None:
        analyzer = build_analyzer(settings.gemini_api_key, settings.gemini_model)

    service = AnalysisService(
        session_factory=make_session_factory(engine),
        analyzer=analyzer,
        storage=FileStorage(root=settings.data_dir),
        max_upload_bytes=settings.max_upload_bytes,
    )

    app = FastAPI(title="SiteGuard API", version="0.1.0")
    app.state.settings = settings
    app.state.service = service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api")
    return app
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pytest tests/api/test_health.py -q`
Expected: `2 passed`

- [ ] **Step 9: Boot the server manually once**

```bash
uvicorn app.main:create_app --factory --port 8000 &
sleep 2 && curl -s http://localhost:8000/api/health; kill %1
```
Expected: `{"status":"ok","gemini_configured":true}` (true only if `.env` has the key)

- [ ] **Step 10: Commit**

```bash
git add backend/app/api backend/app/main.py backend/tests/conftest.py backend/tests/api/test_health.py
git commit -m "feat(backend): add app factory, API schemas and health route

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Analyses routes

**Files:**
- Create: `backend/app/api/routes/analyses.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/api/test_analyses.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/api/test_analyses.py
from app.services.errors import AnalyzerError
from tests.factories import make_finding, make_outcome, make_result

PNG = ("site.png", b"\x89PNG fake", "image/png")
MOV = ("clip.mov", b"fake mov", "video/quicktime")


def _upload(client, file=PNG, site_name="Tower A"):
    return client.post("/api/analyses", files={"file": file}, data={"site_name": site_name})


def test_upload_returns_202_and_completes_via_background_task(client, fake_analyzer):
    fake_analyzer.queue.append(make_outcome(make_result(findings=[
        make_finding(severity=5, likelihood=5, mitigation_effectiveness=0.8),
    ])))
    r = _upload(client, MOV)
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "pending"

    # TestClient runs BackgroundTasks before returning, so the row is already completed.
    detail = client.get(f"/api/analyses/{body['id']}").json()
    assert detail["status"] == "completed"
    assert detail["site_name"] == "Tower A"
    assert detail["media_type"] == "video"
    assert detail["risk_score"] == 100
    assert detail["scores"]["residual_score"] == 20
    assert detail["scores"]["risk_level"] == "Critical"
    assert detail["result"]["workers"]["workers_visible"] == 2
    assert detail["model"] == "fake-model"
    assert fake_analyzer.calls[0].mime_type == "video/quicktime"


def test_upload_without_site_name(client):
    r = client.post("/api/analyses", files={"file": PNG})
    assert r.status_code == 202
    assert client.get(f"/api/analyses/{r.json()['id']}").json()["site_name"] is None


def test_upload_rejects_unsupported_type(client):
    r = _upload(client, ("doc.pdf", b"%PDF", "application/pdf"))
    assert r.status_code == 400
    assert "Unsupported file type" in r.json()["detail"]


def test_upload_rejects_oversize(client):
    r = _upload(client, ("big.png", b"x" * (2 * 1024 * 1024 + 1), "image/png"))
    assert r.status_code == 413


def test_get_missing_is_404(client):
    assert client.get("/api/analyses/nope").status_code == 404


def test_list_returns_summaries_newest_first(client):
    first = _upload(client, site_name="One").json()["id"]
    second = _upload(client, site_name="Two").json()["id"]
    rows = client.get("/api/analyses").json()
    assert [r["id"] for r in rows][:2] == [second, first]
    assert set(rows[0]) >= {"id", "created_at", "site_name", "filename", "status", "risk_score", "risk_level"}
    assert "result" not in rows[0]


def test_failed_then_retry(client, fake_analyzer):
    fake_analyzer.queue.extend([AnalyzerError("quota"), AnalyzerError("quota")])
    analysis_id = _upload(client).json()["id"]
    failed = client.get(f"/api/analyses/{analysis_id}").json()
    assert failed["status"] == "failed"
    assert failed["error_message"] == "quota"

    r = client.post(f"/api/analyses/{analysis_id}/retry")
    assert r.status_code == 202
    assert client.get(f"/api/analyses/{analysis_id}").json()["status"] == "completed"


def test_retry_on_completed_is_409(client):
    analysis_id = _upload(client).json()["id"]
    assert client.post(f"/api/analyses/{analysis_id}/retry").status_code == 409


def test_retry_missing_is_404(client):
    assert client.post("/api/analyses/nope/retry").status_code == 404


def test_media_streams_original_file(client):
    analysis_id = _upload(client, MOV).json()["id"]
    r = client.get(f"/api/analyses/{analysis_id}/media")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("video/quicktime")
    assert r.content == b"fake mov"


def test_delete_removes_record_and_media(client, settings):
    analysis_id = _upload(client).json()["id"]
    assert client.delete(f"/api/analyses/{analysis_id}").status_code == 204
    assert client.get(f"/api/analyses/{analysis_id}").status_code == 404
    assert client.get(f"/api/analyses/{analysis_id}/media").status_code == 404
    assert list((settings.data_dir / "uploads").iterdir()) == []


def test_delete_missing_is_404(client):
    assert client.delete("/api/analyses/nope").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/api/test_analyses.py -q`
Expected: failures with `404` on `/api/analyses` (router not registered)

- [ ] **Step 3: Implement `backend/app/api/routes/analyses.py`**

```python
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from app.api.deps import get_service
from app.api.schemas import AnalysisDetail, AnalysisSummary, CreatedResponse, to_detail, to_summary
from app.services.analysis_service import AnalysisService
from app.services.errors import AnalysisNotFound, FileTooLarge, InvalidState, UnsupportedMediaType

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.post("", response_model=CreatedResponse, status_code=202)
async def create_analysis(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    site_name: str | None = Form(default=None),
    service: AnalysisService = Depends(get_service),
) -> CreatedResponse:
    data = await file.read()
    try:
        analysis = service.create(
            filename=file.filename or "upload",
            mime_type=file.content_type or "",
            data=data,
            site_name=site_name,
        )
    except UnsupportedMediaType as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    background.add_task(service.run, analysis.id)
    return CreatedResponse(id=analysis.id, status=analysis.status)


@router.get("", response_model=list[AnalysisSummary])
def list_analyses(service: AnalysisService = Depends(get_service)) -> list[AnalysisSummary]:
    return [to_summary(a) for a in service.list()]


@router.get("/{analysis_id}", response_model=AnalysisDetail)
def get_analysis(analysis_id: str, service: AnalysisService = Depends(get_service)) -> AnalysisDetail:
    analysis = service.get(analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return to_detail(analysis)


@router.post("/{analysis_id}/retry", response_model=CreatedResponse, status_code=202)
def retry_analysis(
    analysis_id: str,
    background: BackgroundTasks,
    service: AnalysisService = Depends(get_service),
) -> CreatedResponse:
    try:
        analysis = service.retry(analysis_id)
    except AnalysisNotFound as exc:
        raise HTTPException(status_code=404, detail="Analysis not found") from exc
    except InvalidState as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    background.add_task(service.run, analysis.id)
    return CreatedResponse(id=analysis.id, status=analysis.status)


@router.get("/{analysis_id}/media")
def get_media(analysis_id: str, service: AnalysisService = Depends(get_service)) -> FileResponse:
    analysis = service.get(analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    path = service.media_path(analysis)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Media file missing")
    # No filename= : that would add Content-Disposition: attachment and break inline <video>/<img>.
    return FileResponse(path, media_type=analysis.mime_type)


@router.delete("/{analysis_id}", status_code=204, response_class=Response)
def delete_analysis(analysis_id: str, service: AnalysisService = Depends(get_service)) -> Response:
    try:
        service.delete(analysis_id)
    except AnalysisNotFound as exc:
        raise HTTPException(status_code=404, detail="Analysis not found") from exc
    return Response(status_code=204)
```

- [ ] **Step 4: Register the router in `backend/app/main.py`**

Change the import line and the include line:

```python
from app.api.routes import analyses, health
```
```python
    app.include_router(health.router, prefix="/api")
    app.include_router(analyses.router, prefix="/api")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/api/test_analyses.py -q`
Expected: `12 passed`

- [ ] **Step 6: Run the full suite**

Run: `pytest -q`
Expected: all passed, 0 failed (integration tests deselected)

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes/analyses.py backend/app/main.py backend/tests/api/test_analyses.py
git commit -m "feat(backend): add analyses routes (upload, get, list, retry, media, delete)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Stats route

**Files:**
- Create: `backend/app/api/routes/stats.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/api/test_stats.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/api/test_stats.py
from app.domain.models import FindingSubject, RiskCategory
from app.services.errors import AnalyzerError
from tests.factories import make_finding, make_outcome, make_result

PNG = ("site.png", b"\x89PNG", "image/png")


def test_stats_empty(client):
    assert client.get("/api/stats").json() == {
        "total": 0, "completed": 0, "average_score": None, "critical_count": 0,
        "average_ppe_compliance": None, "findings_by_category": {}, "findings_by_subject": {},
        "trend": [],
    }


def test_stats_aggregates_completed_analyses(client, fake_analyzer):
    critical = make_result(findings=[
        make_finding(severity=5, likelihood=5, subject=FindingSubject.site, category=RiskCategory.fall_protection),
        make_finding(severity=2, likelihood=2, subject=FindingSubject.worker, category=RiskCategory.ppe),
    ])
    low = make_result(findings=[
        make_finding(severity=2, likelihood=2, subject=FindingSubject.worker, category=RiskCategory.ppe),
    ])
    fake_analyzer.queue.extend([make_outcome(critical), make_outcome(low), AnalyzerError("x"), AnalyzerError("x")])
    client.post("/api/analyses", files={"file": PNG})   # critical: [25, 4] -> 83
    client.post("/api/analyses", files={"file": PNG})   # low: score 16
    client.post("/api/analyses", files={"file": PNG})   # failed

    s = client.get("/api/stats").json()
    assert s["total"] == 3
    assert s["completed"] == 2
    assert s["average_score"] == 49.5
    assert s["critical_count"] == 1
    assert s["average_ppe_compliance"] == 0.75
    assert s["findings_by_category"] == {"fall_protection": 1, "ppe": 2}
    assert s["findings_by_subject"] == {"site": 1, "worker": 2}
    assert [p["score"] for p in s["trend"]] == [83, 16]   # chronological
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/api/test_stats.py -q`
Expected: `404` failures

- [ ] **Step 3: Implement `backend/app/api/routes/stats.py`**

```python
from fastapi import APIRouter, Depends

from app.api.deps import get_service
from app.api.schemas import StatsResponse, TrendPoint
from app.domain.models import AnalysisResult, AnalysisStatus, RiskLevel
from app.services.analysis_service import AnalysisService

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsResponse)
def stats(service: AnalysisService = Depends(get_service)) -> StatsResponse:
    rows = service.list()  # newest first; single-user volumes make in-Python aggregation fine
    completed = [r for r in rows if r.status == AnalysisStatus.completed.value and r.risk_score is not None]

    by_category: dict[str, int] = {}
    by_subject: dict[str, int] = {}
    for row in completed:
        result = AnalysisResult.model_validate(row.result_json)
        for f in result.findings:
            by_category[f.category.value] = by_category.get(f.category.value, 0) + 1
            by_subject[f.subject.value] = by_subject.get(f.subject.value, 0) + 1

    scores = [r.risk_score for r in completed]
    ppe_rates = [r.ppe_compliance_rate for r in completed if r.ppe_compliance_rate is not None]

    return StatsResponse(
        total=len(rows),
        completed=len(completed),
        average_score=round(sum(scores) / len(scores), 1) if scores else None,
        critical_count=sum(1 for r in completed if r.risk_level == RiskLevel.critical.value),
        average_ppe_compliance=round(sum(ppe_rates) / len(ppe_rates), 3) if ppe_rates else None,
        findings_by_category=dict(sorted(by_category.items())),
        findings_by_subject=dict(sorted(by_subject.items())),
        trend=[TrendPoint(date=r.created_at, score=r.risk_score) for r in reversed(completed)],
    )
```

- [ ] **Step 4: Register the router in `backend/app/main.py`**

```python
from app.api.routes import analyses, health, stats
```
```python
    app.include_router(stats.router, prefix="/api")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/api/test_stats.py -q`
Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/stats.py backend/app/main.py backend/tests/api/test_stats.py
git commit -m "feat(backend): add stats route

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Live Gemini integration test

**Files:**
- Test: `backend/tests/integration/test_gemini_live.py`

- [ ] **Step 1: Write the test**

```python
# backend/tests/integration/test_gemini_live.py
"""Hits the real Gemini API. Run with: pytest -m integration -q"""
import os
from pathlib import Path

import pytest

from app.domain.models import MediaType
from app.services.gemini_client import GoogleGeminiAnalyzer

SAMPLES = Path(__file__).resolve().parents[3] / "samples"

pytestmark = pytest.mark.integration


@pytest.fixture
def analyzer():
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY not set")
    return GoogleGeminiAnalyzer(api_key=key, model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))


def test_analyze_one_sample_video(analyzer):
    clips = sorted(SAMPLES.glob("*.mov"))
    if not clips:
        pytest.skip("no samples extracted")
    outcome = analyzer.analyze(clips[0], "video/quicktime", MediaType.video)
    assert outcome.result.scene_summary
    assert outcome.result.workers.workers_visible >= 0
    assert outcome.usage.input_tokens and outcome.usage.input_tokens > 0
    for f in outcome.result.findings:
        assert 1 <= f.severity <= 5 and 1 <= f.likelihood <= 5
    print(f"\n{clips[0].name}: {len(outcome.result.findings)} findings, tokens in/out = "
          f"{outcome.usage.input_tokens}/{outcome.usage.output_tokens}")
```

- [ ] **Step 2: Run it against the real API**

```bash
set -a && source .env && set +a
pytest -m integration -q -s
```
Expected: `1 passed` and a printed line like `Video.mov: 4 findings, tokens in/out = 3120/812`.

If it fails with a schema error from the SDK (e.g. "minimum not supported"), remove the `ge=`/`le=` constraints only from the `response_schema` by passing `response_schema=AnalysisResult.model_json_schema()` — but first try as written; `google-genai>=1.0` accepts Pydantic classes with numeric bounds.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_gemini_live.py
git commit -m "test(backend): add live Gemini integration test

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Smoke script over all sample clips + README

**Files:**
- Create: `scripts/smoke_analyze.py`, `README.md`

- [ ] **Step 1: Write `scripts/smoke_analyze.py`**

```python
#!/usr/bin/env python3
"""Upload every clip in samples/ to a running SiteGuard API and print the scores.

Usage:  python scripts/smoke_analyze.py [--api http://localhost:8000] [--dir samples]
Requires: backend running (uvicorn app.main:create_app --factory) with GEMINI_API_KEY set.
"""
import argparse
import mimetypes
import sys
import time
from pathlib import Path

import httpx

mimetypes.add_type("video/quicktime", ".mov")


def wait_for(client: httpx.Client, analysis_id: str, timeout: float = 240.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        detail = client.get(f"/api/analyses/{analysis_id}").json()
        if detail["status"] in ("completed", "failed"):
            return detail
        time.sleep(2)
    raise TimeoutError(analysis_id)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--dir", default="samples")
    args = parser.parse_args()

    clips = sorted(p for p in Path(args.dir).iterdir() if p.suffix.lower() in {".mov", ".mp4", ".webm", ".jpg", ".jpeg", ".png", ".webp"})
    if not clips:
        print(f"no media in {args.dir}", file=sys.stderr)
        return 1

    total_in = total_out = 0
    print(f"{'file':<14} {'status':<10} {'score':>5} {'resid':>5} {'level':<9} {'find':>4} {'ppe':>5} {'tok in':>7} {'tok out':>7}")
    with httpx.Client(base_url=args.api, timeout=60) as client:
        for clip in clips:
            mime = mimetypes.guess_type(clip.name)[0] or "application/octet-stream"
            with clip.open("rb") as fh:
                r = client.post("/api/analyses", files={"file": (clip.name, fh, mime)}, data={"site_name": "smoke"})
            r.raise_for_status()
            detail = wait_for(client, r.json()["id"])
            if detail["status"] == "failed":
                print(f"{clip.name:<14} {'failed':<10} {detail['error_message']}")
                continue
            s = detail["scores"]
            ppe = "-" if s["ppe_compliance_rate"] is None else f"{s['ppe_compliance_rate']:.0%}"
            tin, tout = detail["input_tokens"] or 0, detail["output_tokens"] or 0
            total_in += tin
            total_out += tout
            print(f"{clip.name:<14} {'completed':<10} {s['risk_score']:>5} {s['residual_score']:>5} "
                  f"{s['risk_level']:<9} {len(detail['result']['findings']):>4} {ppe:>5} {tin:>7} {tout:>7}")
    print(f"\ntotal tokens: in={total_in} out={total_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it end-to-end**

Terminal 1:
```bash
cd "/Users/apple/Desktop/building site risk assesment/backend" && source .venv/bin/activate
uvicorn app.main:create_app --factory --port 8000
```
Terminal 2:
```bash
cd "/Users/apple/Desktop/building site risk assesment" && backend/.venv/bin/python scripts/smoke_analyze.py
```
Expected: 13 rows with `completed`, a score per clip, and a final `total tokens:` line. Note the real token cost in the completion report.

- [ ] **Step 3: Write `README.md`**

```markdown
# SiteGuard — Construction Site Risk Assessment

Upload a photo or short video of a construction site; Gemini identifies worker PPE gaps, unsafe behaviour and site hazards; SiteGuard scores the risk, shows how much the recommended fixes reduce it, and keeps a history.

## Backend

```bash
cd backend
/usr/local/opt/python@3.11/bin/python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # then set GEMINI_API_KEY
uvicorn app.main:create_app --factory --reload --port 8000
```

API docs: http://localhost:8000/docs

### Tests

```bash
pytest -q                       # unit + API tests (no network)
pytest -m integration -q -s     # one real Gemini call (needs GEMINI_API_KEY in env)
```

### Smoke test on real footage

```bash
unzip -j Archive.zip "*.mov" -x "__MACOSX/*" -d samples/
python scripts/smoke_analyze.py   # backend must be running
```

## Frontend

See `frontend/README.md` (added with the frontend plan).

## Security

Never commit `.env`. If the Gemini key was ever shared in chat or a screenshot, rotate it in Google AI Studio.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke_analyze.py README.md
git commit -m "feat: add smoke script over sample clips and README

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Lint pass and final verification

- [ ] **Step 1: Run ruff and fix anything it reports**

```bash
cd backend && ruff check app tests && ruff format --check app tests
```
Expected: `All checks passed!` — if not, run `ruff format app tests` and fix lint errors by hand, re-run tests.

- [ ] **Step 2: Full test run**

```bash
pytest -q
```
Expected: all passed.

- [ ] **Step 3: Commit if anything changed**

```bash
git add -A backend && git commit -m "style(backend): ruff fixes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §3 layers, DI, no cross-layer imports | 3, 4, 5, 6, 7, 8, 9 |
| §4 Gemini contract, video Files API, inline image, usage tokens, retry once | 3, 7, 8 |
| §5 scoring formula, levels, ppe rate, by-subject | 4 |
| §6 data model incl. `ppe_compliance_rate` | 5 |
| §7 API endpoints, 400/413/404/409, polling shape | 9, 10, 11 |
| §9 error handling: missing key, timeout, retry | 7 (timeout), 8 (retry/missing key), 9 (health) |
| §10 backend tests + integration + smoke | every task, 12, 13 |
| §11 layout, `.env.example`, README | 1, 13 |
