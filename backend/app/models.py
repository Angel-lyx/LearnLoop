from datetime import date, datetime, timezone

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


class Setting(SQLModel, table=True):
    """本地键值配置，例如用户填写的 API Key。"""

    key: str = Field(primary_key=True, max_length=64)
    value: str = Field(default="", max_length=500)
    updated_at: datetime = Field(default_factory=utcnow)


class Mistake(SQLModel, table=True):
    """错题。AI 生成的分析与变式题以 JSON 文本保存，便于前端直接渲染。"""

    id: int | None = Field(default=None, primary_key=True)
    subject_id: int = Field(index=True, foreign_key="subject.id")
    question: str = Field(default="")
    answer: str = Field(default="")
    error_analysis: str = Field(default="")
    solution: str = Field(default="")
    knowledge_points: str = Field(default="[]")  # JSON array
    variants: str = Field(default="[]")  # JSON array of {question, answer}
    status: str = Field(default="unmastered", max_length=16)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Exam(SQLModel, table=True):
    """考试。复习计划以它为中心倒排。"""

    id: int | None = Field(default=None, primary_key=True)
    subject_id: int = Field(index=True, foreign_key="subject.id")
    title: str = Field(max_length=120)
    exam_date: date
    scope: str = Field(default="", max_length=2000)
    created_at: datetime = Field(default_factory=utcnow)


class Task(SQLModel, table=True):
    """每日任务。source=plan 由复习计划生成，manual 为手动添加。"""

    id: int | None = Field(default=None, primary_key=True)
    subject_id: int | None = Field(default=None, index=True, foreign_key="subject.id")
    exam_id: int | None = Field(default=None, index=True, foreign_key="exam.id")
    title: str = Field(max_length=200)
    due_date: date = Field(index=True)
    done: bool = Field(default=False)
    source: str = Field(default="plan", max_length=16)
    created_at: datetime = Field(default_factory=utcnow)


class MindMap(SQLModel, table=True):
    """思维导图。data 存 mind-elixir 的节点树 JSON。"""

    id: int | None = Field(default=None, primary_key=True)
    subject_id: int = Field(index=True, foreign_key="subject.id")
    title: str = Field(max_length=120)
    data: str = Field(default="{}")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Course(SQLModel, table=True):
    """必修课成绩。加权平均与 GPA 由本地计算。"""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=120)
    credits: float = Field(gt=0, le=30)
    score: float = Field(ge=0, le=100)
    category: str = Field(default="required", max_length=16)  # required / elective
    term: str = Field(default="", max_length=40)
    created_at: datetime = Field(default_factory=utcnow)


class ScoreRule(SQLModel, table=True):
    """综测加分项模板（德智体美劳下的具体条目与分值）。"""

    id: int | None = Field(default=None, primary_key=True)
    dimension: str = Field(max_length=20)
    name: str = Field(max_length=120)
    score: float = Field(ge=0, le=100)
    created_at: datetime = Field(default_factory=utcnow)


class BonusItem(SQLModel, table=True):
    """已获得的加分材料，按维度累加。"""

    id: int | None = Field(default=None, primary_key=True)
    dimension: str = Field(max_length=20)
    title: str = Field(max_length=200)
    score: float = Field(ge=0, le=100)
    note: str = Field(default="", max_length=500)
    created_at: datetime = Field(default_factory=utcnow)
