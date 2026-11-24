from fastapi import Depends, HTTPException
from sqlmodel import Session

from ..config import settings
from ..db import get_session
from ..models import Setting
from .llm import LLMClient


def get_api_key(session: Session) -> str:
    """数据库里配置的 key 优先，其次回落到环境变量。"""
    record = session.get(Setting, "deepseek_api_key")
    if record and record.value.strip():
        return record.value.strip()
    return settings.deepseek_api_key.strip()


def get_llm(session: Session = Depends(get_session)) -> LLMClient:
    key = get_api_key(session)
    if not key:
        raise HTTPException(status_code=428, detail="还没有配置 API Key，请到设置页填写")
    return LLMClient(key)
