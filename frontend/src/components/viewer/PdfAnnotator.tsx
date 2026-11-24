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

const PRESET_COLORS = [
  "#F2C14E",
  "#EF6F6C",
  "#6F5CE8",
  "#2BB673",
  "#3D9BE9",
  "#E270B8",
  "#111827",
  "#9CA3AF",
];
const STROKE_WIDTHS = [
  { label: "细", value: 2 },
  { label: "中", value: 3.5 },
  { label: "粗", value: 6 },
  { label: "特粗", value: 10 },
];
const CUSTOM_COLORS_KEY = "learnloop.annotate.customColors";

function loadCustomColors(): string[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_COLORS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

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
  const colorRef = useRef(PRESET_COLORS[0]);
  const pageRef = useRef(1);
  const saveTimerRef = useRef<number | null>(null);
  const commitRef = useRef<() => void>(() => {});
  const historyRef = useRef<HistoryState>(EMPTY_HISTORY);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1.2);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [width, setWidth] = useState(STROKE_WIDTHS[1].value);
  const [customColors, setCustomColors] = useState<string[]>(() => loadCustomColors());
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
      brush.width = width;
      canvas.freeDrawingBrush = brush;
    } else {
      canvas.isDrawingMode = false;
    }
    canvas.selection = tool === "select" || tool === "text";
    canvas.defaultCursor =
      tool === "eraser" ? "cell" : tool === "text" ? "text" : "default";
  }, [tool, color, width]);

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

  function saveCustomColor() {
    setCustomColors((prev) => {
      const next = prev.includes(color) ? prev : [...prev, color].slice(-8);
      window.localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(next));
      return next;
    });
  }

  const statusText =
    status === "saving"
      ? "保存中…"
      : status === "saved"
        ? "已保存"
        : status === "error"
          ? "保存失败"
          : "已同步";

  const toolLabels: Record<Tool, string> = {
    pen: "画笔",
    text: "文字",
    eraser: "橡皮擦",
    select: "选择",
  };

  return (
    <div className="space-y-3">
      <div className="card px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="tabbar">
            {(["pen", "text", "eraser", "select"] as Tool[]).map((item) => (
              <button
                key={item}
                onClick={() => setTool(item)}
                className={`tab !px-2.5 !py-1.5 text-xs ${
                  tool === item ? "tab-active" : ""
                }`}
              >
                {toolLabels[item]}
              </button>
            ))}
          </div>

          <span className="h-5 w-px bg-paper-200" />

          <div className="flex items-center gap-1.5">
            {[...PRESET_COLORS, ...customColors].map((item) => (
              <button
                key={item}
                aria-label={`画笔颜色 ${item}`}
                aria-pressed={color === item}
                onClick={() => setColor(item)}
                className={`h-6 w-6 rounded-full transition-transform ${
                  color === item
                    ? "scale-115 ring-2 ring-brand-300 ring-offset-2"
                    : "hover:scale-105"
                }`}
                style={{
                  backgroundColor: item,
                  boxShadow: "inset 0 0 0 1px rgba(21,21,42,.12)",
                }}
              />
            ))}

            <label
              title="自定义颜色"
              className="grid h-6 w-6 cursor-pointer place-items-center rounded-full border border-dashed border-paper-300 text-[11px] text-ink-400 transition-colors hover:border-brand-400 hover:text-brand-600"
            >
              +
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="absolute h-0 w-0 opacity-0"
                aria-label="自定义颜色"
              />
            </label>

            <button
              onClick={saveCustomColor}
              className="rounded-md px-1.5 py-0.5 text-[11px] text-brand-600 hover:bg-brand-50"
            >
              存为常用
            </button>
          </div>

          <span className="h-5 w-px bg-paper-200" />

          <div className="flex items-center gap-1">
            {STROKE_WIDTHS.map((item) => (
              <button
                key={item.value}
                onClick={() => setWidth(item.value)}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                  width === item.value
                    ? "bg-brand-50 font-medium text-brand-600"
                    : "text-ink-500 hover:bg-paper-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-paper-200 pt-2">
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

          <span className="h-5 w-px bg-paper-200" />

          <button
            onClick={() => setZoom((z) => clampZoom(z - 0.2))}
            disabled={zoom <= MIN_ZOOM}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-ink-600">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => clampZoom(z + 0.2))}
            disabled={zoom >= MAX_ZOOM}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            +
          </button>

          <span className="h-5 w-px bg-paper-200" />

          <button
            onClick={() => setPage((p) => clampPage(p - 1, numPages))}
            disabled={page <= 1}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs tabular-nums text-ink-600">
            {page} / {numPages}
          </span>
          <button
            onClick={() => setPage((p) => clampPage(p + 1, numPages))}
            disabled={page >= numPages}
            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-40"
          >
            下一页
          </button>

          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "error"
                  ? "bg-red-500"
                  : status === "saving"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
            {statusText}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="card overflow-auto p-4">
        <div className="relative mx-auto w-fit rounded-lg shadow-[0_2px_6px_rgba(21,21,42,.08),0_24px_60px_-30px_rgba(74,58,180,.45)]">
          <canvas ref={pdfCanvasRef} className="block rounded-lg bg-white" />
          {/* fabric 会把 canvas 包进 .canvas-container，这层负责把它压在 PDF 上方 */}
          <div className="absolute inset-0">
            <canvas ref={fabricElRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
