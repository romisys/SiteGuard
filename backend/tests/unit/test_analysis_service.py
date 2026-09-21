from pathlib import Path

import pytest
from sqlalchemy.orm import sessionmaker

from app.db.session import init_db, make_engine, make_session_factory
from app.services.analysis_service import AnalysisService
from app.services.errors import (
    AnalysisNotFound,
    AnalyzerError,
    FileTooLarge,
    InvalidModelOutput,
    InvalidState,
    UnsupportedMediaType,
)
from app.services.gemini_client import FakeAnalyzer
from app.services.storage import FileStorage
from tests.factories import make_finding, make_outcome, make_result


@pytest.fixture
def session_factory(tmp_path: Path) -> sessionmaker:
    engine = make_engine(f"sqlite:///{tmp_path / 't.db'}")
    init_db(engine)
    return make_session_factory(engine)


@pytest.fixture
def fake() -> FakeAnalyzer:
    return FakeAnalyzer(default=make_outcome())


@pytest.fixture
def service(tmp_path: Path, session_factory, fake) -> AnalysisService:
    return AnalysisService(
        session_factory=session_factory,
        analyzer=fake,
        storage=FileStorage(root=tmp_path),
        max_upload_bytes=1024,
        retry_delay=0,
    )


def test_create_persists_pending_row_and_file(service, tmp_path):
    a = service.create(
        filename="clip.mov", mime_type="video/quicktime", data=b"abc", site_name="Tower A"
    )
    assert a.status == "pending"
    assert a.media_type == "video"
    assert a.site_name == "Tower A"
    assert (tmp_path / a.storage_path).read_bytes() == b"abc"
    assert service.get(a.id).id == a.id


def test_create_rejects_bad_mime(service):
    with pytest.raises(UnsupportedMediaType):
        service.create(filename="x.pdf", mime_type="application/pdf", data=b"abc", site_name=None)


def test_create_rejects_oversize(service):
    with pytest.raises(FileTooLarge):
        service.create(filename="x.png", mime_type="image/png", data=b"x" * 1025, site_name=None)


def test_run_completes_and_stores_scores(service, fake):
    fake.queue.append(
        make_outcome(
            make_result(
                findings=[make_finding(severity=5, likelihood=5, mitigation_effectiveness=0.8)]
            )
        )
    )
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    done = service.get(a.id)
    assert done.status == "completed"
    assert done.risk_score == 100
    assert done.residual_score == 20
    assert done.risk_level == "Critical"
    assert done.ppe_compliance_rate == 0.75
    assert done.model == "fake-model"
    assert done.input_tokens == 1200 and done.output_tokens == 340
    assert done.result_json["scene_summary"].startswith("Two workers")
    assert fake.calls[0].mime_type == "image/png"


def test_run_retries_once_on_analyzer_error(service, fake):
    fake.queue.extend([InvalidModelOutput("bad json"), make_outcome()])
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    assert service.get(a.id).status == "completed"
    assert len(fake.calls) == 2


def test_run_sleeps_between_attempts(tmp_path, session_factory, fake, monkeypatch):
    slept: list[float] = []
    monkeypatch.setattr("app.services.analysis_service.time.sleep", slept.append)
    service = AnalysisService(
        session_factory=session_factory,
        analyzer=fake,
        storage=FileStorage(root=tmp_path),
        max_upload_bytes=1024,
        retry_delay=1.5,
    )
    fake.queue.extend([AnalyzerError("flaky"), make_outcome()])
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    assert service.get(a.id).status == "completed"
    assert slept == [1.5]


def test_run_does_not_sleep_after_final_attempt(service, fake, monkeypatch):
    slept: list[float] = []
    monkeypatch.setattr("app.services.analysis_service.time.sleep", slept.append)
    fake.queue.extend([AnalyzerError("a"), AnalyzerError("b")])
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    assert service.get(a.id).status == "failed"
    assert slept == [0]  # retry_delay=0 in the fixture; one sleep between two attempts


def test_retry_delay_defaults_to_module_constant(tmp_path, session_factory, fake):
    from app.services.analysis_service import RETRY_DELAY_SECONDS

    service = AnalysisService(
        session_factory=session_factory,
        analyzer=fake,
        storage=FileStorage(root=tmp_path),
        max_upload_bytes=1024,
    )
    assert RETRY_DELAY_SECONDS == 2.0
    assert service._retry_delay == RETRY_DELAY_SECONDS


def test_run_fails_after_second_error(service, fake):
    fake.queue.extend([AnalyzerError("down"), AnalyzerError("still down")])
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    failed = service.get(a.id)
    assert failed.status == "failed"
    assert failed.error_message == "still down"
    assert len(fake.calls) == 2


def test_run_unknown_id_is_noop(service):
    service.run("missing")  # must not raise from a background task


def test_retry_resets_failed_to_pending(service, fake):
    fake.queue.append(AnalyzerError("a"))
    fake.queue.append(AnalyzerError("b"))
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    assert service.get(a.id).status == "failed"
    retried = service.retry(a.id)
    assert retried.status == "pending"
    assert retried.error_message is None


def test_retry_rejects_non_failed(service):
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    with pytest.raises(InvalidState):
        service.retry(a.id)


def test_retry_unknown_raises(service):
    with pytest.raises(AnalysisNotFound):
        service.retry("missing")


def test_delete_removes_row_and_file(service, tmp_path):
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    path = tmp_path / a.storage_path
    assert path.exists()
    service.delete(a.id)
    assert not path.exists()
    assert service.get(a.id) is None


def test_delete_unknown_raises(service):
    with pytest.raises(AnalysisNotFound):
        service.delete("missing")


def test_list_newest_first(service):
    a = service.create(filename="first.png", mime_type="image/png", data=b"1", site_name=None)
    b = service.create(filename="second.png", mime_type="image/png", data=b"2", site_name=None)
    ids = [r.id for r in service.list()]
    assert ids.index(b.id) < ids.index(a.id)


def test_run_without_analyzer_marks_failed(tmp_path, session_factory):
    service = AnalysisService(
        session_factory=session_factory,
        analyzer=None,
        storage=FileStorage(root=tmp_path),
        max_upload_bytes=1024,
    )
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    failed = service.get(a.id)
    assert failed.status == "failed"
    assert failed.error_message == "Gemini API key is not configured"


def test_run_marks_failed_when_persist_step_raises(service, fake, monkeypatch):
    fake.queue.append(make_outcome())

    def boom(_result):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.services.analysis_service.score", boom)
    a = service.create(filename="x.png", mime_type="image/png", data=b"abc", site_name=None)
    service.run(a.id)
    failed = service.get(a.id)
    assert failed.status == "failed"
    assert failed.error_message == "boom"
