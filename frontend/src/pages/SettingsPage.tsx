import { useEffect, useState } from "react";

import { settingsApi } from "../lib/api";import type { AISettings } from "../types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"idle" | "save" | "test" | "clear">("idle");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

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
      setMessage({ kind: "ok", text: "已保存到本机数据库，不会上传" });
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
      setMessage({ kind: "ok", text: "已清除本机保存的 Key" });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "清除失败",
      });
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">设置</h1>
        <p className="mt-1 text-sm text-ink-400">大模型密钥与数据管理</p>
      </header>

      {message && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            message.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded-xl border border-paper-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-950">DeepSeek API Key</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              settings?.configured
                ? "bg-green-50 text-green-600"
                : "bg-amber-50 text-amber-600"
            }`}
          >
            {settings?.configured ? "已配置" : "未配置"}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          只保存在本机数据库（
          {settings?.source === "environment" ? "当前来自环境变量" : "backend/data"}），
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
            <dd className="mt-0.5 text-ink-700">{settings?.base_url ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-paper-200 bg-white p-5">
        <h2 className="text-sm font-medium text-ink-950">数据备份</h2>
        <p className="mt-1 text-xs text-ink-400">
          所有数据保存在本机 backend/data/learnloop.db，拷贝该文件即可备份（导入导出功能在 M5 上线）
        </p>
      </section>
    </div>
  );
}
