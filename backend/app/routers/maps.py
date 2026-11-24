import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import Exam, Material, MindMap, Mistake, Subject, utcnow
from ..schemas_study import MindMapCreate, MindMapRead, MindMapUpdate
from ..services.deps import get_llm
from ..services.llm import MAP_SYSTEM, LLMClient, LLMError

router = APIRouter(prefix="/api", tags=["maps"])


def _to_read(mindmap: MindMap) -> dict:
    try:
        data = json.loads(mindmap.data or "{}")
    except json.JSONDecodeError:
        data = {}
    return {
        "id": mindmap.id,
        "subject_id": mindmap.subject_id,
        "title": mindmap.title,
        "data": data,
        "created_at": mindmap.created_at,
        "updated_at": mindmap.updated_at,
    }


def _ensure_ids(node: dict, counter: list[int], depth: int = 0) -> dict:
    counter[0] += 1
    node["id"] = f"n{counter[0]}"
    children = node.get("children") or []
    if depth >= 3:
        children = []
    node["children"] = [
        _ensure_ids(child, counter, depth + 1)
        for child in children
        if isinstance(child, dict) and child.get("topic")
    ]
    return node


@router.get("/subjects/{subject_id}/maps", response_model=list[MindMapRead])
def list_maps(
    subject_id: int, session: Session = Depends(get_session)
) -> list[dict]:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")
    rows = session.exec(
        select(MindMap)
        .where(MindMap.subject_id == subject_id)
        .order_by(MindMap.created_at.desc())
    ).all()
    return [_to_read(item) for item in rows]


@router.post(
    "/subjects/{subject_id}/maps",
    response_model=MindMapRead,
    status_code=status.HTTP_201_CREATED,
)
def create_map(
    subject_id: int, payload: MindMapCreate, session: Session = Depends(get_session)
) -> dict:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")
    tree = {"nodeData": {"id": "root", "topic": payload.title, "children": []}}
    mindmap = MindMap(
        subject_id=subject_id, title=payload.title.strip(), data=json.dumps(tree, ensure_ascii=False)
    )
    session.add(mindmap)
    session.commit()
    session.refresh(mindmap)
    return _to_read(mindmap)


@router.get("/maps/{map_id}", response_model=MindMapRead)
def get_map(map_id: int, session: Session = Depends(get_session)) -> dict:
    mindmap = session.get(MindMap, map_id)
    if mindmap is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "导图不存在")
    return _to_read(mindmap)


@router.patch("/maps/{map_id}", response_model=MindMapRead)
def update_map(
    map_id: int, payload: MindMapUpdate, session: Session = Depends(get_session)
) -> dict:
    mindmap = session.get(MindMap, map_id)
    if mindmap is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "导图不存在")
    if payload.title is not None:
        mindmap.title = payload.title.strip()
    if payload.data is not None:
        mindmap.data = json.dumps(payload.data, ensure_ascii=False)
    mindmap.updated_at = utcnow()
    session.add(mindmap)
    session.commit()
    session.refresh(mindmap)
    return _to_read(mindmap)


@router.delete("/maps/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_map(map_id: int, session: Session = Depends(get_session)) -> None:
    mindmap = session.get(MindMap, map_id)
    if mindmap is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "导图不存在")
    session.delete(mindmap)
    session.commit()


def _build_context(session: Session, subject: Subject) -> str:
    parts: list[str] = [f"学科：{subject.name}"]

    materials = session.exec(
        select(Material).where(Material.subject_id == subject.id)
    ).all()
    if materials:
        parts.append("资料：" + "、".join(m.title[:30] for m in materials[:10]))

    mistakes = session.exec(
        select(Mistake).where(Mistake.subject_id == subject.id)
    ).all()
    if mistakes:
        points: list[str] = []
        for mistake in mistakes[:10]:
            try:
                points.extend(json.loads(mistake.knowledge_points or "[]"))
            except json.JSONDecodeError:
                continue
            if mistake.question:
                points.append(mistake.question[:30])
        if points:
            parts.append("错题涉及：" + "、".join(dict.fromkeys(points))[:400])

    exams = session.exec(select(Exam).where(Exam.subject_id == subject.id)).all()
    if exams:
        parts.append("考试：" + "、".join(f"{e.title}({e.exam_date})" for e in exams[:5]))

    return "\n".join(parts)


@router.post("/subjects/{subject_id}/maps/generate", response_model=MindMapRead)
async def generate_map(
    subject_id: int,
    llm: LLMClient = Depends(get_llm),
    session: Session = Depends(get_session),
) -> dict:
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")

    context = _build_context(session, subject)
    try:
        data = await llm.chat_json(
            MAP_SYSTEM, f"根据下面的学科材料，整理一张复习用思维导图：\n{context}"
        )
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc

    root = data.get("topic") or f"{subject.name} 复习"
    counter = [0]
    node = _ensure_ids(
        {
            "topic": str(root)[:40],
            "children": data.get("children") or [],
        },
        counter,
    )
    tree = {"nodeData": {**node, "id": "root"}}

    mindmap = MindMap(
        subject_id=subject_id,
        title=str(root)[:40],
        data=json.dumps(tree, ensure_ascii=False),
    )
    session.add(mindmap)
    session.commit()
    session.refresh(mindmap)
    return _to_read(mindmap)
