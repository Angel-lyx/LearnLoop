// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const login = vi.fn();
const register = vi.fn();

const store = {
  login,
  register,
  registrationOpen: true,
  needsInviteCode: false,
};

vi.mock("../stores/authStore", () => ({
  useAuthStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

import LoginPage from "./LoginPage";

const USERNAME = "3–40 位，中文或字母数字";

beforeEach(() => {
  vi.clearAllMocks();
  store.registrationOpen = true;
  store.needsInviteCode = false;
});

afterEach(() => {
  cleanup();
});

/** 表单提交按钮和顶部切换 Tab 同名，这里按 type=submit 精确定位 */
function submitButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error("找不到提交按钮");
  return button;
}

function fill(container: HTMLElement, username: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText(USERNAME), {
    target: { value: username },
  });
  const passwordInput =
    container.querySelector<HTMLInputElement>('input[type="password"]') ??
    screen.getByPlaceholderText("输入密码");
  fireEvent.change(passwordInput, { target: { value: password } });
}

describe("登录页", () => {
  it("默认展示登录表单", () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByPlaceholderText(USERNAME)).toBeTruthy();
    expect(submitButton(container).textContent).toContain("登录");
  });

  it("切到注册模式后出现确认密码", () => {
    const { container } = render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    expect(screen.getByPlaceholderText("再输入一次")).toBeTruthy();
    expect(submitButton(container).textContent).toContain("创建账号");
  });

  it("需要邀请码时注册表单多一个输入框", () => {
    store.needsInviteCode = true;
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    expect(screen.getByPlaceholderText("向站长索取")).toBeTruthy();
  });

  it("两次密码不一致时直接提示，不发请求", async () => {
    const { container } = render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    fireEvent.change(screen.getByPlaceholderText(USERNAME), {
      target: { value: "tester" },
    });
    fireEvent.change(screen.getByPlaceholderText("至少 8 位"), {
      target: { value: "password-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("再输入一次"), {
      target: { value: "password-2" },
    });
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(screen.getByText("两次输入的密码不一致")).toBeTruthy();
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("登录成功时把用户名和密码交给 store", async () => {
    login.mockResolvedValue(undefined);
    const { container } = render(<LoginPage />);
    fill(container, "tester", "secret123");
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("tester", "secret123");
    });
  });

  it("登录失败时把后端提示显示出来", async () => {
    login.mockRejectedValue(new Error("用户名或密码不正确"));
    const { container } = render(<LoginPage />);
    fill(container, "tester", "wrong-pass");
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(screen.getByText("用户名或密码不正确")).toBeTruthy();
    });
  });
});
