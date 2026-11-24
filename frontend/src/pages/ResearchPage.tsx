const modules = [
  {
    title: "必修成绩",
    desc: "上传成绩单识别课程与学分，只算必修，自动算加权与 GPA",
  },
  {
    title: "综测",
    desc: "录入学院细则，加分材料自动归类到德智体美劳",
  },
  {
    title: "综合成绩与模拟",
    desc: "按学校权重合成总分，模拟提分后的结果",
  },
];

export default function ResearchPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">保研</h1>
        <p className="mt-1 text-sm text-ink-400">
          必修成绩与综测两套分数，最终合成综合成绩
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {modules.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-paper-200 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink-950">{item.title}</h2>
              <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[11px] text-ink-400">
                M4
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-400">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
