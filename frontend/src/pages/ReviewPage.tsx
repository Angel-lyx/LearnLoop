import { useEffect, useState } from "react";

import { examsApi } from "../lib/api";
import { useTaskStore } from "../stores/taskStore";
import type { Exam } from "../types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReviewPage() {
  const { items, loading, error, load, add, toggle, remove, dismissError } = useTaskStore();
  const [title, setTitle] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    void load();
    examsApi.all().then(setExams).catch(() => setExams([]));
  }, [load]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const ok = await add(title.trim(), todayISO());
    if (ok) setTitle("");
  }

  const today = todayISO();
  const overdue = items.filter((item) => item.due_date < today && !item.done);
  const todays = items.filter((item) => item.due_date >= today);
  const doneCount = items.filter((item) => item.done).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">复习计划</h1>
        <p className="muted mt-1.5">
          今日任务 {doneCount}/{items.length} 已完成 · 逾期未完成的会自动顺延
        </p>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={dismissError} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      <section className="card p-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="手动添加一条今日任务"
            className="min-w-0 flex-1 rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            添加
          </button>
        </form>
      </section>

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-400">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-300 bg-white/70 backdrop-blur-sm px-6 py-14 text-center">
          <p className="text-sm text-ink-600">今天没有任务</p>
          <p className="mt-1 text-xs text-ink-400">
            在学科里录入考试并生成复习计划，任务会自动出现在这里
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          {overdue.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-medium text-amber-700">
                逾期未完成（已顺延到今天）
              </h2>
              <ul className="space-y-2">
                {overdue.map((task) => (
                  <TaskRow
                    key={task.id}
                    id={task.id}
                    title={task.title}
                    dueDate={task.due_date}
                    done={task.done}
                    onToggle={() => void toggle(task.id, true)}
                    onRemove={() => void remove(task.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-xs font-medium text-ink-400">今天</h2>
            {todays.length === 0 ? (
              <p className="rounded-lg bg-white/70 px-4 py-6 text-center text-sm text-ink-400">
                今天的任务都完成了 🎉
              </p>
            ) : (
              <ul className="space-y-2">
                {todays.map((task) => (
                  <TaskRow
                    key={task.id}
                    id={task.id}
                    title={task.title}
                    dueDate={task.due_date}
                    done={task.done}
                    onToggle={() => void toggle(task.id, !task.done)}
                    onRemove={() => void remove(task.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {exams.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-medium text-ink-950">考试倒计时</h2>
          <ul className="mt-3 space-y-2">
            {exams.map((exam) => (
              <li key={exam.id} className="flex items-center justify-between text-sm">
                <span className="text-ink-700">{exam.title}</span>
                <span
                  className={`text-xs ${
                    exam.days_left < 0
                      ? "text-ink-400"
                      : exam.days_left <= 7
                        ? "text-amber-700"
                        : "text-ink-500"
                  }`}
                >
                  {exam.days_left < 0 ? "已结束" : `${exam.days_left} 天后`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TaskRow({
  title,
  dueDate,
  done,
  onToggle,
  onRemove,
}: {
  id: number;
  title: string;
  dueDate: string;
  done: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="card group flex items-center gap-3 px-4 py-3">
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        className="h-4 w-4 rounded border-paper-300 accent-[var(--color-brand-500)]"
      />
      <span
        className={`flex-1 text-sm ${done ? "text-ink-400 line-through" : "text-ink-800"}`}
      >
        {title}
      </span>
      <span className="text-xs text-ink-400">{dueDate}</span>
      <button
        onClick={onRemove}
        className="text-xs text-ink-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
      >
        删除
      </button>
    </li>
  );
}
