// ============================================================
// services/ava/ava.ts
// Lógica completa del servicio AVA. Se auto-registra en App
// a través de la interfaz ServiceModule.
// ============================================================

import type { Chat } from '../../models/chat';
import { postToWebhook, isValidWebhookUrl } from '../../core/api/WebhookClient';
import {
  showTypingIndicator,
  hideTypingIndicator,
  scrollToBottom,
} from '../../core/chat/ChatRenderer';
import { ensureChatSessionId } from '../../core/chat/ChatManager';
import { SERVICES } from '../../config/services';

// ── AVA-specific constants ────────────────────────────────────

const SERVICE_ID = 'ava';
const CFG = SERVICES[SERVICE_ID];

const CATEGORY_NAMES: Record<string, string> = {
  capacitacion: 'Capacitación SGC en UNIMINUTO',
  consulta: 'Consulta Técnica ISO 9001:2015',
  simulador: 'Simulador de Auditorías',
  gestion: 'Gestión de No Conformidades',
};

const PROCESOS: Record<string, string[]> = {
  'Docencia': ['Enseñanza, Aprendizaje y Evaluación', 'Vida Estudiantil'],
  'Investigación': ['Investigación Formativa', 'Transferencia de Conocimiento y Tecnología'],
  'Proyección Social': ['Educación Continua'],
  'Gestión Administrativa y Financiera': ['Gestión de Ingresos', 'Aprovisionamiento'],
  'Gestión de Mercadeo y Posicionamiento': ['Comercialización y Ventas'],
};

// ── Helpers ───────────────────────────────────────────────────

function getWebhook(category: string | null): string {
  if (!category) return '';
  const url = CFG.webhooks[category];
  return isValidWebhookUrl(url) ? url : '';
}

// ── Welcome screen cards ──────────────────────────────────────

export function renderAvaWelcomeCards(): string {
  return `
    <button class="category-btn" data-ava-cat="capacitacion">
      <span class="icon">🧠</span>
      Capacitación SGC en UNIMINUTO
    </button>
    <button class="category-btn" data-ava-cat="consulta">
        <span class="icon">📘</span>
        Consulta Técnica ISO 9001:2015
      </button>
    <button class="category-btn" data-ava-cat="simulador">
      <span class="icon">💡</span>
      Simulador de Auditorías
    </button>
    <button class="category-btn" data-ava-cat="gestion">
      <span class="icon">📊</span>
      Glosario SGC - ISOLUCION
    </button>
  `;
}

export function bindAvaWelcomeCards(
  container: HTMLElement,
  onSelect: (category: string) => void
): void {
  container.querySelectorAll<HTMLButtonElement>('[data-ava-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.avaCat;
      if (cat) onSelect(cat);
    });
  });
}

// ── Category selection ────────────────────────────────────────

export function avaSelectCategory(
  chat: Chat,
  category: string,
  save: () => void
): void {
  chat.category = category;
  chat.serviceId = SERVICE_ID;
  chat.title = CATEGORY_NAMES[category] ?? 'AVA';

  const welcomeMap: Record<string, string> = {
    capacitacion: `👋 ¡Hola! Bienvenida a "${CATEGORY_NAMES.capacitacion}".\n\nPara empezar, escribe: "empecemos".`,
    consulta: `Bienvenido al modulo de consulta ISO 9001:2015, para comenzar el chat, puedes iniciar saludando a AVA. \n\n Por ejemplo, puedes escribir "Hola AVA" o "Buenos días".`,
    default: `👋 Bienvenida al módulo "${CATEGORY_NAMES[category] ?? category}".Este módulo está diseñado para realizar una preauditoría de tus procesos, que consiste en una simulación de auditoría donde te hare una serie de preguntas relacionadas con el macroproceso que elijas. ¡Empecemos! Selecciona el macroproceso que deseas auditar.(No olvides que si quieres cambiar de categoria debes iniciar un nuevo chat.)`,
  };

  chat.messages.push({
    role: 'assistant',
    content: welcomeMap[category] ?? welcomeMap.default,
    timestamp: new Date().toISOString(),
  });

  if (category === 'simulador') {
    chat.messages.push({
      role: 'assistant',
      content: '__SPECIAL__:process_selection',
      timestamp: new Date().toISOString(),
    });
    chat.state = 'category_selected';
  } else {
    chat.state = 'chatting';
  }

  save();
}

// ── Process selection UI ──────────────────────────────────────

export function renderProcessSelection(): void {
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  document.getElementById('processSelectionDiv')?.remove();

  const div = document.createElement('div');
  div.className = 'process-selection';
  div.id = 'processSelectionDiv';
  div.innerHTML = `
    <div class="process-selection-title">📋 Selecciona el macroproceso:</div>
    <div class="process-buttons">
      ${Object.keys(PROCESOS).map((macro, i) => `
        <button class="process-btn" data-macro-index="${i}">${macro}</button>
      `).join('')}
    </div>`;

  div.querySelectorAll<HTMLButtonElement>('[data-macro-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.macroIndex);
      const macro = Object.keys(PROCESOS)[i];
      if (macro) renderSubprocessSelection(macro);
    });
  });

  container.appendChild(div);
  scrollToBottom();
}

function renderSubprocessSelection(macro: string): void {
  const div = document.getElementById('processSelectionDiv');
  if (!div) return;

  const subs = PROCESOS[macro];
  const macroIndex = Object.keys(PROCESOS).indexOf(macro);

  div.innerHTML = `
    <div class="process-selection-title">📋 Macroproceso: <strong>${macro}</strong><br>Selecciona el subproceso:</div>
    <div class="process-buttons">
      ${subs.map((sub, i) => `<button class="process-btn" data-sub-index="${i}" data-macro-index="${macroIndex}">${sub}</button>`).join('')}
      <button class="process-btn process-btn-secondary" id="backToMacro">← Cambiar macroproceso</button>
    </div>`;

  div.querySelectorAll<HTMLButtonElement>('[data-sub-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = Number(btn.dataset.subIndex);
      _onProcessSelected?.(subs[si], macro);
    });
  });

  div.querySelector<HTMLButtonElement>('#backToMacro')
    ?.addEventListener('click', () => renderProcessSelection());
}

// Callback set by avaBindProcessSelection
let _onProcessSelected: ((sub: string, macro: string) => void) | null = null;

export function avaBindProcessSelection(
  onSelect: (sub: string, macro: string) => void
): void {
  _onProcessSelected = onSelect;
}

// ── Send process selection to webhook ────────────────────────

export async function avaSendProcessSelection(
  chat: Chat,
  subproceso: string,
  macro: string,
  save: () => void
): Promise<void> {
  chat.process = subproceso;
  chat.macroproceso = macro;

  chat.messages.push({
    role: 'user',
    content: `${macro} → ${subproceso}`,
    timestamp: new Date().toISOString(),
  });

  save();

  const url = getWebhook(chat.category);
  const sessionId = ensureChatSessionId(chat, save);

  showTypingIndicator();

  const reply = await postToWebhook(url, {
    message: subproceso,
    proceso: subproceso,
    macroproceso: macro,
    subproceso: '',
    sessionId,
    category: chat.category,
  });

  hideTypingIndicator();
  chat.messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
  chat.state = 'chatting';
  save();
}

// ── Regular message ───────────────────────────────────────────

export async function avaSendMessage(
  chat: Chat,
  message: string,
  save: () => void
): Promise<void> {
  const url = getWebhook(chat.category);

  if (!url) {
    chat.messages.push({
      role: 'assistant',
      content: '⚠️ Esta categoría no tiene webhook configurado. Actualiza config/services.ts.',
      timestamp: new Date().toISOString(),
    });
    save();
    return;
  }

  const sessionId = ensureChatSessionId(chat, save);

  showTypingIndicator();

  const reply = await postToWebhook(url, {
    message,
    proceso: chat.process ?? '',
    macroproceso: chat.macroproceso ?? '',
    subproceso: '',
    sessionId,
    category: chat.category,
    esSeleccionProceso: false,
  });

  hideTypingIndicator();
  chat.messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
  save();
}

// ── Special message renderer (called by ChatRenderer) ─────────

export function avaRenderSpecial(type: string): void {
  if (type === 'process_selection') {
    renderProcessSelection();
  }
}