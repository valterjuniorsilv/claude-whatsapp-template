-- S7 da auditoria: habilitar RLS em 4 tabelas AGENCY que não tinham
-- Rodar via Supabase SQL Editor (https://supabase.com/dashboard/project/mdbnozncpcnludsmubxq/sql)

-- bot_protected_contacts: PII telefones (André Ramalho etc) — vaza se anon key vazar
ALTER TABLE IF EXISTS public.bot_protected_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_bot_protected_contacts" ON public.bot_protected_contacts;
CREATE POLICY "service_role_only_bot_protected_contacts" ON public.bot_protected_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- bot_protected_interceptions
ALTER TABLE IF EXISTS public.bot_protected_interceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_bot_protected_interceptions" ON public.bot_protected_interceptions;
CREATE POLICY "service_role_only_bot_protected_interceptions" ON public.bot_protected_interceptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- capi_events: telemetria CAPI Meta (phone hash + fbtrace + response Meta)
ALTER TABLE IF EXISTS public.capi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_capi_events" ON public.capi_events;
CREATE POLICY "service_role_only_capi_events" ON public.capi_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- agency_monitor_snapshots: snapshots de monitoring
ALTER TABLE IF EXISTS public.agency_monitor_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_agency_monitor_snapshots" ON public.agency_monitor_snapshots;
CREATE POLICY "service_role_only_agency_monitor_snapshots" ON public.agency_monitor_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Verificar pós-aplicação:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('bot_protected_contacts','bot_protected_interceptions','capi_events','agency_monitor_snapshots');
