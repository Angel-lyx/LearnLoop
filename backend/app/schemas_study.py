from datetime import date as date_type

from pydantic import BaseModel, Field


class ExamCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    exam_date: date_type
    scope: str = Field(default="", max_length=2000)


class ExamRead(BaseModel):
    id: int
    subject_id: int
    title: str
    exam_date: date_type
    scope: str
    created_at: object
    days_left: int


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_date: date_type
    subject_id: int | None = None
    exam_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due_date: date_type | None = None
    done: bool | None = None


class PlanResource(BaseModel):
    title: str = ""
    url: str = ""


class PlanTaskItem(BaseModel):
    title: str
    detail: str = ""
    minutes: int = 45


class TaskRead(BaseModel):
    id: int
    subject_id: int | None
    exam_id: int | None
    title: str
    due_date: date_type
    done: bool
    source: str
    detail: str = ""
    resources: list[PlanResource] = Field(default_factory=list)


class PlanDay(BaseModel):
    date: date_type
    focus: str = ""
    tasks: list[PlanTaskItem] = Field(default_factory=list)
    resources: list[PlanResource] = Field(default_factory=list)


class AIPlanResult(BaseModel):
    summary: str = ""
    days: list[PlanDay] = Field(default_factory=list)
    tasks: list[TaskRead] = Field(default_factory=list)


class MindMapRead(BaseModel):
    id: int
    subject_id: int
    title: str
    data: dict
    created_at: object
    updated_at: object


class MindMapCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class MindMapUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    data: dict | None = None
