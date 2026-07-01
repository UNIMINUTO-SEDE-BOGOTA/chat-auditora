// ============================================================
// config/services.ts
// ============================================================

export interface ServiceWebhooks {
  [key: string]: string;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  webhooks: ServiceWebhooks;
  defaultWebhookKey: string;
  enabled: boolean;
  comingSoon?: boolean;
}

// URL base de tus Edge Functions
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const AVA_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/AVA`;

// URLs independientes por flujo (desde .env)
const WEBHOOK_AVA_CAPACITACION = import.meta.env.VITE_WEBHOOK_AVA_CAPACITACION ?? AVA_FUNCTION_URL;
const WEBHOOK_AVA_CONSULTA     = import.meta.env.VITE_WEBHOOK_AVA_CONSULTA     ?? AVA_FUNCTION_URL;
const WEBHOOK_AVA_SIMULADOR    = import.meta.env.VITE_WEBHOOK_AVA_SIMULADOR    ?? AVA_FUNCTION_URL;
const WEBHOOK_AVA_GESTION      = import.meta.env.VITE_WEBHOOK_AVA_GESTION      ?? AVA_FUNCTION_URL;

export const SERVICES: Record<string, ServiceDefinition> = {
  ava: {
    id: 'ava',
    name: 'EVA - Agente Virtual de Auditoría',
    shortName: 'EVA',
    icon: '🧠',
    description: 'Capacitación SGC, consultas ISO 9001 y simulador de auditorías',
    webhooks: {
      capacitacion: WEBHOOK_AVA_CAPACITACION,
      consulta:     WEBHOOK_AVA_CONSULTA,
      simulador:    WEBHOOK_AVA_SIMULADOR,
      gestion:      WEBHOOK_AVA_GESTION,
    },
    defaultWebhookKey: 'capacitacion',
    enabled: true,
  },
};

export const SERVICE_ORDER: string[] = ['ava'];