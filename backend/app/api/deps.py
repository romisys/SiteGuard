from fastapi import Request

from app.config import Settings
from app.services.analysis_service import AnalysisService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_service(request: Request) -> AnalysisService:
    return request.app.state.service
