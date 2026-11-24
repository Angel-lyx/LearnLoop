from datetime import date, timedelta

from app.services.planner import build_plan, merge_today


def test_build_plan_spreads_items_over_days():
    today = date(2026, 11, 1)
    plan = build_plan(date(2026, 11, 4), today, ["A", "B", "C"])
    assert [title for _, title in plan] == ["A", "B", "C"]
    assert [due for due, _ in plan] == [today, today + timedelta(days=1), today + timedelta(days=2)]


def test_build_plan_handles_more_items_than_days():
    today = date(2026, 11, 1)
    plan = build_plan(date(2026, 11, 2), today, ["A", "B", "C", "D"])
    assert len(plan) == 4
    assert all(today <= due < date(2026, 11, 2) for due, _ in plan)


def test_build_plan_same_day_exam():
    today = date(2026, 11, 1)
    plan = build_plan(today, today, ["A", "B"])
    assert all(due == today for due, _ in plan)


def test_build_plan_fallback_items():
    plan = build_plan(date(2026, 11, 5), date(2026, 11, 1), [])
    assert len(plan) == 3


def test_merge_today_includes_overdue_and_excludes_future():
    today = date(2026, 11, 10)
    rows = [
        {"id": 1, "due_date": date(2026, 11, 9), "done": False, "title": "逾期"},
        {"id": 2, "due_date": date(2026, 11, 10), "done": True, "title": "今天已完成"},
        {"id": 3, "due_date": date(2026, 11, 11), "done": False, "title": "明天"},
    ]
    merged = merge_today(rows, today)
    assert [row["title"] for row in merged] == ["逾期", "今天已完成"]


def test_merge_today_can_skip_overdue():
    today = date(2026, 11, 10)
    rows = [{"id": 1, "due_date": date(2026, 11, 9), "done": False, "title": "逾期"}]
    assert merge_today(rows, today, include_overdue=False) == []
