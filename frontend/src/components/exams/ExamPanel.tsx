import { useEffect, useState } from "react";

import { useExamStore } from "../../stores/studyStore";
import { useTaskStore } from "../../stores/taskStore";

export default function ExamPanel({ subjectId }: { subjectId: number }) {
  const { items, loading, error, load, create, remove, generatePlan, dismissError } =
    useExamStore();
  const reloadTasks = useTaskStore((state) => state.load);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [scope, setScope] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load(subjectId);
  }, [subjectId, load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !examDate) return;
    const ok = await create(subjectId, {
      title: title.trim(),
      exam_date: examDate,
      scope: scope.trim(),
    });
    if (ok) {
      setTitle("");
      setExamDate("");
      setScope("");
      setShowForm(false);
    }
  }

  async function handlePlan(examId: number) {
    setBusy(true);
    setNotice(null);
    const count = await generatePlan(examId);
    setBusy(false);
    if (count > 0) {
      setNotice(`已生成 ${count} 条复习任务，去「复习计划」查看每日安排`);
      await reloadTasks();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          录入考试后，系统会汇总该学科的资料、错题与导图，倒排成每日计划
        </p>
        <button
          onClick={() => setShowForm((value) => !value)}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {showForm ? "收起" : "录入考试"}
        </button>
      </div>

      {(error || notice) && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${
            error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
          }`}
        >
          <span>{error ?? notice}</span>
          <button
            onClick={() => {
              dismissError();
              setNotice(null);
            }}
            className="text-xs underline"
          >
            关闭
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-2 rounded-xl border border-paper-200 bg-white p-4"
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="考试名称，例如：高等数学期中"
            className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              className="rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              placeholder="考试范围（可选）"
              className="flex-1 rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={!title.trim() || !examDate}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            保存考试
          </button>
        </form>
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-400">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-14 text-center">
          <p className="text-sm text-ink-600">还没有考试</p>
          <p className="mt-1 text-xs text-ink-400">录入后可以一键生成复习计划</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((exam) => (
            <li
              key={exam.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-paper-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-900">{exam.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      exam.days_left < 0
                        ? "bg-paper-100 text-ink-400"
                        : exam.days_left <= 7
                          ? "bg-amber-50 text-amber-600"
                          : "bg-brand-50 text-brand-600"
                    }`}
                  >
                    {exam.days_left < 0 ? "已结束" : `还剩 ${exam.days_left} 天`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-400">
                  {exam.exam_date}
                  {exam.scope ? ` · ${exam.scope}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => void handlePlan(exam.id)}
                  disabled={busy || exam.days_left < 0}
                  className="rounded-lg border border-brand-500 px-2.5 py-1 text-brand-600 hover:bg-brand-50 disabled:opacity-40"
                >
                  生成复习计划
                </button>
                <button
                  onClick={() => void remove(exam.id)}
                  className="text-ink-400 hover:text-red-500"
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
