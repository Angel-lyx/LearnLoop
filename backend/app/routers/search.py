from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import Material, MindMap, Mistake, Subject, User

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def search(
    q: str = Query(min_length=1, max_length=50),
    limit: int = Query(default=8, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    keyword = q.strip()
    if not keyword:
        return {"subjects": [], "materials": [], "mistakes": [], "maps": []}

    subjects = session.exec(
        select(Subject)
        .where(Subject.user_id == user.id, Subject.name.contains(keyword))
        .limit(limit)
    ).all()
    materials = session.exec(
        select(Material)
        .where(Material.user_id == user.id, Material.title.contains(keyword))
        .limit(limit)
    ).all()
    mistakes = session.exec(
        select(Mistake)
        .where(Mistake.user_id == user.id, Mistake.question.contains(keyword))
        .limit(limit)
    ).all()
    maps = session.exec(
        select(MindMap)
        .where(MindMap.user_id == user.id, MindMap.title.contains(keyword))
        .limit(limit)
    ).all()

    return {
        "subjects": [
            {"id": item.id, "name": item.name, "color": item.color} for item in subjects
        ],
        "materials": [
            {
                "id": item.id,
                "title": item.title,
                "subject_id": item.subject_id,
                "kind": item.kind,
            }
            for item in materials
        ],
        "mistakes": [
            {
                "id": item.id,
                "question": item.question[:80],
                "subject_id": item.subject_id,
                "status": item.status,
            }
            for item in mistakes
        ],
        "maps": [
            {
                "id": item.id,
                "title": item.title,
                "subject_id": item.subject_id,
            }
            for item in maps
        ],
    }
