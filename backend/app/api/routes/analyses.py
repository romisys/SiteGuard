from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from app.api.deps import get_service
from app.api.schemas import AnalysisDetail, AnalysisSummary, CreatedResponse, to_detail, to_summary
from app.services.analysis_service import AnalysisService
from app.services.errors import AnalysisNotFound, FileTooLarge, InvalidState, UnsupportedMediaType

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.post("", response_model=CreatedResponse, status_code=202)
async def create_analysis(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    site_name: str | None = Form(default=None),
    service: AnalysisService = Depends(get_service),
) -> CreatedResponse:
    data = await file.read()
    try:
        analysis = service.create(
            filename=file.filename or "upload",
            mime_type=file.content_type or "",
            data=data,
            site_name=site_name,
        )
    except UnsupportedMediaType as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
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
