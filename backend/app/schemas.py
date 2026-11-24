import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


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


class MaterialRead(BaseModel):
    id: int
    subject_id: int
    title: str
    filename: str
    kind: str
    size: int
    page_count: int
    created_at: datetime


class AnnotationUpsert(BaseModel):
    payload: str = Field(default="[]", max_length=2_000_000)


class AnnotationRead(BaseModel):
    page: int
    payload: str
    updated_at: datetime


class AISettingsRead(BaseModel):
    configured: bool
    model: str
    base_url: str
    source: Literal["database", "environment", "none"]


class AIKeyUpdate(BaseModel):
    api_key: str = Field(min_length=8, max_length=200)


class Variant(BaseModel):
    question: str
    answer: str = ""


class AnalyzeRequest(BaseModel):
    question: str = Field(min_length=1, max_length=8000)
    answer: str = Field(default="", max_length=4000)


class AnalyzeResponse(BaseModel):
    error_analysis: str
    solution: str
    knowledge_points: list[str] = Field(default_factory=list)
    variants: list[Variant] = Field(default_factory=list)


class TranscribeResponse(BaseModel):
    text: str


class MistakeCreate(BaseModel):
    question: str = Field(min_length=1, max_length=8000)
    answer: str = Field(default="", max_length=4000)
    error_analysis: str = Field(default="", max_length=8000)
    solution: str = Field(default="", max_length=12000)
    knowledge_points: list[str] = Field(default_factory=list)
    variants: list[Variant] = Field(default_factory=list)


class MistakeUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=8000)
    answer: str | None = Field(default=None, max_length=4000)
    error_analysis: str | None = Field(default=None, max_length=8000)
    solution: str | None = Field(default=None, max_length=12000)
    knowledge_points: list[str] | None = None
    variants: list[Variant] | None = None
    status: Literal["unmastered", "mastered", "archived"] | None = None


class MistakeRead(BaseModel):
    id: int
    subject_id: int
    question: str
    answer: str
    error_analysis: str
    solution: str
    knowledge_points: list[str]
    variants: list[Variant]
    status: str
    created_at: datetime
    updated_at: datetime

    @field_validator("knowledge_points", mode="before")
    @classmethod
    def parse_points(cls, value: object) -> list[str]:
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            return [str(item) for item in parsed] if isinstance(parsed, list) else []
        return list(value)  # type: ignore[arg-type]

    @field_validator("variants", mode="before")
    @classmethod
    def parse_variants(cls, value: object) -> list[dict]:
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            return parsed if isinstance(parsed, list) else []
        return list(value)  # type: ignore[arg-type]
