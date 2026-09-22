from app.db.session import make_engine


def test_sqlite_engine_gets_check_same_thread(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'x.db'}")
    assert engine.dialect.name == "sqlite"


def test_postgres_url_does_not_get_sqlite_connect_args():
    # Must not raise TypeError from passing check_same_thread to psycopg.
    engine = make_engine("postgresql+psycopg://u:p@localhost/db")
    assert engine.dialect.name == "postgresql"
    assert "check_same_thread" not in engine.dialect.create_connect_args(engine.url)[1]


def test_postgres_engine_uses_nullpool():
    from sqlalchemy.pool import NullPool

    engine = make_engine("postgresql+psycopg://u:p@localhost/db")
    assert isinstance(engine.pool, NullPool)
