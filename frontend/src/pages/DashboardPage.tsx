import { Link } from "react-router-dom";

import { useSubjectStore } from "../stores/subjectStore";

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
  const today = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">主页</h1>
        <p className="mt-1 text-sm text-ink-400">{today} · 今天也按计划推进</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="今日任务" value="0 / 0" hint="复习计划接入后自动生成" />
        <StatCard label="最近考试" value="暂无" hint="录入考试后显示倒计时" />
        <StatCard label="综合成绩" value="待录入" hint="必修成绩与综测合成" />
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
              <li
                key={subject.id}
                className="flex items-center gap-2.5 rounded-lg border border-paper-200 px-3 py-2.5"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
                <span className="text-sm text-ink-800">{subject.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
