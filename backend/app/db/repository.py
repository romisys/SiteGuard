from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Analysis


class AnalysisRepository:
    """Thin data-access wrapper. Callers own the transaction (session.commit())."""

    def __init__(self, session: Session):
        self.session = session

    def add(self, analysis: Analysis) -> Analysis:
        self.session.add(analysis)
        self.session.flush()
        return analysis

    def get(self, analysis_id: str) -> Analysis | None:
        return self.session.get(Analysis, analysis_id)

    def list_all(self) -> list[Analysis]:
        stmt = select(Analysis).order_by(Analysis.created_at.desc())
        return list(self.session.scalars(stmt))

    def delete(self, analysis: Analysis) -> None:
        self.session.delete(analysis)
        self.session.flush()
