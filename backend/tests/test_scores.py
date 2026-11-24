import pytest

from app.services.scores import (
    CourseRow,
    composite_score,
    course_stats,
    dimension_totals,
    score_to_gpa,
)


def test_score_to_gpa_thresholds():
    assert score_to_gpa(95) == 4.0
    assert score_to_gpa(90) == 4.0
    assert score_to_gpa(86) == 3.7
    assert score_to_gpa(80) == 3.0
    assert score_to_gpa(59) == 0.0


def test_course_stats_only_counts_required():
    courses = [
        CourseRow(credits=3, score=90, category="required"),
        CourseRow(credits=2, score=80, category="required"),
        CourseRow(credits=4, score=100, category="elective"),
    ]
    stats = course_stats(courses)
    # (90*3 + 80*2) / 5 = 86
    assert stats["weighted_average"] == 86.0
    assert stats["credits"] == 5.0
    assert stats["count"] == 2
    # (4.0*3 + 3.0*2) / 5 = 3.6
    assert stats["gpa"] == 3.6


def test_course_stats_empty():
    stats = course_stats([])
    assert stats == {"count": 0, "credits": 0.0, "weighted_average": 0.0, "gpa": 0.0}


def test_dimension_totals():
    totals = dimension_totals([("德", 2), ("智", 5), ("智", 1.5)])
    assert totals["德"] == 2
    assert totals["智"] == 6.5
    assert totals["劳"] == 0


def test_composite_score():
    assert composite_score(86, 10, 0.7) == pytest.approx(63.2, abs=0.01)
    assert composite_score(86, 10, 0) == 10
    assert composite_score(86, 10, 1) == 86
    # 权重越界会被夹住
    assert composite_score(86, 10, 5) == 86
