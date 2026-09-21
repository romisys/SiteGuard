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
        make_finding(severity=5, likelihood=5, subject=FindingSubject.site,
                     category=RiskCategory.fall_protection),
        make_finding(severity=2, likelihood=2, subject=FindingSubject.worker,
                     category=RiskCategory.ppe),
    ])
    low = make_result(findings=[
        make_finding(severity=2, likelihood=2, subject=FindingSubject.worker,
                     category=RiskCategory.ppe),
    ])
    fake_analyzer.queue.extend(
        [make_outcome(critical), make_outcome(low), AnalyzerError("x"), AnalyzerError("x")]
    )
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
