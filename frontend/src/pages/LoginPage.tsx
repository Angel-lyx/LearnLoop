import { useState } from "react";

import { useAuthStore } from "../stores/authStore";

type Mode = "login" | "register";

export default function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const registrationOpen = useAuthStore((state) => state.registrationOpen);
  const needsInviteCode = useAuthStore((state) => state.needsInviteCode);

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("请填写用户名和密码");
      return;
    }
    if (mode === "register" && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, inviteCode.trim());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setConfirm("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold text-white"
            style={{
              background: "linear-gradient(145deg,#4a6fa5,#6c5a9e)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,.4), 0 10px 22px -12px rgba(74,111,165,.9)",
            }}
            aria-hidden
          >
            L
          </span>
          <div>
            <div className="text-lg font-bold tracking-tight text-ink-950">
              Learn<span className="text-brand-600">Loop</span>
            </div>
            <div className="text-xs text-ink-400">学习与保研规划</div>
          </div>
        </div>

        <div className="card p-6">
          <div className="tabbar mb-5 w-full">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`tab flex-1 ${mode === "login" ? "tab-active" : ""}`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              disabled={!registrationOpen}
              className={`tab flex-1 disabled:opacity-40 ${mode === "register" ? "tab-active" : ""}`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">用户名</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="input"
                placeholder="3–40 位，中文或字母数字"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="input"
                placeholder={mode === "login" ? "输入密码" : "至少 8 位"}
              />
            </label>

            {mode === "register" && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs text-ink-500">确认密码</span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                    className="input"
                    placeholder="再输入一次"
                  />
                </label>

                {needsInviteCode && (
                  <label className="block">
                    <span className="mb-1 block text-xs text-ink-500">邀请码</span>
                    <input
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value)}
                      autoComplete="off"
                      className="input"
                      placeholder="向站长索取"
                    />
                  </label>
                )}
              </>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy ? "请稍候…" : mode === "login" ? "登录" : "创建账号"}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-400">
            {registrationOpen
              ? "数据按账号隔离，只有你自己能看到自己的学科、资料与成绩"
              : "站长已关闭注册，如需账号请联系管理员"}
          </p>
        </div>
      </div>
    </div>
  );
}
