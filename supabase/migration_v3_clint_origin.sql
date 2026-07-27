-- Go Beyond Ops — migração v3
-- Adiciona 'clint' ao enum de origem do lead (leads vindos do webhook da Clint).
-- Rodar no SQL Editor do Supabase (ou via `supabase db query --linked`).

alter type public.lead_origin add value if not exists 'clint';
