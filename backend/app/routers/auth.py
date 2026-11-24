import hmac
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from ..auth import (
    check_login_allowed,
    clear_login_failures,
    clear_session_cookie,
    create_session,
    get_current_user,
    get_optional_user,
    hash_password,
    hash_token,
    normalize_username,
    record_login_failure,
    set_session_cookie,
    verify_password,
)
from ..config import settings
from ..db import adopt_orphan_data, get_session
from ..models import User, UserSession
from ..schemas_auth import (
    AuthState,
    LoginRequest,
    PasswordChangeRequest,
    RegisterRequest,
    UserRead,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.\-\u4e00-\u9fff]{3,40}$")
# 账号不存在时也跑一次哈希，避免用响应时间判断用户名是否存在
DUMMY_HASH = hash_password("learnloop-placeholder-password")


def _state(user: User | None) -> AuthState:
    return AuthState(
        user=UserRead(id=user.id, username=user.username, created_at=user.created_at)
        if user
        else None,
        registration_open=settings.allow_registration,
        needs_invite_code=bool(settings.registration_code),
    )


@router.get("/me", response_model=AuthState)
def me(user: User | None = Depends(get_optional_user)) -> AuthState:
    return _state(user)


@router.post(
    "/register", response_model=AuthState, status_code=status.HTTP_201_CREATED
)
def register(
    payload: RegisterRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> AuthState:
    if not settings.allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "管理员已关闭注册")

    username = normalize_username(payload.username)
    if not USERNAME_PATTERN.match(payload.username.strip()):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "用户名需 3–40 位，只能包含中文、字母、数字、下划线、点或短横线",
        )

    if settings.registration_code and not hmac.compare_digest(
        payload.invite_code.strip(), settings.registration_code
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "邀请码不正确")

    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "用户名已被占用")

    user = User(username=username, password_hash=hash_password(payload.password))
    session.add(user)
    session.commit()
    session.refresh(user)

    # 首个账号认领升级前的单用户数据，避免老库里的资料变成孤儿
    if len(session.exec(select(User)).all()) == 1:
        adopt_orphan_data(session, user.id)

    set_session_cookie(response, create_session(session, user))
    return _state(user)


@router.post("/login", response_model=AuthState)
def login(
    payload: LoginRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> AuthState:
    check_login_allowed(payload.username)
    username = normalize_username(payload.username)
    user = session.exec(select(User).where(User.username == username)).first()

    if user is None:
        verify_password(payload.password, DUMMY_HASH)
        record_login_failure(payload.username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户名或密码不正确")

    if not verify_password(payload.password, user.password_hash):
        record_login_failure(payload.username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户名或密码不正确")

    clear_login_failures(payload.username)
    set_session_cookie(response, create_session(session, user))
    return _state(user)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        record = session.exec(
            select(UserSession).where(UserSession.token_hash == hash_token(token))
        ).first()
        if record is not None:
            session.delete(record)
            session.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.post("/password", response_model=AuthState)
def change_password(
    payload: PasswordChangeRequest,
    response: Response,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AuthState:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "当前密码不正确")

    user.password_hash = hash_password(payload.new_password)
    session.add(user)
    # 改密后让其他设备上的会话全部失效
    for record in session.exec(
        select(UserSession).where(UserSession.user_id == user.id)
    ).all():
        session.delete(record)
    session.commit()

    set_session_cookie(response, create_session(session, user))
    return _state(user)
