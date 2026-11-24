import { create } from "zustand";

import { ApiError, tasksApi } from "../lib/api";
import type { Task } from "../types";

interface TaskState {
  items: Task[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (title: string, dueDate: string, subjectId?: number) => Promise<boolean>;
  toggle: (taskId: number, done: boolean) => Promise<void>;
  remove: (taskId: number) => Promise<void>;
  dismissError: () => void;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "未知错误";
}

export const useTaskStore = create<TaskState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  dismissError: () => set({ error: null }),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const items = await tasksApi.today();
      set({ items, loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  add: async (title, dueDate, subjectId) => {
    try {
      const created = await tasksApi.create({
        title,
        due_date: dueDate,
        subject_id: subjectId,
      });
      set({ items: [...get().items, created] });
      return true;
    } catch (error) {
      set({ error: toMessage(error) });
      return false;
    }
  },

  toggle: async (taskId, done) => {
    // 先本地更新，失败再回滚
    const before = get().items;
    set({ items: before.map((item) => (item.id === taskId ? { ...item, done } : item)) });
    try {
      await tasksApi.update(taskId, { done });
    } catch (error) {
      set({ items: before, error: toMessage(error) });
    }
  },

  remove: async (taskId) => {
    const before = get().items;
    set({ items: before.filter((item) => item.id !== taskId) });
    try {
      await tasksApi.remove(taskId);
    } catch (error) {
      set({ items: before, error: toMessage(error) });
    }
  },
}));
