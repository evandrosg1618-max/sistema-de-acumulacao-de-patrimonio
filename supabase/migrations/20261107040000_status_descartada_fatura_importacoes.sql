-- Migration: 20261107040000_status_descartada_fatura_importacoes.sql
-- Objetivo: Garantir suporte ao status 'descartada' para sessões de importação de faturas PDF
-- que forem substituídas por nova importação do mesmo cartão ou descartadas pelo usuário ao sair.
-- Suporte a ciclo de vida v0.0.77.

-- O campo status já é TEXT com DEFAULT 'em_revisao'.
-- Atualizamos o comentário da coluna e criamos um índice para busca rápida de faturas em processamento por cartão.
COMMENT ON COLUMN public.fatura_importacoes.status IS 'Status da sessão: em_revisao, concluida, cancelada, descartada';

CREATE INDEX IF NOT EXISTS idx_fatura_importacoes_cartao_status
  ON public.fatura_importacoes(cartao_id, status);

CREATE INDEX IF NOT EXISTS idx_fatura_importacoes_ws_status
  ON public.fatura_importacoes(workspace_id, status);
