import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useMapStore } from "../../stores/studyStore";

export default function MindMapPanel({ subjectId }: { subjectId: number }) {
  const { items, loading, generating, error, load, generate, remove, dismissError } =
    useMapStore();
  const navigate = useNavigate();

  useEffect(() => {
    void load(subjectId);
  }, [subjectId, load]);

  async function handleGenerate() {
    const created = await generate(subjectId);
    if (created) navigate(`/maps/${created.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          AI 会综合该学科的资料、错题与考试范围，生成可编辑的复习导图
        </p>
        <button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="btn btn-primary"
        >
          {generating ? "生成中…" : "AI 生成导图"}
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={dismissError} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-400">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-300 bg-white/70 backdrop-blur-sm px-6 py-14 text-center">
          <p className="text-sm text-ink-600">还没有思维导图</p>
          <p className="mt-1 text-xs text-ink-400">
            先上传一些资料或录入错题，AI 生成的内容会更有针对性
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-paper-200 overflow-hidden">
          {items.map((map) => (
            <li
              key={map.id}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-paper-50"
            >
              <span className="text-base" aria-hidden>
                🧠
              </span>
              <Link
                to={`/maps/${map.id}`}
                className="min-w-0 flex-1 truncate text-sm text-ink-800 hover:text-brand-600"
              >
                {map.title}
              </Link>
              <span className="text-xs text-ink-400">
                {new Date(map.updated_at).toLocaleDateString("zh-CN")}
              </span>
              <button
                onClick={() => void remove(map.id)}
                className="text-xs text-ink-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
