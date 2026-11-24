import { create } from "zustand";

import { ApiError, mistakesApi } from "../lib/api";
import type { Mistake } from "../types";

interface MistakeState {
  items: Mistake[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (subjectId: number, status?: string) => Promise<void>;
  create: (subjectId: number, payload: unknown) => Promise<boolean>;
  update: (mistakeId: number, payload: unknown) => Promise<void>;
  remove: (mistakeId: number) => Promise<void>;
  clear: () => void;
  dismissError: () => void;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "未知错误";
}

export const useMistakeStore = create<MistakeState>((set, get) => ({
  items: [],
  loading: false,
  saving: false,
  error: null,

  clear: () => set({ items: [], error: null }),
  dismissError: () => set({ error: null }),

  load: async (subjectId, status) => {
    set({ loading: true, error: null });
    try {
      const items = await mistakesApi.list(subjectId, status);
      set({ items, loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  create: async (subjectId, payload) => {
    set({ saving: true, error: null });
    try {
      const created = await mistakesApi.create(subjectId, payload);
      set({ items: [created, ...get().items], saving: false });
      return true;
    } catch (error) {
      set({ saving: false, error: toMessage(error) });
      return false;
    }
  },

  update: async (mistakeId, payload) => {
    set({ error: null });
    try {
      const updated = await mistakesApi.update(mistakeId, payload);
      set({
        items: get().items.map((item) => (item.id === updated.id ? updated : item)),
      });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  remove: async (mistakeId) => {
    set({ error: null });
    try {
      await mistakesApi.remove(mistakeId);
      set({ items: get().items.filter((item) => item.id !== mistakeId) });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },
}));
