"""Hits the real Gemini API. Run with: pytest -m integration -q"""

import os
from pathlib import Path

import pytest

from app.domain.models import MediaType
from app.services.gemini_client import GoogleGeminiAnalyzer

SAMPLES = Path(__file__).resolve().parents[3] / "samples"

pytestmark = pytest.mark.integration


@pytest.fixture
def analyzer():
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY not set")
    return GoogleGeminiAnalyzer(
        api_key=key, model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    )


def test_analyze_one_sample_video(analyzer):
    clips = sorted(SAMPLES.glob("*.mov"))
    if not clips:
        pytest.skip("no samples extracted")
    outcome = analyzer.analyze(clips[0], "video/quicktime", MediaType.video)
    assert outcome.result.scene_summary
    assert outcome.result.workers.workers_visible >= 0
    assert outcome.usage.input_tokens and outcome.usage.input_tokens > 0
    for f in outcome.result.findings:
        assert 1 <= f.severity <= 5 and 1 <= f.likelihood <= 5
    print(
        f"\n{clips[0].name}: {len(outcome.result.findings)} findings, tokens in/out = "
        f"{outcome.usage.input_tokens}/{outcome.usage.output_tokens}"
    )
