import { useEffect, useRef, useState } from "react";

import {
  researchApi,
  type CourseDraft,
  type RuleDraft,
} from "../lib/api";
import type {
  BonusItem,
  Course,
  Dimension,
  ResearchOverview,
  ScoreRule,
} from "../types";

const DIMENSIONS: Dimension[] = ["德", "智", "体", "美", "劳"];
type Tab = "courses" | "zongce" | "composite";

export default function ResearchPage() {
  const [tab, setTab] = useState<Tab>("courses");
  const [overview, setOverview] = useState<ResearchOverview | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [rules, setRules] = useState<ScoreRule[]>([]);
  const [bonus, setBonus] = useState<BonusItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [nextOverview, nextCourses, nextRules, nextBonus] = await Promise.all([
        researchApi.overview(),
        researchApi.courses(),
        researchApi.rules(),
        researchApi.bonus(),
      ]);
      setOverview(nextOverview);
      setCourses(nextCourses);
      setRules(nextRules);
      setBonus(nextBonus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">保研</h1>
        <p className="muted mt-1.5">
          必修成绩与综测两套分数，按学校权重合成综合成绩
        </p>
      </header>

      <div className="tabbar">
        {(
          [
            ["courses", "必修成绩"],
            ["zongce", "综测"],
            ["composite", "综合成绩"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`tab ${tab === value ? "tab-active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      {tab === "courses" && (
        <CoursesTab
          courses={courses}
          overview={overview}
          onChanged={refresh}
          onError={setError}
        />
      )}
      {tab === "zongce" && (
        <ZongceTab
          rules={rules}
          bonus={bonus}
          overview={overview}
          onChanged={refresh}
          onError={setError}
        />
      )}
      {tab === "composite" && (
        <CompositeTab overview={overview} onChanged={refresh} onError={setError} />
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight text-ink-950">
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-ink-400">{hint}</div>}
    </div>
  );
}

function CoursesTab({
  courses,
  overview,
  onChanged,
  onError,
}: {
  courses: Course[];
  overview: ResearchOverview | null;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [credits, setCredits] = useState("3");
  const [score, setScore] = useState("");
  const [category, setCategory] = useState<"required" | "elective">("required");
  const [drafts, setDrafts] = useState<CourseDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    onError(null);
    try {
      setDrafts(await researchApi.parseCoursesFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "成绩单识别失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateDraft(index: number, patch: Partial<CourseDraft>) {
    setDrafts((current) =>
      current
        ? current.map((item, i) => (i === index ? { ...item, ...patch } : item))
        : current,
    );
  }

  async function confirmDrafts() {
    if (!drafts) return;
    setBusy(true);
    try {
      for (const draft of drafts) {
        await researchApi.addCourse({ ...draft, term: "" });
      }
      setDrafts(null);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const creditValue = Number(credits);
    const scoreValue = Number(score);
    if (!name.trim() || !creditValue || Number.isNaN(scoreValue)) return;
    if (scoreValue < 0 || scoreValue > 100) {
      onError("成绩需要在 0-100 之间");
      return;
    }
    try {
      await researchApi.addCourse({
        name: name.trim(),
        credits: creditValue,
        score: scoreValue,
        category,
        term: "",
      });
      setName("");
      setScore("");
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "添加失败");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="加权平均分"
          value={overview ? overview.courses.weighted_average.toFixed(2) : "—"}
          hint="仅统计必修课"
        />
        <Stat
          label="GPA（4.0）"
          value={overview ? overview.courses.gpa.toFixed(2) : "—"}
          hint="按学分加权"
        />
        <Stat label="必修学分" value={overview ? String(overview.courses.credits) : "—"} />
        <Stat label="必修门数" value={overview ? String(overview.courses.count) : "—"} />
      </div>

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-paper-200 bg-white p-4"
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="课程名称"
          className="input min-w-[160px] flex-1"
        />
        <input
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          type="number"
          step="0.5"
          min="0.5"
          placeholder="学分"
          className="input !w-20"
        />
        <input
          value={score}
          onChange={(event) => setScore(event.target.value)}
          type="number"
          min="0"
          max="100"
          placeholder="成绩"
          className="input !w-20"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as "required" | "elective")}
          className="rounded-lg border border-paper-200 px-2 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="required">必修</option>
          <option value="elective">选修</option>
        </select>
        <button
          type="submit"
          className="btn btn-primary"
        >
          添加课程
        </button>
      </form>

      <section className="rounded-xl border border-paper-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id="course-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(event) => void handleFile(event)}
          />
          <label
            htmlFor="course-file"
            className="btn btn-soft cursor-pointer text-xs"
          >
            {busy && !drafts ? "识别中…" : "上传成绩单识别"}
          </label>
          <span className="text-xs text-ink-400">
            支持成绩单截图、教务 PDF；识别结果可逐行修改后再导入
          </span>
        </div>

        {drafts && (
          <div className="mt-3 rounded-lg bg-paper-50 p-3">
            <p className="text-xs text-ink-500">
              识别到 {drafts.length} 门课程，确认无误后导入：
            </p>
            <ul className="mt-2 space-y-1.5">
              {drafts.map((draft, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft(index, { name: event.target.value })}
                    className="min-w-[140px] flex-1 rounded border border-paper-200 px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={draft.credits}
                    onChange={(event) =>
                      updateDraft(index, { credits: Number(event.target.value) })
                    }
                    className="w-16 rounded border border-paper-200 px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    value={draft.score}
                    onChange={(event) =>
                      updateDraft(index, { score: Number(event.target.value) })
                    }
                    className="w-16 rounded border border-paper-200 px-2 py-1 text-sm"
                  />
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      updateDraft(index, {
                        category: event.target.value as "required" | "elective",
                      })
                    }
                    className="rounded border border-paper-200 px-2 py-1 text-sm"
                  >
                    <option value="required">必修</option>
                    <option value="elective">选修</option>
                  </select>
                  <button
                    onClick={() =>
                      setDrafts((current) =>
                        current ? current.filter((_, i) => i !== index) : current,
                      )
                    }
                    className="text-xs text-ink-400 hover:text-red-500"
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void confirmDrafts()}
                disabled={busy || drafts.length === 0}
                className="btn btn-primary text-xs"
              >
                {busy ? "导入中…" : "确认导入"}
              </button>
              <button
                onClick={() => setDrafts(null)}
                className="text-xs text-ink-400 hover:text-ink-600"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      {courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-ink-600">还没有课程</p>
          <p className="mt-1 text-xs text-ink-400">
            先手动添加几门必修课，或者等 M4.1 的成绩单识别
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-paper-200 overflow-hidden rounded-xl border border-paper-200 bg-white">
          {courses.map((course) => (
            <li key={course.id} className="group flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                {course.name}
              </span>
              <span className="rounded bg-paper-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                {course.category === "required" ? "必修" : "选修"}
              </span>
              <span className="w-14 text-right text-xs text-ink-500">
                {course.credits} 学分
              </span>
              <span className="w-12 text-right text-sm font-medium text-ink-800">
                {course.score}
              </span>
              <button
                onClick={async () => {
                  await researchApi.removeCourse(course.id);
                  await onChanged();
                }}
                className="text-xs text-ink-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ZongceTab({
  rules,
  bonus,
  overview,
  onChanged,
  onError,
}: {
  rules: ScoreRule[];
  bonus: BonusItem[];
  overview: ResearchOverview | null;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [dimension, setDimension] = useState<Dimension>("智");
  const [title, setTitle] = useState("");
  const [score, setScore] = useState("");
  const [ruleText, setRuleText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [drafts, setDrafts] = useState<RuleDraft[] | null>(null);
  const [bonusDrafts, setBonusDrafts] = useState<RuleDraft[] | null>(null);
  const ruleFileRef = useRef<HTMLInputElement>(null);
  const bonusFileRef = useRef<HTMLInputElement>(null);

  async function handleRuleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setParsing(true);
    onError(null);
    try {
      setDrafts(await researchApi.parseRulesFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "细则识别失败");
    } finally {
      setParsing(false);
      if (ruleFileRef.current) ruleFileRef.current.value = "";
    }
  }

  async function handleBonusFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setParsing(true);
    onError(null);
    try {
      setBonusDrafts(await researchApi.parseBonusFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "证书识别失败");
    } finally {
      setParsing(false);
      if (bonusFileRef.current) bonusFileRef.current.value = "";
    }
  }

  async function confirmBonusDrafts() {
    if (!bonusDrafts) return;
    try {
      for (const draft of bonusDrafts) {
        await researchApi.addBonus({
          dimension: draft.dimension,
          title: draft.name,
          score: draft.score,
        });
      }
      setBonusDrafts(null);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "导入失败");
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(score);
    if (!title.trim() || Number.isNaN(value) || value <= 0) return;
    try {
      await researchApi.addBonus({ dimension, title: title.trim(), score: value });
      setTitle("");
      setScore("");
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "添加失败");
    }
  }

  async function handleParse() {
    if (!ruleText.trim()) return;
    setParsing(true);
    onError(null);
    try {
      setDrafts(await researchApi.parseRules(ruleText.trim()));
    } catch (err) {
      onError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmDrafts() {
    if (!drafts) return;
    try {
      for (const draft of drafts) {
        await researchApi.addRule(draft);
      }
      setDrafts(null);
      setRuleText("");
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "导入失败");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {DIMENSIONS.map((item) => (
          <div
            key={item}
            className="rounded-xl border border-paper-200 bg-white p-3 text-center"
          >
            <div className="text-xs text-ink-400">{item}育</div>
            <div className="mt-1 text-xl font-semibold text-ink-950">
              {overview ? (overview.zongce.dimensions[item] ?? 0) : 0}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-paper-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-950">综测总分</h2>
          <span className="text-xl font-semibold text-brand-600">
            {overview ? overview.zongce.total : 0}
          </span>
        </div>
      </div>

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-paper-200 bg-white p-4"
      >
        <select
          value={dimension}
          onChange={(event) => setDimension(event.target.value as Dimension)}
          className="rounded-lg border border-paper-200 px-2 py-2 text-sm outline-none focus:border-brand-500"
        >
          {DIMENSIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="加分项，例如：数学建模国一"
          className="input min-w-[180px] flex-1"
        />
        <input
          value={score}
          onChange={(event) => setScore(event.target.value)}
          type="number"
          step="0.5"
          min="0"
          placeholder="分值"
          className="input !w-20"
        />
        <button
          type="submit"
          className="btn btn-primary"
        >
          添加加分
        </button>
        <input
          ref={bonusFileRef}
          id="bonus-file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(event) => void handleBonusFile(event)}
        />
        <label
          htmlFor="bonus-file"
          className="cursor-pointer rounded-lg border border-paper-200 px-3 py-2 text-xs text-ink-600 hover:bg-paper-50"
        >
          上传证书识别
        </label>
      </form>

      {bonusDrafts && (
        <div className="rounded-xl border border-paper-200 bg-white p-4">
          <p className="text-xs text-ink-500">
            从材料里识别到 {bonusDrafts.length} 条加分项，确认后写入：
          </p>
          <ul className="mt-2 space-y-1">
            {bonusDrafts.map((draft, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-ink-800">
                <span className="rounded bg-paper-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                  {draft.dimension}
                </span>
                <span className="flex-1 truncate">{draft.name}</span>
                <span className="text-xs text-ink-500">+{draft.score}</span>
                <button
                  onClick={() =>
                    setBonusDrafts((current) =>
                      current ? current.filter((_, i) => i !== index) : current,
                    )
                  }
                  className="text-xs text-ink-400 hover:text-red-500"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void confirmBonusDrafts()}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
            >
              确认导入
            </button>
            <button
              onClick={() => setBonusDrafts(null)}
              className="text-xs text-ink-400 hover:text-ink-600"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {bonus.length > 0 && (
        <ul className="divide-y divide-paper-200 overflow-hidden rounded-xl border border-paper-200 bg-white">
          {bonus.map((item) => (
            <li key={item.id} className="group flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 text-center text-xs text-ink-500">{item.dimension}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                {item.title}
              </span>
              <span className="text-sm font-medium text-ink-800">+{item.score}</span>
              <button
                onClick={async () => {
                  await researchApi.removeBonus(item.id);
                  await onChanged();
                }}
                className="text-xs text-ink-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-paper-200 bg-white p-4">
        <h2 className="text-sm font-medium text-ink-950">从细则生成加分项规则</h2>
        <p className="mt-1 text-xs text-ink-400">
          把学院细则粘贴进来，AI 会拆成「维度 + 名称 + 分值」，确认后写入规则库
        </p>
        <textarea
          value={ruleText}
          onChange={(event) => setRuleText(event.target.value)}
          rows={3}
          placeholder="例如：国家级学科竞赛一等奖 5 分；志愿服务满 50 小时 2 分……"
          className="mt-2 w-full resize-y rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void handleParse()}
            disabled={!ruleText.trim() || parsing}
            className="btn btn-soft text-xs"
          >
            {parsing ? "解析中…" : "AI 解析细则"}
          </button>
          <input
            ref={ruleFileRef}
            id="rule-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(event) => void handleRuleFile(event)}
          />
          <label
            htmlFor="rule-file"
            className="btn btn-ghost cursor-pointer text-xs"
          >
            上传细则文件/截图
          </label>
          <span className="text-xs text-ink-400">
            规则库当前 {rules.length} 条
          </span>
        </div>

        {drafts && (
          <div className="mt-3 rounded-lg bg-paper-50 p-3">
            <p className="text-xs text-ink-500">识别到 {drafts.length} 条，确认后导入：</p>
            <ul className="mt-2 space-y-1">
              {drafts.map((draft, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-ink-800">
                  <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-ink-600">
                    {draft.dimension}
                  </span>
                  <span className="flex-1 truncate">{draft.name}</span>
                  <span className="text-xs text-ink-500">+{draft.score}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void handleConfirmDrafts()}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
              >
                确认导入
              </button>
              <button
                onClick={() => setDrafts(null)}
                className="text-xs text-ink-400 hover:text-ink-600"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CompositeTab({
  overview,
  onChanged,
  onError,
}: {
  overview: ResearchOverview | null;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [weight, setWeight] = useState(overview?.composite.course_weight ?? 0.7);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (overview) setWeight(overview.composite.course_weight);
  }, [overview]);

  async function handleSave() {
    setSaving(true);
    try {
      await researchApi.saveWeights(weight);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const composite = overview?.composite.score ?? 0;
  const targetValue = Number(target);
  const gap = target && !Number.isNaN(targetValue) ? targetValue - composite : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="必修加权"
          value={overview ? overview.composite.course_score.toFixed(2) : "—"}
        />
        <Stat
          label="综测总分"
          value={overview ? String(overview.composite.zongce_score) : "—"}
        />
        <Stat label="保研综合成绩" value={composite.toFixed(2)} hint="按下方权重合成" />
      </div>

      <section className="rounded-xl border border-paper-200 bg-white p-4">
        <h2 className="text-sm font-medium text-ink-950">权重设置</h2>
        <p className="mt-1 text-xs text-ink-400">
          按学校规则调整：必修占比 {Math.round(weight * 100)}% · 综测占比{" "}
          {Math.round((1 - weight) * 100)}%
        </p>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={weight}
          onChange={(event) => setWeight(Number(event.target.value))}
          className="mt-3 w-full accent-[var(--color-brand-500)]"
        />
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="mt-3 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存权重"}
        </button>
      </section>

      <section className="rounded-xl border border-paper-200 bg-white p-4">
        <h2 className="text-sm font-medium text-ink-950">目标对照</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-500">目标分数</span>
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            type="number"
            step="0.1"
            placeholder="例如 85"
            className="w-24 rounded-lg border border-paper-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          {gap !== null && (
            <span className={gap > 0 ? "text-amber-600" : "text-green-600"}>
              {gap > 0 ? `还差 ${gap.toFixed(2)} 分` : `已超出 ${Math.abs(gap).toFixed(2)} 分`}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
