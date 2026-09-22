from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine

from app.db.models import Analysis
from app.db.repository import AnalysisRepository
from app.db.session import init_db, make_session_factory


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as s:
        yield s


def _row(**overrides) -> Analysis:
    data = dict(
        filename="clip.mov",
        media_type="video",
        mime_type="video/quicktime",
        storage_path="uploads/x.mov",
    )
    data.update(overrides)
    return Analysis(**data)


def test_add_assigns_id_and_defaults(session):
    repo = AnalysisRepository(session)
    row = repo.add(_row())
    session.commit()
    assert len(row.id) == 36
    assert row.status == "pending"
    assert row.created_at is not None
    assert repo.get(row.id) is row


def test_get_missing_returns_none(session):
    assert AnalysisRepository(session).get("nope") is None


def test_list_all_is_newest_first(session):
    from datetime import UTC, datetime, timedelta

    repo = AnalysisRepository(session)
    older = repo.add(_row(filename="a", created_at=datetime.now(UTC) - timedelta(days=1)))
    newer = repo.add(_row(filename="b"))
    session.commit()
    assert [r.filename for r in repo.list_all()] == ["b", "a"]
    assert repo.list_all()[0] is newer and repo.list_all()[1] is older


def test_delete_removes_row(session):
    repo = AnalysisRepository(session)
    row = repo.add(_row())
    session.commit()
    repo.delete(row)
    session.commit()
    assert repo.get(row.id) is None


def test_result_json_roundtrip(session):
    repo = AnalysisRepository(session)
    row = repo.add(_row(result_json={"findings": [], "scene_summary": "x"}, risk_score=12))
    session.commit()
    session.expire_all()
    fetched = repo.get(row.id)
    assert fetched.result_json == {"findings": [], "scene_summary": "x"}
    assert fetched.risk_score == 12


def test_created_at_is_utc_aware_after_reload(session):
    from datetime import UTC

    repo = AnalysisRepository(session)
    row = repo.add(_row())
    session.commit()
    session.expire_all()
    reloaded = repo.get(row.id)
    assert reloaded.created_at.tzinfo is not None
    assert reloaded.created_at.utcoffset() == UTC.utcoffset(None)


def test_mark_interrupted_fails_pending_and_processing_only(session):
    repo = AnalysisRepository(session)
    stale = datetime.now(UTC) - timedelta(hours=2)
    pending = repo.add(_row(status="pending", created_at=stale))
    processing = repo.add(_row(status="processing", created_at=stale))
    completed = repo.add(_row(status="completed", risk_score=10, created_at=stale))
    session.commit()

    count = repo.mark_interrupted("Server restarted during analysis — click Retry")
    session.commit()
    session.expire_all()

    assert count == 2
    for row in (pending, processing):
        fetched = repo.get(row.id)
        assert fetched.status == "failed"
        assert fetched.error_message == "Server restarted during analysis — click Retry"
    untouched = repo.get(completed.id)
    assert untouched.status == "completed"
    assert untouched.error_message is None


def test_mark_interrupted_with_nothing_stuck_returns_zero(session):
    repo = AnalysisRepository(session)
    repo.add(_row(status="completed"))
    session.commit()
    assert repo.mark_interrupted("restarted") == 0


def test_mark_interrupted_spares_recent_rows(session):
    """A serverless cold start must not fail an analysis that is still running."""
    repo = AnalysisRepository(session)
    fresh = repo.add(_row(status="processing"))
    session.commit()

    assert repo.mark_interrupted("restarted") == 0
    session.commit()
    session.expire_all()
    assert repo.get(fresh.id).status == "processing"
