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


def _plan_context(session: Session, exam: Exam, subject: Subject, today: date) -> str:
    days = (exam.exam_date - today).days
    lines = [
        f"学科：{subject.name}",
        f"考试：{exam.title}",
        f"考试日期：{exam.exam_date}（今天 {today}，还有 {days} 天）",
    ]
    if exam.scope:
        lines.append(f"考试范围：{exam.scope}")

    materials = session.exec(
        select(Material).where(Material.subject_id == subject.id)
    ).all()
    if materials:
        lines.append("已有资料：" + "、".join(m.title[:24] for m in materials[:10]))

    mistakes = session.exec(
        select(Mistake).where(Mistake.subject_id == subject.id)
    ).all()
    if mistakes:
        lines.append(f"错题数量：{len(mistakes)}")
        points: list[str] = []
        for mistake in mistakes[:8]:
            try:
                points.extend(str(p) for p in json.loads(mistake.knowledge_points or "[]"))
            except json.JSONDecodeError:
                continue
        if points:
            lines.append("错题涉及知识点：" + "、".join(dict.fromkeys(points))[:300])
    return "\n".join(lines)


def _search_queries(subject: Subject, exam: Exam) -> list[str]:
    focus = (exam.scope or exam.title).strip()[:60]
    return [
        f"{subject.name} {focus} 复习重点 知识点",
        f"{subject.name} {exam.title} 真题 题型 解题方法",
    ]


def _normalize_plan(
    raw: dict, today: date, exam_date: date, allowed: dict[str, str]
) -> tuple[str, list[PlanDay]]:
    summary = str(raw.get("summary") or "").strip()[:400]
    days: list[PlanDay] = []
    for item in raw.get("days") or []:
        if not isinstance(item, dict):
            continue
        try:
            day = date.fromisoformat(str(item.get("date", ""))[:10])
        except ValueError:
            continue
        if not (today <= day < exam_date):
            continue

        tasks: list[PlanTaskItem] = []
        for task in item.get("tasks") or []:
            if not isinstance(task, dict):
                continue
            title = str(task.get("title") or "").strip()
            if not title:
                continue
            try:
                minutes = int(task.get("minutes") or 45)
            except (TypeError, ValueError):
                minutes = 45
            tasks.append(
                PlanTaskItem(
                    title=title[:120],
                    detail=str(task.get("detail") or "").strip()[:300],
                    minutes=min(max(minutes, 15), 180),
                )
            )
        if not tasks:
            continue

        resources = []
        for res in item.get("resources") or []:
            if not isinstance(res, dict):
                continue
            url = str(res.get("url") or "").strip()
            if url in allowed:
                resources.append(PlanResource(title=allowed[url][:120], url=url))

        days.append(
            PlanDay(
                date=day,
                focus=str(item.get("focus") or "").strip()[:20],
                tasks=tasks[:5],
                resources=resources[:4],
            )
        )
    days.sort(key=lambda d: d.date)
    return summary, days


@router.post("/exams/{exam_id}/plan/ai", response_model=AIPlanResult)
async def generate_ai_plan(
    exam_id: int,
    llm: LLMClient = Depends(get_llm),
    session: Session = Depends(get_session),
) -> AIPlanResult:
    exam = session.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "考试不存在")
    subject = session.get(Subject, exam.subject_id)
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学科不存在")

    today = date.today()
    if exam.exam_date <= today:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "考试日期已过或就在今天，无法生成计划")

    # 1. 联网检索资料（失败不阻断，只用已有数据生成）
    sources: dict[str, str] = {}
    for query in _search_queries(subject, exam):
        try:
            for row in await llm.search(query, 5):
                sources.setdefault(row["url"], row["title"])
        except LLMError:
            continue
    source_text = "\n".join(
        f"- {title} | {url}" for url, title in list(sources.items())[:8]
    ) or "（没有检索到外部资料）"

    # 2. 让模型排出逐日计划
    prompt = (
        f"{_plan_context(session, exam, subject, today)}\n\n"
        f"检索到的外部资料：\n{source_text}\n\n"
        f"请从 {today} 排到 {(exam.exam_date - timedelta(days=1))}，"
        "每天给出 2-4 个可执行任务。"
    )
    try:
        raw = await llm.chat_json(PLAN_SYSTEM, prompt)
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc

    summary, days = _normalize_plan(raw, today, exam.exam_date, sources)
    if not days:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "模型没有给出有效计划，请重试")

    # 3. 覆盖旧 AI 计划，写入新任务
    for old in session.exec(
        select(Task).where(Task.exam_id == exam_id, Task.source == "ai")
    ).all():
        session.delete(old)

    created: list[Task] = []
    for day in days:
        resources_json = json.dumps(
            [res.model_dump() for res in day.resources], ensure_ascii=False
        )
        for item in day.tasks:
            task = Task(
                subject_id=exam.subject_id,
                exam_id=exam_id,
                title=item.title,
                detail=(item.detail or "")[:600],
                resources=resources_json,
                due_date=day.date,
                source="ai",
            )
            session.add(task)
            created.append(task)

    session.commit()
    for task in created:
        session.refresh(task)

    return AIPlanResult(
        summary=summary or f"已按 {len(days)} 天排好计划",
        days=days,
        tasks=[task_to_read(task) for task in created],
    )


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
