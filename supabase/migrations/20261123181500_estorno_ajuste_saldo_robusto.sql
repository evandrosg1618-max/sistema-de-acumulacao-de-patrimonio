-- SAP — Central de Ajustes D2.1 / T2: estorno robusto do ajuste de saldo bancário.
-- PROBLEMA: o ajuste de saldo nasce com status_pagamento='pago' (saldo movido na criação).
-- O toggle de pagamento da lista podia adulterar o status para 'pendente' SEM reverter o
-- saldo, e o estorno antigo só reverteia se status='pago' — depois disso nunca mais.
-- SOLUÇÃO: a prova de que o saldo foi movido é a EXISTÊNCIA da movimentacoes_conta do
-- lançamento, não o status. Idempotência mantida: após o estorno a movimentação é
-- apagada e o status vira 'cancelado' — uma segunda chamada não reverte de novo.

CREATE OR REPLACE FUNCTION public.estornar_ajuste_saldo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_lanc RECORD;
  v_mov RECORD;
  v_conta_id uuid;
  v_saldo_antes numeric;
  v_ja_estornado boolean := false;
BEGIN
  IF NOT public.is_member_of_workspace(p_workspace_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não é membro do workspace');
  END IF;

  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.tipo <> 'ajuste' OR v_lanc.subtipo_ajuste <> 'ajuste_saldo_conta' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é um ajuste de saldo da conta');
  END IF;

  -- Idempotência: já estornado/excluído (status 'cancelado' é a marca do estorno;
  -- a movimentação correspondente já foi apagada na primeira reversão).
  IF v_lanc.deleted_at IS NOT NULL OR v_lanc.status_pagamento = 'cancelado' THEN
    RETURN jsonb_build_object('sucesso', true, 'ja_estornado', true);
  END IF;

  -- Prova de que o saldo foi movido: existe movimentacoes_conta deste lançamento.
  SELECT * INTO v_mov
  FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE
  LIMIT 1;

  IF FOUND THEN
    v_ja_estornado := false;
    v_conta_id := COALESCE(v_mov.conta_id, v_lanc.conta_origem_id);
  ELSE
    v_ja_estornado := true;
    v_conta_id := v_lanc.conta_origem_id;
  END IF;

  IF v_ja_estornado THEN
    -- Sem movimentação = o saldo nunca foi movido ou já foi revertido.
    -- Apenas sela o lançamento como cancelado (sem tocar no saldo).
    UPDATE public.lancamentos
    SET status_pagamento = 'cancelado', updated_at = NOW()
    WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

    INSERT INTO public.auditoria_operacoes (
      workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
    ) VALUES (
      p_workspace_id, 'lancamentos', p_lancamento_id, 'estorno_ajuste_saldo',
      jsonb_build_object('saldo_antes_estorno', NULL, 'valor_ajuste', v_lanc.valor,
                         'direcao', NULL, 'sem_movimentacao', true),
      jsonb_build_object('status', 'cancelado'),
      p_user_id
    );

    RETURN jsonb_build_object('sucesso', true, 'estornado', true, 'sem_movimentacao', true);
  END IF;

  -- Reverte o efeito no saldo: entrada somou, saída subtraiu.
  IF v_conta_id IS NOT NULL THEN
    SELECT saldo_atual INTO v_saldo_antes
    FROM public.contas
    WHERE id = v_conta_id AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF v_mov.tipo = 'entrada' THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_lanc.valor, updated_at = NOW()
      WHERE id = v_conta_id AND workspace_id = p_workspace_id;
    ELSE
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_lanc.valor, updated_at = NOW()
      WHERE id = v_conta_id AND workspace_id = p_workspace_id;
    END IF;
  END IF;

  DELETE FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

  UPDATE public.lancamentos
  SET status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'estorno_ajuste_saldo',
    jsonb_build_object('saldo_antes_estorno', v_saldo_antes, 'valor_ajuste', v_lanc.valor,
                       'direcao', COALESCE(v_mov.tipo, NULL)),
    jsonb_build_object('status', 'cancelado'),
    p_user_id
  );

  RETURN jsonb_build_object('sucesso', true, 'estornado', true);
END;
$function$;
