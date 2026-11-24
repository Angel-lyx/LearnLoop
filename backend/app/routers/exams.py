import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import Exam, Material, MindMap, Mistake, Subject, Task
from ..schemas_study import AIPlanResult, ExamCreate, ExamRead, PlanDay, PlanResource, PlanTaskItem, TaskRead
from ..services.deps import get_llm
from ..services.llm import PLAN_SYSTEM, LLMClient, LLMError
from ..services.planner import build_plan
from .tasks import _to_read as task_to_read

router = APIRouter(prefix="/api", tags=["exams"])


def _to_read(exam: Exam, today: date) -> dict:
    return {
        "id": exam.id,
        "subject_id": exam.subject_id,
        "title": exam.title,
        "exam_date": exam.exam_date,
        "scope": exam.scope,
        "created_at": exam.created_at,
        "days_left": (exam.exam_date - today).days,
    }


@router.get("/exams", response_model=list[ExamRead])
def list_all_exams(session: Session = Depends(get_session)) -> list[dict]:
    today = date.today()
    rows = session.exec(select(Exam).order_by(Exam.exam_date)).all()
    return [_to_read(exam, today) for exam in rows]


@router.get("/subjects/{subject_id}/exams", response_model=list[ExamRead])
def list_exams(
    subject_id: int, session: Session = Depends(get_session)
) -> list[dict]:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")
    today = date.today()
    rows = session.exec(
        select(Exam).where(Exam.subject_id == subject_id).order_by(Exam.exam_date)
    ).all()
    return [_to_read(exam, today) for exam in rows]


@router.post(
    "/subjects/{subject_id}/exams",
    response_model=ExamRead,
    status_code=status.HTTP_201_CREATED,
)
def create_exam(
    subject_id: int, payload: ExamCreate, session: Session = Depends(get_session)
) -> dict:
    if session.get(Subject, subject_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")
    exam = Exam(
        subject_id=subject_id,
        title=payload.title.strip(),
        exam_date=payload.exam_date,
        scope=payload.scope.strip(),
    )
    session.add(exam)
    session.commit()
    session.refresh(exam)
    return _to_read(exam, date.today())


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(exam_id: int, session: Session = Depends(get_session)) -> None:
    exam = session.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "考试不存在")
    for task in session.exec(select(Task).where(Task.exam_id == exam_id)).all():
        session.delete(task)
    session.delete(exam)
    session.commit()


def _collect_items(session: Session, subject_id: int, scope: str) -> list[str]:
    items: list[str] = []
    if scope:
        items.append(f"明确考试范围：{scope[:40]}")

    materials = session.exec(
        select(Material).where(Material.subject_id == subject_id).order_by(Material.created_at)
    ).all()
    items.extend(f"复习资料：{material.title[:30]}" for material in materials)

    mistakes = session.exec(
        select(Mistake).where(
            Mistake.subject_id == subject_id, Mistake.status == "unmastered"
        )
    ).all()
    items.extend(f"重做错题：{mistake.question.strip()[:30]}" for mistake in mistakes)

    maps = session.exec(select(MindMap).where(MindMap.subject_id == subject_id)).all()
    items.extend(f"回顾导图：{mindmap.title[:30]}" for mindmap in maps)

    # 去重并限制条数，避免计划过长
    unique: list[str] = []
    for item in items:
        if item not in unique:
            unique.append(item)

    # 保底：即使还没上传资料/错题，也要给出可执行的复习节奏
    for fallback in ("通读教材与笔记", "重做错题本", "限时模拟自测"):
        if len(unique) >= 3:
            break
        if fallback not in unique:
            unique.append(fallback)

    return unique[:30]


@router.post("/exams/{exam_id}/plan", response_model=list[TaskRead])
def generate_plan(
    exam_id: int, session: Session = Depends(get_session)
) -> list[dict]:
    exam = session.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "考试不存在")

    today = date.today()
    if exam.exam_date < today:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "考试日期已过，无法生成计划")

    items = _collect_items(session, exam.subject_id, exam.scope)
    plan = build_plan(exam.exam_date, today, items)

    # 重新生成时清掉旧计划，保留手动任务
    for old in session.exec(
        select(Task).where(Task.exam_id == exam_id, Task.source == "plan")
    ).all():
        session.delete(old)

    created: list[Task] = []
    for due, title in plan:
        task = Task(
            subject_id=exam.subject_id,
            exam_id=exam_id,
            title=title,
            due_date=due,
            source="plan",
        )
        session.add(task)
        created.append(task)

    session.commit()
    for task in created:
        session.refresh(task)
    return [task_to_read(task) for task in created]
    return created
