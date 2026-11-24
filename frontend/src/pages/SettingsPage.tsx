import { useEffect, useRef, useState } from "react";

import { authApi, backupApi, settingsApi } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import type { AISettings } from "../types";

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const [settings, setSettings] = useState<AISettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"idle" | "save" | "test" | "clear">("idle");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm("导入会覆盖当前账号的全部数据，确定继续？")) {
      event.target.value = "";
      return;
    }
    setImporting(true);
    try {
      await backupApi.import(file);
      window.location.reload();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "导入失败",
      });
      setImporting(false);
      event.target.value = "";
    }
  }

  useEffect(() => {
    settingsApi
      .read()
      .then(setSettings)
      .catch((error: unknown) =>
        setMessage({
          kind: "error",
          text: error instanceof Error ? error.message : "读取配置失败",
        }),
      );
  }, []);

  async function handleSave() {
    if (apiKey.trim().length < 8) {
      setMessage({ kind: "error", text: "API Key 看起来不完整" });
      return;
    }
    setBusy("save");
    setMessage(null);
    try {
      const next = await settingsApi.saveKey(apiKey.trim());
      setSettings(next);
      setApiKey("");
      setMessage({ kind: "ok", text: "已保存到你的账号下，只有你能用" });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "保存失败",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleTest() {
    setBusy("test");
    setMessage(null);
    try {
      await settingsApi.test();
      setMessage({ kind: "ok", text: "连接成功，模型可用" });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "连接失败",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleClear() {
    setBusy("clear");
    setMessage(null);
    try {
      setSettings(await settingsApi.clearKey());
      setMessage({ kind: "ok", text: "已清除保存的 Key" });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "清除失败",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleChangePassword() {
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage({ kind: "error", text: "新密码至少 8 位" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ kind: "error", text: "两次输入的新密码不一致" });
      return;
    }
    setPasswordBusy(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({
        kind: "ok",
        text: "密码已更新，其他设备上的登录已失效",
      });
    } catch (error) {
      setPasswordMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "修改失败",
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">设置</h1>
        <p className="muted mt-1.5">账号、大模型密钥与数据管理</p>
      </header>

      {message && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-medium text-ink-950">账号</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-ink-700">
            👤 <span className="font-medium">{user?.username ?? "—"}</span>
          </div>
          <button
            onClick={() => void logout()}
            className="rounded-lg border border-paper-200 px-3 py-1.5 text-xs text-ink-600 hover:bg-paper-50"
          >
            退出登录
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          你的学科、资料、错题与成绩都只属于这个账号，其他账号看不到
        </p>

        <details className="mt-4 border-t border-paper-200 pt-3">
          <summary className="cursor-pointer text-xs text-ink-500 select-none">
            修改密码
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="当前密码"
              autoComplete="current-password"
              className="input text-sm"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="新密码（至少 8 位）"
              autoComplete="new-password"
              className="input text-sm"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="确认新密码"
              autoComplete="new-password"
              className="input text-sm"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleChangePassword()}
              disabled={passwordBusy}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {passwordBusy ? "提交中…" : "更新密码"}
            </button>
            {passwordMessage && (
              <span
                className={`text-xs ${
                  passwordMessage.kind === "ok" ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {passwordMessage.text}
              </span>
            )}
          </div>
        </details>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-950">DeepSeek API Key</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              settings?.configured
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {settings?.configured ? "已配置" : "未配置"}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          只保存在服务器上属于你的那条记录（
          {settings?.source === "environment" ? "当前来自环境变量" : "数据库"}），
          不会打包进前端，也不会进 git
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            onClick={() => void handleSave()}
            disabled={busy === "save"}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "save" ? "保存中…" : "保存"}
          </button>
          <button
            onClick={() => void handleTest()}
            disabled={busy === "test" || !settings?.configured}
            className="rounded-lg border border-paper-200 px-4 py-2 text-sm text-ink-600 hover:bg-paper-50 disabled:opacity-50"
          >
            {busy === "test" ? "测试中…" : "测试连接"}
          </button>
          <button
            onClick={() => void handleClear()}
            disabled={busy === "clear" || settings?.source !== "database"}
            className="rounded-lg px-3 py-2 text-sm text-ink-400 hover:text-red-500 disabled:opacity-40"
          >
            清除
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2 text-xs text-ink-500 sm:grid-cols-2">
          <div>
            <dt className="text-ink-400">模型</dt>
            <dd className="mt-0.5 text-ink-700">{settings?.model ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-400">接口地址</dt>
            <dd className="mt-0.5 break-all text-ink-700">{settings?.base_url ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-medium text-ink-950">数据备份</h2>
        <p className="mt-1 text-xs text-ink-400">
          导出的是你这个账号的 zip（资料文件 + 全部记录）；导入会覆盖当前账号的数据，
          其他账号不受影响。换服务器时用它搬家。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={backupApi.exportUrl}
            className="rounded-lg border border-paper-200 px-3 py-1.5 text-xs text-ink-600 hover:bg-paper-50"
          >
            导出备份
          </a>
          <input
            ref={importRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(event) => void handleImport(event)}
          />
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-paper-200 px-3 py-1.5 text-xs text-ink-600 hover:bg-paper-50 disabled:opacity-50"
          >
            {importing ? "导入中…" : "导入备份"}
          </button>
          <span className="text-xs text-ink-400">导入后页面会自动刷新</span>
        </div>
      </section>
    </div>
  );
}
