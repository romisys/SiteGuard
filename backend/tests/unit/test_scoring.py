import pytest

from app.domain.models import FindingSubject, PpeCheck, PpeItem, RiskCategory, RiskLevel
from app.domain.scoring import aggregate, level_for, ppe_compliance_rate, score
from tests.factories import make_finding, make_result, make_workers


@pytest.mark.parametrize(
    "value,expected",
    [
        (0, RiskLevel.low),
        (24, RiskLevel.low),
        (25, RiskLevel.moderate),
        (49, RiskLevel.moderate),
        (50, RiskLevel.high),
        (74, RiskLevel.high),
        (75, RiskLevel.critical),
        (100, RiskLevel.critical),
    ],
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
    assert aggregate([25, 1]) == 81  # 0.6*1 + 0.4*(13/25)
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
        make_finding(
            severity=5,
            likelihood=5,
            mitigation_effectiveness=0.8,
            subject=FindingSubject.site,
            category=RiskCategory.fall_protection,
        ),
        make_finding(
            severity=5,
            likelihood=1,
            mitigation_effectiveness=0.5,
            subject=FindingSubject.worker,
            category=RiskCategory.ppe,
        ),
    ]
    s = score(make_result(findings=findings))
    assert s.risk_score == 84  # 0.6*1 + 0.4*(15/25)
    assert s.residual_score == 18  # residual risks 5 and 2.5
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
    workers = make_workers(
        ppe=[
            PpeCheck(item=PpeItem.helmet, compliant=3, non_compliant=2),
            PpeCheck(item=PpeItem.hi_vis_vest, compliant=5, non_compliant=0),
        ]
    )
    assert ppe_compliance_rate(workers) == 0.8


def test_ppe_compliance_rate_none_when_no_workers():
    assert ppe_compliance_rate(make_workers(workers_visible=0, ppe=[])) is None
    no_ppe = make_workers(ppe=[PpeCheck(item=PpeItem.gloves, compliant=0, non_compliant=0)])
    assert ppe_compliance_rate(no_ppe) is None


def test_score_includes_ppe_rate():
    s = score(make_result())  # factory: helmet 1/2, vest 2/2 -> 3/4
    assert s.ppe_compliance_rate == 0.75
