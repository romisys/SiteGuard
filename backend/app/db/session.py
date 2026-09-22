from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.db.models import Base


def make_engine(database_url: str) -> Engine:
    """SQLite needs check_same_thread=False (the background task uses another thread);
    Postgres on serverless needs NullPool, since every invocation is a fresh process
    and a pooled connection would simply leak."""
    if database_url.startswith("sqlite"):
        return create_engine(database_url, connect_args={"check_same_thread": False})
    return create_engine(database_url, poolclass=NullPool, pool_pre_ping=True)


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
