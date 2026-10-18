-- Migration: Build 2 - Conciliação e Ajustes de Lançamento
-- Adiciona suporte a conciliação manual, status conciliado e tabela de conciliações de saldo

ALTER TABLE public.lancamentos 
  ADD COLUMN IF NOT EXISTS conciliado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_conciliacao timestamp with time zone,
  ADD COLUMN IF NOT EXISTS conciliado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Tabela de histórico de conciliações de conta bancária
CREATE TABLE IF NOT EXISTS public.conciliacoes_conta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conta_id uuid NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  data_extrato date NOT NULL,
  saldo_sistema numeric(14,2) NOT NULL,
  saldo_extrato numeric(14,2) NOT NULL,
  divergencia numeric(14,2) NOT NULL,
  ajustado boolean NOT NULL DEFAULT false,
  lancamento_ajuste_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  observacao text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.conciliacoes_conta ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para conciliacoes_conta
DROP POLICY IF EXISTS "conciliacoes_conta_all" ON public.conciliacoes_conta;
CREATE POLICY "conciliacoes_conta_all" ON public.conciliacoes_conta
  FOR ALL TO authenticated
  USING (is_member_of_workspace(workspace_id))
  WITH CHECK (is_member_of_workspace(workspace_id));

CREATE INDEX IF NOT EXISTS idx_conciliacoes_conta_ws ON public.conciliacoes_conta (workspace_id, conta_id);
