import { useState } from "react";

import { formatDayLabel, isDetailed, sortCoverage, totalMinutes } from "../../lib/plan";
import type { AIPlan, AIPlanDay, PlanCoverage } from "../../types";

export default function PlanView({
  plan,
  examTitle,
  regenerating,
  onRegenerate,
  onClose,
}: {
  plan: AIPlan;
  examTitle: string;
  regenerating: boolean;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const coverage = sortCoverage(plan.coverage);
  const [showAllCoverage, setShowAllCoverage] = useState(false);
  const visibleCoverage = showAllCoverage ? coverage : coverage.slice(0, 8);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="section-title">AI 定制计划</h3>
          <p className="mt-1 text-xs text-ink-400">
            {examTitle} · 共 {plan.days.length} 天 · 前 10 天带考点速览与自测
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="btn btn-ghost !px-2.5 !py-1 text-xs"
          >
            {regenerating ? "重新排期中…" : "重新生成"}
          </button>
          <button onClick={onClose} className="text-xs text-ink-400 hover:text-ink-700">
            收起
          </button>
        </div>
      </div>

      {plan.summary && <p className="mt-3 text-sm leading-relaxed text-ink-700">{plan.summary}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`chip ${
            plan.source_note.startsWith("已参考")
              ? "!border-brand-200 !bg-brand-50 !text-brand-600"
              : "!border-amber-200 !bg-amber-50 !text-amber-700"
          }`}
        >
          {plan.source_note || "已生成"}
        </span>
        {visibleCoverage.map((item) => (
          <CoverageChip key={item.topic} item={item} />
        ))}
        {coverage.length > visibleCoverage.length && (
          <button
            onClick={() => setShowAllCoverage(true)}
            className="chip hover:border-brand-400 hover:text-brand-600"
          >
            +{coverage.length - visibleCoverage.length} 个专题
          </button>
        )}
      </div>

      <ol className="mt-4 space-y-2">
        {plan.days.map((day, index) => (
          <DayCard key={day.date} day={day} index={index} />
        ))}
      </ol>
    </section>
  );
}

function CoverageChip({ item }: { item: PlanCoverage }) {
  const tone =
    item.weight === "高频"
      ? "!border-rose-200 !bg-rose-50 !text-rose-600"
      : item.weight === "中频"
        ? "!border-amber-200 !bg-amber-50 !text-amber-700"
        : "";
  return (
    <span className={`chip ${tone}`} title={item.date ? `安排在 ${item.date}` : "待排期"}>
      {item.topic}
      {item.weight && <span className="opacity-70">· {item.weight}</span>}
    </span>
  );
}

function DayCard({ day, index }: { day: AIPlanDay; index: number }) {
  const [revealed, setRevealed] = useState<boolean[]>(() => day.quiz.map(() => false));
  const minutes = totalMinutes(day);

  function reveal(target: number) {
    setRevealed((previous) => previous.map((value, i) => (i === target ? true : value)));
  }

  return (
    <li>
      <details
        open={index < 2}
        className="rounded-xl border border-paper-200 bg-white/70 open:bg-white/90"
      >
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5">
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] text-brand-600">
            第 {index + 1} 天
          </span>
          <span className="text-sm font-medium text-ink-900">{day.focus || "继续推进"}</span>
          <span className="text-xs text-ink-400">{formatDayLabel(day.date)}</span>
          {minutes > 0 && (
            <span className="ml-auto text-xs text-ink-400">约 {minutes} 分钟</span>
          )}
        </summary>

        <div className="space-y-3 px-3 pb-3">
          {day.goal && <p className="text-xs text-ink-500">当天目标：{day.goal}</p>}

          {day.notes.length > 0 && (
            <section>
              <h4 className="text-xs font-medium text-ink-500">考点速览 · 直接背</h4>
              <ul className="mt-1 space-y-1">
                {day.notes.map((note) => (
                  <li
                    key={note}
                    className="rounded-lg bg-paper-50 px-2.5 py-1.5 text-sm leading-relaxed text-ink-800"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {day.tasks.length > 0 && (
            <section>
              <h4 className="text-xs font-medium text-ink-500">今日任务</h4>
              <ul className="mt-1 space-y-1">
                {day.tasks.map((task) => (
                  <li key={task.title} className="text-sm text-ink-800">
                    · {task.title}
                    <span className="ml-2 text-xs text-ink-400">{task.minutes} 分钟</span>
                    {task.detail && (
                      <p className="ml-3 text-xs text-ink-500">{task.detail}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {day.pitfalls.length > 0 && (
            <section className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-800">
              <span className="font-medium">易错点：</span>
              {day.pitfalls.join("；")}
            </section>
          )}

          {day.quiz.length > 0 && (
            <section>
              <h4 className="text-xs font-medium text-ink-500">当天自测</h4>
              <ul className="mt-1 space-y-1.5">
                {day.quiz.map((quiz, quizIndex) => (
                  <li
                    key={quiz.question}
                    className="rounded-lg border border-paper-200 px-2.5 py-2"
                  >
                    <p className="text-sm text-ink-800">{quiz.question}</p>
                    {revealed[quizIndex] ? (
                      <p className="mt-1 text-xs leading-relaxed text-brand-600">
                        {quiz.answer || "（没有给出答案）"}
                      </p>
                    ) : (
                      <button
                        onClick={() => reveal(quizIndex)}
                        className="mt-1 text-xs text-ink-400 underline hover:text-brand-600"
                      >
                        显示答案
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {day.resources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {day.resources.map((resource) => (
                <a
                  key={resource.url}
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="chip hover:border-brand-400 hover:text-brand-600"
                >
                  🔗 {resource.title || resource.url}
                </a>
              ))}
            </div>
          )}

          {!isDetailed(day) && (
            <p className="text-xs text-ink-400">
              这一天先按任务推进；考前再点「重新生成」，会把这段时间的考点速览补齐。
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
