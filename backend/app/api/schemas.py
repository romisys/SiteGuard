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
