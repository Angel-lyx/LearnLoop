import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import (
    Exam,
    Material,
    MindMap,
    Mistake,
    StudyPlan,
    Subject,
    Task,
    utcnow,
)
from ..schemas_study import (
    AIPlanRequest,
    AIPlanResult,
    ExamCreate,
    ExamRead,
    PlanCoverage,
    PlanDay,
    PlanQuizItem,
    PlanResource,
    PlanTaskItem,
    TaskRead,
)
from ..services.deps import get_llm
from ..services.llm import PLAN_SYSTEM, LLMClient, LLMError
from ..services.planner import build_plan
from .tasks import _to_read as task_to_read

router = APIRouter(prefix="/api", tags=["exams"])

# 只给最近的这些天写「考点速览 + 自测题」，更远的日期先排任务，避免一次生成过长被截断
DETAIL_DAYS = 10
MAX_COVERAGE = 24
MAX_SOURCES = 8


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
    for plan in session.exec(select(StudyPlan).where(StudyPlan.exam_id == exam_id)).all():
        session.delete(plan)
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
        lines.append(f"考试范围（用户填写，必须全部覆盖）：{exam.scope}")

    materials = session.exec(
        select(Material).where(Material.subject_id == subject.id)
    ).all()
    if materials:
        lines.append("学生已有资料：" + "、".join(m.title[:30] for m in materials[:10]))
    else:
        lines.append("学生还没有上传资料，以教材目录与常见考点为准。")

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
        lines.append("典型错题：" + "；".join(m.question.strip()[:40] for m in mistakes[:5]))
    return "\n".join(lines)


def _search_queries(subject: Subject, exam: Exam) -> list[str]:
    focus = (exam.scope or exam.title).strip()[:60]
    queries = [
        f"{subject.name} {focus} 高频考点 复习重点",
        f"{subject.name} {exam.title} 期末真题 题型 解题方法",
    ]
    if exam.scope:
        queries.append(f"{exam.scope[:40]} 公式 定理 易错点 总结")
    return queries


async def _gather_sources(
    llm: LLMClient, subject: Subject, exam: Exam
) -> tuple[dict[str, str], list[dict[str, str]], bool]:
    """联网找参考资料。单个查询失败不影响其他查询，全部失败时返回 failed=True。"""
    sources: dict[str, str] = {}
    snippets: list[dict[str, str]] = []
    failed = False
    for query in _search_queries(subject, exam):
        try:
            rows = await llm.search(query, 5)
        except LLMError:
            failed = True
            continue
        for row in rows:
            url = (row.get("url") or "").strip()
            if not url or url in sources:
                continue
            sources[url] = (row.get("title") or url)[:120]
            snippets.append(
                {
                    "title": sources[url],
                    "url": url,
                    "summary": str(row.get("summary") or "")[:200],
                }
            )
            if len(snippets) >= MAX_SOURCES:
                break
        if len(snippets) >= MAX_SOURCES:
            break
    return sources, snippets, failed


def _source_text(snippets: list[dict[str, str]]) -> str:
    if not snippets:
        return "（没有检索到外部资料）"
    return "\n".join(
        f"- {row['title']} | {row['url']}\n  摘要：{row['summary'] or '（无摘要）'}"
        for row in snippets
    )


def _source_note(snippets: list[dict[str, str]], failed: bool) -> str:
    if snippets:
        return f"已参考 {len(snippets)} 条网络资料"
    if failed:
        return "联网检索暂时不可用，已按你的资料与常见考点排期"
    return "没有检索到合适的网络资料，已按你的资料与常见考点排期"


def _detail_dates(today: date, exam_date: date) -> set[date]:
    last = min(exam_date - timedelta(days=1), today + timedelta(days=DETAIL_DAYS - 1))
    days: set[date] = set()
    cursor = today
    while cursor <= last:
        days.add(cursor)
        cursor += timedelta(days=1)
    return days


def _parse_day(value: object, today: date, exam_date: date) -> date | None:
    try:
        day = date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None
    if not (today <= day < exam_date):
        return None
    return day


def _normalize_plan(
    raw: dict,
    today: date,
    exam_date: date,
    allowed: dict[str, str],
    detail_dates: set[date],
) -> tuple[str, list[PlanCoverage], list[PlanDay]]:
    summary = str(raw.get("summary") or "").strip()[:600]

    coverage: list[PlanCoverage] = []
    seen: set[str] = set()
    for item in raw.get("coverage") or []:
        if not isinstance(item, dict):
            continue
        topic = str(item.get("topic") or "").strip()[:40]
        if not topic or topic in seen:
            continue
        seen.add(topic)
        weight = str(item.get("weight") or "").strip()
        if weight not in ("高频", "中频", "低频"):
            weight = ""
        coverage.append(
            PlanCoverage(
                topic=topic,
                date=_parse_day(item.get("date"), today, exam_date),
                weight=weight,
            )
        )
        if len(coverage) >= MAX_COVERAGE:
            break

    merged: dict[date, PlanDay] = {}
    for item in raw.get("days") or []:
        if not isinstance(item, dict):
            continue
        day = _parse_day(item.get("date"), today, exam_date)
        if day is None:
            continue
        entry = merged.setdefault(day, PlanDay(date=day))

        focus = str(item.get("focus") or "").strip()
        if focus:
            entry.focus = focus[:20]
        goal = str(item.get("goal") or "").strip()
        if goal:
            entry.goal = goal[:40]

        # 远期日期即使模型多写了精华，也只保留排期，避免一次生成过长
        if day in detail_dates:
            for note in item.get("notes") or []:
                text = str(note).strip()[:80]
                if text and text not in entry.notes and len(entry.notes) < 4:
                    entry.notes.append(text)
            for pitfall in item.get("pitfalls") or []:
                text = str(pitfall).strip()[:80]
                if text and text not in entry.pitfalls and len(entry.pitfalls) < 3:
                    entry.pitfalls.append(text)
            for quiz in item.get("quiz") or []:
                if not isinstance(quiz, dict) or len(entry.quiz) >= 2:
                    continue
                question = str(quiz.get("question") or "").strip()[:300]
                if not question:
                    continue
                entry.quiz.append(
                    PlanQuizItem(
                        question=question,
                        answer=str(quiz.get("answer") or "").strip()[:500],
                    )
                )

        for task in item.get("tasks") or []:
            if not isinstance(task, dict) or len(entry.tasks) >= 4:
                continue
            title = str(task.get("title") or "").strip()
            if not title:
                continue
            try:
                minutes = int(task.get("minutes") or 45)
            except (TypeError, ValueError):
                minutes = 45
            entry.tasks.append(
                PlanTaskItem(
                    title=title[:120],
                    detail=str(task.get("detail") or "").strip()[:300],
                    minutes=min(max(minutes, 10), 180),
                )
            )

        for res in item.get("resources") or []:
            if not isinstance(res, dict) or len(entry.resources) >= 4:
                continue
            url = str(res.get("url") or "").strip()
            if url in allowed:
                entry.resources.append(PlanResource(title=allowed[url][:120], url=url))

    days = [entry for entry in merged.values() if entry.tasks]
    days.sort(key=lambda entry: entry.date)
    return summary, coverage, days


def _save_plan(
    session: Session,
    exam_id: int,
    summary: str,
    source_note: str,
    coverage: list[PlanCoverage],
    days: list[PlanDay],
) -> None:
    record = session.exec(select(StudyPlan).where(StudyPlan.exam_id == exam_id)).first()
    if record is None:
        record = StudyPlan(exam_id=exam_id)
        session.add(record)
    record.summary = summary
    record.source_note = source_note
    record.coverage = json.dumps(
        [item.model_dump(mode="json") for item in coverage], ensure_ascii=False
    )
    record.days = json.dumps(
        [item.model_dump(mode="json") for item in days], ensure_ascii=False
    )
    record.updated_at = utcnow()


@router.get("/exams/{exam_id}/plan/ai", response_model=AIPlanResult)
def read_ai_plan(
    exam_id: int, session: Session = Depends(get_session)
) -> AIPlanResult:
    if session.get(Exam, exam_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "考试不存在")
    record = session.exec(select(StudyPlan).where(StudyPlan.exam_id == exam_id)).first()
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "还没有生成 AI 计划")
    try:
        days = [PlanDay.model_validate(item) for item in json.loads(record.days or "[]")]
        coverage = [
            PlanCoverage.model_validate(item)
            for item in json.loads(record.coverage or "[]")
        ]
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "计划数据已损坏，请重新生成"
        ) from exc
    return AIPlanResult(
        summary=record.summary,
        source_note=record.source_note,
        coverage=coverage,
        days=days,
        tasks=[],
    )


@router.post("/exams/{exam_id}/plan/ai", response_model=AIPlanResult)
async def generate_ai_plan(
    exam_id: int,
    payload: AIPlanRequest | None = None,
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

    daily_minutes = payload.daily_minutes if payload else 60
    detail_dates = _detail_dates(today, exam.exam_date)

    # 1. 联网检索资料（失败不阻断，只用已有数据生成）
    sources, snippets, search_failed = await _gather_sources(llm, subject, exam)
    source_note = _source_note(snippets, search_failed)

    # 2. 让模型排出逐日计划：范围 → 考频 → 精讲内容
    prompt = (
        f"{_plan_context(session, exam, subject, today)}\n\n"
        f"学生每天可投入：{daily_minutes} 分钟\n"
        f"精讲日（只有这些天填 notes/pitfalls/quiz）："
        f"{'、'.join(sorted(day.isoformat() for day in detail_dates))}\n"
        f"需要排期的范围：{today} 至 {exam.exam_date - timedelta(days=1)}，"
        f"共 {(exam.exam_date - today).days} 天。\n\n"
        f"检索到的外部资料（resources 只能从这里挑）：\n{_source_text(snippets)}\n\n"
        "请先拆解考试范围并标注考频，再按「补基础 → 专项突破 → 模拟回顾」排期。"
    )
    try:
        # 长周期计划（几十天）输出较长，给足超时与 token 预算
        raw = await llm.chat_json(
            PLAN_SYSTEM, prompt, max_tokens=8192, timeout=240
        )
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc

    summary, coverage, days = _normalize_plan(
        raw, today, exam.exam_date, sources, detail_dates
    )
    if not days:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "模型没有给出有效计划，请重试")

    # 3. 覆盖旧 AI 计划与任务，写入新的
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

    _save_plan(session, exam_id, summary, source_note, coverage, days)
    session.commit()
    for task in created:
        session.refresh(task)

    return AIPlanResult(
        summary=summary or f"已按 {len(days)} 天排好计划",
        source_note=source_note,
        coverage=coverage,
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
