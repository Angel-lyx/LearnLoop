from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from ..auth import get_current_user, owned
from ..config import settings
from ..db import get_session
from ..models import (
    Annotation,
    Exam,
    Material,
    MindMap,
    Mistake,
    StudyPlan,
    Subject,
    Task,
    User,
    utcnow,
)
from ..schemas import SubjectCreate, SubjectRead, SubjectUpdate

router = APIRouter(prefix="/api/subjects", tags=["subjects"])


@router.get("", response_model=list[SubjectRead])
def list_subjects(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Subject]:
    return list(session.exec(select(Subject).where(Subject.user_id == user.id)).all())


@router.post("", response_model=SubjectRead, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Subject:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "学科名称不能为空")
    if session.exec(
        select(Subject).where(Subject.user_id == user.id, Subject.name == name)
    ).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "学科名称已存在")
    subject = Subject(
        user_id=user.id, name=name, color=payload.color, icon=payload.icon
    )
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return subject


@router.patch("/{subject_id}", response_model=SubjectRead)
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Subject:
    subject = owned(session, Subject, subject_id, user, "学科不存在")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "学科名称不能为空")
        duplicated = session.exec(
            select(Subject).where(
                Subject.user_id == user.id,
                Subject.name == name,
                Subject.id != subject_id,
            )
        ).first()
        if duplicated:
            raise HTTPException(status.HTTP_409_CONFLICT, "学科名称已存在")
        subject.name = name
    if payload.color is not None:
        subject.color = payload.color
    if payload.icon is not None:
        subject.icon = payload.icon
    if payload.archived is not None:
        subject.archived = payload.archived
    subject.updated_at = utcnow()
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    subject = owned(session, Subject, subject_id, user, "学科不存在")

    # 级联清理：资料（含文件与批注）、错题、导图、考试（含任务）
    for material in session.exec(
        select(Material).where(
            Material.subject_id == subject_id, Material.user_id == user.id
        )
    ).all():
        (settings.uploads_dir / material.storage_name).unlink(missing_ok=True)
        for annotation in session.exec(
            select(Annotation).where(Annotation.material_id == material.id)
        ).all():
            session.delete(annotation)
        session.delete(material)

    for mistake in session.exec(
        select(Mistake).where(
            Mistake.subject_id == subject_id, Mistake.user_id == user.id
        )
    ).all():
        session.delete(mistake)

    for mindmap in session.exec(
        select(MindMap).where(
            MindMap.subject_id == subject_id, MindMap.user_id == user.id
        )
    ).all():
        session.delete(mindmap)

    for exam in session.exec(
        select(Exam).where(Exam.subject_id == subject_id, Exam.user_id == user.id)
    ).all():
        for task in session.exec(select(Task).where(Task.exam_id == exam.id)).all():
            session.delete(task)
        for plan in session.exec(
            select(StudyPlan).where(StudyPlan.exam_id == exam.id)
        ).all():
            session.delete(plan)
        session.delete(exam)

    # 手动任务也一并清掉
    for task in session.exec(
        select(Task).where(
            Task.subject_id == subject_id,
            Task.exam_id.is_(None),
            Task.user_id == user.id,
        )
    ).all():
        session.delete(task)

    session.delete(subject)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
