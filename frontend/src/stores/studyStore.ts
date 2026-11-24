import { create } from "zustand";

import { ApiError, examsApi, mapsApi } from "../lib/api";
import type { Exam, MindMapDoc } from "../types";

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "未知错误";
}

interface ExamState {
  items: Exam[];
  loading: boolean;
  error: string | null;
  load: (subjectId: number) => Promise<void>;
  create: (subjectId: number, payload: { title: string; exam_date: string; scope: string }) => Promise<boolean>;
  remove: (examId: number) => Promise<void>;
  generatePlan: (examId: number) => Promise<number>;
  dismissError: () => void;
}

export const useExamStore = create<ExamState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  dismissError: () => set({ error: null }),

  load: async (subjectId) => {
    set({ loading: true, error: null });
    try {
      set({ items: await examsApi.list(subjectId), loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  create: async (subjectId, payload) => {
    try {
      const created = await examsApi.create(subjectId, payload);
      set({ items: [...get().items, created].sort((a, b) => a.exam_date.localeCompare(b.exam_date)) });
      return true;
    } catch (error) {
      set({ error: toMessage(error) });
      return false;
    }
  },

  remove: async (examId) => {
    try {
      await examsApi.remove(examId);
      set({ items: get().items.filter((item) => item.id !== examId) });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  generatePlan: async (examId) => {
    try {
      const tasks = await examsApi.plan(examId);
      return tasks.length;
    } catch (error) {
      set({ error: toMessage(error) });
      return 0;
    }
  },
}));

interface MapState {
  items: MindMapDoc[];
  loading: boolean;
  generating: boolean;
  error: string | null;
  load: (subjectId: number) => Promise<void>;
  generate: (subjectId: number) => Promise<MindMapDoc | null>;
  remove: (mapId: number) => Promise<void>;
  dismissError: () => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  items: [],
  loading: false,
  generating: false,
  error: null,

  dismissError: () => set({ error: null }),

  load: async (subjectId) => {
    set({ loading: true, error: null });
    try {
      set({ items: await mapsApi.list(subjectId), loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  generate: async (subjectId) => {
    set({ generating: true, error: null });
    try {
      const created = await mapsApi.generate(subjectId);
      set({ items: [created, ...get().items], generating: false });
      return created;
    } catch (error) {
      set({ generating: false, error: toMessage(error) });
      return null;
    }
  },

  remove: async (mapId) => {
    try {
      await mapsApi.remove(mapId);
      set({ items: get().items.filter((item) => item.id !== mapId) });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },
}));
