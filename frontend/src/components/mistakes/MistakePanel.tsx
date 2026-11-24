import { useEffect, useRef, useState } from "react";

import { aiApi } from "../../lib/api";
import { useMistakeStore } from "../../stores/mistakeStore";
import type { Analysis, Mistake } from "../../types";

const STATUS_LABEL: Record<string, string> = {
  unmastered: "未掌握",
  mastered: "已掌握",
  archived: "已归档",
};

export default function MistakePanel({ subjectId }: { subjectId: number }) {
  const { items, loading, saving, error, load, create, update, remove, dismissError } =
    useMistakeStore();
  const [filter, setFilter] = useState<"all" | "unmastered" | "mastered">("all");
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    void load(subjectId, filter === "all" ? undefined : filter);
  }, [subjectId, filter, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(
            [
              ["all", "全部"],
              ["unmastered", "未掌握"],
              ["mastered", "已掌握"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                filter === value
                  ? "bg-brand-50 font-medium text-brand-600"
                  : "text-ink-600 hover:bg-paper-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm((value) => !value)}
          className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {showForm ? "收起" : "新增错题"}
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={dismissError} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      {showForm && (
        <MistakeForm
          subjectId={subjectId}
          saving={saving}
          onCancel={() => setShowForm(false)}
          onCreate={async (payload) => {
            const ok = await create(subjectId, payload);
            if (ok) setShowForm(false);
            return ok;
          }}
        />
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-400">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-14 text-center">
          <p className="text-sm text-ink-600">还没有错题</p>
          <p className="mt-1 text-xs text-ink-400">
            录入后可让 AI 分析错因、给出解法并生成同类变式题
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((mistake) => (
            <MistakeCard
              key={mistake.id}
              mistake={mistake}
              expanded={expanded === mistake.id}
              onToggle={() =>
                setExpanded((current) => (current === mistake.id ? null : mistake.id))
              }
              onToggleStatus={() =>
                void update(mistake.id, {
                  status: mistake.status === "mastered" ? "unmastered" : "mastered",
                })
              }
              onRemove={() => void remove(mistake.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MistakeCard({
  mistake,
  expanded,
  onToggle,
  onToggleStatus,
  onRemove,
}: {
  mistake: Mistake;
  expanded: boolean;
  onToggle: () => void;
  onToggleStatus: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-xl border border-paper-200 bg-white">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm text-ink-800">{mistake.question}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                mistake.status === "mastered"
                  ? "bg-green-50 text-green-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {STATUS_LABEL[mistake.status] ?? mistake.status}
            </span>
            {mistake.knowledge_points.map((point) => (
              <span
                key={point}
                className="rounded-full bg-paper-100 px-2 py-0.5 text-[11px] text-ink-600"
              >
                {point}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button onClick={onToggle} className="text-ink-500 hover:text-brand-600">
            {expanded ? "收起" : "查看"}
          </button>
          <button onClick={onToggleStatus} className="text-ink-500 hover:text-brand-600">
            {mistake.status === "mastered" ? "标记未掌握" : "标记已掌握"}
          </button>
          <button onClick={onRemove} className="text-ink-400 hover:text-red-500">
            删除
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-paper-200 px-4 py-3 text-sm">
          {mistake.answer && (
            <section>
              <h3 className="text-xs font-medium text-ink-400">我的答案</h3>
              <p className="mt-1 whitespace-pre-wrap text-ink-700">{mistake.answer}</p>
            </section>
          )}
          <section>
            <h3 className="text-xs font-medium text-ink-400">错误分析</h3>
            <p className="mt-1 whitespace-pre-wrap text-ink-700">
              {mistake.error_analysis || "还没有分析，可让 AI 重新生成"}
            </p>
          </section>
          <section>
            <h3 className="text-xs font-medium text-ink-400">正确解法</h3>
            <p className="mt-1 whitespace-pre-wrap text-ink-700">{mistake.solution}</p>
          </section>
          {mistake.variants.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-ink-400">同类变式题</h3>
              <ol className="mt-1 space-y-2">
                {mistake.variants.map((variant, index) => (
                  <li key={index} className="rounded-lg bg-paper-50 p-3">
                    <p className="whitespace-pre-wrap text-ink-800">
                      {index + 1}. {variant.question}
                    </p>
                    {variant.answer && (
                      <p className="mt-1 text-xs text-ink-500">答案：{variant.answer}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </li>
  );
}

function MistakeForm({
  subjectId,
  saving,
  onCancel,
  onCreate,
}: {
  subjectId: number;
  saving: boolean;
  onCancel: () => void;
  onCreate: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<"idle" | "transcribe" | "analyze">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("transcribe");
    setMessage(null);
    try {
      const result = await aiApi.transcribe(file);
      setQuestion((current) => (current ? `${current}\n${result.text}` : result.text));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "识别失败");
    } finally {
      setBusy("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAnalyze() {
    if (!question.trim()) return;
    setBusy("analyze");
    setMessage(null);
    try {
      const result = await aiApi.analyze(question.trim(), answer.trim());
      setAnalysis(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "分析失败");
    } finally {
      setBusy("idle");
    }
  }

  async function handleSave() {
    if (!question.trim()) return;
    await onCreate({
      question: question.trim(),
      answer: answer.trim(),
      error_analysis: analysis?.error_analysis ?? "",
      solution: analysis?.solution ?? "",
      knowledge_points: analysis?.knowledge_points ?? [],
      variants: analysis?.variants ?? [],
    });
  }

  return (
    <div className="rounded-xl border border-paper-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          id={`mistake-file-${subjectId}`}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(event) => void handleFile(event)}
          className="hidden"
        />
        <label
          htmlFor={`mistake-file-${subjectId}`}
          className="cursor-pointer rounded-lg border border-paper-200 px-3 py-1.5 text-xs text-ink-600 hover:bg-paper-50"
        >
          {busy === "transcribe" ? "识别中…" : "上传图片/PDF 识别"}
        </label>
        <span className="text-xs text-ink-400">也可以直接手动输入题干</span>
      </div>

      <textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        rows={4}
        placeholder="粘贴或输入题目"
        className="mt-3 w-full resize-y rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />

      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={2}
        placeholder="我的答案（可选，帮助 AI 更准确地定位错误）"
        className="mt-2 w-full resize-y rounded-lg border border-paper-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />

      {message && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{message}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => void handleAnalyze()}
          disabled={!question.trim() || busy !== "idle"}
          className="rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
        >
          {busy === "analyze" ? "分析中…" : "AI 分析错因与解法"}
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={!question.trim() || saving}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存错题"}
        </button>
        <button onClick={onCancel} className="text-xs text-ink-400 hover:text-ink-600">
          取消
        </button>
      </div>

      {analysis && (
        <div className="mt-4 space-y-2 rounded-lg bg-paper-50 p-3 text-sm">
          <section>
            <h4 className="text-xs font-medium text-ink-400">错误分析</h4>
            <p className="mt-1 whitespace-pre-wrap text-ink-700">{analysis.error_analysis}</p>
          </section>
          <section>
            <h4 className="text-xs font-medium text-ink-400">正确解法</h4>
            <p className="mt-1 whitespace-pre-wrap text-ink-700">{analysis.solution}</p>
          </section>
          {analysis.knowledge_points.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {analysis.knowledge_points.map((point) => (
                <span
                  key={point}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-600"
                >
                  {point}
                </span>
              ))}
            </div>
          )}
          {analysis.variants.length > 0 && (
            <section>
              <h4 className="text-xs font-medium text-ink-400">同类变式题</h4>
              <ol className="mt-1 space-y-1.5">
                {analysis.variants.map((variant, index) => (
                  <li key={index} className="rounded bg-white p-2">
                    <p className="whitespace-pre-wrap text-ink-800">
                      {index + 1}. {variant.question}
                    </p>
                    {variant.answer && (
                      <p className="mt-0.5 text-xs text-ink-500">答案：{variant.answer}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
