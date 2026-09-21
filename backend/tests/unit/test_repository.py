import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Analysis
from app.db.repository import AnalysisRepository
from app.db.session import init_db


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    init_db(engine)
    factory = sessionmaker(bind=engine)
    with factory() as s:
        yield s


def _row(**overrides) -> Analysis:
    data = dict(
        filename="clip.mov", media_type="video", mime_type="video/quicktime",
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
