from pathlib import Path
from types import SimpleNamespace

import pytest

from app.domain.models import MediaType
from app.services.errors import InvalidModelOutput
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
