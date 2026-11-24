import mimetypes
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..models import Annotation, Material, Subject, utcnow
from ..schemas import AnnotationRead, AnnotationUpsert, MaterialRead

router = APIRouter(prefix="/api", tags=["materials"])

KIND_BY_EXT = {
    ".pdf": "pdf",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
    ".docx": "docx",
    ".pptx": "pptx",
}

DEFAULT_MEDIA_TYPE = "application/octet-stream"


def _get_material_or_404(session: Session, material_id: int) -> Material:
    material = session.get(Material, material_id)
    if material is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "资料不存在")
    return material


@router.post(
    "/subjects/{subject_id}/materials",
    response_model=MaterialRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_material(
    subject_id: int,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    session: Session = Depends(get_session),
) -> Material:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")

    filename = file.filename or "unnamed"
    suffix = Path(filename).suffix.lower()
    kind = KIND_BY_EXT.get(suffix)
    if kind is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"不支持的文件类型：{suffix or '无扩展名'}",
        )

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "文件为空")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"文件超过 {settings.max_upload_mb} MB 上限",
        )

    storage_name = f"{uuid4().hex}{suffix}"
    uploads_dir = settings.uploads_dir
    uploads_dir.mkdir(parents=True, exist_ok=True)
    (uploads_dir / storage_name).write_bytes(data)

    material = Material(
        subject_id=subject_id,
        title=(title or filename).strip()[:200] or filename,
        filename=filename[:200],
        kind=kind,
        size=len(data),
        storage_name=storage_name,
    )
    session.add(material)
    session.commit()
    session.refresh(material)
    return material


@router.get("/subjects/{subject_id}/materials", response_model=list[MaterialRead])
def list_materials(
    subject_id: int, session: Session = Depends(get_session)
) -> list[Material]:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")
    statement = (
        select(Material)
        .where(Material.subject_id == subject_id)
        .order_by(Material.created_at)
    )
    return list(session.exec(statement).all())


@router.get("/materials/{material_id}", response_model=MaterialRead)
def get_material(
    material_id: int, session: Session = Depends(get_session)
) -> Material:
    return _get_material_or_404(session, material_id)


@router.get("/materials/{material_id}/file")
def download_material(
    material_id: int, session: Session = Depends(get_session)
) -> FileResponse:
    material = _get_material_or_404(session, material_id)
    path = settings.uploads_dir / material.storage_name
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "文件已丢失")
    media_type = mimetypes.guess_type(material.filename)[0] or DEFAULT_MEDIA_TYPE
    return FileResponse(
        path,
        media_type=media_type,
        filename=material.filename,
        content_disposition_type="inline",
    )


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: int, session: Session = Depends(get_session)
) -> None:
    material = _get_material_or_404(session, material_id)
    path = settings.uploads_dir / material.storage_name
    path.unlink(missing_ok=True)
    for annotation in session.exec(
        select(Annotation).where(Annotation.material_id == material_id)
    ).all():
        session.delete(annotation)
    session.delete(material)
    session.commit()


@router.get(
    "/materials/{material_id}/annotations", response_model=list[AnnotationRead]
)
def list_annotations(
    material_id: int, session: Session = Depends(get_session)
) -> list[Annotation]:
    _get_material_or_404(session, material_id)
    statement = (
        select(Annotation)
        .where(Annotation.material_id == material_id)
        .order_by(Annotation.page)
    )
    return list(session.exec(statement).all())


@router.put(
    "/materials/{material_id}/annotations/{page}", response_model=AnnotationRead
)
def upsert_annotation(
    material_id: int,
    page: int,
    payload: AnnotationUpsert,
    session: Session = Depends(get_session),
) -> Annotation:
    _get_material_or_404(session, material_id)
    if page < 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "页码从 1 开始")

    annotation = session.exec(
        select(Annotation).where(
            Annotation.material_id == material_id, Annotation.page == page
        )
    ).first()
    if annotation is None:
        annotation = Annotation(material_id=material_id, page=page, payload=payload.payload)
    else:
        annotation.payload = payload.payload
        annotation.updated_at = utcnow()
    session.add(annotation)
    session.commit()
    session.refresh(annotation)
    return annotation


@router.delete(
    "/materials/{material_id}/annotations/{page}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_annotation(
    material_id: int, page: int, session: Session = Depends(get_session)
) -> None:
    _get_material_or_404(session, material_id)
    annotation = session.exec(
        select(Annotation).where(
            Annotation.material_id == material_id, Annotation.page == page
        )
    ).first()
    if annotation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "该页没有批注")
    session.delete(annotation)
    session.commit()
