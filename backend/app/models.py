from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Subject(SQLModel, table=True):
    """学科。所有资料、错题、导图、考试都挂在学科下面。"""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, min_length=1, max_length=50, unique=True)
    color: str = Field(default="#4F7CFF", max_length=20)
    icon: str = Field(default="book", max_length=32)
    archived: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Material(SQLModel, table=True):
    """资料。原始文件落盘，数据库只保存元信息。"""

    id: int | None = Field(default=None, primary_key=True)
    subject_id: int = Field(index=True, foreign_key="subject.id")
    title: str = Field(max_length=200)
    filename: str = Field(max_length=200)
    kind: str = Field(max_length=16)
    size: int = Field(default=0, ge=0)
    storage_name: str = Field(max_length=120)
    page_count: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=utcnow)


class Annotation(SQLModel, table=True):
    """某个资料某一页的批注快照（fabric.js 序列化后的 JSON）。"""

    id: int | None = Field(default=None, primary_key=True)
    material_id: int = Field(index=True, foreign_key="material.id")
    page: int = Field(ge=1)
    payload: str = Field(default="[]")
    updated_at: datetime = Field(default_factory=utcnow)
