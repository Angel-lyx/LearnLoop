import { Howl } from "howler";
import { create } from "zustand";

import { musicDb, type Track } from "../lib/musicDb";

export type PlayMode = "list" | "one" | "shuffle";

interface PlayerState {
  tracks: Track[];
  currentId: number | null;
  playing: boolean;
  volume: number;
  mode: PlayMode;
  progress: number;
  duration: number;
  load: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  removeTrack: (id: number) => Promise<void>;
  play: (id?: number) => Promise<void>;
  toggle: () => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  setVolume: (volume: number) => void;
  setMode: (mode: PlayMode) => void;
  seek: (ratio: number) => void;
}

let howl: Howl | null = null;
let objectUrl: string | null = null;
let ticker: number | null = null;

function stopTicker() {
  if (ticker !== null) {
    window.clearInterval(ticker);
    ticker = null;
  }
}

function releaseHowl() {
  stopTicker();
  if (howl) {
    howl.stop();
    howl.unload();
    howl = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  tracks: [],
  currentId: null,
  playing: false,
  volume: 0.7,
  mode: "list",
  progress: 0,
  duration: 0,

  load: async () => {
    const tracks = await musicDb.tracks.toArray();
    set({ tracks });
  },

  addFiles: async (files) => {
    const audio = files.filter((file) => file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name));
    if (audio.length === 0) return;
    await musicDb.tracks.bulkAdd(
      audio.map((file) => ({ name: file.name, blob: file, size: file.size })),
    );
    await get().load();
  },

  removeTrack: async (id) => {
    await musicDb.tracks.delete(id);
    if (get().currentId === id) {
      releaseHowl();
      set({ currentId: null, playing: false, progress: 0, duration: 0 });
    }
    await get().load();
  },

  play: async (id) => {
    const { tracks, currentId, mode, volume } = get();
    const targetId = id ?? currentId ?? tracks[0]?.id;
    if (!targetId) return;

    const track = tracks.find((item) => item.id === targetId);
    if (!track) return;

    releaseHowl();
    objectUrl = URL.createObjectURL(track.blob);

    // blob URL 没有扩展名，必须显式告诉 Howler 音频格式
    const extension = track.name.split(".").pop()?.toLowerCase() ?? "";
    const format = ["mp3", "wav", "ogg", "m4a", "flac", "webm", "aac"].includes(extension)
      ? [extension]
      : undefined;

    howl = new Howl({
      src: [objectUrl],
      format,
      html5: false,
      volume,
      onplay: () => set({ playing: true }),
      onpause: () => set({ playing: false }),
      onstop: () => set({ playing: false }),
      onloaderror: (_id, error) => {
        console.error("音频加载失败", error);
      },
      onplayerror: (_id, error) => {
        console.error("音频播放失败", error);
      },
      onend: () => {
        if (mode === "one") {
          howl?.play();
        } else {
          void get().next();
        }
      },
    });

    howl.play();
    set({ currentId: targetId, progress: 0, duration: 0 });

    stopTicker();
    ticker = window.setInterval(() => {
      if (!howl) return;
      const duration = howl.duration();
      const seek = howl.seek();
      set({
        duration: Number.isFinite(duration) ? duration : 0,
        progress: duration > 0 ? Number(seek) / duration : 0,
      });
    }, 500);
  },

  toggle: () => {
    if (!howl) {
      void get().play();
      return;
    }
    if (howl.playing()) {
      howl.pause();
    } else {
      howl.play();
    }
  },

  next: async () => {
    const { tracks, currentId, mode } = get();
    if (tracks.length === 0) return;
    const index = tracks.findIndex((item) => item.id === currentId);
    let nextIndex: number;
    if (mode === "shuffle") {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } else {
      nextIndex = (index + 1) % tracks.length;
    }
    await get().play(tracks[nextIndex].id);
  },

  prev: async () => {
    const { tracks, currentId } = get();
    if (tracks.length === 0) return;
    const index = tracks.findIndex((item) => item.id === currentId);
    const prevIndex = (index - 1 + tracks.length) % tracks.length;
    await get().play(tracks[prevIndex].id);
  },

  setVolume: (volume) => {
    howl?.volume(volume);
    set({ volume });
  },

  setMode: (mode) => set({ mode }),

  seek: (ratio) => {
    if (!howl) return;
    const duration = howl.duration();
    if (!Number.isFinite(duration) || duration <= 0) return;
    howl.seek(Math.min(Math.max(ratio, 0), 1) * duration);
    set({ progress: Math.min(Math.max(ratio, 0), 1) });
  },
}));
