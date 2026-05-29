-- L3 do AGENCY-Auditoria-PLANO 2026-05-24
-- Audit log de toda mensagem outbound da BOT/Bot pra revisão CFO 196/2019.
-- Rodar no Supabase SQL Editor: https://supabase.com/dashboard/project/mdbnozncpcnludsmubxq/sql

CREATE TABLE IF NOT EXISTS public.bot_message_audit (
  id              BIGSERIAL PRIMARY KEY,
  tenant_slug     TEXT NOT NULL DEFAULT 'agency',
  phone           TEXT NOT NULL,
  lead_id         TEXT,
  direction       TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  message_text    TEXT NOT NULL,
  message_id      TEXT,
  -- Flags CFO 196/2019 detectadas via regex no momento da mensagem
  cfo_flags       TEXT[] DEFAULT ARRAY[]::TEXT[],
  has_promise     BOOLEAN DEFAULT FALSE,
  has_guarantee   BOOLEAN DEFAULT FALSE,
  has_comparison  BOOLEAN DEFAULT FALSE,
  -- Metadata
  llm_model       TEXT,
  llm_temperature NUMERIC(3,2),
  workflow_id     TEXT,
  execution_id    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_audit_phone_idx ON public.bot_message_audit(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS bot_audit_flags_idx ON public.bot_message_audit USING GIN (cfo_flags);
CREATE INDEX IF NOT EXISTS bot_audit_created_idx ON public.bot_message_audit(created_at DESC);

-- RLS canônico — service_role only (acesso via N8N + admin)
ALTER TABLE public.bot_message_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_bot_message_audit" ON public.bot_message_audit;
CREATE POLICY "service_role_only_bot_message_audit"
  ON public.bot_message_audit FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Retention 7 anos (prazo prescricional CFO + cível brasileiro)
COMMENT ON TABLE public.bot_message_audit IS 'L3 audit log BOT — retention 7 anos (CFO 196/2019)';

-- Query útil pra revisão semanal admin:
-- SELECT created_at, phone, message_text, cfo_flags
-- FROM bot_message_audit
-- WHERE direction='outbound' AND array_length(cfo_flags,1) > 0
-- ORDER BY created_at DESC LIMIT 50;
