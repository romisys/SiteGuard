from pathlib import Path

from app.config import Settings


def test_defaults_without_env_file(tmp_path: Path):
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.gemini_api_key is None
    assert s.gemini_configured is False
    assert s.gemini_model == "gemini-2.5-flash"
    assert s.database_url == f"sqlite:///{tmp_path / 'siteguard.db'}"
    assert s.uploads_dir == tmp_path / "uploads"
    assert s.max_upload_bytes == 100 * 1024 * 1024


def test_key_marks_configured(tmp_path: Path):
    s = Settings(_env_file=None, data_dir=tmp_path, gemini_api_key="abc")
    assert s.gemini_configured is True


def test_reads_env_vars(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-x")
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.gemini_api_key == "from-env"
    assert s.gemini_model == "gemini-x"
