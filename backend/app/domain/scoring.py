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
