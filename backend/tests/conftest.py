import pytest


@pytest.fixture(autouse=True)
def _isolate_gemini_env(monkeypatch):
    """The developer's shell exports GEMINI_API_KEY; tests must not see it."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("DATA_DIR", raising=False)
