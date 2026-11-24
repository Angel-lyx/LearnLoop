import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useSubjectStore } from "../stores/subjectStore";

const COLORS = ["#4F7CFF", "#FF6B6B", "#22B573", "#F5A623", "#9B59B6", "#00A3A3"];

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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">学科</h1>
        <p className="mt-1 text-sm text-ink-400">
          每个学科下会挂资料、错题、导图与考试
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-paper-200 bg-white p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={50}
            placeholder="学科名称，例如：高等数学"
            className="min-w-0 flex-1 rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "创建中…" : "新建学科"}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-ink-400">颜色</span>
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`选择颜色 ${item}`}
              aria-pressed={color === item}
              onClick={() => setColor(item)}
              className={`h-5 w-5 rounded-full transition-transform ${
                color === item ? "scale-110 ring-2 ring-offset-2 ring-ink-400" : ""
              }`}
              style={{ backgroundColor: item }}
            />
          ))}
        </div>
      </form>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={dismissError} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      <section>
        {loading && items.length === 0 ? (
          <p className="text-sm text-ink-400">加载中…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-ink-400">还没有学科</p>
            <p className="mt-1 text-xs text-ink-400">
              先建一个，比如「高等数学」「数据结构」
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((subject) => (
              <li
                key={subject.id}
                className="group flex items-center justify-between rounded-xl border border-paper-200 bg-white px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <Link
                    to={`/subjects/${subject.id}`}
                    className="truncate text-sm text-ink-800 hover:text-brand-600"
                  >
                    {subject.name}
                  </Link>
                </div>
                <button
                  onClick={() => void remove(subject.id)}
                  className="text-xs text-ink-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
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
