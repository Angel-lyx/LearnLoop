import type { AIPlanDay } from "../types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 把 2027-01-01 显示成「1月1日 周五」，解析失败时原样返回。 */
export function formatDayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAYS[date.getDay()]}`;
}

/** 近期日期才有「考点速览 / 自测」，远期只排任务。 */
export function isDetailed(day: AIPlanDay): boolean {
  return day.notes.length > 0 || day.quiz.length > 0;
}

export function totalMinutes(day: AIPlanDay): number {
  return day.tasks.reduce((sum, task) => sum + task.minutes, 0);
}

/** 覆盖表按考频排序：高频在前，没有考频的排最后，便于先看重点。 */
export function sortCoverage<T extends { weight: string }>(items: T[]): T[] {
  const rank: Record<string, number> = { 高频: 0, 中频: 1, 低频: 2 };
  return [...items].sort(
    (a, b) => (rank[a.weight] ?? 3) - (rank[b.weight] ?? 3),
  );
}
