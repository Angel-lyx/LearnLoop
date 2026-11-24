export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">设置</h1>
        <p className="mt-1 text-sm text-ink-400">API Key 与数据备份</p>
      </header>

      <section className="rounded-xl border border-paper-200 bg-white p-5">
        <h2 className="text-sm font-medium text-ink-950">大模型 API Key</h2>
        <p className="mt-1 text-xs text-ink-400">
          密钥只保存在本机后端环境变量里，不会打包进前端，也不会进 git
        </p>
        <input
          type="password"
          disabled
          placeholder="在 backend/.env 中配置 DEEPSEEK_API_KEY"
          className="mt-3 w-full rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-400"
        />
      </section>

      <section className="rounded-xl border border-paper-200 bg-white p-5">
        <h2 className="text-sm font-medium text-ink-950">数据备份</h2>
        <p className="mt-1 text-xs text-ink-400">
          导出/导入全量数据（M5 上线）
        </p>
      </section>
    </div>
  );
}
