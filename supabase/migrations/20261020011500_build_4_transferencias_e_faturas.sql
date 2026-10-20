-- Migration: Build 4 - Correção e garantia de restauração de saldos de transferências e integridade de faturas pagas
-- 1. Função RPC para estornar/desfazer movimentações e restaurar saldos de transferências com atomicidade
CREATE OR REPLACE FUNCTION public.restaurar_saldo_transferencia_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_origem RECORD;
  v_destino RECORD;
  v_valor numeric;
BEGIN
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.tipo <> 'transferencia' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é uma transferência');
  END IF;

  v_valor := COALESCE(v_lanc.valor, 0);

  IF v_lanc.status_pagamento = 'pago' AND v_valor > 0 THEN
    -- Restaura conta origem (adiciona de volta o valor)
    IF v_lanc.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_valor,
          updated_at = NOW()
      WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
    END IF;

    -- Restaura conta destino (subtrai o valor)
    IF v_lanc.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_valor,
          updated_at = NOW()
      WHERE id = v_lanc.conta_destino_id AND workspace_id = p_workspace_id;
    END IF;

    -- Remove as movimentações financeiras geradas por este lançamento
    DELETE FROM public.movimentacoes_conta
    WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'valor_restaurado', v_valor);
END;
$$;

-- 2. Garantir RPC para aplicar saldo de transferência
CREATE OR REPLACE FUNCTION public.aplicar_saldo_transferencia_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_origem RECORD;
  v_destino RECORD;
  v_valor numeric;
BEGIN
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.tipo <> 'transferencia' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é uma transferência');
  END IF;

  v_valor := COALESCE(v_lanc.valor, 0);

  IF v_valor > 0 AND v_lanc.conta_origem_id IS NOT NULL AND v_lanc.conta_destino_id IS NOT NULL THEN
    -- Debita conta origem
    UPDATE public.contas
    SET saldo_atual = saldo_atual - v_valor,
        updated_at = NOW()
    WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;

    -- Credita conta destino
    UPDATE public.contas
    SET saldo_atual = saldo_atual + v_valor,
        updated_at = NOW()
    WHERE id = v_lanc.conta_destino_id AND workspace_id = p_workspace_id;

    -- Busca nomes das contas
    SELECT nome INTO v_origem FROM public.contas WHERE id = v_lanc.conta_origem_id;
    SELECT nome INTO v_destino FROM public.contas WHERE id = v_lanc.conta_destino_id;

    -- Remove movimentações antigas se existirem
    DELETE FROM public.movimentacoes_conta
    WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

    -- Insere movimentações
    INSERT INTO public.movimentacoes_conta (
      workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
    ) VALUES 
    (
      p_workspace_id, v_lanc.conta_origem_id, p_lancamento_id, 'transferencia_saida',
      v_valor, v_lanc.data, 'Transf. saída para ' || COALESCE(v_destino.nome, 'Conta destino'), p_user_id
    ),
    (
      p_workspace_id, v_lanc.conta_destino_id, p_lancamento_id, 'transferencia_entrada',
      v_valor, v_lanc.data, 'Transf. entrada de ' || COALESCE(v_origem.nome, 'Conta origem'), p_user_id
    );
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'valor_aplicado', v_valor);
END;
$$;
