import { describe, expect, it } from "vitest";

import {
  EMPTY_HISTORY,
  clampPage,
  clampZoom,
  canRedo,
  canUndo,
  formatBytes,
  pushHistory,
  redo,
  undo,
} from "./annotations";

describe("批注历史栈", () => {
  it("push 记录新快照并清空重做栈", () => {
    const first = pushHistory(EMPTY_HISTORY, '["a"]');
    const second = pushHistory(first, '["a","b"]');

    expect(second.present).toBe('["a","b"]');
    expect(second.past).toEqual(["[]", '["a"]']);
    expect(second.future).toEqual([]);
  });

  it("重复快照不产生历史", () => {
    const state = pushHistory(EMPTY_HISTORY, "[]");
    expect(state).toBe(EMPTY_HISTORY);
  });

  it("undo 回到上一步并转入重做栈", () => {
    const state = pushHistory(pushHistory(EMPTY_HISTORY, '["a"]'), '["a","b"]');
    const back = undo(state);

    expect(back).not.toBeNull();
    expect(back!.present).toBe('["a"]');
    expect(back!.future).toEqual(['["a","b"]']);
    expect(canRedo(back!)).toBe(true);
  });

  it("undo 在栈底返回 null", () => {
    expect(undo(EMPTY_HISTORY)).toBeNull();
    expect(canUndo(EMPTY_HISTORY)).toBe(false);
  });

  it("redo 恢复被撤销的快照", () => {
    const state = pushHistory(pushHistory(EMPTY_HISTORY, '["a"]'), '["a","b"]');
    const back = undo(state)!;
    const forward = redo(back)!;

    expect(forward.present).toBe('["a","b"]');
    expect(forward.future).toEqual([]);
  });

  it("redo 在没有可重做内容时返回 null", () => {
    expect(redo(EMPTY_HISTORY)).toBeNull();
  });

  it("历史长度上限为 50", () => {
    let state = EMPTY_HISTORY;
    for (let i = 0; i < 60; i += 1) state = pushHistory(state, `[${i}]`);
    expect(state.past).toHaveLength(50);
  });
});

describe("页码与缩放约束", () => {
  it("页码限制在合法区间", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(3.4, 10)).toBe(3);
    expect(clampPage(Number.NaN, 10)).toBe(1);
    expect(clampPage(5, 0)).toBe(1);
  });

  it("缩放限制在 0.5 到 3 之间", () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(10)).toBe(3);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("文件体积格式化", () => {
  it("按单位换算", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatBytes(-1)).toBe("-");
  });
});
