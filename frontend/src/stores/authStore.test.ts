import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../lib/api", () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  },
}));

import { authApi } from "../lib/api";
import { useAuthStore } from "./authStore";

const mocked = authApi as unknown as {
  me: Mock;
  login: Mock;
  register: Mock;
  logout: Mock;
};

const USER = { id: 1, username: "tester", created_at: "2026-11-24T00:00:00Z" };

function state(overrides: Record<string, unknown> = {}) {
  return {
    user: USER,
    registration_open: true,
    needs_invite_code: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    ready: false,
    registrationOpen: true,
    needsInviteCode: false,
  });
});

describe("账号 store", () => {
  it("bootstrap 读取 /auth/me 并标记就绪", async () => {
    mocked.me.mockResolvedValue(state());

    await useAuthStore.getState().bootstrap();

    const store = useAuthStore.getState();
    expect(store.ready).toBe(true);
    expect(store.user?.username).toBe("tester");
  });

  it("bootstrap 失败时按未登录处理，不会卡在载入中", async () => {
    mocked.me.mockRejectedValue(new Error("网络断了"));

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState().ready).toBe(true);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("login 成功后写入账号", async () => {
    mocked.login.mockResolvedValue(state({ needs_invite_code: true }));

    await useAuthStore.getState().login("tester", "secret123");

    expect(mocked.login).toHaveBeenCalledWith("tester", "secret123");
    expect(useAuthStore.getState().user?.id).toBe(1);
    expect(useAuthStore.getState().needsInviteCode).toBe(true);
  });

  it("login 失败时抛出错误且不写入账号", async () => {
    mocked.login.mockRejectedValue(new Error("用户名或密码不正确"));

    await expect(
      useAuthStore.getState().login("tester", "wrong"),
    ).rejects.toThrow("用户名或密码不正确");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("register 会把邀请码一起提交", async () => {
    mocked.register.mockResolvedValue(state());

    await useAuthStore.getState().register("tester", "secret123", "invite-1");

    expect(mocked.register).toHaveBeenCalledWith("tester", "secret123", "invite-1");
    expect(useAuthStore.getState().user?.username).toBe("tester");
  });

  it("logout 即使请求失败也要清掉本地账号", async () => {
    useAuthStore.setState({ user: USER, ready: true });
    mocked.logout.mockRejectedValue(new Error("网络断了"));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
  });

  it("markSignedOut 只清账号，不影响注册开关", async () => {
    useAuthStore.setState({ user: USER, ready: true, registrationOpen: false });

    useAuthStore.getState().markSignedOut();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().registrationOpen).toBe(false);
  });
});
