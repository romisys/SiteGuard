from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import Analysis
from app.domain.models import AnalysisStatus

_IN_FLIGHT = (AnalysisStatus.pending.value, AnalysisStatus.processing.value)
# Serverless cold starts are frequent, so only rows too old to still be running are swept.
INTERRUPTED_AFTER = timedelta(minutes=30)


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

    def mark_interrupted(self, message: str, cutoff: datetime | None = None) -> int:
        """Fail pending/processing rows older than the cutoff (default 30 minutes).

        Rows younger than that may belong to a request running right now in another
        process, which a cold start must not kill. Returns the count.
        """
        cutoff = cutoff or datetime.now(UTC) - INTERRUPTED_AFTER
        stmt = (
            update(Analysis)
            .where(Analysis.status.in_(_IN_FLIGHT), Analysis.created_at < cutoff)
            .values(status=AnalysisStatus.failed.value, error_message=message)
        )
        result = self.session.execute(stmt)
        return result.rowcount
