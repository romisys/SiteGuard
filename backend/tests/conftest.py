from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.gemini_client import FakeAnalyzer


@pytest.fixture(autouse=True)
def _isolate_gemini_env(request, monkeypatch):
    """The developer's shell exports GEMINI_API_KEY; tests must not see it.

    Integration-marked tests deliberately hit the real API, so they keep the env.
    """
    if request.node.get_closest_marker("integration"):
        return
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("DATA_DIR", raising=False)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        data_dir=tmp_path / "data",
        gemini_api_key="test-key",
        max_upload_bytes=2 * 1024 * 1024,
    )


@pytest.fixture
def fake_analyzer() -> FakeAnalyzer:
    return FakeAnalyzer()


@pytest.fixture
def client(settings: Settings, fake_analyzer: FakeAnalyzer):
    app = create_app(settings=settings, analyzer=fake_analyzer)
    with TestClient(app) as c:
        yield c
