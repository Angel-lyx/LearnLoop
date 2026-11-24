import { useCallback, useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { materialsApi } from "../../lib/api";
import {
  EMPTY_HISTORY,
  MAX_ZOOM,
  MIN_ZOOM,
  clampPage,
  clampZoom,
  canRedo,
  canUndo,
  pushHistory,
  redo,
  undo,
  type HistoryState,
} from "../../lib/annotations";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Tool = "pen" | "eraser" | "select";
type SaveStatus = "idle" | "saving" | "saved" | "error";

const COLORS = ["#FFD166", "#FF6B6B", "#4F7CFF", "#22B573"];

export default function PdfAnnotator({
  materialId,
  fileUrl,
}: {
  materialId: number;
  fileUrl: string;
}) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const toolRef = useRef<Tool>("pen");
  const pageRef = useRef(1);
  const saveTimerRef = useRef<number | null>(null);
  const commitRef = useRef<() => void>(() => {});
  const historyRef = useRef<HistoryState>(EMPTY_HISTORY);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1.2);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  pageRef.current = page;

  // 1. 加载 PDF 文档
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);
    const task = pdfjsLib.getDocument({ url: fileUrl });
    task.promise
      .then((loaded) => {
        if (cancelled) return;
        setDoc(loaded);
        setNumPages(loaded.numPages);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "PDF 加载失败");
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [fileUrl]);

  // 2. 初始化 fabric 画布（只建一次）
  useEffect(() => {
    const el = fabricElRef.current;
    if (!el) return;
    const canvas = new fabric.Canvas(el, { selection: false });
    fabricRef.current = canvas;

    canvas.on("path:created", () => commitRef.current());
    canvas.on("mouse:down", (event) => {
      if (toolRef.current !== "eraser") return;
      const point = canvas.getScenePoint(event.e);
      const targets = canvas.getObjects().filter((obj) => obj.containsPoint(point));
      if (targets.length === 0) return;
      targets.forEach((obj) => canvas.remove(obj));
      canvas.requestRenderAll();
      commitRef.current();
    });

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  const snapshot = useCallback((): string => {
    const canvas = fabricRef.current;
    if (!canvas) return "[]";
    return JSON.stringify(canvas.toJSON().objects ?? []);
  }, []);

  const applyPayload = useCallback((payload: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    let objects: object[] = [];
    try {
      objects = JSON.parse(payload || "[]") as object[];
    } catch {
      objects = [];
    }
    canvas.loadFromJSON({ objects }, () => canvas.requestRenderAll());
  }, []);

  const persist = useCallback(
    (payload: string) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      setStatus("saving");
      saveTimerRef.current = window.setTimeout(() => {
        materialsApi
          .saveAnnotations(materialId, pageRef.current, payload)
          .then(() => setStatus("saved"))
          .catch((err: unknown) => {
            setStatus("error");
            setError(err instanceof Error ? err.message : "保存失败");
          });
      }, 350);
    },
    [materialId],
  );

  const commit = useCallback(() => {
    const next = snapshot();
    const updated = pushHistory(historyRef.current, next);
    if (updated === historyRef.current) return;
    historyRef.current = updated;
    setHistory(updated);
    persist(next);
  }, [persist, snapshot]);

  commitRef.current = commit;

  // 3. 渲染当前页
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;

    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      const canvas = pdfCanvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      renderTaskRef.current?.cancel();
      const task = pdfPage.render({ canvasContext: context, viewport, canvas });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        return; // 被新的渲染取消
      }
      if (cancelled) return;

      const fabricCanvas = fabricRef.current;
      if (fabricCanvas) {
        fabricCanvas.setDimensions({
          width: canvas.width,
          height: canvas.height,
        });
        fabricCanvas.setZoom(zoom);
        fabricCanvas.requestRenderAll();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, zoom]);

  // 4. 切页时读取该页批注
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await materialsApi.annotations(materialId);
        if (cancelled) return;
        const payload = list.find((item) => item.page === page)?.payload ?? "[]";
        historyRef.current = { past: [], present: payload, future: [] };
        setHistory(historyRef.current);
        applyPayload(payload);
        setStatus("idle");
      } catch {
        if (!cancelled) applyPayload("[]");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialId, page, applyPayload]);

  // 5. 工具与颜色
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    toolRef.current = tool;
    if (tool === "pen") {
      canvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(canvas);
      brush.color = color;
      brush.width = 3;
      canvas.freeDrawingBrush = brush;
    } else {
      canvas.isDrawingMode = false;
    }
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "eraser" ? "cell" : "default";
  }, [tool, color]);

  function handleUndo() {
    const next = undo(historyRef.current);
    if (!next) return;
    historyRef.current = next;
    setHistory(next);
    applyPayload(next.present);
    persist(next.present);
  }

  function handleRedo() {
    const next = redo(historyRef.current);
    if (!next) return;
    historyRef.current = next;
    setHistory(next);
    applyPayload(next.present);
    persist(next.present);
  }

  const statusText =
    status === "saving"
      ? "保存中…"
      : status === "saved"
        ? "已保存"
        : status === "error"
          ? "保存失败"
          : "已同步";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-paper-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          {(["pen", "eraser", "select"] as Tool[]).map((item) => (
            <button
              key={item}
              onClick={() => setTool(item)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                tool === item
                  ? "bg-brand-50 font-medium text-brand-600"
                  : "text-ink-600 hover:bg-paper-100"
              }`}
            >
              {item === "pen" ? "画笔" : item === "eraser" ? "橡皮擦" : "选择"}
            </button>
          ))}
        </div>

        <span className="mx-1 h-4 w-px bg-paper-200" />

        <div className="flex items-center gap-1.5">
          {COLORS.map((item) => (
            <button
              key={item}
              aria-label={`画笔颜色 ${item}`}
              aria-pressed={color === item}
              onClick={() => setColor(item)}
              className={`h-5 w-5 rounded-full ${color === item ? "ring-2 ring-ink-400 ring-offset-1" : ""}`}
              style={{ backgroundColor: item }}
            />
          ))}
        </div>

        <span className="mx-1 h-4 w-px bg-paper-200" />

        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={!canUndo(history)}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            撤销
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo(history)}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            重做
          </button>
        </div>

        <span className="mx-1 h-4 w-px bg-paper-200" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => clampZoom(z - 0.2))}
            disabled={zoom <= MIN_ZOOM}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-ink-600">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => clampZoom(z + 0.2))}
            disabled={zoom >= MAX_ZOOM}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            +
          </button>
        </div>

        <span className="mx-1 h-4 w-px bg-paper-200" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => clampPage(p - 1, numPages))}
            disabled={page <= 1}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-ink-600">
            {page} / {numPages}
          </span>
          <button
            onClick={() => setPage((p) => clampPage(p + 1, numPages))}
            disabled={page >= numPages}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            下一页
          </button>
        </div>

        <span className="ml-auto text-xs text-ink-400">{statusText}</span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="overflow-auto rounded-xl border border-paper-200 bg-paper-100 p-4">
        <div className="relative mx-auto w-fit shadow-sm">
          <canvas ref={pdfCanvasRef} className="block bg-white" />
          <canvas ref={fabricElRef} className="absolute left-0 top-0" />
        </div>
      </div>
    </div>
  );
}
