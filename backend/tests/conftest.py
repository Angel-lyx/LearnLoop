from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

from app.auth import reset_throttle
from app.config import settings
from app.db import get_session
from app.main import create_app

DEFAULT_USERNAME = "tester"
DEFAULT_PASSWORD = "learnloop-test-123"


def _prepare_settings(monkeypatch, tmp_path) -> str:
    # 每次测试用独立的数据库与上传目录，避免污染开发数据
    monkeypatch.setattr(settings, "data_dir", tmp_path, raising=False)
    db_path = tmp_path / "learnloop.db"
    monkeypatch.setattr(
        settings, "database_url", f"sqlite:///{db_path.as_posix()}", raising=False
    )
    # 认证相关配置固定下来，避免本机 .env 影响测试
    monkeypatch.setattr(settings, "allow_registration", True, raising=False)
    monkeypatch.setattr(settings, "registration_code", "", raising=False)
    monkeypatch.setattr(settings, "session_cookie_secure", False, raising=False)
    monkeypatch.setattr(settings, "deepseek_api_key", "", raising=False)
    return f"sqlite:///{db_path.as_posix()}"


def _build_client(monkeypatch, tmp_path) -> Iterator[TestClient]:
    url = _prepare_settings(monkeypatch, tmp_path)

    # 文件型数据库 + 不池化连接：备份替换文件后能立刻读到新库
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    SQLModel.metadata.create_all(engine)

    def override_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(init_database=False)
    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def _reset_login_throttle() -> Iterator[None]:
    reset_throttle()
    yield
    reset_throttle()


@pytest.fixture(name="anon_client")
def anon_client_fixture(monkeypatch, tmp_path) -> Iterator[TestClient]:
    """没有登录的客户端，用来验证未授权访问。"""
    yield from _build_client(monkeypatch, tmp_path)


@pytest.fixture(name="client")
def client_fixture(monkeypatch, tmp_path) -> Iterator[TestClient]:
    for client in _build_client(monkeypatch, tmp_path):
        response = client.post(
            "/api/auth/register",
            json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
        )
        assert response.status_code == 201, response.text
        yield client


@pytest.fixture(name="user")
def user_fixture(client: TestClient) -> dict:
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    return response.json()["user"]


OTHER_USER = {"username": "roommate", "password": "learnloop-test-456"}


@pytest.fixture(name="other_client")
def other_client_fixture(client: TestClient) -> Iterator[TestClient]:
    """同一个数据库上的第二个账号，用来验证数据隔离。"""
    other = TestClient(client.app)
    response = other.post("/api/auth/register", json=OTHER_USER)
    assert response.status_code == 201, response.text
    yield other
    other.close()


@pytest.fixture(name="subject")
def subject_fixture(client: TestClient) -> dict:
    response = client.post("/api/subjects", json={"name": "高等数学"})
    assert response.status_code == 201
    return response.json()


class FakeLLM:
    """测试用替身：不发起真实网络请求。"""

    def __init__(self) -> None:
        self.analysis = {
            "error_analysis": "把极限存在和连续混淆了",
            "solution": "先判断左右极限是否相等，再比较函数值",
            "knowledge_points": ["极限", "连续性"],
            "variants": [
                {"question": "变式题 A", "answer": "答案 A"},
                {"question": "变式题 B", "answer": "答案 B"},
            ],
        }
        self.transcribed = "1. 求极限 lim(x->0) sin(x)/x"
        self.map_data = {
            "topic": "高等数学",
            "children": [
                {"topic": "极限", "children": [{"topic": "等价无穷小"}]},
                {"topic": "导数"},
            ],
        }
        self.rules_data = {
            "rules": [
                {"dimension": "智", "name": "国家级竞赛一等奖", "score": 5},
                {"dimension": "德", "name": "志愿服务满 50 小时", "score": 2},
                {"dimension": "未知", "name": "非法维度", "score": 3},
                {"dimension": "体", "name": "", "score": 1},
            ]
        }
        self.courses_data = {
            "courses": [
                {"name": "高等数学", "credits": 4, "score": 92, "category": "required"},
                {"name": "大学物理", "credits": 3, "score": 85, "category": "required"},
                {"name": "艺术鉴赏", "credits": 2, "score": 90, "category": "elective"},
                {"name": "", "credits": 3, "score": 80},
                {"name": "越界课", "credits": 3, "score": 120},
            ]
        }
        self.calls: list[tuple[str, str]] = []
        self.fail_search = False

        from datetime import date, timedelta

        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        self.search_results = [
            {
                "title": "高数期末复习提纲",
                "url": "https://example.com/outline",
                "summary": "极限、导数、积分的重点梳理",
            },
            {
                "title": "高数历年真题",
                "url": "https://example.com/papers",
                "summary": "近五年期末真题与解析",
            },
        ]
        self.plan_data = {
            "summary": "先补基础再做真题，最后两天模拟",
            "coverage": [
                {"topic": "极限", "date": tomorrow, "weight": "高频"},
                {"topic": "导数", "date": tomorrow, "weight": "重点"},
            ],
            "days": [
                {
                    "date": tomorrow,
                    "focus": "极限",
                    "goal": "能独立求 5 类极限",
                    "notes": ["等价无穷小：sin x ~ x，tan x ~ x", "洛必达前先确认 0/0 或 ∞/∞"],
                    "pitfalls": ["加减法里不能直接替换等价无穷小"],
                    "quiz": [
                        {"question": "求 lim(x→0) sin x / x", "answer": "1，用等价无穷小"}
                    ],
                    "tasks": [
                        {"title": "复习极限定义", "detail": "整理 5 个典型例题", "minutes": 60}
                    ],
                    "resources": [
                        {"title": "高数期末复习提纲", "url": "https://example.com/outline"},
                        {"title": "伪造链接", "url": "https://evil.example.com/x"},
                    ],
                }
            ],
        }

    async def chat_json(
        self, system: str, user: str, image_urls=None, max_tokens=8192, timeout=120
    ):
        self.calls.append(("json", user))
        if "思维导图" in system:
            return self.map_data
        if "备考规划师" in system:
            return self.plan_data
        if "成绩单" in system:
            return self.courses_data
        if "综测" in system or "加分" in system:
            return self.rules_data
        return self.analysis

    async def search(self, query: str, count: int = 5):
        self.calls.append(("search", query))
        if self.fail_search:
            from app.services.llm import LLMError

            raise LLMError("大模型返回 404：Not Found", 502)
        return self.search_results[:count]

    async def chat_text(self, system: str, user: str, image_urls=None):
        self.calls.append(("text", user))
        return self.transcribed

    async def ocr(self, filename: str, content: bytes) -> str:
        self.calls.append(("ocr", filename))
        return self.transcribed

    async def ping(self) -> bool:
        self.calls.append(("ping", ""))
        return True


@pytest.fixture(name="fake_llm")
def fake_llm_fixture(client: TestClient) -> FakeLLM:
    from app.services.deps import get_llm

    fake = FakeLLM()
    client.app.dependency_overrides[get_llm] = lambda: fake
    return fake

