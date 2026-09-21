from fastapi import APIRouter, Depends

from app.api.deps import get_service
from app.api.schemas import StatsResponse, TrendPoint
from app.domain.models import AnalysisResult, AnalysisStatus, RiskLevel
from app.services.analysis_service import AnalysisService

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsResponse)
def stats(service: AnalysisService = Depends(get_service)) -> StatsResponse:
    rows = service.list()  # newest first; single-user volumes make in-Python aggregation fine
    completed = [
        r for r in rows if r.status == AnalysisStatus.completed.value and r.risk_score is not None
    ]

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
