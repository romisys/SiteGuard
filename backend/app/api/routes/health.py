from fastapi import APIRouter, Depends

from app.api.deps import get_settings
from app.api.schemas import HealthResponse
from app.config import Settings

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", gemini_configured=settings.gemini_configured)
