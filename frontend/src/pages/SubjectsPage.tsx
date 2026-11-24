import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useSubjectStore } from "../stores/subjectStore";

const COLORS = ["#6F5CE8", "#E2607C", "#1F9D8F", "#D98B2B", "#3D7BD9", "#8B5CF6"];

export default function SubjectsPage() {
  const { items, loading, error, create, remove, dismissError } = useSubjectStore();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const ok = await create({ name: trimmed, color });
    setSubmitting(false);
    if (ok) setName("");
  }

  return (
    <div className="space-y-7">
      <header>
        <h1 className="page-title">学科</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          每个学科下会挂资料、错题、导图与考试
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={50}
            placeholder="学科名称，例如：高等数学"
            className="input flex-1"
          />
          <div className="flex items-center gap-2">
            {COLORS.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`选择颜色 ${item}`}
                aria-pressed={color === item}
                onClick={() => setColor(item)}
                className={`h-6 w-6 rounded-full transition-all ${
                  color === item
                    ? "scale-110 ring-2 ring-brand-300 ring-offset-2"
                    : "hover:scale-105"
                }`}
                style={{
                  backgroundColor: item,
                  boxShadow: `0 4px 10px -4px ${item}`,
                }}
              />
            ))}
          </div>
          <button type="submit" disabled={!name.trim() || submitting} className="btn btn-primary">
            {submitting ? "创建中…" : "新建学科"}
          </button>
        </div>
      </form>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={dismissError} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      <section>
        {loading && items.length === 0 ? (
          <p className="muted">加载中…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-paper-300 bg-white/60 px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-xl">
              📚
            </div>
            <p className="text-sm font-medium text-ink-700">还没有学科</p>
            <p className="mt-1 text-xs text-ink-400">
              先建一个，比如「高等数学」「数据结构」
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((subject) => (
              <li key={subject.id} className="card card-lift group relative p-4">
                <Link to={`/subjects/${subject.id}`} className="block">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-9 w-9 shrink-0 rounded-xl"
                      style={{
                        background: `linear-gradient(145deg, ${subject.color}, ${subject.color}aa)`,
                        boxShadow: `0 8px 16px -10px ${subject.color}`,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink-900">
                        {subject.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-400">
                        资料 · 错题 · 导图 · 考试
                      </div>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => void remove(subject.id)}
                  className="absolute right-3 top-3 rounded-md px-1.5 py-0.5 text-[11px] text-ink-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
