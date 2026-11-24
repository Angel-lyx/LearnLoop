import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import Mistake, Subject, utcnow
from ..schemas import MistakeCreate, MistakeRead, MistakeUpdate

router = APIRouter(prefix="/api", tags=["mistakes"])


def _to_read(mistake: Mistake) -> dict:
    try:
        points = json.loads(mistake.knowledge_points or "[]")
    except json.JSONDecodeError:
        points = []
    try:
        variants = json.loads(mistake.variants or "[]")
    except json.JSONDecodeError:
        variants = []
    return {
        "id": mistake.id,
        "subject_id": mistake.subject_id,
        "question": mistake.question,
        "answer": mistake.answer,
        "error_analysis": mistake.error_analysis,
        "solution": mistake.solution,
        "knowledge_points": points if isinstance(points, list) else [],
        "variants": variants if isinstance(variants, list) else [],
        "status": mistake.status,
        "created_at": mistake.created_at,
        "updated_at": mistake.updated_at,
    }


def _get_or_404(session: Session, mistake_id: int) -> Mistake:
    mistake = session.get(Mistake, mistake_id)
    if mistake is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "错题不存在")
    return mistake


@router.get("/subjects/{subject_id}/mistakes", response_model=list[MistakeRead])
def list_mistakes(
    subject_id: int,
    status_filter: str | None = Query(default=None, alias="status"),
    session: Session = Depends(get_session),
) -> list[dict]:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")
    statement = select(Mistake).where(Mistake.subject_id == subject_id)
    if status_filter:
        statement = statement.where(Mistake.status == status_filter)
    statement = statement.order_by(Mistake.created_at.desc())
    return [_to_read(item) for item in session.exec(statement).all()]


@router.post(
    "/subjects/{subject_id}/mistakes",
    response_model=MistakeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_mistake(
    subject_id: int, payload: MistakeCreate, session: Session = Depends(get_session)
) -> dict:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")

    mistake = Mistake(
        subject_id=subject_id,
        question=payload.question.strip(),
        answer=payload.answer.strip(),
        error_analysis=payload.error_analysis.strip(),
        solution=payload.solution.strip(),
        knowledge_points=json.dumps(payload.knowledge_points, ensure_ascii=False),
        variants=json.dumps(
            [variant.model_dump() for variant in payload.variants], ensure_ascii=False
        ),
    )
    session.add(mistake)
    session.commit()
    session.refresh(mistake)
    return _to_read(mistake)


@router.get("/mistakes/{mistake_id}", response_model=MistakeRead)
def get_mistake(mistake_id: int, session: Session = Depends(get_session)) -> dict:
    return _to_read(_get_or_404(session, mistake_id))


@router.patch("/mistakes/{mistake_id}", response_model=MistakeRead)
def update_mistake(
    mistake_id: int, payload: MistakeUpdate, session: Session = Depends(get_session)
) -> dict:
    mistake = _get_or_404(session, mistake_id)
    if payload.question is not None:
        mistake.question = payload.question.strip()
    if payload.answer is not None:
        mistake.answer = payload.answer.strip()
    if payload.error_analysis is not None:
        mistake.error_analysis = payload.error_analysis.strip()
    if payload.solution is not None:
        mistake.solution = payload.solution.strip()
    if payload.knowledge_points is not None:
        mistake.knowledge_points = json.dumps(payload.knowledge_points, ensure_ascii=False)
    if payload.variants is not None:
        mistake.variants = json.dumps(
            [variant.model_dump() for variant in payload.variants], ensure_ascii=False
        )
    if payload.status is not None:
        mistake.status = payload.status
    mistake.updated_at = utcnow()
    session.add(mistake)
    session.commit()
    session.refresh(mistake)
    return _to_read(mistake)


@router.delete("/mistakes/{mistake_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mistake(mistake_id: int, session: Session = Depends(get_session)) -> None:
    mistake = _get_or_404(session, mistake_id)
    session.delete(mistake)
    session.commit()
