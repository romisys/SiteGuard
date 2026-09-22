from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables or a .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_thinking_budget: int = 2048
    data_dir: Path = Path("./data")
    max_upload_bytes: int = 100 * 1024 * 1024
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Serverless knobs. Unset everywhere but Vercel, where the platform injects them.
    database_url_env: str | None = Field(default=None, validation_alias="DATABASE_URL")
    blob_token: str | None = Field(default=None, validation_alias="BLOB_READ_WRITE_TOKEN")
    sync_analysis: bool = Field(default=False, validation_alias="SITEGUARD_SYNC_ANALYSIS")

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def database_url(self) -> str:
        """Postgres when DATABASE_URL is set, else a local SQLite file.

        Neon/Heroku hand out `postgres://` and `postgresql://` URLs; SQLAlchemy 2
        needs an explicit driver, and psycopg 3 is the one we install.
        """
        raw = self.database_url_env
        if not raw:
            return f"sqlite:///{self.data_dir / 'siteguard.db'}"
        for prefix in ("postgres://", "postgresql://"):
            if raw.startswith(prefix):
                return "postgresql+psycopg://" + raw[len(prefix) :]
        return raw

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
