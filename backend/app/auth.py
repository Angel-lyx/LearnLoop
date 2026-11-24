import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import TypeVar

from fastapi import Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from .config import settings
from .db import get_session
from .models import Setting, User, UserSession, utcnow

HASH_ALGORITHM = "pbkdf2_sha256"
HASH_ITERATIONS = 210_000

# 同一账号短时间连续失败后拒绝登录，避免公网被撞库
_failures: dict[str, list[float]] = {}

T = TypeVar("T")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), HASH_ITERATIONS
    )
    return f"{HASH_ALGORITHM}${HASH_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != HASH_ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("ascii"), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), expected)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_username(username: str) -> str:
    return username.strip().lower()


def create_session(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(days=settings.session_days)
    session.add(
        UserSession(user_id=user.id, token_hash=hash_token(token), expires_at=expires)
    )
    user.last_login_at = utcnow()
    session.add(user)
    session.commit()
    return token


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/")


def get_current_user(
    request: Request, session: Session = Depends(get_session)
) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "请先登录")

    record = session.exec(
        select(UserSession).where(UserSession.token_hash == hash_token(token))
    ).first()
    if record is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "登录已失效，请重新登录")

    if record.expires_at <= utcnow():
        session.delete(record)
        session.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "登录已过期，请重新登录")

    user = session.get(User, record.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "账号不存在")
    return user


def get_optional_user(
    request: Request, session: Session = Depends(get_session)
) -> User | None:
    """没登录时返回 None，供 /api/auth/me 这类「探测状态」的接口使用。"""
    try:
        return get_current_user(request, session)
    except HTTPException:
        return None


def owned(
    session: Session,
    model: type[T],
    object_id: int,
    user: User,
    detail: str = "对象不存在",
) -> T:
    """取对象并确认属于当前账号；不属于也按「不存在」处理，避免泄露 id 是否存在。"""
    obj = session.get(model, object_id)
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail)
    return obj


def get_setting(session: Session, user_id: int, key: str) -> str:
    record = session.get(Setting, (user_id, key))
    return (record.value if record else "").strip()


def save_setting(session: Session, user_id: int, key: str, value: str) -> None:
    record = session.get(Setting, (user_id, key))
    if record is None:
        record = Setting(user_id=user_id, key=key, value=value)
    else:
        record.value = value
        record.updated_at = utcnow()
    session.add(record)


# --- 登录失败节流 ---------------------------------------------------------


def _throttle_enabled() -> bool:
    return settings.login_max_failures > 0


def _failure_window() -> float:
    return max(settings.login_lockout_minutes, 1) * 60


def _recent_failures(key: str) -> list[float]:
    now = time.monotonic()
    window = _failure_window()
    attempts = [item for item in _failures.get(key, []) if now - item < window]
    if attempts:
        _failures[key] = attempts
    else:
        _failures.pop(key, None)
    return attempts


def check_login_allowed(username: str) -> None:
    if not _throttle_enabled():
        return
    if len(_recent_failures(normalize_username(username))) >= settings.login_max_failures:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"失败次数过多，请 {settings.login_lockout_minutes} 分钟后再试",
        )


def record_login_failure(username: str) -> None:
    if not _throttle_enabled():
        return
    key = normalize_username(username)
    attempts = _recent_failures(key)
    attempts.append(time.monotonic())
    _failures[key] = attempts


def clear_login_failures(username: str) -> None:
    _failures.pop(normalize_username(username), None)


def reset_throttle() -> None:
    """测试用：清空失败记录。"""
    _failures.clear()
