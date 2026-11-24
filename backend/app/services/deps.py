from fastapi import Depends, HTTPException
from sqlmodel import Session

from ..auth import get_current_user, get_setting
from ..config import settings
from ..db import get_session
from ..models import User
from .llm import LLMClient

KEY_NAME = "deepseek_api_key"


def get_api_key(session: Session, user_id: int) -> str:
    """账号自己配置的 key 优先，其次回落到环境变量里的共享 key。"""
    return get_setting(session, user_id, KEY_NAME) or settings.deepseek_api_key.strip()


def get_llm(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LLMClient:
    key = get_api_key(session, user.id)
    if not key:
        raise HTTPException(status_code=428, detail="还没有配置 API Key，请到设置页填写")
    return LLMClient(key)
