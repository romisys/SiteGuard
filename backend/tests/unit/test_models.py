import pytest
from pydantic import ValidationError

from app.domain.models import AnalysisResult, Finding
from tests.factories import make_finding, make_result


def test_result_roundtrips_through_json():
    result = make_result()
    dumped = result.model_dump_json()
    assert AnalysisResult.model_validate_json(dumped) == result


def test_finding_risk_is_severity_times_likelihood():
    assert make_finding(severity=4, likelihood=3).risk == 12


def test_timestamp_is_optional():
    f = make_finding(timestamp_seconds=None)
    assert f.timestamp_seconds is None


@pytest.mark.parametrize(
    "field,value", [("severity", 0), ("severity", 6), ("likelihood", 0), ("likelihood", 6)]
)
def test_out_of_range_severity_or_likelihood_rejected(field, value):
    with pytest.raises(ValidationError):
        make_finding(**{field: value})


@pytest.mark.parametrize("value", [-0.1, 1.1])
def test_mitigation_effectiveness_bounded(value):
    with pytest.raises(ValidationError):
        make_finding(mitigation_effectiveness=value)


def test_unknown_category_rejected():
    with pytest.raises(ValidationError):
        make_finding(category="ghosts")


def test_unknown_subject_rejected():
    with pytest.raises(ValidationError):
        make_finding(subject="manager")


def test_missing_required_field_rejected():
    payload = make_finding().model_dump()
    del payload["recommendation"]
    with pytest.raises(ValidationError):
        Finding(**payload)


def test_result_requires_workers_block():
    payload = make_result().model_dump()
    del payload["workers"]
    with pytest.raises(ValidationError):
        AnalysisResult(**payload)
