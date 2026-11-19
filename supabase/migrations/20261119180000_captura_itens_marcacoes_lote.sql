-- TESTE CAPTURA 5 / T4 — marcações de lote persistidas no item de captura.
-- Idempotente: ADD COLUMN IF NOT EXISTS. Nenhuma coluna é removida.
ALTER TABLE public.captura_sessao_itens
  ADD COLUMN IF NOT EXISTS marcado_pago boolean NOT NULL DEFAULT false;
ALTER TABLE public.captura_sessao_itens
  ADD COLUMN IF NOT EXISTS marcado_repetir boolean NOT NULL DEFAULT false;
