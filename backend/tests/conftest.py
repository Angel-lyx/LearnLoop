from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings
from app.db import get_session
from app.main import create_app


@pytest.fixture(name="client")
def client_fixture(tmp_path, monkeypatch) -> Iterator[TestClient]:
    # 每次测试用独立的数据库与上传目录，避免污染开发数据
    monkeypatch.setattr(settings, "data_dir", tmp_path, raising=False)
    db_path = tmp_path / "learnloop.db"
    monkeypatch.setattr(
        settings, "database_url", f"sqlite:///{db_path.as_posix()}", raising=False
    )

    # 文件型数据库 + 不池化连接：备份替换文件后能立刻读到新库
    engine = create_engine(
        f"sqlite:///{db_path.as_posix()}",
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

    async def chat_json(self, system: str, user: str, image_urls=None):
        self.calls.append(("json", user))
        if "思维导图" in system:
            return self.map_data
        if "成绩单" in system:
            return self.courses_data
        if "综测" in system or "加分" in system:
            return self.rules_data
        return self.analysis

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

