from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_service, get_settings
from app.api.schemas import AnalysisDetail, AnalysisSummary, CreatedResponse, to_detail, to_summary
from app.config import Settings
from app.services.analysis_service import AnalysisService
from app.services.errors import (
    AnalysisNotFound,
    FileTooLarge,
    InvalidState,
    StorageError,
    UnsupportedMediaType,
)

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.post("", response_model=CreatedResponse, status_code=202)
async def create_analysis(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    site_name: str | None = Form(default=None),
    service: AnalysisService = Depends(get_service),
    settings: Settings = Depends(get_settings),
) -> CreatedResponse:
    # Reject oversize uploads from the multipart metadata before loading the body into memory.
    if file.size is not None and file.size > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File is {file.size / 1024 / 1024:.1f} MB; limit is "
            f"{settings.max_upload_bytes // 1024 // 1024} MB",
        )
    data = await file.read()
    try:
        # SQLite commit + disk write of up to max_upload_bytes: keep it off the event loop.
        analysis = await run_in_threadpool(
            service.create,
            filename=file.filename or "upload",
            mime_type=file.content_type or "",
            data=data,
            site_name=site_name,
        )
    except UnsupportedMediaType as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except StorageError as exc:
        # Blob storage is a dependency, not a client mistake: say so instead of a bare 500.
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if service.runs_inline:
        # service.run never raises; it writes the outcome to the row.
        await run_in_threadpool(service.run, analysis.id)
        analysis = service.get(analysis.id) or analysis
    else:
        background.add_task(service.run, analysis.id)
    return CreatedResponse(id=analysis.id, status=analysis.status)


@router.get("", response_model=list[AnalysisSummary])
def list_analyses(service: AnalysisService = Depends(get_service)) -> list[AnalysisSummary]:
    return [to_summary(a) for a in service.list()]


@router.get("/{analysis_id}", response_model=AnalysisDetail)
def get_analysis(
    analysis_id: str, service: AnalysisService = Depends(get_service)
) -> AnalysisDetail:
    analysis = service.get(analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return to_detail(analysis)


@router.post("/{analysis_id}/retry", response_model=CreatedResponse, status_code=202)
def retry_analysis(
    analysis_id: str,
    background: BackgroundTasks,
    service: AnalysisService = Depends(get_service),
) -> CreatedResponse:
    try:
        analysis = service.retry(analysis_id)
    except AnalysisNotFound as exc:
        raise HTTPException(status_code=404, detail="Analysis not found") from exc
    except InvalidState as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if service.runs_inline:
        # This endpoint is a sync def, so Starlette already runs it off the event loop.
        service.run(analysis.id)
        analysis = service.get(analysis.id) or analysis
    else:
        background.add_task(service.run, analysis.id)
    return CreatedResponse(id=analysis.id, status=analysis.status)


@router.get("/{analysis_id}/media")
def get_media(analysis_id: str, service: AnalysisService = Depends(get_service)) -> FileResponse:
    analysis = service.get(analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    path = service.media_path(analysis)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Media file missing")
    # No filename= : that would add Content-Disposition: attachment and break inline <video>/<img>.
    return FileResponse(path, media_type=analysis.mime_type)


@router.delete("/{analysis_id}", status_code=204, response_class=Response)
def delete_analysis(analysis_id: str, service: AnalysisService = Depends(get_service)) -> Response:
    try:
        service.delete(analysis_id)
    except AnalysisNotFound as exc:
        raise HTTPException(status_code=404, detail="Analysis not found") from exc
    return Response(status_code=204)
