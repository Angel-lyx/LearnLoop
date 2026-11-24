import base64
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import BonusItem, Course, ScoreRule, Setting, utcnow
from ..schemas_research import (
    BonusCreate,
    BonusRead,
    CompositeStats,
    CourseCreate,
    CourseDraft,
    CourseParseRequest,
    CourseRead,
    CourseStats,
    OverviewRead,
    RuleCreate,
    RuleDraft,
    RuleParseRequest,
    RuleRead,
    WeightsRead,
    WeightsUpdate,
    ZongceStats,
)
from ..services.deps import get_llm
from ..services.llm import COURSE_SYSTEM, RULE_SYSTEM, LLMClient, LLMError
from ..services.scores import (
    DIMENSIONS,
    CourseRow,
    composite_score,
    course_stats,
    dimension_totals,
)

router = APIRouter(prefix="/api/research", tags=["research"])

WEIGHTS_KEY = "score_weights"
DEFAULT_COURSE_WEIGHT = 0.7


def _get_course_weight(session: Session) -> float:
    record = session.get(Setting, WEIGHTS_KEY)
    if record is None or not record.value:
        return DEFAULT_COURSE_WEIGHT
    try:
        data = json.loads(record.value)
        value = float(data.get("course_weight", DEFAULT_COURSE_WEIGHT))
    except (json.JSONDecodeError, TypeError, ValueError):
        return DEFAULT_COURSE_WEIGHT
    return min(max(value, 0.0), 1.0)


@router.get("/courses", response_model=list[CourseRead])
def list_courses(session: Session = Depends(get_session)) -> list[Course]:
    return list(session.exec(select(Course).order_by(Course.created_at)).all())


@router.post("/courses", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate, session: Session = Depends(get_session)
) -> Course:
    course = Course(
        name=payload.name.strip(),
        credits=payload.credits,
        score=payload.score,
        category=payload.category,
        term=payload.term.strip(),
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: int, session: Session = Depends(get_session)) -> None:
    course = session.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "课程不存在")
    session.delete(course)
    session.commit()


@router.get("/rules", response_model=list[RuleRead])
def list_rules(session: Session = Depends(get_session)) -> list[ScoreRule]:
    return list(
        session.exec(
            select(ScoreRule).order_by(ScoreRule.dimension, ScoreRule.created_at)
        ).all()
    )


@router.post("/rules", response_model=RuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(payload: RuleCreate, session: Session = Depends(get_session)) -> ScoreRule:
    rule = ScoreRule(
        dimension=payload.dimension, name=payload.name.strip(), score=payload.score
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, session: Session = Depends(get_session)) -> None:
    rule = session.get(ScoreRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "规则不存在")
    session.delete(rule)
    session.commit()


def _normalize_rules(raw: dict) -> list[RuleDraft]:
    drafts: list[RuleDraft] = []
    for item in raw.get("rules") or []:
        if not isinstance(item, dict):
            continue
        dimension = str(item.get("dimension", "")).strip()
        name = str(item.get("name", "")).strip()
        if dimension not in DIMENSIONS or not name:
            continue
        try:
            score = float(item.get("score", 0))
        except (TypeError, ValueError):
            continue
        drafts.append(
            RuleDraft(dimension=dimension, name=name[:120], score=min(max(score, 0), 100))
        )
    return drafts


@router.post("/rules/parse", response_model=list[RuleDraft])
async def parse_rules(
    payload: RuleParseRequest, llm: LLMClient = Depends(get_llm)
) -> list[RuleDraft]:
    try:
        raw = await llm.chat_json(
            RULE_SYSTEM, f"请把下面的综测细则整理成规则条目：\n{payload.text}"
        )
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    drafts = _normalize_rules(raw)
    if not drafts:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "没有解析出可用规则，请检查原文")
    return drafts


async def _extract_text(llm: LLMClient, filename: str, content: bytes) -> str:
    """把上传的 PDF / 图片转成文字，供后续结构化使用。"""
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return await llm.ocr(filename, content)
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        mime = "image/png" if suffix == ".png" else f"image/{suffix.lstrip('.')}"
        encoded = base64.b64encode(content).decode("ascii")
        return await llm.chat_text(
            "你负责转写图片中的文字，只输出文字内容。",
            "请转写这张图片里的文字。",
            [f"data:{mime};base64,{encoded}"],
        )
    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"暂不支持 {suffix}")


async def _read_upload(file: UploadFile) -> tuple[str, bytes]:
    content = await file.read()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "文件为空")
    return file.filename or "upload", content


@router.post("/rules/parse-file", response_model=list[RuleDraft])
async def parse_rules_file(
    file: UploadFile = File(...),
    llm: LLMClient = Depends(get_llm),
) -> list[RuleDraft]:
    filename, content = await _read_upload(file)
    try:
        text = await _extract_text(llm, filename, content)
        raw = await llm.chat_json(
            RULE_SYSTEM, f"请把下面的综测细则整理成规则条目：\n{text}"
        )
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc

    drafts = _normalize_rules(raw)
    if not drafts:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "没有解析出可用规则")
    return drafts


def _normalize_courses(raw: dict) -> list[CourseDraft]:
    drafts: list[CourseDraft] = []
    for item in raw.get("courses") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        try:
            credits = float(item.get("credits", 0))
            score = float(item.get("score", 0))
        except (TypeError, ValueError):
            continue
        if credits <= 0 or not 0 <= score <= 100:
            continue
        category = (
            "elective"
            if str(item.get("category", "")).lower().startswith("elect")
            else "required"
        )
        drafts.append(
            CourseDraft(
                name=name[:120],
                credits=min(credits, 30),
                score=score,
                category=category,
            )
        )
    return drafts


@router.post("/courses/parse", response_model=list[CourseDraft])
async def parse_courses(
    payload: CourseParseRequest, llm: LLMClient = Depends(get_llm)
) -> list[CourseDraft]:
    try:
        raw = await llm.chat_json(COURSE_SYSTEM, f"请整理下面的成绩单：\n{payload.text}")
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    drafts = _normalize_courses(raw)
    if not drafts:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "没有识别出课程")
    return drafts


@router.post("/courses/parse-file", response_model=list[CourseDraft])
async def parse_courses_file(
    file: UploadFile = File(...),
    llm: LLMClient = Depends(get_llm),
) -> list[CourseDraft]:
    filename, content = await _read_upload(file)
    try:
        text = await _extract_text(llm, filename, content)
        raw = await llm.chat_json(COURSE_SYSTEM, f"请整理下面的成绩单：\n{text}")
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    drafts = _normalize_courses(raw)
    if not drafts:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "没有识别出课程")
    return drafts


@router.post("/bonus/parse-file", response_model=list[RuleDraft])
async def parse_bonus_file(
    file: UploadFile = File(...),
    llm: LLMClient = Depends(get_llm),
) -> list[RuleDraft]:
    """从证书/奖状图片里提取可加分的条目。"""
    filename, content = await _read_upload(file)
    try:
        text = await _extract_text(llm, filename, content)
        raw = await llm.chat_json(
            RULE_SYSTEM, f"下面是获奖证书或加分材料的文字，请提取可加分的条目：\n{text}"
        )
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    drafts = _normalize_rules(raw)
    if not drafts:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "没有识别出可加分的条目")
    return drafts


@router.get("/bonus", response_model=list[BonusRead])
def list_bonus(session: Session = Depends(get_session)) -> list[BonusItem]:
    return list(
        session.exec(
            select(BonusItem).order_by(BonusItem.dimension, BonusItem.created_at)
        ).all()
    )


@router.post("/bonus", response_model=BonusRead, status_code=status.HTTP_201_CREATED)
def create_bonus(
    payload: BonusCreate, session: Session = Depends(get_session)
) -> BonusItem:
    item = BonusItem(
        dimension=payload.dimension,
        title=payload.title.strip(),
        score=payload.score,
        note=payload.note.strip(),
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/bonus/{bonus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bonus(bonus_id: int, session: Session = Depends(get_session)) -> None:
    item = session.get(BonusItem, bonus_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "加分项不存在")
    session.delete(item)
    session.commit()


@router.get("/weights", response_model=WeightsRead)
def read_weights(session: Session = Depends(get_session)) -> WeightsRead:
    return WeightsRead(course_weight=_get_course_weight(session))


@router.put("/weights", response_model=WeightsRead)
def save_weights(
    payload: WeightsUpdate, session: Session = Depends(get_session)
) -> WeightsRead:
    record = session.get(Setting, WEIGHTS_KEY)
    value = json.dumps({"course_weight": payload.course_weight})
    if record is None:
        record = Setting(key=WEIGHTS_KEY, value=value)
    else:
        record.value = value
        record.updated_at = utcnow()
    session.add(record)
    session.commit()
    return WeightsRead(course_weight=payload.course_weight)


@router.get("/overview", response_model=OverviewRead)
def overview(session: Session = Depends(get_session)) -> OverviewRead:
    courses = [
        CourseRow(credits=c.credits, score=c.score, category=c.category)
        for c in session.exec(select(Course)).all()
    ]
    stats = course_stats(courses)

    bonus = session.exec(select(BonusItem)).all()
    totals = dimension_totals([(item.dimension, item.score) for item in bonus])
    zongce_total = round(sum(totals.values()), 2)

    weight = _get_course_weight(session)
    composite = composite_score(stats["weighted_average"], zongce_total, weight)

    return OverviewRead(
        courses=CourseStats(**stats),
        zongce=ZongceStats(dimensions=totals, total=zongce_total),
        composite=CompositeStats(
            course_weight=weight,
            course_score=stats["weighted_average"],
            zongce_score=zongce_total,
            score=composite,
        ),
    )
