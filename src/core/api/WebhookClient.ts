// ============================================================
// core/api/WebhookClient.ts
// Encapsula toda la comunicación con los webhooks de n8n.
// Reutilizable por cualquier servicio.
// ============================================================

const REQUEST_TIMEOUT_MS = 300_000;

export interface WebhookPayload {
  message: string;
  proceso?: string;
  macroproceso?: string;
  subproceso?: string;
  sessionId: string;
  category?: string | null;
  esSeleccionProceso?: boolean;
  [key: string]: unknown;
}

export interface WebhookResponse {
  respuesta?: string;
  output?: string;
  text?: string;
  response?: string;
  message?: string | { content: string };
  [key: string]: unknown;
}

// ── Validation ───────────────────────────────────────────────

export function isValidWebhookUrl(url: string | undefined): boolean {
  return Boolean(
    url &&
    url.startsWith('http') &&
    !url.includes('TU_N8N_URL') &&
    !url.includes('_ID')
  );
}

// ── Main request ─────────────────────────────────────────────

export async function postToWebhook(
  url: string,
  payload: WebhookPayload
): Promise<string> {

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Adaptar payload al formato que espera la Edge Function
  const edgePayload = {
    mensaje: payload.message,
    modo: payload.category ?? '',
    proceso: payload.proceso ?? '',
    macroproceso: payload.macroproceso ?? '',
    subproceso: payload.subproceso ?? '',
    sessionId: payload.sessionId,
    esSeleccionProceso: payload.esSeleccionProceso ?? false,
  };

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(edgePayload),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Respuesta no OK:', response.status, errorText);
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await parseResponse(response);
    return extractReply(data);
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('💥 Error en fetch:', (error as Error).name, (error as Error).message);
    return buildErrorMessage(error);
  }
}

// ── Response parsing ─────────────────────────────────────────

async function parseResponse(response: Response): Promise<WebhookResponse | string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return { message: { content: text } };
}

export function extractReply(data: WebhookResponse | string | unknown): string {
  if (typeof data === 'string' && data.trim()) return data;

  const d = data as WebhookResponse;
  if (d?.respuesta) return d.respuesta;
  if (d?.output) return d.output;
  if (d?.text) return d.text;
  if (d?.response) return d.response;
  if (d?.message && typeof d.message === 'object' && 'content' in d.message) {
    return (d.message as { content: string }).content;
  }
  if (d?.message && typeof d.message === 'string') return d.message;

  if (Array.isArray(data)) {
    const first = data[0] as WebhookResponse;
    if (first?.respuesta) return first.respuesta;
    if (first?.output) return first.output;
  }

  return 'Lo siento, no pude procesar tu solicitud.';
}

// ── Error messages ────────────────────────────────────────────

function buildErrorMessage(error: unknown): string {
  if ((error as Error)?.name === 'AbortError') {
    return '⏰ La consulta está tomando más de 5 minutos. Por favor, intenta con una pregunta más específica.';
  }
  if ((error as Error)?.message?.includes('HTTP 5')) {
    return 'El servidor tuvo un problema temporal. Por favor intenta de nuevo.';
  }
  return 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.';
}