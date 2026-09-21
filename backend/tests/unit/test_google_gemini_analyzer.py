from pathlib import Path
from types import SimpleNamespace

import pytest

from app.domain.models import MediaType
from app.services.errors import AnalyzerError, InvalidModelOutput
from app.services.gemini_client import GoogleGeminiAnalyzer
from tests.factories import make_result


def _analyzer_with_response(response) -> GoogleGeminiAnalyzer:
    analyzer = GoogleGeminiAnalyzer(api_key="dummy-key", model="fake-model")
    analyzer._client = SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **kwargs: response)
    )
    return analyzer


def _image(tmp_path: Path) -> Path:
    path = tmp_path / "x.png"
    path.write_bytes(b"\x89PNG\r\n")
    return path


def test_empty_text_reports_block_reason(tmp_path: Path):
    response = SimpleNamespace(
        text=None,
        prompt_feedback=SimpleNamespace(block_reason=SimpleNamespace(name="SAFETY")),
        candidates=[],
    )
    analyzer = _analyzer_with_response(response)
    with pytest.raises(InvalidModelOutput, match="SAFETY"):
        analyzer.analyze(_image(tmp_path), "image/png", MediaType.image)


def test_output_tokens_include_thinking_tokens(tmp_path: Path):
    response = SimpleNamespace(
        text=make_result().model_dump_json(),
        usage_metadata=SimpleNamespace(
            prompt_token_count=10, candidates_token_count=5, thoughts_token_count=7
        ),
    )
    analyzer = _analyzer_with_response(response)
    outcome = analyzer.analyze(_image(tmp_path), "image/png", MediaType.image)
    assert outcome.usage.input_tokens == 10
    assert outcome.usage.output_tokens == 12


def _analyzer_capturing_config(captured: dict, **kwargs) -> GoogleGeminiAnalyzer:
    response = SimpleNamespace(
        text=make_result().model_dump_json(),
        usage_metadata=SimpleNamespace(prompt_token_count=1, candidates_token_count=1),
    )

    def generate_content(**call):
        captured.update(call)
        return response

    analyzer = GoogleGeminiAnalyzer(api_key="dummy-key", model="fake-model", **kwargs)
    analyzer._client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    return analyzer


def test_thinking_budget_capped_by_default(tmp_path: Path):
    captured: dict = {}
    analyzer = _analyzer_capturing_config(captured)
    analyzer.analyze(_image(tmp_path), "image/png", MediaType.image)
    assert captured["config"].thinking_config.thinking_budget == 2048


def test_thinking_budget_none_leaves_sdk_default(tmp_path: Path):
    captured: dict = {}
    analyzer = _analyzer_capturing_config(captured, thinking_budget=None)
    analyzer.analyze(_image(tmp_path), "image/png", MediaType.image)
    assert captured["config"].thinking_config is None


# ------------------------------------------------------------------ video path


def _file(state: str, name: str = "files/abc") -> SimpleNamespace:
    return SimpleNamespace(
        name=name,
        uri=f"https://x/{name}",
        mime_type="video/quicktime",
        state=SimpleNamespace(name=state),
    )


def _video(tmp_path: Path) -> Path:
    path = tmp_path / "clip.mov"
    path.write_bytes(b"fake mov")
    return path


class _FilesStub:
    """Stand-in for client.files: upload returns the first state, get() walks the rest."""

    def __init__(self, states: list[str], upload_error=None, get_error=None):
        self._states = list(states)
        self._upload_error = upload_error
        self._get_error = get_error
        self.uploaded: list[dict] = []
        self.deleted: list[str] = []
        self.polls = 0

    def upload(self, **kwargs):
        if self._upload_error is not None:
            raise self._upload_error
        self.uploaded.append(kwargs)
        return _file(self._states.pop(0))

    def get(self, name: str):
        self.polls += 1
        if self._get_error is not None:
            raise self._get_error
        # Stay in the last state once the sequence is exhausted (e.g. PROCESSING forever).
        state = self._states.pop(0) if len(self._states) > 1 else self._states[0]
        return _file(state, name=name)

    def delete(self, name: str):
        self.deleted.append(name)


def _video_analyzer(
    files: _FilesStub, captured: dict | None = None, **kwargs
) -> GoogleGeminiAnalyzer:
    response = SimpleNamespace(
        text=make_result().model_dump_json(),
        usage_metadata=SimpleNamespace(prompt_token_count=1, candidates_token_count=1),
    )

    def generate_content(**call):
        if captured is not None:
            captured.update(call)
        return response

    kwargs.setdefault("poll_interval", 0)
    kwargs.setdefault("file_timeout", 5)
    analyzer = GoogleGeminiAnalyzer(api_key="dummy-key", model="fake-model", **kwargs)
    analyzer._client = SimpleNamespace(
        models=SimpleNamespace(generate_content=generate_content), files=files
    )
    return analyzer


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr("app.services.gemini_client.time.sleep", lambda _s: None)


def test_video_waits_for_active_then_uses_uploaded_uri(tmp_path: Path):
    files = _FilesStub(["PROCESSING", "PROCESSING", "ACTIVE"])
    captured: dict = {}
    analyzer = _video_analyzer(files, captured)

    outcome = analyzer.analyze(_video(tmp_path), "video/quicktime", MediaType.video)

    assert outcome.usage.model == "fake-model"
    assert files.polls == 2
    assert files.uploaded[0]["file"] == str(tmp_path / "clip.mov")
    assert files.uploaded[0]["config"].mime_type == "video/quicktime"
    media_part = captured["contents"][0]
    assert media_part.file_data.file_uri == "https://x/files/abc"
    assert media_part.file_data.mime_type == "video/quicktime"
    assert files.deleted == ["files/abc"]


def test_video_processing_forever_times_out_and_still_cleans_up(tmp_path: Path):
    files = _FilesStub(["PROCESSING"])
    analyzer = _video_analyzer(files, file_timeout=0)
    with pytest.raises(AnalyzerError, match="timeout"):
        analyzer.analyze(_video(tmp_path), "video/quicktime", MediaType.video)
    assert files.deleted == ["files/abc"]


def test_video_failed_state_raises(tmp_path: Path):
    files = _FilesStub(["PROCESSING", "FAILED"])
    analyzer = _video_analyzer(files)
    with pytest.raises(AnalyzerError, match="could not process"):
        analyzer.analyze(_video(tmp_path), "video/quicktime", MediaType.video)
    assert files.deleted == ["files/abc"]


def test_video_polling_error_is_wrapped(tmp_path: Path):
    files = _FilesStub(["PROCESSING"], get_error=RuntimeError("503"))
    analyzer = _video_analyzer(files)
    with pytest.raises(AnalyzerError, match="Polling"):
        analyzer.analyze(_video(tmp_path), "video/quicktime", MediaType.video)
    assert files.deleted == ["files/abc"]


def test_video_upload_error_is_wrapped(tmp_path: Path):
    files = _FilesStub([], upload_error=RuntimeError("network down"))
    analyzer = _video_analyzer(files)
    with pytest.raises(AnalyzerError, match="upload"):
        analyzer.analyze(_video(tmp_path), "video/quicktime", MediaType.video)
    assert files.deleted == []  # nothing was uploaded, nothing to delete
