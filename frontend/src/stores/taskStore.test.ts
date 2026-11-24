import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../lib/api", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    ApiError,
    tasksApi: { today: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  };
});

import { tasksApi } from "../lib/api";
import type { Task } from "../types";
import { useTaskStore } from "./taskStore";

const mocked = tasksApi as unknown as {
  today: Mock;
  create: Mock;
  update: Mock;
  remove: Mock;
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    subject_id: 1,
    exam_id: null,
    title: "复习极限",
    due_date: "2026-11-24",
    done: false,
    source: "plan",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTaskStore.setState({ items: [], loading: false, error: null });
});

describe("任务 store", () => {
  it("load 拉取今日任务", async () => {
    mocked.today.mockResolvedValue([task()]);
    await useTaskStore.getState().load();
    expect(useTaskStore.getState().items).toHaveLength(1);
  });

  it("toggle 先本地更新再请求后端", async () => {
    useTaskStore.setState({ items: [task()] });
    mocked.update.mockResolvedValue(task({ done: true }));

    await useTaskStore.getState().toggle(1, true);

    expect(useTaskStore.getState().items[0].done).toBe(true);
    expect(mocked.update).toHaveBeenCalledWith(1, { done: true });
  });

  it("toggle 失败时回滚", async () => {
    useTaskStore.setState({ items: [task()] });
    mocked.update.mockRejectedValue(new Error("网络错误"));

    await useTaskStore.getState().toggle(1, true);

    expect(useTaskStore.getState().items[0].done).toBe(false);
    expect(useTaskStore.getState().error).toBe("网络错误");
  });

  it("remove 失败时恢复列表", async () => {
    useTaskStore.setState({ items: [task()] });
    mocked.remove.mockRejectedValue(new Error("删除失败"));

    await useTaskStore.getState().remove(1);

    expect(useTaskStore.getState().items).toHaveLength(1);
  });

  it("add 成功后追加", async () => {
    mocked.create.mockResolvedValue(task({ id: 9, title: "背单词" }));
    const ok = await useTaskStore.getState().add("背单词", "2026-11-24");
    expect(ok).toBe(true);
    expect(useTaskStore.getState().items[0].title).toBe("背单词");
  });
});
