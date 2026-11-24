export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">复习计划</h1>
        <p className="mt-1 text-sm text-ink-400">
          按考试日期倒排，自动拆成每日任务
        </p>
      </header>
      <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-14 text-center">
        <p className="text-sm text-ink-600">M3 上线</p>
        <p className="mt-1 text-xs text-ink-400">
          先完成考试录入，计划会汇总该学科的资料、错题与导图
        </p>
      </div>
    </div>
  );
}
