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


def test_box_2d_accepts_a_normalised_box():
    f = make_finding(box_2d=[100, 200, 400, 600])
    assert f.box_2d == [100, 200, 400, 600]


def test_box_2d_is_optional():
    assert make_finding(box_2d=None).box_2d is None


@pytest.mark.parametrize(
    "box",
    [
        [1, 2, 3],  # too few
        [1, 2, 3, 4, 5],  # too many
        [-1, 0, 100, 100],  # below range
        [0, 0, 1001, 100],  # above range
        [400, 0, 100, 100],  # y_min >= y_max
        [0, 600, 100, 200],  # x_min >= x_max
    ],
)
def test_malformed_box_is_dropped_not_fatal(box):
    """A bad box must cost the thumbnail, never the whole report."""
    assert make_finding(box_2d=box).box_2d is None


def test_timestamp_end_defaults_to_none():
    payload = make_finding().model_dump(exclude={"timestamp_end_seconds"})
    assert Finding(**payload).timestamp_end_seconds is None
