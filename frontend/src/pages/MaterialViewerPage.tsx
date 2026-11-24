import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { materialsApi } from "../lib/api";
import type { Material } from "../types";

// pdf.js 与 fabric 体积较大，进入阅读器时才加载
const PdfAnnotator = lazy(() => import("../components/viewer/PdfAnnotator"));

export default function MaterialViewerPage() {
  const { id } = useParams();
  const materialId = Number(id);
  const [material, setMaterial] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(materialId)) return;
    let cancelled = false;
    materialsApi
      .get(materialId)
      .then((item) => {
        if (!cancelled) setMaterial(item);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "资料加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!material) {
    return <p className="text-sm text-ink-400">加载中…</p>;
  }

  const fileUrl = materialsApi.fileUrl(material.id);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={`/subjects/${material.subject_id}`}
            className="text-xs text-ink-400 hover:text-brand-600"
          >
            ← 返回学科
          </Link>
          <h1 className="page-title mt-1.5 truncate">{material.title}</h1>
        </div>
        <a
          href={fileUrl}
          download={material.filename}
          className="btn btn-ghost shrink-0 text-xs"
        >
          下载原件
        </a>
      </header>

      {material.kind === "pdf" ? (
        <Suspense
          fallback={
            <div className="card px-6 py-14 text-center text-sm text-ink-400">
              阅读器加载中…
            </div>
          }
        >
          <PdfAnnotator materialId={material.id} fileUrl={fileUrl} />
        </Suspense>
      ) : material.kind === "image" ? (
        <div className="card p-4">
          <img src={fileUrl} alt={material.title} className="mx-auto max-w-full" />
          <p className="mt-3 text-center text-xs text-ink-400">
            图片批注将在后续版本支持
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-paper-300 bg-white/70 backdrop-blur-sm px-6 py-14 text-center">
          <p className="text-sm text-ink-600">该格式暂不支持在线预览</p>
          <p className="mt-1 text-xs text-ink-400">
            可以下载原件查看，Word/PPT 转 PDF 预览会在后续版本支持
          </p>
        </div>
      )}
    </div>
  );
}
