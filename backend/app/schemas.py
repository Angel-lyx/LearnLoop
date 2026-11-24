from datetime import datetime

from pydantic import BaseModel, Field


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#4F7CFF", max_length=20)
    icon: str = Field(default="book", max_length=32)


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=32)
    archived: bool | None = None


class SubjectRead(BaseModel):
    id: int
    name: str
    color: str
    icon: str
    archived: bool
    created_at: datetime
    updated_at: datetime
