import { create } from "zustand";

import { authApi } from "../lib/api";
import type { AuthUser } from "../types";

interface AuthStore {
  user: AuthUser | null;
  /** 首次 /api/auth/me 之前为 false，避免闪一下登录页 */
  ready: boolean;
  registrationOpen: boolean;
  needsInviteCode: boolean;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    inviteCode?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  markSignedOut: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  ready: false,
  registrationOpen: true,
  needsInviteCode: false,

  bootstrap: async () => {
    try {
      const state = await authApi.me();
      set({
        user: state.user,
        ready: true,
        registrationOpen: state.registration_open,
        needsInviteCode: state.needs_invite_code,
      });
    } catch {
      // 网络异常时先当作未登录，用户可以手动重试
      set({ user: null, ready: true });
    }
  },

  login: async (username, password) => {
    const state = await authApi.login(username, password);
    set({
      user: state.user,
      registrationOpen: state.registration_open,
      needsInviteCode: state.needs_invite_code,
    });
  },

  register: async (username, password, inviteCode = "") => {
    const state = await authApi.register(username, password, inviteCode);
    set({
      user: state.user,
      registrationOpen: state.registration_open,
      needsInviteCode: state.needs_invite_code,
    });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // 网络失败不影响本地退出，Cookie 过期后服务端也会自动失效
    }
    set({ user: null });
  },

  markSignedOut: () => set({ user: null }),
}));
