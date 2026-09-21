"""Gemini integration behind a small Protocol so the rest of the app never imports google-genai."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ValidationError

from app.domain.models import AnalysisResult, MediaType
from app.services.errors import AnalyzerError, InvalidModelOutput

log = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "inspector.md"


def load_prompt(media_type: MediaType) -> str:
    return PROMPT_PATH.read_text(encoding="utf-8").replace("{media_kind}", media_type.value)


class GeminiUsage(BaseModel):
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class GeminiOutcome(BaseModel):
    result: AnalysisResult
    usage: GeminiUsage


class GeminiAnalyzer(Protocol):
    def analyze(self, path: Path, mime_type: str, media_type: MediaType) -> GeminiOutcome: ...


# --------------------------------------------------------------------------- fake


@dataclass
class AnalyzeCall:
    path: Path
    mime_type: str
    media_type: MediaType


@dataclass
class FakeAnalyzer:
    """Returns queued outcomes (or raises queued exceptions) in order; records calls.

    With an empty queue it returns a sensible default result so simple tests need no setup.
    """

    queue: list[GeminiOutcome | Exception] = field(default_factory=list)
    calls: list[AnalyzeCall] = field(default_factory=list)

    def analyze(self, path: Path, mime_type: str, media_type: MediaType) -> GeminiOutcome:
        self.calls.append(AnalyzeCall(path, mime_type, media_type))
        if not self.queue:
            from tests.factories import make_outcome  # test-only helper; fine for a fake

            return make_outcome()
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


# --------------------------------------------------------------------------- real


class GoogleGeminiAnalyzer:
    def __init__(
        self,
        api_key: str,
        model: str,
        poll_interval: float = 2.0,
        file_timeout: float = 120.0,
        temperature: float = 0.2,
    ):
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._poll_interval = poll_interval
        self._file_timeout = file_timeout
        self._temperature = temperature

    def analyze(self, path: Path, mime_type: str, media_type: MediaType) -> GeminiOutcome:
        from google.genai import types

        uploaded = None
        try:
            if media_type is MediaType.video:
                uploaded = self._upload_and_wait(path, mime_type)
                media_part = types.Part.from_uri(
                    file_uri=uploaded.uri, mime_type=uploaded.mime_type
                )
            else:
                media_part = types.Part.from_bytes(data=path.read_bytes(), mime_type=mime_type)

            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AnalysisResult,
                temperature=self._temperature,
            )
            try:
                response = self._client.models.generate_content(
                    model=self._model,
                    contents=[media_part, load_prompt(media_type)],
                    config=config,
                )
            except Exception as exc:  # SDK raises many types; normalise
                raise AnalyzerError(f"Gemini request failed: {exc}") from exc

            text = response.text or ""
            try:
                result = AnalysisResult.model_validate_json(text)
            except ValidationError as exc:
                log.warning("Gemini returned invalid JSON: %s", text[:500])
                raise InvalidModelOutput(f"Gemini output did not match schema: {exc}") from exc

            usage = response.usage_metadata
            return GeminiOutcome(
                result=result,
                usage=GeminiUsage(
                    model=self._model,
                    input_tokens=getattr(usage, "prompt_token_count", None),
                    output_tokens=getattr(usage, "candidates_token_count", None),
                ),
            )
        finally:
            if uploaded is not None:
                try:
                    self._client.files.delete(name=uploaded.name)
                except Exception:  # best effort cleanup
                    log.debug("Could not delete uploaded file %s", uploaded.name)

    def _upload_and_wait(self, path: Path, mime_type: str):
        from google.genai import types

        try:
            uploaded = self._client.files.upload(
                file=str(path), config=types.UploadFileConfig(mime_type=mime_type)
            )
        except Exception as exc:
            raise AnalyzerError(f"Video upload to Gemini failed: {exc}") from exc

        deadline = time.monotonic() + self._file_timeout
        while uploaded.state and uploaded.state.name == "PROCESSING":
            if time.monotonic() > deadline:
                raise AnalyzerError("Gemini took too long to process the video (timeout)")
            time.sleep(self._poll_interval)
            uploaded = self._client.files.get(name=uploaded.name)
        if uploaded.state and uploaded.state.name == "FAILED":
            raise AnalyzerError("Gemini could not process the video file")
        return uploaded


def build_analyzer(api_key: str | None, model: str) -> GeminiAnalyzer | None:
    if not api_key:
        return None
    return GoogleGeminiAnalyzer(api_key=api_key, model=model)
