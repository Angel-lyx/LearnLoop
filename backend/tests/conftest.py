from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings
from app.db import get_session
from app.main import create_app


@pytest.fixture(name="client")
def client_fixture(tmp_path, monkeypatch) -> Iterator[TestClient]:
    # 每次测试用独立的数据库与上传目录，避免污染开发数据
    monkeypatch.setattr(settings, "data_dir", tmp_path, raising=False)

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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
