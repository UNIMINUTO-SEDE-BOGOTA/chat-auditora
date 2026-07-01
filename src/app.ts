// ============================================================
// app.ts
// Orquestador principal. Conecta ChatManager, Sidebar,
// servicios y componentes. Es el único lugar que conoce
// el estado global de la aplicación.
// ============================================================

import type { Chat } from './models/chat';
import { loadChats, saveChats } from './core/chat/ChatStorage';
import {
  createBaseChat,
  maybeUpdateTitle,
  removeChat,
  restoreChat,
  type PendingDelete,
} from './core/chat/ChatManager';
import {
  renderMessages,
  updateInputState,
  adjustInputHeight,
  scrollToBottom,
} from './core/chat/ChatRenderer';
import { renderChatsList, initSidebarListeners } from './components/Sidebar';
import { showUndoToast, initUndoToastListeners } from './components/UndoToast';
import { setupUpdateChecker, initUpdateBannerListeners } from './components/UpdateBanner';
import { SERVICES, SERVICE_ORDER } from './config/services';

// AVA service
import {
  avaSelectCategory,
  avaSendMessage,
  avaSendProcessSelection,
  avaRenderSpecial,
  avaBindProcessSelection,
  renderAvaWelcomeCards,
  bindAvaWelcomeCards,
} from './services/ava/ava';

export class App {
  private chats: Chat[] = [];
  private currentChatId = '';
  private pendingDelete: PendingDelete | null = null;

  // ── FIX: isSending ahora es un Set de chat IDs en vez de un
  //    booleano global. Así cada chat tiene su propio estado de
  //    "enviando" y cambiar de chat nunca bloquea el input.
  private sendingChats = new Set<string>();

  // ── Init ────────────────────────────────────────────────────

  init(): void {
    this.chats = loadChats();

    this.initComponents();
    this.initInputListeners();
    this.renderWelcomeCards();

    if (this.chats.length === 0) {
      // Primera vez: crea un chat vacío y muestra la welcome
      this.createNewChat();
    } else {
      // Tiene historial: selecciona el primer chat pero NO lo abre —
      // solo muestra la pantalla de módulos para que el usuario elija.
      this.currentChatId = this.chats[0].id;
      this.renderSidebar();
      this.showWelcomeScreen();
    }
  }

  private showWelcomeScreen(): void {
    // Muestra la pantalla de módulos y limpia mensajes anteriores
    document.getElementById('welcomeScreen')?.classList.remove('hidden');
    const container = document.getElementById('messagesContainer');
    if (container) {
      container.querySelectorAll('.message, .process-selection').forEach(el => el.remove());
    }
    // El input se oculta en estado welcome — se habilitará cuando
    // el usuario seleccione un módulo/categoría
    updateInputState('welcome', false);
  }

  private initComponents(): void {
    initSidebarListeners({
      onNewChat: () => this.createNewChat(),
      onSelectChat: (id) => this.loadChat(id),
      onDeleteChat: (id, e) => this.deleteChat(id, e),
      onLogoClick: () => this.goToMainWindow(),
    });

    initUndoToastListeners();
    initUpdateBannerListeners();
    setupUpdateChecker();

    // AVA process selection callback
    avaBindProcessSelection((sub, macro) => {
      const chat = this.currentChat;
      if (!chat) return;
      avaSendProcessSelection(chat, sub, macro, () => this.save()).then(() => {
        renderMessages(chat, avaRenderSpecial);
        this.renderSidebar();
        updateInputState(chat.state, this.isCurrentChatSending());
      });
    });
  }

  private initInputListeners(): void {
    const input = document.getElementById('messageInput') as HTMLTextAreaElement | null;
    const sendBtn = document.getElementById('sendBtn');

    input?.addEventListener('input', () => adjustInputHeight());
    input?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    input?.addEventListener('focus', () => {
      setTimeout(() => {
        document.getElementById('inputContainer')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }, 350);
    });

    sendBtn?.addEventListener('click', () => this.sendMessage());

    if (typeof window.visualViewport !== 'undefined') {
      window.visualViewport?.addEventListener('resize', () => scrollToBottom());
    }
  }

  // ── Welcome screen ───────────────────────────────────────────

  private renderWelcomeCards(): void {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    let html = '';
    SERVICE_ORDER.forEach(id => {
      const svc = SERVICES[id];
      if (!svc) return;

      if (svc.id === 'ava') {
        html += renderAvaWelcomeCards();
      } else {
        const disabled = !svc.enabled || svc.comingSoon;
        html += `
          <button class="category-btn${disabled ? ' category-btn-disabled' : ''}"
            ${disabled ? 'disabled aria-disabled="true"' : ''}
            data-service="${svc.id}">
            ${svc.comingSoon ? '<span class="category-status-badge">Próximamente</span>' : ''}
            <span class="icon">${svc.icon}</span>
            ${svc.name}
          </button>`;
      }
    });

    grid.innerHTML = html;

    bindAvaWelcomeCards(grid, (cat) => this.avaOnSelectCategory(cat));

    grid.querySelectorAll<HTMLButtonElement>('[data-service]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.service;
        if (id) this.onSelectService(id);
      });
    });
  }

  // ── Service routing ──────────────────────────────────────────

  private onSelectService(serviceId: string): void {
    console.log('Service selected:', serviceId);
  }

  private avaOnSelectCategory(category: string): void {
    const chat = this.currentChat;
    if (!chat) return;

    document.getElementById('welcomeScreen')?.classList.add('hidden');
    avaSelectCategory(chat, category, () => this.save());
    renderMessages(chat, avaRenderSpecial);
    this.renderSidebar();
    updateInputState(chat.state, this.isCurrentChatSending());
  }

  // ── Message sending ──────────────────────────────────────────

  async sendMessage(): Promise<void> {
    const input = document.getElementById('messageInput') as HTMLTextAreaElement | null;
    const message = input?.value.trim();
    if (!message) return;

    const chat = this.ensureActiveChat();
    if (!chat) return;

    // FIX: bloquea solo si ESTE chat ya está enviando, no cualquiera
    if (this.sendingChats.has(chat.id)) return;

    // Captura el ID del chat al inicio — si el usuario cambia de chat
    // mientras se procesa, las actualizaciones se aplican al chat
    // correcto y no al que esté visible en ese momento.
    const sendingChatId = chat.id;

    chat.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    maybeUpdateTitle(chat, message);
    if (input) { input.value = ''; adjustInputHeight(); }

    this.sendingChats.add(sendingChatId);

    // Solo bloquea el input si este chat sigue siendo el activo
    if (this.currentChatId === sendingChatId) {
      updateInputState(chat.state, true);
    }

    renderMessages(chat, avaRenderSpecial);
    this.save();
    this.renderSidebar();

    try {
      if (chat.serviceId === 'ava') {
        await avaSendMessage(chat, message, () => this.save());
      }
    } catch (err) {
      console.error('Error enviando mensaje:', err);
      // Agrega un mensaje de error visible en el chat
      chat.messages.push({
        role: 'assistant',
        content: 'Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.',
        timestamp: new Date().toISOString(),
      });
      this.save();
    } finally {
      // FIX: siempre se libera el flag, incluso si hubo error o
      // el usuario cambió de chat — nunca queda bloqueado
      this.sendingChats.delete(sendingChatId);

      // Actualiza el chat que procesó el mensaje (aunque no sea el activo)
      const resolvedChat = this.chats.find(c => c.id === sendingChatId);
      if (resolvedChat) {
        this.save();
        // Solo re-renderiza si este chat sigue siendo el visible
        if (this.currentChatId === sendingChatId) {
          renderMessages(resolvedChat, avaRenderSpecial);
          updateInputState(resolvedChat.state, false);
        }
        this.renderSidebar();
      }
    }
  }

  // ── Chat lifecycle ───────────────────────────────────────────

  createNewChat(): void {
    const chat = createBaseChat();
    this.currentChatId = chat.id;
    this.chats.unshift(chat);
    this.save();
    this.renderSidebar();
    this.loadChat(this.currentChatId);
  }

  goToMainWindow(): void {
    const chat = this.currentChat;
    if (chat && chat.messages.length === 0 && chat.state === 'welcome') {
      this.loadChat(chat.id);
    } else {
      this.createNewChat();
    }
  }

  loadChat(chatId: string): void {
    this.currentChatId = chatId;
    const chat = this.currentChat;
    if (!chat) return;

    const welcome = document.getElementById('welcomeScreen');
    if (chat.messages.length === 0) {
      welcome?.classList.remove('hidden');
    } else {
      welcome?.classList.add('hidden');
      // Si el chat tiene mensajes pero su estado quedó en 'welcome'
      // (por el reset de ChatStorage al cargar la app), lo corregimos
      // aquí para que el input se muestre correctamente.
      if (chat.state === 'welcome') {
        chat.state = 'chatting';
      }
    }

    renderMessages(chat, avaRenderSpecial);
    updateInputState(chat.state, this.sendingChats.has(chatId));
    this.renderSidebar();
  }

  deleteChat(chatId: string, event?: MouseEvent): void {
    event?.stopPropagation();

    const toDelete = this.chats.find(c => c.id === chatId);
    if (!toDelete) return;

    if (!window.confirm(`¿Eliminar el chat "${toDelete.title}"?`)) return;

    const result = removeChat(this.chats, chatId, this.currentChatId);
    if (!result) return;

    this.chats = result.chats;
    this.currentChatId = result.newCurrentId;
    this.pendingDelete = result.pending;

    // limpia el flag de envío si el chat eliminado estaba procesando
    this.sendingChats.delete(chatId);

    this.save();
    this.renderSidebar();
    this.loadChat(this.currentChatId);

    showUndoToast(
      toDelete.title,
      () => this.undoDelete(),
      () => { this.pendingDelete = null; }
    );
  }

  private undoDelete(): void {
    if (!this.pendingDelete) return;
    const { chats, restoredId } = restoreChat(this.chats, this.pendingDelete);
    this.chats = chats;
    this.currentChatId = restoredId;
    this.pendingDelete = null;
    this.save();
    this.renderSidebar();
    this.loadChat(restoredId);
  }

  // ── Helpers ──────────────────────────────────────────────────

  private get currentChat(): Chat | undefined {
    return this.chats.find(c => c.id === this.currentChatId);
  }

  // FIX: helper que reemplaza el booleano global this.isSending
  private isCurrentChatSending(): boolean {
    return this.sendingChats.has(this.currentChatId);
  }

  private ensureActiveChat(): Chat {
    if (!this.currentChatId || !this.chats.some(c => c.id === this.currentChatId)) {
      this.createNewChat();
    }
    return this.currentChat!;
  }

  private save(): void {
    saveChats(this.chats);
  }

  private renderSidebar(): void {
    renderChatsList(this.chats, this.currentChatId, {
      onNewChat: () => this.createNewChat(),
      onSelectChat: (id) => this.loadChat(id),
      onDeleteChat: (id, e) => this.deleteChat(id, e),
      onLogoClick: () => this.goToMainWindow(),
    });
  }
}