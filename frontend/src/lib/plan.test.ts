import { describe, expect, it } from "vitest";

import { formatDayLabel, isDetailed, sortCoverage, totalMinutes } from "./plan";
import type { AIPlanDay } from "../types";

function makeDay(overrides: Partial<AIPlanDay> = {}): AIPlanDay {
  return {
    date: "2027-01-01",
    focus: "极限",
    goal: "",
    notes: [],
    pitfalls: [],
    quiz: [],
    tasks: [],
    resources: [],
    ...overrides,
  };
}

describe("计划展示辅助", () => {
  it("把 ISO 日期显示成中文日期与星期", () => {
    expect(formatDayLabel("2027-01-01")).toBe("1月1日 周五");
  });

  it("非法日期原样返回，不抛错", () => {
    expect(formatDayLabel("不是日期")).toBe("不是日期");
  });

  it("只有笔记或自测题才算精讲日", () => {
    expect(isDetailed(makeDay())).toBe(false);
    expect(isDetailed(makeDay({ notes: ["等价无穷小"] }))).toBe(true);
    expect(
      isDetailed(makeDay({ quiz: [{ question: "求极限", answer: "1" }] })),
    ).toBe(true);
  });

  it("汇总当天任务时长", () => {
    const day = makeDay({
      tasks: [
        { title: "看讲义", detail: "", minutes: 25 },
        { title: "做题", detail: "", minutes: 35 },
      ],
    });
    expect(totalMinutes(day)).toBe(60);
    expect(totalMinutes(makeDay())).toBe(0);
  });

  it("覆盖表按高频、中频、低频、未知排序", () => {
    const sorted = sortCoverage([
      { topic: "定积分", weight: "" },
      { topic: "极限", weight: "低频" },
      { topic: "导数", weight: "高频" },
      { topic: "中值定理", weight: "中频" },
    ]);
    expect(sorted.map((item) => item.topic)).toEqual([
      "导数",
      "中值定理",
      "极限",
      "定积分",
    ]);
  });
});
