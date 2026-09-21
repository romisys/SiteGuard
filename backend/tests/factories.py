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


from app.services.gemini_client import GeminiOutcome, GeminiUsage  # noqa: E402


def make_outcome(result: AnalysisResult | None = None, **usage_overrides) -> GeminiOutcome:
    usage = dict(model="fake-model", input_tokens=1200, output_tokens=340)
    usage.update(usage_overrides)
    return GeminiOutcome(result=result or make_result(), usage=GeminiUsage(**usage))
