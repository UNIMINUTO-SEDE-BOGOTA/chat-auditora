// ============================================================
// core/chat/ChatManager.ts
// Gestión del ciclo de vida de los chats: crear, cargar,
// eliminar, deshacer. No toca el DOM directamente.
// ============================================================

import type { Chat, ChatState } from '../../models/chat';
import { saveChats, saveActiveChat } from './ChatStorage';

// ── ID generators ────────────────────────────────────────────

export function generateChatId(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function generateSessionId(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ── Factory ──────────────────────────────────────────────────

export function createBaseChat(serviceId: string | null = null): Chat {
  return {
    id: generateChatId(),
    sessionId: generateSessionId(),
    title: 'Chat',
    messages: [],
    serviceId,
    category: null,
    process: null,
    macroproceso: null,
    state: 'welcome',
    createdAt: new Date().toISOString(),
  };
}

// ── Session ID guard ─────────────────────────────────────────

export function ensureChatSessionId(chat: Chat, onSave: () => void): string {
  if (!chat.sessionId) {
    chat.sessionId = generateSessionId();
    onSave();
  }
  return chat.sessionId;
}

// ── State mutation ───────────────────────────────────────────

export function setChatState(chat: Chat, state: ChatState, onSave: () => void): void {
  chat.state = state;
  onSave();
}

// ── Title auto-generation ────────────────────────────────────

const AUTO_TITLES = new Set(['Chat', 'EVA', 'Nuevo chat']);

export function maybeUpdateTitle(chat: Chat, userText: string): void {
  if (!userText || !AUTO_TITLES.has(chat.title)) return;
  const title = buildTitleFromText(userText);
  if (title) chat.title = title;
}

function buildTitleFromText(text: string): string {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  const preferred = sentences[1] ?? sentences[0] ?? normalized;
  const cleaned = preferred.replace(/^[¡¿"'\-\s]+/, '').replace(/["'.,;:!?…\s]+$/, '');
  if (!cleaned) return '';

  const words = cleaned.split(' ').filter(Boolean);
  const joined = words.slice(0, 8).join(' ');
  return joined.length > 52 ? `${joined.slice(0, 52).trim()}…` : joined;
}

// ── Delete with undo ─────────────────────────────────────────

export interface PendingDelete {
  chat: Chat;
  index: number;
  wasCurrentChat: boolean;
  wasOnlyChat: boolean;
}

export function removeChat(
  chats: Chat[],
  chatId: string,
  currentChatId: string
): { chats: Chat[]; newCurrentId: string; pending: PendingDelete } | null {
  const index = chats.findIndex(c => c.id === chatId);
  if (index === -1) return null;

  const deleted = chats[index];
  const wasOnly = chats.length === 1;
  const wasCurrent = currentChatId === chatId;

  const next = [...chats];
  next.splice(index, 1);

  let newCurrentId: string;

  if (wasOnly) {
    const fallback = createBaseChat();
    fallback.isAutoFallback = true;
    next.push(fallback);
    newCurrentId = fallback.id;
  } else if (wasCurrent || !next.some(c => c.id === currentChatId)) {
    newCurrentId = next[0].id;
  } else {
    newCurrentId = currentChatId;
  }

  return {
    chats: next,
    newCurrentId,
    pending: { chat: { ...deleted }, index, wasCurrentChat: wasCurrent, wasOnlyChat: wasOnly },
  };
}

export function restoreChat(
  chats: Chat[],
  pending: PendingDelete
): { chats: Chat[]; restoredId: string } {
  let next = [...chats];

  if (pending.wasOnlyChat) {
    next = next.filter(c => !c.isAutoFallback);
  }

  if (next.some(c => c.id === pending.chat.id)) {
    return { chats: next, restoredId: pending.chat.id };
  }

  const insertAt = Math.min(pending.index, next.length);
  const restored = { ...pending.chat };
  delete restored.isAutoFallback;
  next.splice(insertAt, 0, restored);

  saveChats(next);
  return { chats: next, restoredId: restored.id };
}

// ── Activate chat (session-scoped) ───────────────────────────
// Llama a esto cada vez que el usuario hace clic en un chat
// del historial o crea uno nuevo, para que la sesión recuerde
// cuál era el activo — pero solo hasta cerrar la pestaña.

export function activateChat(chatId: string): void {
  saveActiveChat(chatId);
}