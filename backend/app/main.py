import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analyses, health, stats
from app.config import Settings, get_settings
from app.db.session import init_db, make_engine, make_session_factory
from app.services.analysis_service import AnalysisService
from app.services.gemini_client import GeminiAnalyzer, build_analyzer
from app.services.storage import FileStorage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None, analyzer: GeminiAnalyzer | None = None) -> FastAPI:
    """App factory. Tests pass explicit settings and a FakeAnalyzer."""
    settings = settings or get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    engine = make_engine(settings.database_url)
    init_db(engine)
    if analyzer is None:
        analyzer = build_analyzer(
            settings.gemini_api_key,
            settings.gemini_model,
            thinking_budget=settings.gemini_thinking_budget,
        )

    service = AnalysisService(
        session_factory=make_session_factory(engine),
        analyzer=analyzer,
        storage=FileStorage(root=settings.data_dir),
        max_upload_bytes=settings.max_upload_bytes,
    )

    app = FastAPI(title="SiteGuard API", version="0.1.0")
    app.state.settings = settings
    app.state.service = service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api")
    app.include_router(analyses.router, prefix="/api")
    app.include_router(stats.router, prefix="/api")
    return app
