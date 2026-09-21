"""Orchestrates one analysis: store file -> Gemini -> scoring -> persist."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Analysis
from app.db.repository import AnalysisRepository
from app.domain.models import AnalysisResult, AnalysisStatus, MediaType
from app.domain.scoring import score
from app.services.errors import AnalysisNotFound, AnalyzerError, FileTooLarge, InvalidState
from app.services.gemini_client import GeminiAnalyzer, GeminiOutcome
from app.services.storage import FileStorage, media_type_for

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 2  # one automatic retry


class AnalysisService:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        analyzer: GeminiAnalyzer | None,
        storage: FileStorage,
        max_upload_bytes: int,
    ):
        self._session_factory = session_factory
        self._analyzer = analyzer
        self._storage = storage
        self._max_upload_bytes = max_upload_bytes

    # ------------------------------------------------------------------ writes

    def create(self, filename: str, mime_type: str, data: bytes, site_name: str | None) -> Analysis:
        media_type = media_type_for(mime_type)  # raises UnsupportedMediaType
        if len(data) > self._max_upload_bytes:
            raise FileTooLarge(
                f"File is {len(data) / 1024 / 1024:.1f} MB; limit is "
                f"{self._max_upload_bytes // 1024 // 1024} MB"
            )
        with self._session_factory() as session:
            repo = AnalysisRepository(session)
            analysis = repo.add(
                Analysis(
                    filename=filename,
                    media_type=media_type,
                    mime_type=mime_type,
                    storage_path="",
                    site_name=site_name or None,
                    status=AnalysisStatus.pending.value,
                )
            )
            analysis.storage_path = self._storage.save(analysis.id, mime_type, data)
            session.commit()
            return analysis

    def run(self, analysis_id: str) -> None:
        """Background job. Never raises: outcome is written to the row's status."""
        with self._session_factory() as session:
            repo = AnalysisRepository(session)
            analysis = repo.get(analysis_id)
            if analysis is None:
                log.warning("run(): analysis %s not found", analysis_id)
                return
            analysis.status = AnalysisStatus.processing.value
            analysis.error_message = None
            session.commit()

            try:
                outcome = self._analyze_with_retry(analysis)
                summary = score(outcome.result)
                analysis.result_json = outcome.result.model_dump(mode="json")
                analysis.risk_score = summary.risk_score
                analysis.residual_score = summary.residual_score
                analysis.risk_level = summary.risk_level.value
                analysis.ppe_compliance_rate = summary.ppe_compliance_rate
                analysis.model = outcome.usage.model
                analysis.input_tokens = outcome.usage.input_tokens
                analysis.output_tokens = outcome.usage.output_tokens
                analysis.status = AnalysisStatus.completed.value
                session.commit()
            except Exception as exc:  # noqa: BLE001 - background task must not crash
                log.exception("analysis %s failed", analysis_id)
                session.rollback()
                analysis.status = AnalysisStatus.failed.value
                analysis.error_message = str(exc) or exc.__class__.__name__
                try:
                    session.commit()
                except Exception:  # noqa: BLE001
                    log.exception("could not persist failure for %s", analysis_id)

    def retry(self, analysis_id: str) -> Analysis:
        with self._session_factory() as session:
            analysis = AnalysisRepository(session).get(analysis_id)
            if analysis is None:
                raise AnalysisNotFound(analysis_id)
            if analysis.status != AnalysisStatus.failed.value:
                raise InvalidState(
                    f"Only failed analyses can be retried (status is {analysis.status})"
                )
            analysis.status = AnalysisStatus.pending.value
            analysis.error_message = None
            session.commit()
            return analysis

    def delete(self, analysis_id: str) -> None:
        with self._session_factory() as session:
            repo = AnalysisRepository(session)
            analysis = repo.get(analysis_id)
            if analysis is None:
                raise AnalysisNotFound(analysis_id)
            self._storage.delete(analysis.storage_path)
            repo.delete(analysis)
            session.commit()

    # ------------------------------------------------------------------- reads

    def get(self, analysis_id: str) -> Analysis | None:
        with self._session_factory() as session:
            return AnalysisRepository(session).get(analysis_id)

    def list(self) -> list[Analysis]:
        with self._session_factory() as session:
            return AnalysisRepository(session).list_all()

    def media_path(self, analysis: Analysis):
        return self._storage.absolute(analysis.storage_path)

    @staticmethod
    def parse_result(analysis: Analysis) -> AnalysisResult | None:
        if analysis.result_json is None:
            return None
        return AnalysisResult.model_validate(analysis.result_json)

    # ---------------------------------------------------------------- internal

    def _analyze_with_retry(self, analysis: Analysis) -> GeminiOutcome:
        if self._analyzer is None:
            raise AnalyzerError("Gemini API key is not configured")
        path = self._storage.absolute(analysis.storage_path)
        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return self._analyzer.analyze(
                    path, analysis.mime_type, MediaType(analysis.media_type)
                )
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                log.warning(
                    "attempt %d/%d for %s failed: %s", attempt, MAX_ATTEMPTS, analysis.id, exc
                )
        assert last_error is not None
        raise last_error
