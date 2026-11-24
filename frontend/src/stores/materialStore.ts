import { create } from "zustand";

import { ApiError, materialsApi } from "../lib/api";
import type { Material } from "../types";

interface MaterialState {
  items: Material[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
  load: (subjectId: number) => Promise<void>;
  upload: (subjectId: number, file: File) => Promise<boolean>;
  remove: (materialId: number) => Promise<void>;
  clear: () => void;
  dismissError: () => void;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "未知错误";
}

export const useMaterialStore = create<MaterialState>((set, get) => ({
  items: [],
  loading: false,
  uploading: false,
  error: null,

  clear: () => set({ items: [], error: null }),
  dismissError: () => set({ error: null }),

  load: async (subjectId) => {
    set({ loading: true, error: null });
    try {
      const items = await materialsApi.list(subjectId);
      set({ items, loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  upload: async (subjectId, file) => {
    set({ uploading: true, error: null });
    try {
      const created = await materialsApi.upload(subjectId, file);
      set({ items: [...get().items, created], uploading: false });
      return true;
    } catch (error) {
      set({ uploading: false, error: toMessage(error) });
      return false;
    }
  },

  remove: async (materialId) => {
    set({ error: null });
    try {
      await materialsApi.remove(materialId);
      set({ items: get().items.filter((item) => item.id !== materialId) });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },
}));
