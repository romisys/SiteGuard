from pathlib import Path

import pytest

from app.domain.models import MediaType
from app.services.errors import AnalyzerError
from app.services.gemini_client import FakeAnalyzer, load_prompt
from tests.factories import make_outcome


def test_prompt_mentions_both_passes_and_media_kind():
    text = load_prompt(MediaType.video)
    assert "PASS 1" in text and "PASS 2" in text
    assert "video" in text and "{media_kind}" not in text
    assert "image" in load_prompt(MediaType.image)


def test_fake_returns_queued_outcomes_in_order(tmp_path: Path):
    first, second = make_outcome(input_tokens=1), make_outcome(input_tokens=2)
    fake = FakeAnalyzer([first, second])
    assert fake.analyze(tmp_path / "a.mov", "video/quicktime", MediaType.video) is first
    assert fake.analyze(tmp_path / "a.mov", "video/quicktime", MediaType.video) is second
    assert [c.mime_type for c in fake.calls] == ["video/quicktime", "video/quicktime"]


def test_fake_raises_queued_exception(tmp_path: Path):
    fake = FakeAnalyzer([AnalyzerError("boom"), make_outcome()])
    with pytest.raises(AnalyzerError, match="boom"):
        fake.analyze(tmp_path / "a.png", "image/png", MediaType.image)
    outcome = fake.analyze(tmp_path / "a.png", "image/png", MediaType.image)
    assert outcome.usage.model == "fake-model"


def test_fake_with_empty_queue_returns_configured_default(tmp_path: Path):
    default = make_outcome()
    fake = FakeAnalyzer(default=default)
    assert fake.analyze(tmp_path / "a.png", "image/png", MediaType.image) is default
    assert fake.analyze(tmp_path / "a.png", "image/png", MediaType.image) is default


def test_fake_queue_takes_precedence_over_default(tmp_path: Path):
    queued = make_outcome(input_tokens=1)
    fake = FakeAnalyzer([queued], default=make_outcome(input_tokens=2))
    assert fake.analyze(tmp_path / "a.png", "image/png", MediaType.image) is queued
    assert fake.analyze(tmp_path / "a.png", "image/png", MediaType.image).usage.input_tokens == 2


def test_bare_fake_with_empty_queue_raises(tmp_path: Path):
    fake = FakeAnalyzer()
    with pytest.raises(AnalyzerError, match="queue is empty"):
        fake.analyze(tmp_path / "a.png", "image/png", MediaType.image)
    assert len(fake.calls) == 1
