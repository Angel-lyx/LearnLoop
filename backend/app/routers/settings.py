from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from ..config import settings
from ..db import get_session
from ..models import Setting, utcnow
from ..schemas import AIKeyUpdate, AISettingsRead
from ..services.deps import get_llm
from ..services.llm import LLMClient, LLMError

router = APIRouter(prefix="/api/settings", tags=["settings"])

KEY_NAME = "deepseek_api_key"


def _read_state(session: Session) -> AISettingsRead:
    record = session.get(Setting, KEY_NAME)
    db_key = (record.value if record else "").strip()
    env_key = settings.deepseek_api_key.strip()
    if db_key:
        source = "database"
    elif env_key:
        source = "environment"
    else:
        source = "none"
    return AISettingsRead(
        configured=bool(db_key or env_key),
        model=settings.deepseek_model,
        base_url=settings.deepseek_base_url,
        source=source,
    )


@router.get("/ai", response_model=AISettingsRead)
def read_ai_settings(session: Session = Depends(get_session)) -> AISettingsRead:
    return _read_state(session)


@router.put("/ai", response_model=AISettingsRead)
def save_ai_key(
    payload: AIKeyUpdate, session: Session = Depends(get_session)
) -> AISettingsRead:
    key = payload.api_key.strip()
    if len(key) < 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "API Key 格式不正确")
    record = session.get(Setting, KEY_NAME)
    if record is None:
        record = Setting(key=KEY_NAME, value=key)
    else:
        record.value = key
        record.updated_at = utcnow()
    session.add(record)
    session.commit()
    return _read_state(session)


@router.delete("/ai", response_model=AISettingsRead)
def clear_ai_key(session: Session = Depends(get_session)) -> AISettingsRead:
    record = session.get(Setting, KEY_NAME)
    if record is not None:
        session.delete(record)
        session.commit()
    return _read_state(session)


@router.post("/ai/test")
async def test_ai_key(llm: LLMClient = Depends(get_llm)) -> dict[str, bool]:
    try:
        await llm.ping()
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    return {"ok": True}
