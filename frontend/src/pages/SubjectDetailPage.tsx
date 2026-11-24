import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";

import { formatBytes } from "../lib/annotations";
import { useMaterialStore } from "../stores/materialStore";
import { useSubjectStore } from "../stores/subjectStore";

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  image: "图片",
  docx: "Word",
  pptx: "PPT",
};

export default function SubjectDetailPage() {
  const { id } = useParams();
  const subjectId = Number(id);
  const subject = useSubjectStore((state) =>
    state.items.find((item) => item.id === subjectId),
  );

  const { items, loading, uploading, error, load, upload, remove, dismissError } =
    useMaterialStore();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (Number.isFinite(subjectId)) void load(subjectId);
  }, [subjectId, load]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await upload(subjectId, file);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (!Number.isFinite(subjectId)) {
    return <p className="text-sm text-ink-400">学科不存在</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link to="/subjects" className="text-xs text-ink-400 hover:text-brand-600">
            ← 返回学科
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink-950">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: subject?.color ?? "#4F7CFF" }}
            />
            {subject?.name ?? "学科"}
          </h1>
          <p className="mt-1 text-sm text-ink-400">资料、错题、导图与考试都会挂在这里</p>
        </div>

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
            className="cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            {uploading ? "上传中…" : "上传资料"}
          </label>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={dismissError} className="text-xs underline">
            关闭
          </button>
        </div>
      )}

      <section>
        {loading && items.length === 0 ? (
          <p className="text-sm text-ink-400">加载中…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-14 text-center">
            <p className="text-sm text-ink-600">还没有资料</p>
            <p className="mt-1 text-xs text-ink-400">
              支持 PDF、图片、Word、PPT，单个不超过 50 MB
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-paper-200 overflow-hidden rounded-xl border border-paper-200 bg-white">
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
    </div>
  );
}
