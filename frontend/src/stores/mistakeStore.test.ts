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
    mistakesApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
});

import { mistakesApi } from "../lib/api";
import type { Mistake } from "../types";
import { useMistakeStore } from "./mistakeStore";

const mocked = mistakesApi as unknown as {
  list: Mock;
  create: Mock;
  update: Mock;
  remove: Mock;
};

function mistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: 1,
    subject_id: 1,
    question: "求 lim(x->0) sin(x)/x",
    answer: "0",
    error_analysis: "概念混淆",
    solution: "等价无穷小",
    knowledge_points: ["极限"],
    variants: [],
    status: "unmastered",
    created_at: "2026-11-24T00:00:00Z",
    updated_at: "2026-11-24T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMistakeStore.setState({ items: [], loading: false, saving: false, error: null });
});

describe("错题 store", () => {
  it("load 写入列表并按状态过滤传参", async () => {
    mocked.list.mockResolvedValue([mistake()]);

    await useMistakeStore.getState().load(1, "mastered");

    expect(mocked.list).toHaveBeenCalledWith(1, "mastered");
    expect(useMistakeStore.getState().items).toHaveLength(1);
  });

  it("create 成功插到列表最前面", async () => {
    useMistakeStore.setState({ items: [mistake({ id: 1 })] });
    mocked.create.mockResolvedValue(mistake({ id: 2, question: "新题" }));

    const ok = await useMistakeStore.getState().create(1, { question: "新题" });

    expect(ok).toBe(true);
    expect(useMistakeStore.getState().items[0].question).toBe("新题");
  });

  it("create 失败返回 false 并记录错误", async () => {
    mocked.create.mockRejectedValue(new Error("学科不存在"));

    const ok = await useMistakeStore.getState().create(1, { question: "x" });

    expect(ok).toBe(false);
    expect(useMistakeStore.getState().error).toBe("学科不存在");
  });

  it("update 就地替换对应项", async () => {
    useMistakeStore.setState({ items: [mistake({ id: 1 }), mistake({ id: 2 })] });
    mocked.update.mockResolvedValue(mistake({ id: 2, status: "mastered" }));

    await useMistakeStore.getState().update(2, { status: "mastered" });

    const items = useMistakeStore.getState().items;
    expect(items[0].status).toBe("unmastered");
    expect(items[1].status).toBe("mastered");
  });

  it("remove 从列表移除", async () => {
    useMistakeStore.setState({ items: [mistake({ id: 1 })] });
    mocked.remove.mockResolvedValue(undefined);

    await useMistakeStore.getState().remove(1);

    expect(useMistakeStore.getState().items).toEqual([]);
  });
});
