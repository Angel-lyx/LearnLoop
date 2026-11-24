import { useEffect, useRef, useState } from "react";

import { usePlayerStore } from "../../stores/playerStore";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const MODE_LABEL = { list: "列表", one: "单曲", shuffle: "随机" } as const;

export default function MusicPlayer() {
  const {
    tracks,
    currentId,
    playing,
    progress,
    duration,
    volume,
    mode,
    load,
    addFiles,
    removeTrack,
    play,
    toggle,
    next,
    prev,
    setVolume,
    setMode,
    seek,
  } = usePlayerStore();
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const current = tracks.find((track) => track.id === currentId);

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open ? (
        <div className="card w-72 p-3 backdrop-blur" style={{ boxShadow: "var(--shadow-float)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600">音乐</span>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-ink-400 hover:text-ink-600"
            >
              收起
            </button>
          </div>

          <div className="mt-2 truncate text-sm text-ink-900">
            {current ? current.name : "还没有音乐，先上传一首"}
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={progress}
            onChange={(event) => seek(Number(event.target.value))}
            className="mt-2 w-full accent-[var(--color-brand-500)]"
            aria-label="播放进度"
          />
          <div className="flex justify-between text-[11px] text-ink-400">
            <span>{formatTime(progress * duration)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <button onClick={() => void prev()} className="px-2 text-ink-500 hover:text-ink-900">
              ⏮
            </button>
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600"
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <button onClick={() => void next()} className="px-2 text-ink-500 hover:text-ink-900">
              ⏭
            </button>
            <button
              onClick={() =>
                setMode(mode === "list" ? "one" : mode === "one" ? "shuffle" : "list")
              }
              className="rounded-md px-1.5 py-0.5 text-[11px] text-ink-500 hover:bg-paper-100"
              title="播放模式"
            >
              {MODE_LABEL[mode]}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-ink-400">音量</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="flex-1 accent-[var(--color-brand-500)]"
              aria-label="音量"
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                void addFiles(files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-paper-200 px-2 py-1 text-[11px] text-ink-600 hover:bg-paper-50"
            >
              上传音乐
            </button>
            <button
              onClick={() => setShowList((value) => !value)}
              className="rounded-md px-2 py-1 text-[11px] text-ink-500 hover:bg-paper-100"
            >
              播放列表 {tracks.length}
            </button>
          </div>

          {showList && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
              {tracks.length === 0 && (
                <li className="px-1 py-2 text-[11px] text-ink-400">列表是空的</li>
              )}
              {tracks.map((track) => (
                <li
                  key={track.id}
                  className={`group flex items-center gap-2 rounded px-1.5 py-1 text-[12px] ${
                    track.id === currentId ? "bg-brand-50 text-brand-600" : "text-ink-700"
                  }`}
                >
                  <button
                    onClick={() => void play(track.id)}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {track.name}
                  </button>
                  <button
                    onClick={() => track.id && void removeTrack(track.id)}
                    className="text-[11px] text-ink-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-paper-200 bg-white/70 px-4 py-2.5 backdrop-blur text-sm text-ink-700 transition-transform hover:-translate-y-0.5 hover:border-brand-300"
          style={{ boxShadow: "var(--shadow-float)" }}
        >
          <span aria-hidden>🎵</span>
          <span className="max-w-32 truncate">
            {current ? current.name : "音乐"}
          </span>
        </button>
      )}
    </div>
  );
}
