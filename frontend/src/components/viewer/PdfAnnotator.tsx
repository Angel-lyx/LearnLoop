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

type Tool = "pen" | "eraser" | "text" | "select";
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
  const colorRef = useRef(COLORS[0]);
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
    // JBIG2 / JPEG2000 扫描件需要 wasm 解码器，中文 CID 字体需要 cMaps
    const assetBase = import.meta.env.BASE_URL;
    const task = pdfjsLib.getDocument({
      url: fileUrl,
      wasmUrl: `${assetBase}pdfjs-wasm/`,
      cMapUrl: `${assetBase}pdfjs-cmaps/`,
      cMapPacked: true,
    });
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
      const mode = toolRef.current;
      const point = canvas.getScenePoint(event.e);

      if (mode === "eraser") {
        // 用包围盒命中，细笔迹也容易擦到
        const pad = 6;
        const targets = canvas.getObjects().filter((obj) => {
          const rect = obj.getBoundingRect();
          return (
            point.x >= rect.left - pad &&
            point.x <= rect.left + rect.width + pad &&
            point.y >= rect.top - pad &&
            point.y <= rect.top + rect.height + pad
          );
        });
        if (targets.length === 0) return;
        targets.forEach((obj) => canvas.remove(obj));
        canvas.requestRenderAll();
        commitRef.current();
        return;
      }

      if (mode === "text") {
        const box = new fabric.Textbox("输入批注…", {
          left: point.x,
          top: point.y,
          width: 220,
          fontSize: 16,
          fill: colorRef.current,
          splitByGrapheme: true,
          editable: true,
        });
        canvas.add(box);
        canvas.setActiveObject(box);
        box.enterEditing();
        box.selectAll();

        // 编辑结束时保存；空文本或仍是占位符的自动丢弃
        const finish = () => {
          const value = box.text.trim();
          if (value.length === 0 || value === "输入批注…") {
            canvas.remove(box);
            canvas.requestRenderAll();
            return;
          }
          commitRef.current();
        };
        (box as unknown as { on: (name: string, cb: () => void) => void }).on(
          "editing:exited",
          finish,
        );
      }
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
      } catch (err) {
        // 被新的渲染取消时静默忽略，真正的失败要让用户看见
        if (
          cancelled ||
          (err as { name?: string } | null)?.name === "RenderingCancelledException"
        ) {
          return;
        }
        setError(
          `这一页渲染失败：${err instanceof Error ? err.message : "未知错误"}`,
        );
        return;
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
    colorRef.current = color;
    if (tool === "pen") {
      canvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(canvas);
      brush.color = color;
      brush.width = 3;
      canvas.freeDrawingBrush = brush;
    } else {
      canvas.isDrawingMode = false;
    }
    canvas.selection = tool === "select" || tool === "text";
    canvas.defaultCursor =
      tool === "eraser" ? "cell" : tool === "text" ? "text" : "default";
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
          {(["pen", "text", "eraser", "select"] as Tool[]).map((item) => (
            <button
              key={item}
              onClick={() => setTool(item)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                tool === item
                  ? "bg-brand-50 font-medium text-brand-600"
                  : "text-ink-600 hover:bg-paper-100"
              }`}
            >
              {item === "pen"
                ? "画笔"
                : item === "text"
                  ? "文字"
                  : item === "eraser"
                    ? "橡皮擦"
                    : "选择"}
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
          {/* fabric 会把 canvas 包进 .canvas-container，这层负责把它压在 PDF 上方 */}
          <div className="absolute inset-0">
            <canvas ref={fabricElRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
