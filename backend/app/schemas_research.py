from typing import Literal

from pydantic import BaseModel, Field

Dimension = Literal["德", "智", "体", "美", "劳"]


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    credits: float = Field(gt=0, le=30)
    score: float = Field(ge=0, le=100)
    category: Literal["required", "elective"] = "required"
    term: str = Field(default="", max_length=40)


class CourseRead(BaseModel):
    id: int
    name: str
    credits: float
    score: float
    category: str
    term: str
    created_at: object


class RuleCreate(BaseModel):
    dimension: Dimension
    name: str = Field(min_length=1, max_length=120)
    score: float = Field(ge=0, le=100)


class RuleRead(BaseModel):
    id: int
    dimension: str
    name: str
    score: float


class RuleDraft(BaseModel):
    dimension: Dimension
    name: str
    score: float


class RuleParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


class CourseDraft(BaseModel):
    name: str
    credits: float = 3
    score: float = 0
    category: Literal["required", "elective"] = "required"


class CourseParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


class BonusCreate(BaseModel):
    dimension: Dimension
    title: str = Field(min_length=1, max_length=200)
    score: float = Field(ge=0, le=100)
    note: str = Field(default="", max_length=500)


class BonusRead(BaseModel):
    id: int
    dimension: str
    title: str
    score: float
    note: str
    created_at: object


class WeightsRead(BaseModel):
    course_weight: float


class WeightsUpdate(BaseModel):
    course_weight: float = Field(ge=0, le=1)


class CourseStats(BaseModel):
    count: int
    credits: float
    weighted_average: float
    gpa: float


class ZongceStats(BaseModel):
    dimensions: dict[str, float]
    total: float


class CompositeStats(BaseModel):
    course_weight: float
    course_score: float
    zongce_score: float
    score: float


class OverviewRead(BaseModel):
    courses: CourseStats
    zongce: ZongceStats
    composite: CompositeStats
