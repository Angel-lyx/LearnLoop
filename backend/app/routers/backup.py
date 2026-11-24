import json
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlmodel import Session, select

from ..auth import get_current_user, get_setting, save_setting
from ..config import settings
from ..db import get_session
from ..models import (
    Annotation,
    BonusItem,
    Course,
    Exam,
    Material,
    MindMap,
    Mistake,
    ScoreRule,
    StudyPlan,
    Subject,
    Task,
    User,
)

router = APIRouter(prefix="/api/backup", tags=["backup"])

MANIFEST = "manifest.json"
UPLOADS_PREFIX = "uploads/"
FORMAT_VERSION = 2
WEIGHTS_KEY = "score_weights"

# 导入时不能直接带上的字段：主键、归属人，以及嵌套的子结构
_DROP_ON_IMPORT = ("id", "user_id", "annotations")


def _dump(rows: list) -> list[dict]:
    return [row.model_dump(mode="json") for row in rows]


def _scoped(session: Session, model, user: User) -> list:
    return list(session.exec(select(model).where(model.user_id == user.id)).all())


def _clean(payload: dict) -> dict:
    return {key: value for key, value in payload.items() if key not in _DROP_ON_IMPORT}


def _build(model, item: dict, user_id: int, **extra):
    """用 model_validate 走一遍校验，把备份里的 ISO 字符串还原成 date/datetime。"""
    return model.model_validate({**_clean(item), "user_id": user_id, **extra})


@router.get("/export")
def export_backup(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    subjects = _scoped(session, Subject, user)
    materials = _scoped(session, Material, user)
    mistakes = _scoped(session, Mistake, user)
    exams = _scoped(session, Exam, user)
    tasks = _scoped(session, Task, user)
    plans = _scoped(session, StudyPlan, user)
    maps = _scoped(session, MindMap, user)
    courses = _scoped(session, Course, user)
    rules = _scoped(session, ScoreRule, user)
    bonus = _scoped(session, BonusItem, user)

    annotations_by_material: dict[int, list[dict]] = {}
    for annotation in _scoped(session, Annotation, user):
        annotations_by_material.setdefault(annotation.material_id, []).append(
            {
                "page": annotation.page,
                "payload": annotation.payload,
                "updated_at": annotation.updated_at.isoformat(),
            }
        )

    manifest = {
        "version": FORMAT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "username": user.username,
        "subjects": _dump(subjects),
        "materials": [
            {**_dump([material])[0], "annotations": annotations_by_material.get(material.id, [])}
            for material in materials
        ],
        "mistakes": _dump(mistakes),
        "exams": _dump(exams),
        "tasks": _dump(tasks),
        "plans": _dump(plans),
        "maps": _dump(maps),
        "courses": _dump(courses),
        "rules": _dump(rules),
        "bonus": _dump(bonus),
        # API Key 属于凭证，不进备份包；换机器后重新填写即可
        "settings": {"score_weights": get_setting(session, user.id, WEIGHTS_KEY)},
    }

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(MANIFEST, json.dumps(manifest, ensure_ascii=False, indent=1))
        for material in materials:
            path = settings.uploads_dir / material.storage_name
            if path.is_file():
                archive.write(path, f"{UPLOADS_PREFIX}{material.storage_name}")

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="learnloop-backup.zip"'},
    )


def _delete_user_data(session: Session, user: User) -> list[str]:
    """删掉该账号的全部记录，返回旧文件的 storage_name，事务提交后再删文件。"""
    storage_names = [
        material.storage_name for material in _scoped(session, Material, user)
    ]

    for model in (
        Annotation,
        Task,
        StudyPlan,
        Material,
        Mistake,
        MindMap,
        Exam,
        Subject,
        Course,
        ScoreRule,
        BonusItem,
    ):
        for row in _scoped(session, model, user):
            session.delete(row)
    return storage_names


def _require_dict(item: object, name: str) -> dict:
    if not isinstance(item, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"备份里的 {name} 格式不正确")
    return item


def _restore(
    session: Session,
    user: User,
    manifest: dict,
    archive: zipfile.ZipFile,
    names: list[str],
    written: list[Path],
) -> int:
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    restored = 0

    subject_map: dict[int, int] = {}
    for raw in manifest.get("subjects") or []:
        item = _require_dict(raw, "subjects")
        subject = _build(Subject, item, user.id)
        session.add(subject)
        session.flush()
        subject_map[int(item.get("id"))] = subject.id

    exam_map: dict[int, int] = {}
    for raw in manifest.get("exams") or []:
        item = _require_dict(raw, "exams")
        subject_id = subject_map.get(int(item.get("subject_id") or 0))
        if subject_id is None:
            continue
        exam = _build(Exam, item, user.id, subject_id=subject_id)
        session.add(exam)
        session.flush()
        exam_map[int(item.get("id"))] = exam.id

    for raw in manifest.get("materials") or []:
        item = _require_dict(raw, "materials")
        subject_id = subject_map.get(int(item.get("subject_id") or 0))
        if subject_id is None:
            continue

        old_storage = str(item.get("storage_name") or "")
        new_storage = f"{uuid4().hex}{Path(old_storage).suffix}"
        member = f"{UPLOADS_PREFIX}{old_storage}"
        if old_storage and member in names:
            target = settings.uploads_dir / new_storage
            target.write_bytes(archive.read(member))
            written.append(target)
            restored += 1
        elif old_storage:
            continue  # 文件缺失的资料直接跳过，避免库里留下空记录

        material = _build(
            Material,
            {**item, "storage_name": new_storage},
            user.id,
            subject_id=subject_id,
        )
        session.add(material)
        session.flush()

        for raw_note in item.get("annotations") or []:
            note = _require_dict(raw_note, "annotations")
            session.add(
                Annotation(
                    user_id=user.id,
                    material_id=material.id,
                    page=int(note.get("page") or 1),
                    payload=str(note.get("payload") or "[]"),
                )
            )

    for raw in manifest.get("mistakes") or []:
        item = _require_dict(raw, "mistakes")
        subject_id = subject_map.get(int(item.get("subject_id") or 0))
        if subject_id is None:
            continue
        session.add(_build(Mistake, item, user.id, subject_id=subject_id))

    for raw in manifest.get("maps") or []:
        item = _require_dict(raw, "maps")
        subject_id = subject_map.get(int(item.get("subject_id") or 0))
        if subject_id is None:
            continue
        session.add(_build(MindMap, item, user.id, subject_id=subject_id))

    for raw in manifest.get("plans") or []:
        item = _require_dict(raw, "plans")
        exam_id = exam_map.get(int(item.get("exam_id") or 0))
        if exam_id is None:
            continue
        session.add(_build(StudyPlan, item, user.id, exam_id=exam_id))

    for raw in manifest.get("tasks") or []:
        item = _require_dict(raw, "tasks")
        exam_id = exam_map.get(int(item.get("exam_id") or 0))
        subject_id = subject_map.get(int(item.get("subject_id") or 0))
        if item.get("exam_id") and exam_id is None:
            continue
        if item.get("subject_id") and subject_id is None:
            continue
        session.add(
            _build(Task, item, user.id, subject_id=subject_id, exam_id=exam_id)
        )

    for raw in manifest.get("courses") or []:
        session.add(_build(Course, _require_dict(raw, "courses"), user.id))
    for raw in manifest.get("rules") or []:
        session.add(_build(ScoreRule, _require_dict(raw, "rules"), user.id))
    for raw in manifest.get("bonus") or []:
        session.add(_build(BonusItem, _require_dict(raw, "bonus"), user.id))

    weights = (manifest.get("settings") or {}).get("score_weights")
    if isinstance(weights, str) and weights.strip():
        save_setting(session, user.id, WEIGHTS_KEY, weights)

    return restored


@router.post("/import")
async def import_backup(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, int]:
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "文件为空")

    try:
        archive = zipfile.ZipFile(BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "不是合法的备份文件") from exc

    names = archive.namelist()
    if MANIFEST not in names:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "备份格式过旧（缺少 manifest.json），请用新版本重新导出",
        )
    # 防止 zip 路径穿越
    for name in names:
        if name.startswith("/") or ".." in Path(name).parts:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "备份文件包含非法路径")

    try:
        manifest = json.loads(archive.read(MANIFEST).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "备份内容已损坏") from exc
    if not isinstance(manifest, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "备份内容格式不正确")
    if manifest.get("version") != FORMAT_VERSION:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "不支持的备份版本")

    # 清空与重建放在同一个事务里：导入失败整体回滚，旧文件等提交成功后再删
    old_storage = _delete_user_data(session, user)
    session.flush()

    written: list[Path] = []
    try:
        restored = _restore(session, user, manifest, archive, names, written)
        session.commit()
    except HTTPException:
        session.rollback()
        for path in written:
            path.unlink(missing_ok=True)
        raise
    except Exception as exc:  # noqa: BLE001  备份内容不可预期，统一转成 400
        session.rollback()
        for path in written:
            path.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "备份内容无法导入") from exc

    for name in old_storage:
        (settings.uploads_dir / name).unlink(missing_ok=True)

    return {"ok": 1, "uploads": restored}
