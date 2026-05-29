-- ============================================================
-- Bot — Contatos Protegidos
-- Criado: 2026-05-19
-- Motivo: Bot atendia contato pessoal do admin (André Ramalho) quando ele clicava em CTWA
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_protected_contacts (
  phone       TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  reason      TEXT,
  source      TEXT NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual','icloud_sync','agency_crm','google_contacts')),
  added_by    TEXT DEFAULT 'valter',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_protected_phone ON bot_protected_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_bot_protected_source ON bot_protected_contacts(source);

-- Seed: o André Ramalho que disparou o problema hoje
INSERT INTO bot_protected_contacts (phone, name, reason, source)
VALUES ('554391038883', 'André Ramalho', 'contato pessoal admin (DDD 43, conhecido)', 'manual')
ON CONFLICT (phone) DO NOTHING;

-- Log de interceptações (auditoria)
CREATE TABLE IF NOT EXISTS bot_protected_interceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  remote_jid      TEXT NOT NULL,
  contact_name    TEXT,
  inbound_text    TEXT,
  source          TEXT,
  intercepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valter_notified BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_bot_intercept_phone ON bot_protected_interceptions(phone, intercepted_at DESC);
