import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import ExamPanel from "../components/exams/ExamPanel";
import MindMapPanel from "../components/maps/MindMapPanel";
import MistakePanel from "../components/mistakes/MistakePanel";
import { formatBytes } from "../lib/annotations";
import { useMaterialStore } from "../stores/materialStore";
import { useSubjectStore } from "../stores/subjectStore";

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  image: "图片",
  docx: "Word",
  pptx: "PPT",
};

type Tab = "materials" | "mistakes" | "maps" | "exams";

export default function SubjectDetailPage() {
  const { id } = useParams();
  const subjectId = Number(id);
  const subject = useSubjectStore((state) =>
    state.items.find((item) => item.id === subjectId),
  );
  const [params] = useSearchParams();
  const requested = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(
    requested && ["materials", "mistakes", "maps", "exams"].includes(requested)
      ? requested
      : "materials",
  );

  if (!Number.isFinite(subjectId)) {
    return <p className="text-sm text-ink-400">学科不存在</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/subjects"
          className="text-xs font-medium text-ink-400 transition-colors hover:text-brand-600"
        >
          ← 返回学科
        </Link>
        <h1 className="page-title mt-2 flex items-center gap-3">
          <span
            aria-hidden
            className="h-9 w-9 rounded-xl"
            style={{
              background: `linear-gradient(145deg, ${subject?.color ?? "#6F5CE8"}, ${subject?.color ?? "#6F5CE8"}aa)`,
              boxShadow: `0 8px 18px -10px ${subject?.color ?? "#6F5CE8"}`,
            }}
          />
          {subject?.name ?? "学科"}
        </h1>
        <p className="muted mt-1.5">资料、错题、导图与考试都会挂在这里</p>
      </header>

      <div className="tabbar">
        {(
          [
            ["materials", "资料"],
            ["mistakes", "错题"],
            ["maps", "导图"],
            ["exams", "考试"],
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

      {tab === "materials" ? (
        <MaterialPanel subjectId={subjectId} />
      ) : tab === "mistakes" ? (
        <MistakePanel subjectId={subjectId} />
      ) : tab === "maps" ? (
        <MindMapPanel subjectId={subjectId} />
      ) : (
        <ExamPanel subjectId={subjectId} />
      )}
    </div>
  );
}

function MaterialPanel({ subjectId }: { subjectId: number }) {
  const { items, loading, uploading, error, load, upload, remove, dismissError } =
    useMaterialStore();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load(subjectId);
  }, [subjectId, load]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await upload(subjectId, file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          支持 PDF、图片、Word、PPT，单个不超过 50 MB
        </p>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx"
            onChange={(event) => void handleFile(event)}
            className="hidden"
            id="material-file"
          />
          <label
            htmlFor="material-file"
            className="btn btn-primary cursor-pointer"
          >
            {uploading ? "上传中…" : "上传资料"}
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={dismissError} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-400">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-14 text-center">
          <p className="text-sm text-ink-600">还没有资料</p>
          <p className="mt-1 text-xs text-ink-400">上传后可以在线阅读并做多色批注</p>
        </div>
      ) : (
        <ul className="card divide-y divide-paper-200 overflow-hidden">
          {items.map((material) => (
            <li
              key={material.id}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-paper-50"
            >
              <span className="rounded bg-paper-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                {KIND_LABEL[material.kind] ?? material.kind}
              </span>
              <Link
                to={`/materials/${material.id}`}
                className="min-w-0 flex-1 truncate text-sm text-ink-800 hover:text-brand-600"
              >
                {material.title}
              </Link>
              <span className="text-xs text-ink-400">{formatBytes(material.size)}</span>
              <button
                onClick={() => void remove(material.id)}
                className="text-xs text-ink-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
