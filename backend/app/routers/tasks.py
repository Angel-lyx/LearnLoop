import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import Exam, Subject, Task
from ..schemas_study import TaskCreate, TaskRead, TaskUpdate
from ..services.planner import merge_today

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
def list_tasks(
    day: date | None = None,
    include_overdue: bool = True,
    subject_id: int | None = None,
    session: Session = Depends(get_session),
) -> list[dict]:
    target = day or date.today()
    statement = select(Task).where(Task.due_date <= target)
    if subject_id is not None:
        statement = statement.where(Task.subject_id == subject_id)
    rows = session.exec(statement.order_by(Task.due_date)).all()
    data = [
        {
            "id": task.id,
            "subject_id": task.subject_id,
            "exam_id": task.exam_id,
            "title": task.title,
            "due_date": task.due_date,
            "done": task.done,
            "source": task.source,
            "detail": task.detail,
            "resources": _parse_resources(task.resources),
        }
        for task in rows
    ]
    return merge_today(data, target, include_overdue)


def _parse_resources(raw: str) -> list[dict]:
    try:
        parsed = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def _to_read(task: Task) -> dict:
    return {
        "id": task.id,
        "subject_id": task.subject_id,
        "exam_id": task.exam_id,
        "title": task.title,
        "due_date": task.due_date,
        "done": task.done,
        "source": task.source,
        "detail": task.detail,
        "resources": _parse_resources(task.resources),
    }


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate, session: Session = Depends(get_session)
) -> dict:
    if payload.subject_id is not None and session.get(Subject, payload.subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")
    if payload.exam_id is not None and session.get(Exam, payload.exam_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "考试不存在")
    task = Task(
        title=payload.title.strip(),
        due_date=payload.due_date,
        subject_id=payload.subject_id,
        exam_id=payload.exam_id,
        source="manual",
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return _to_read(task)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int, payload: TaskUpdate, session: Session = Depends(get_session)
) -> dict:
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "任务不存在")
    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.done is not None:
        task.done = payload.done
    session.add(task)
    session.commit()
    session.refresh(task)
    return _to_read(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, session: Session = Depends(get_session)) -> None:
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "任务不存在")
    session.delete(task)
    session.commit()
