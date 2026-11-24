import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MindElixir from "mind-elixir";
import "mind-elixir/style.css";

import { mapsApi } from "../lib/api";
import type { MindMapDoc } from "../types";

// mind-elixir 的类型定义较松，这里按运行时结构使用
type MindInstance = {
  init: (data: unknown) => void;
  getData: () => unknown;
  destroy?: () => void;
};

export default function MindMapPage() {
  const { id } = useParams();
  const mapId = Number(id);
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<MindInstance | null>(null);

  const [map, setMap] = useState<MindMapDoc | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(mapId)) return;
    let cancelled = false;
    mapsApi
      .get(mapId)
      .then((doc) => {
        if (!cancelled) setMap(doc);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "导图加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  useEffect(() => {
    if (!map || !containerRef.current) return;
    const Ctor = MindElixir as unknown as {
      new (options: Record<string, unknown>): MindInstance;
      SIDE: number;
    };
    const mind = new Ctor({
      el: containerRef.current,
      direction: Ctor.SIDE,
      draggable: true,
      contextMenu: true,
      toolBar: true,
      nodeMenu: true,
      keypress: true,
    });
    mind.init(map.data);
    mindRef.current = mind;
    return () => {
      mind.destroy?.();
      mindRef.current = null;
    };
  }, [map]);

  async function handleSave() {
    if (!mindRef.current || !map) return;
    setStatus("saving");
    setError(null);
    try {
      const data = mindRef.current.getData();
      await mapsApi.update(map.id, { data });
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  if (error && !map) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={map ? `/subjects/${map.subject_id}` : "/subjects"}
            className="text-xs text-ink-400 hover:text-brand-600"
          >
            ← 返回学科
          </Link>
          <h1 className="page-title mt-1.5 truncate">{map?.title ?? "思维导图"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-400">
            {status === "saving"
              ? "保存中…"
              : status === "saved"
                ? "已保存"
                : "双击节点可编辑，拖拽可调整结构"}
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={!map || status === "saving"}
            className="btn btn-primary"
          >
            保存导图
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="card overflow-hidden">
        <div ref={containerRef} style={{ height: "70vh", width: "100%" }} />
      </div>
    </div>
  );
}
