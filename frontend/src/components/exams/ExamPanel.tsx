import { useEffect, useRef, useState } from "react";

import { examsApi } from "../../lib/api";
import type { AIPlan, Exam } from "../../types";
import { useExamStore } from "../../stores/studyStore";
import { useTaskStore } from "../../stores/taskStore";
import PlanView from "./PlanView";

function planErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "生成失败";
  // 旧后端没有 /plan/ai 路由时只会回一个 "Not Found"，这里翻译成可操作的提示
  if (message === "Not Found") {
    return "后端服务还是旧版本，重启后端（uvicorn）后再试一次";
  }
  return message;
}

export default function ExamPanel({ subjectId }: { subjectId: number }) {
  const { items, loading, error, load, create, remove, generatePlan, dismissError } =
    useExamStore();
  const reloadTasks = useTaskStore((state) => state.load);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [scope, setScope] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeFailed, setNoticeFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(null);
  const [aiExam, setAiExam] = useState<{ id: number; title: string } | null>(null);
  const autoLoaded = useRef<number | null>(null);

  useEffect(() => {
    void load(subjectId);
    setAiPlan(null);
    setAiExam(null);
    autoLoaded.current = null;
  }, [subjectId, load]);

  // 再次进入页面时，直接展示已经生成过的计划，不用重新花 token
  useEffect(() => {
    if (!items.length || autoLoaded.current === subjectId) return;
    const next = items.find((exam) => exam.days_left >= 0);
    if (!next) return;
    autoLoaded.current = subjectId;
    examsApi
      .savedAiPlan(next.id)
      .then((saved) => {
        if (saved.days.length === 0) return;
        setAiPlan(saved);
        setAiExam({ id: next.id, title: next.title });
      })
      .catch(() => undefined);
  }, [items, subjectId]);

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
      setNoticeFailed(false);
      setNotice(`已生成 ${count} 条复习任务，去「复习计划」查看每日安排`);
      await reloadTasks();
    }
  }

  async function handleAiPlan(exam: Exam | { id: number; title: string }) {
    setAiBusy(exam.id);
    setNotice(null);
    try {
      const result = await examsApi.aiPlan(exam.id, minutes);
      setAiPlan(result);
      setAiExam({ id: exam.id, title: exam.title });
      setNoticeFailed(false);
      setNotice(
        `${result.source_note}，已按 ${result.days.length} 天排好；前 10 天有考点速览与自测`,
      );
      await reloadTasks();
    } catch (err) {
      setNoticeFailed(true);
      setNotice(planErrorMessage(err));
    } finally {
      setAiBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          录入考试后，系统会汇总该学科的资料、错题与导图，联网补充参考资料，
          倒排成每日计划，并给出考点速览与自测题
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-400">
            每天
            <select
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="rounded-lg border border-paper-200 bg-white/80 px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500"
            >
              {[30, 60, 90, 120].map((value) => (
                <option key={value} value={value}>
                  {value} 分钟
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setShowForm((value) => !value)}
            className="btn btn-primary"
          >
            {showForm ? "收起" : "录入考试"}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${
            error || noticeFailed
              ? "bg-red-50 text-red-600"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          <span>{error ?? notice}</span>
          <button
            onClick={() => {
              dismissError();
              setNotice(null);
              setNoticeFailed(false);
            }}
            className="text-xs underline"
          >
            关闭
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-2 p-4">
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
              placeholder="考试范围（可选），例如：极限到定积分"
              className="flex-1 rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={!title.trim() || !examDate}
            className="btn btn-primary text-xs"
          >
            保存考试
          </button>
        </form>
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-400">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-300 bg-white/70 backdrop-blur-sm px-6 py-14 text-center">
          <p className="text-sm text-ink-600">还没有考试</p>
          <p className="mt-1 text-xs text-ink-400">录入后可以一键生成复习计划</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((exam) => (
            <li
              key={exam.id}
              className="card flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-900">{exam.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      exam.days_left < 0
                        ? "bg-paper-100 text-ink-400"
                        : exam.days_left <= 7
                          ? "bg-amber-50 text-amber-700"
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
                  onClick={() => void handleAiPlan(exam)}
                  disabled={aiBusy !== null || exam.days_left < 0}
                  className="btn btn-primary !px-2.5 !py-1 text-xs"
                >
                  {aiBusy === exam.id ? "检索排期中…" : "AI 智能计划"}
                </button>
                <button
                  onClick={() => void handlePlan(exam.id)}
                  disabled={busy || exam.days_left < 0}
                  className="btn btn-ghost !px-2.5 !py-1 text-xs"
                >
                  快速排期
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

      {aiPlan && aiExam && (
        <PlanView
          key={`${aiExam.id}-${aiPlan.days[0]?.date ?? ""}-${aiPlan.summary.slice(0, 12)}`}
          plan={aiPlan}
          examTitle={aiExam.title}
          regenerating={aiBusy !== null}
          onRegenerate={() => void handleAiPlan(aiExam)}
          onClose={() => {
            setAiPlan(null);
            setAiExam(null);
          }}
        />
      )}
    </div>
  );
}
