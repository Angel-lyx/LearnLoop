export interface HistoryState {
  past: string[];
  present: string;
  future: string[];
}

const LIMIT = 50;

export const EMPTY_HISTORY: HistoryState = {
  past: [],
  present: "[]",
  future: [],
};

/** 记录一次新快照；与当前快照相同时不产生历史。 */
export function pushHistory(state: HistoryState, next: string): HistoryState {
  if (next === state.present) return state;
  return {
    past: [...state.past, state.present].slice(-LIMIT),
    present: next,
    future: [],
  };
}

/** 回退一步；没有历史时返回 null。 */
export function undo(state: HistoryState): HistoryState | null {
  if (state.past.length === 0) return null;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, LIMIT),
  };
}

/** 前进一步；没有可重做的内容时返回 null。 */
export function redo(state: HistoryState): HistoryState | null {
  if (state.future.length === 0) return null;
  const [next, ...rest] = state.future;
  return {
    past: [...state.past, state.present].slice(-LIMIT),
    present: next,
    future: rest,
  };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

/** 页码限制在 1..total 之间。total 非法时返回 1。 */
export function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page) || total < 1) return 1;
  return Math.min(Math.max(Math.round(page), 1), total);
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
