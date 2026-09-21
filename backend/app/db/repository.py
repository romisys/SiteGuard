from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import Analysis
from app.domain.models import AnalysisStatus

_IN_FLIGHT = (AnalysisStatus.pending.value, AnalysisStatus.processing.value)


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

    def mark_interrupted(self, message: str) -> int:
        """Fail every pending/processing row (e.g. after a server restart). Returns the count."""
        stmt = (
            update(Analysis)
            .where(Analysis.status.in_(_IN_FLIGHT))
            .values(status=AnalysisStatus.failed.value, error_message=message)
        )
        result = self.session.execute(stmt)
        return result.rowcount
