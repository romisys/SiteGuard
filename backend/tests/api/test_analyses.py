from app.services.errors import AnalyzerError
from tests.factories import make_finding, make_outcome, make_result

PNG = ("site.png", b"\x89PNG fake", "image/png")
MOV = ("clip.mov", b"fake mov", "video/quicktime")


def _upload(client, file=PNG, site_name="Tower A"):
    return client.post("/api/analyses", files={"file": file}, data={"site_name": site_name})


def test_upload_returns_202_and_completes_via_background_task(client, fake_analyzer):
    fake_analyzer.queue.append(
        make_outcome(
            make_result(
                findings=[
                    make_finding(severity=5, likelihood=5, mitigation_effectiveness=0.8),
                ]
            )
        )
    )
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


def test_upload_oversize_rejected_before_read(client, fake_analyzer):
    r = _upload(client, ("big.png", b"x" * (2 * 1024 * 1024 + 1), "image/png"))
    assert r.status_code == 413
    assert fake_analyzer.calls == []
    assert client.get("/api/analyses").json() == []


def test_get_missing_is_404(client):
    assert client.get("/api/analyses/nope").status_code == 404


def test_list_returns_summaries_newest_first(client):
    first = _upload(client, site_name="One").json()["id"]
    second = _upload(client, site_name="Two").json()["id"]
    rows = client.get("/api/analyses").json()
    assert [r["id"] for r in rows][:2] == [second, first]
    assert set(rows[0]) >= {
        "id",
        "created_at",
        "site_name",
        "filename",
        "status",
        "risk_score",
        "risk_level",
    }
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
