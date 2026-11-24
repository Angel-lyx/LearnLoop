from dataclasses import dataclass

# 4.0 制 GPA 的常用换算（百分制 → 绩点）
GPA_TABLE: list[tuple[float, float]] = [
    (90, 4.0),
    (85, 3.7),
    (82, 3.3),
    (78, 3.0),
    (75, 2.7),
    (72, 2.3),
    (68, 2.0),
    (64, 1.5),
    (60, 1.0),
    (0, 0.0),
]


@dataclass
class CourseRow:
    credits: float
    score: float
    category: str


def score_to_gpa(score: float) -> float:
    for threshold, point in GPA_TABLE:
        if score >= threshold:
            return point
    return 0.0


def course_stats(courses: list[CourseRow]) -> dict:
    """只统计必修课；返回加权平均、GPA 与学分。"""
    required = [c for c in courses if c.category == "required"]
    total_credits = sum(c.credits for c in required)
    if total_credits <= 0:
        return {
            "count": len(required),
            "credits": 0.0,
            "weighted_average": 0.0,
            "gpa": 0.0,
        }

    weighted = sum(c.score * c.credits for c in required) / total_credits
    gpa = sum(score_to_gpa(c.score) * c.credits for c in required) / total_credits
    return {
        "count": len(required),
        "credits": round(total_credits, 2),
        "weighted_average": round(weighted, 2),
        "gpa": round(gpa, 3),
    }


DIMENSIONS = ["德", "智", "体", "美", "劳"]


def dimension_totals(items: list[tuple[str, float]]) -> dict[str, float]:
    totals = {dimension: 0.0 for dimension in DIMENSIONS}
    for dimension, score in items:
        totals[dimension] = round(totals.get(dimension, 0.0) + score, 2)
    return totals


def composite_score(course_score: float, zongce_score: float, course_weight: float) -> float:
    """保研综合成绩 = 必修加权 × 权重 + 综测 × (1 - 权重)。"""
    weight = min(max(course_weight, 0.0), 1.0)
    return round(course_score * weight + zongce_score * (1 - weight), 2)
