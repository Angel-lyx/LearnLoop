import { create } from "zustand";

import { ApiError, api } from "../lib/api";
import type { Subject, SubjectInput } from "../types";

interface SubjectState {
  items: Subject[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (input: SubjectInput) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  dismissError: () => void;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "未知错误";
}

export const useSubjectStore = create<SubjectState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  dismissError: () => set({ error: null }),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const items = await api.get<Subject[]>("/subjects");
      set({ items, loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  create: async (input) => {
    set({ error: null });
    try {
      const created = await api.post<Subject>("/subjects", input);
      set({ items: [...get().items, created] });
      return true;
    } catch (error) {
      set({ error: toMessage(error) });
      return false;
    }
  },

  remove: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/subjects/${id}`);
      set({ items: get().items.filter((item) => item.id !== id) });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },
}));
