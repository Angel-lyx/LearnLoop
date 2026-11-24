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
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

import { api } from "../lib/api";
import type { Subject } from "../types";
import { useSubjectStore } from "./subjectStore";

const mockedApi = api as unknown as {
  get: Mock;
  post: Mock;
  delete: Mock;
};

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 1,
    name: "高等数学",
    color: "#4F7CFF",
    icon: "book",
    archived: false,
    created_at: "2026-11-24T00:00:00Z",
    updated_at: "2026-11-24T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSubjectStore.setState({ items: [], loading: false, error: null });
});

describe("学科 store", () => {
  it("load 成功后写入列表", async () => {
    mockedApi.get.mockResolvedValue([subject()]);

    await useSubjectStore.getState().load();

    const state = useSubjectStore.getState();
    expect(mockedApi.get).toHaveBeenCalledWith("/subjects");
    expect(state.items).toHaveLength(1);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("load 失败时记录错误且列表保持不变", async () => {
    mockedApi.get.mockRejectedValue(new Error("网络断了"));

    await useSubjectStore.getState().load();

    expect(useSubjectStore.getState().error).toBe("网络断了");
    expect(useSubjectStore.getState().items).toEqual([]);
  });

  it("create 成功后追加到列表", async () => {
    mockedApi.post.mockResolvedValue(subject({ id: 2, name: "线性代数" }));

    const ok = await useSubjectStore.getState().create({ name: "线性代数", color: "#FF6B6B" });

    expect(ok).toBe(true);
    expect(useSubjectStore.getState().items.map((s) => s.name)).toEqual(["线性代数"]);
  });

  it("create 失败时返回 false 并暴露错误信息", async () => {
    mockedApi.post.mockRejectedValue(new Error("学科名称已存在"));

    const ok = await useSubjectStore.getState().create({ name: "高等数学", color: "#000000" });

    expect(ok).toBe(false);
    expect(useSubjectStore.getState().error).toBe("学科名称已存在");
    expect(useSubjectStore.getState().items).toEqual([]);
  });

  it("remove 成功后从列表移除", async () => {
    useSubjectStore.setState({ items: [subject({ id: 1 }), subject({ id: 2, name: "概率论" })] });
    mockedApi.delete.mockResolvedValue(undefined);

    await useSubjectStore.getState().remove(1);

    expect(mockedApi.delete).toHaveBeenCalledWith("/subjects/1");
    expect(useSubjectStore.getState().items.map((s) => s.id)).toEqual([2]);
  });

  it("remove 失败时保留原列表", async () => {
    useSubjectStore.setState({ items: [subject({ id: 1 })] });
    mockedApi.delete.mockRejectedValue(new Error("删除失败"));

    await useSubjectStore.getState().remove(1);

    expect(useSubjectStore.getState().items).toHaveLength(1);
    expect(useSubjectStore.getState().error).toBe("删除失败");
  });
});
