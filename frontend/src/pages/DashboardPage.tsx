import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { examsApi } from "../lib/api";
import { useSubjectStore } from "../stores/subjectStore";
import { useTaskStore } from "../stores/taskStore";
import type { Exam } from "../types";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-paper-200 bg-white p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink-950">{value}</div>
      <div className="mt-1 text-xs text-ink-400">{hint}</div>
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
  const todayTasks = tasks.filter((task) => task.due_date === today || (!task.done));
  const doneCount = todayTasks.filter((task) => task.done).length;
  const nextExam = exams.find((exam) => exam.days_left >= 0);
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">主页</h1>
        <p className="mt-1 text-sm text-ink-400">{dateText} · 今天也按计划推进</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="今日任务"
          value={`${doneCount} / ${todayTasks.length}`}
          hint={todayTasks.length ? "勾选即完成，逾期会自动顺延" : "去学科里生成复习计划"}
        />
        <StatCard
          label="最近考试"
          value={nextExam ? `${nextExam.days_left} 天` : "暂无"}
          hint={nextExam ? nextExam.title : "录入考试后显示倒计时"}
        />
        <StatCard label="综合成绩" value="待录入" hint="必修成绩与综测合成（M4）" />
      </section>

      <section className="rounded-xl border border-paper-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink-950">今日任务</h2>
          <Link to="/review" className="text-sm text-brand-600 hover:underline">
            全部任务
          </Link>
        </div>

        {todayTasks.length === 0 ? (
          <p className="mt-4 rounded-lg bg-paper-50 px-4 py-6 text-center text-sm text-ink-400">
            今天还没有任务，去
            <Link to="/review" className="mx-1 text-brand-600 hover:underline">
              复习计划
            </Link>
            添加一条吧
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {todayTasks.slice(0, 6).map((task) => (
              <li key={task.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => void toggle(task.id, !task.done)}
                  className="h-4 w-4 accent-[var(--color-brand-500)]"
                />
                <span
                  className={task.done ? "text-ink-400 line-through" : "text-ink-800"}
                >
                  {task.title}
                </span>
                {task.due_date < today && !task.done && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-600">
                    逾期
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-paper-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink-950">学科速览</h2>
          <Link to="/subjects" className="text-sm text-brand-600 hover:underline">
            管理学科
          </Link>
        </div>

        {subjects.length === 0 ? (
          <p className="mt-4 rounded-lg bg-paper-50 px-4 py-6 text-center text-sm text-ink-400">
            还没有学科，先去
            <Link to="/subjects" className="mx-1 text-brand-600 hover:underline">
              创建一个
            </Link>
            吧
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {subjects.map((subject) => (
              <li key={subject.id}>
                <Link
                  to={`/subjects/${subject.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-paper-200 px-3 py-2.5 hover:border-brand-500"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <span className="text-sm text-ink-800">{subject.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
