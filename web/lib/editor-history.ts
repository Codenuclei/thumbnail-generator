import type { EditorDocument } from "@/lib/editor-types";

const MAX_HISTORY = 40;

export type EditorHistory = {
  past: EditorDocument[];
  present: EditorDocument;
  future: EditorDocument[];
};

export function createEditorHistory(present: EditorDocument): EditorHistory {
  return { past: [], present, future: [] };
}

export function pushEditorHistory(history: EditorHistory, next: EditorDocument): EditorHistory {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    present: next,
    future: [],
  };
}

export function undoEditorHistory(history: EditorHistory): EditorHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, MAX_HISTORY),
  };
}

export function redoEditorHistory(history: EditorHistory): EditorHistory {
  if (!history.future.length) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    present: next,
    future: history.future.slice(1),
  };
}
