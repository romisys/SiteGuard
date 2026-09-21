from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_ok_when_configured(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "gemini_configured": True}


def test_health_reports_missing_key(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path, gemini_api_key=None)
    app = create_app(settings=settings, analyzer=None)
    with TestClient(app) as c:
        assert c.get("/api/health").json()["gemini_configured"] is False
