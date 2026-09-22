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
    assert s.gemini_thinking_budget == 2048


def test_key_marks_configured(tmp_path: Path):
    s = Settings(_env_file=None, data_dir=tmp_path, gemini_api_key="abc")
    assert s.gemini_configured is True


def test_reads_env_vars(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-x")
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.gemini_api_key == "from-env"
    assert s.gemini_model == "gemini-x"


def test_thinking_budget_env_override(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("GEMINI_THINKING_BUDGET", "512")
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.gemini_thinking_budget == 512


def test_database_url_prefers_explicit_env(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    s = Settings(_env_file=None, data_dir=tmp_path)
    # normalised to the psycopg driver SQLAlchemy needs
    assert s.database_url == "postgresql+psycopg://u:p@host/db"


def test_database_url_falls_back_to_sqlite(tmp_path: Path):
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.database_url == f"sqlite:///{tmp_path / 'siteguard.db'}"


def test_serverless_flags_default_off(tmp_path: Path):
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.blob_token is None
    assert s.sync_analysis is False


def test_serverless_flags_read_env(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_x")
    monkeypatch.setenv("SITEGUARD_SYNC_ANALYSIS", "1")
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.blob_token == "vercel_blob_rw_x"
    assert s.sync_analysis is True


def test_secrets_are_stripped_of_stray_whitespace(monkeypatch, tmp_path):
    """A token pasted into a dashboard often carries a trailing newline, which is
    an illegal HTTP header value."""
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_abc\n")
    monkeypatch.setenv("GEMINI_API_KEY", "  key-with-spaces  ")
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host/db\n")
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.blob_token == "vercel_blob_rw_abc"
    assert s.gemini_api_key == "key-with-spaces"
    assert s.database_url == "postgresql+psycopg://u:p@host/db"
