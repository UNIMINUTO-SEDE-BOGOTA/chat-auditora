// ============================================================
// core/chat/ChatRenderer.ts
// Toda la lógica de renderizado de mensajes y estados de UI.
// No contiene lógica de negocio.
// ============================================================

import type { Chat, ChatMessage } from '../../models/chat';
import { formatMessage } from '../utils/formatMessage';

// ── Scroll ───────────────────────────────────────────────────

export function scrollToBottom(containerId = 'messagesContainer'): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(containerId);
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// ── Typing indicator (NUEVO VERSIÓN CON MENSAJE PESTAÑEANTE) ──────────────────────────────────────────

export function showTypingIndicator(avatarSrc = '/icon-ava.png'): void {
  const container = document.getElementById('messagesContainer');
  if (!container || document.getElementById('typingIndicator')) return;

  const el = document.createElement('div');
  el.className = 'message assistant';
  el.id = 'typingIndicator';
  el.innerHTML = `
    <div class="message-avatar"><img src="${avatarSrc}" alt="Asistente"></div>
    <div class="message-body">
      <div class="message-label">Asistente</div>
      <div class="message-content">
        <div class="blinking-message">
          <span class="blinking-text">Procesando..</span>
          <span class="blinking-dots">...</span>
        </div>
      </div>
    </div>`;
  container.appendChild(el);
  scrollToBottom();
}

export function hideTypingIndicator(): void {
  document.getElementById('typingIndicator')?.remove();
}

// ── Single message ────────────────────────────────────────────

export function renderMessage(message: ChatMessage, labelOverride?: string): void {
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `message ${message.role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  if (message.role === 'user') {
    avatar.textContent = 'TÚ';
  } else {
    avatar.innerHTML = '<img src="/icon-ava.png" alt="AVA">';
  }

  const body = document.createElement('div');
  body.className = 'message-body';

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = message.role === 'user' ? 'Usuario' : (labelOverride ?? 'Asistente');

  const content = document.createElement('div');
  content.className = 'message-content';
  content.innerHTML = formatMessage(message.content);

  body.append(label, content);
  div.append(avatar, body);
  container.appendChild(div);
}

// ── Full chat render ──────────────────────────────────────────

/**
 * Limpia el contenedor y re-renderiza todos los mensajes del chat.
 * El callback `onSpecialMessage` permite a cada servicio inyectar
 * elementos especiales (ej: el selector de procesos de AVA).
 */
export function renderMessages(
  chat: Chat,
  onSpecialMessage?: (content: string) => void
): void {
  const container = document.getElementById('messagesContainer');
  const welcome = document.getElementById('welcomeScreen');
  if (!container) return;

  // Remove previous messages (not the welcome screen)
  container.querySelectorAll('.message, .process-selection').forEach(el => el.remove());

  if (chat.messages.length === 0) {
    welcome?.classList.remove('hidden');
    return;
  }

  welcome?.classList.add('hidden');

  chat.messages.forEach(msg => {
    if (msg.content.startsWith('__SPECIAL__:') && onSpecialMessage) {
      onSpecialMessage(msg.content.replace('__SPECIAL__:', '').trim());
    } else {
      renderMessage(msg);
    }
  });

  scrollToBottom();
}

// ── Input state ───────────────────────────────────────────────

export function updateInputState(state: string, isSending: boolean): void {
  const input = document.getElementById('messageInput') as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement | null;
  const wrapper = document.getElementById('inputWrapper');
  const inputContainer = document.getElementById('inputContainer');

  const canChat = state === 'chatting' && !isSending;

  inputContainer?.classList.toggle('hidden', state === 'welcome');

  if (input) input.disabled = !canChat;
  if (sendBtn) sendBtn.disabled = !canChat;
  wrapper?.classList.toggle('disabled', !canChat);
}

// ── Textarea auto-resize ──────────────────────────────────────

export function adjustInputHeight(inputId = 'messageInput', maxPx = 180): void {
  const el = document.getElementById(inputId) as HTMLTextAreaElement | null;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
}