from datetime import date, timedelta


def build_plan(
    exam_date: date, today: date, items: list[str]
) -> list[tuple[date, str]]:
    """把待复习条目均匀铺到「今天 → 考前」之间，生成 (日期, 任务) 列表。

    - 考前不足一天时按 1 天排
    - 条目多于天数时，同一天可以有多条
    - 没有任何条目时给出一条兜底任务
    """
    days = max((exam_date - today).days, 1)
    if not items:
        items = ["通读教材与笔记", "重做错题本", "限时模拟自测"]

    total = len(items)
    plan: list[tuple[date, str]] = []
    for index, item in enumerate(items):
        offset = min(index * days // total, days - 1)
        plan.append((today + timedelta(days=offset), item))
    return plan


def merge_today(rows: list[dict], today: date, include_overdue: bool = True) -> list[dict]:
    """今日任务：当天应做的 + 逾期未完成的（顺延）。"""
    result = []
    for row in rows:
        due = row["due_date"]
        if due == today:
            result.append(row)
        elif include_overdue and due < today and not row["done"]:
            result.append(row)
    result.sort(key=lambda row: (row["due_date"], row["id"] or 0))
    return result
