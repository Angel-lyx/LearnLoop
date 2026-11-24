import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { examsApi } from "../lib/api";
import { useSubjectStore } from "../stores/subjectStore";
import { useTaskStore } from "../stores/taskStore";
import type { Exam } from "../types";

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  tone: "brand" | "amber" | "teal";
}) {
  const tones = {
    brand: "from-brand-50 to-white text-brand-600",
    amber: "from-amber-50 to-white text-amber-700",
    teal: "from-teal-50 to-white text-teal-600",
  } as const;
  return (
    <div className="card card-lift relative overflow-hidden p-4">
      <div
        className={`pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-gradient-to-br ${tones[tone]} opacity-70`}
      />
      <div className="relative flex items-center gap-2 text-xs text-ink-400">
        <span aria-hidden className="text-sm">
          {icon}
        </span>
        {label}
      </div>
      <div className="relative mt-2 text-[26px] font-bold tracking-tight text-ink-950">
        {value}
      </div>
      <div className="relative mt-1 text-[11px] text-ink-400">{hint}</div>
    </div>
  );
}

export default function DashboardPage() {
  const subjects = useSubjectStore((state) => state.items);
  const { items: tasks, load: loadTasks, toggle } = useTaskStore();
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    void loadTasks();
    examsApi.all().then(setExams).catch(() => setExams([]));
  }, [loadTasks]);

  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter((task) => task.due_date === today || !task.done);
  const doneCount = todayTasks.filter((task) => task.done).length;
  const nextExam = exams.find((exam) => exam.days_left >= 0);
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <div className="space-y-7">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title">主页</h1>
          <p className="mt-1.5 text-sm text-ink-400">{dateText} · 今天也按计划推进</p>
        </div>
        <Link to="/review" className="btn btn-soft hidden sm:inline-flex">
          查看今日任务
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon="✅"
          label="今日任务"
          value={`${doneCount} / ${todayTasks.length}`}
          hint={todayTasks.length ? "勾选即完成，逾期自动顺延" : "去学科里生成复习计划"}
          tone="brand"
        />
        <StatCard
          icon="⏳"
          label="最近考试"
          value={nextExam ? `${nextExam.days_left} 天` : "暂无"}
          hint={nextExam ? nextExam.title : "录入考试后显示倒计时"}
          tone="amber"
        />
        <StatCard
          icon="🎓"
          label="综合成绩"
          value="待录入"
          hint="必修成绩与综测合成"
          tone="teal"
        />
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title">今日任务</h2>
          <Link
            to="/review"
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            全部任务 →
          </Link>
        </div>

        {todayTasks.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-paper-200 bg-paper-50 px-4 py-8 text-center">
            <p className="text-sm text-ink-600">今天还没有任务</p>
            <Link
              to="/review"
              className="mt-2 inline-flex text-xs font-medium text-brand-600 hover:underline"
            >
              去添加一条
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {todayTasks.slice(0, 6).map((task) => (
              <li
                key={task.id}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-paper-50"
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => void toggle(task.id, !task.done)}
                  className="h-4 w-4 rounded border-paper-300 accent-[var(--color-brand-500)]"
                />
                <span
                  className={`flex-1 text-sm ${
                    task.done ? "text-ink-400 line-through" : "text-ink-800"
                  }`}
                >
                  {task.title}
                </span>
                {task.due_date < today && !task.done && (
                  <span className="chip !border-amber-200 !bg-amber-50 !text-amber-700">
                    逾期
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title">学科速览</h2>
          <Link
            to="/subjects"
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            管理学科 →
          </Link>
        </div>

        {subjects.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-paper-200 bg-paper-50 px-4 py-8 text-center">
            <p className="text-sm text-ink-600">还没有学科</p>
            <Link
              to="/subjects"
              className="mt-2 inline-flex text-xs font-medium text-brand-600 hover:underline"
            >
              创建一个
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {subjects.map((subject) => (
              <li key={subject.id}>
                <Link
                  to={`/subjects/${subject.id}`}
                  className="card card-lift flex items-center gap-3 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className="h-8 w-8 shrink-0 rounded-lg"
                    style={{
                      background: `linear-gradient(145deg, ${subject.color}, ${subject.color}bb)`,
                      boxShadow: `0 6px 14px -8px ${subject.color}`,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">
                    {subject.name}
                  </span>
                  <span className="text-xs text-ink-400">进入 →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
