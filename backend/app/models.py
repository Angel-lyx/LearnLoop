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
