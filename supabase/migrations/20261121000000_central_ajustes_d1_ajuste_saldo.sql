-- Migration: Central de Ajustes — Parte D1 (fundação do Ajuste de Saldo Bancário)
-- Versão: 20261121000000
--
-- Regras (especificação seções 14–19):
--  - O ajuste movimenta o saldo da conta (contas.saldo_atual persistido), mas é
--    NEUTRO em Resultado, Orçamento, cartões e faturas (afeta_resultado=false,
--    afeta_orcamento=false, sem categoria, sem cartão, sem parcelas/recorrência).
--  - O saldo final é consequência do lançamento registrado (movimentação
--    auditável), nunca sobrescrita sem lançamento.
--  - RPC atômica com FOR UPDATE: se o saldo mudou entre a abertura da tela e a
--    confirmação, o ajuste é recalculado com o saldo atual travado — o saldo
--    final SEMPRE termina igual ao saldo real informado.
--  - Ajuste zero: não cria nada (retorna sem_ajuste).
--  - Duplo clique: idempotency_key única por workspace protege no nível do banco.

-- 1) Relaxa as constraints de 'ajuste' para aceitar o novo subtipo de saldo
--    (ajuste de fatura continua exigindo cartão/efeito_fatura exatamente como antes).
ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_ajuste_regras_check;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_ajuste_regras_check CHECK (
  tipo <> 'ajuste' OR (
    (
      subtipo_ajuste IN ('ajuste_fatura_banco', 'ajuste_tecnico_sap')
      AND efeito_fatura IS NOT NULL
      AND cartao_id IS NOT NULL
      AND regime = 'unico'
      AND meio_pagamento_tipo = 'CARTAO'
    )
    OR (
      subtipo_ajuste = 'ajuste_saldo_conta'
      AND efeito_fatura IS NULL
      AND cartao_id IS NULL
      AND categoria_id IS NULL
      AND subcategoria_id IS NULL
      AND conta_destino_id IS NULL
      AND conta_origem_id IS NOT NULL
      AND regime = 'unico'
      AND meio_pagamento_tipo = 'CONTA'
    )
  )
);

ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_subtipo_ajuste_check;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_subtipo_ajuste_check CHECK (
  subtipo_ajuste IS NULL
  OR subtipo_ajuste IN ('ajuste_fatura_banco', 'ajuste_tecnico_sap', 'ajuste_saldo_conta')
);

-- 2) RPC atômica de registro do ajuste de saldo bancário
CREATE OR REPLACE FUNCTION public.registrar_ajuste_saldo_rpc(
  p_workspace_id uuid,
  p_conta_id uuid,
  p_saldo_real numeric,
  p_data date,
  p_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conta RECORD;
  v_ajuste numeric;
  v_ajuste_abs numeric;
  v_direcao text;
  v_lancamento_id uuid;
  v_competencia text;
  v_idem text;
  v_obs text;
BEGIN
  IF NOT public.is_member_of_workspace(p_workspace_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não é membro do workspace');
  END IF;

  IF p_saldo_real IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Saldo real é obrigatório');
  END IF;

  -- Trava a conta (FOR UPDATE): o ajuste é calculado com o saldo ATUAL travado,
  -- nunca com o saldo obsoleto exibido na tela antes de outra movimentação.
  SELECT * INTO v_conta
  FROM public.contas
  WHERE id = p_conta_id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta não encontrada');
  END IF;

  v_ajuste := ROUND(p_saldo_real - COALESCE(v_conta.saldo_atual, 0), 2);

  -- Ajuste zero: nada a registrar (botão deve estar desabilitado; proteção no banco)
  IF v_ajuste = 0 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'sem_ajuste', true,
      'mensagem', 'O saldo informado já corresponde ao saldo registrado no SAP. Nenhum ajuste foi necessário.',
      'saldo_atual', v_conta.saldo_atual
    );
  END IF;

  v_ajuste_abs := ABS(v_ajuste);
  v_direcao := CASE WHEN v_ajuste > 0 THEN 'entrada' ELSE 'saida' END;
  v_competencia := TO_CHAR(p_data, 'YYYY-MM');
  v_obs := NULLIF(TRIM(COALESCE(p_observacao, '')), '');
  v_idem := 'ajuste_saldo:' || p_conta_id::text || ':' || TO_CHAR(p_data, 'YYYY-MM-DD')
            || ':' || v_ajuste::text;

  -- Idempotência: mesma conta / mesma data / mesmo ajuste já registrado (duplo clique)
  PERFORM 1
  FROM public.lancamentos
  WHERE workspace_id = p_workspace_id
    AND idempotency_key = v_idem
    AND deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'duplicado', true,
      'mensagem', 'Ajuste já registrado anteriormente. Nenhum lançamento duplicado.'
    );
  END IF;

  -- Lançamento de ajuste: neutro em Resultado/Orçamento, sem categoria, sem cartão
  BEGIN
    INSERT INTO public.lancamentos (
      workspace_id, tipo, regime, data, competencia, descricao, valor,
      meio_pagamento_tipo, conta_origem_id, cartao_id, categoria_id, subcategoria_id,
      status_pagamento, data_pagamento, observacao, idempotency_key, created_by,
      afeta_resultado, afeta_orcamento, subtipo_ajuste, efeito_fatura
    ) VALUES (
      p_workspace_id, 'ajuste', 'unico', p_data, v_competencia, 'Ajuste do saldo da conta',
      v_ajuste_abs, 'CONTA', p_conta_id, NULL, NULL, NULL,
      'pago', p_data, v_obs, v_idem, p_user_id,
      false, false, 'ajuste_saldo_conta', NULL
    )
    RETURNING id INTO v_lancamento_id;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida de duplo clique: o índice único (workspace_id, idempotency_key) segurou
    RETURN jsonb_build_object(
      'sucesso', true,
      'duplicado', true,
      'mensagem', 'Ajuste já registrado anteriormente. Nenhum lançamento duplicado.'
    );
  END;

  -- Histórico de movimentação da conta (valor sempre positivo + direção)
  INSERT INTO public.movimentacoes_conta (
    workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, idempotency_key, created_by
  ) VALUES (
    p_workspace_id, p_conta_id, v_lancamento_id, v_direcao, v_ajuste_abs, p_data,
    'Ajuste do saldo da conta', v_idem, p_user_id
  );

  -- Novo saldo = consequência do lançamento (saldo travado + ajuste recalculado)
  UPDATE public.contas
  SET saldo_atual = saldo_atual + v_ajuste,
      updated_at = NOW()
  WHERE id = p_conta_id AND workspace_id = p_workspace_id;

  -- Registro da conciliação
  INSERT INTO public.conciliacoes_conta (
    workspace_id, conta_id, data_extrato, saldo_sistema, saldo_extrato,
    divergencia, ajustado, lancamento_ajuste_id, observacao, created_by
  ) VALUES (
    p_workspace_id, p_conta_id, p_data, v_conta.saldo_atual, ROUND(p_saldo_real, 2),
    v_ajuste, true, v_lancamento_id, v_obs, p_user_id
  );

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, idempotency_key, created_by
  ) VALUES (
    p_workspace_id, 'contas', p_conta_id, 'ajuste_saldo',
    jsonb_build_object('saldo_atual', v_conta.saldo_atual),
    jsonb_build_object('saldo_novo', v_conta.saldo_atual + v_ajuste, 'ajuste', v_ajuste,
                       'lancamento_id', v_lancamento_id, 'subtipo_ajuste', 'ajuste_saldo_conta'),
    v_idem, p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'lancamento_id', v_lancamento_id,
    'ajuste', v_ajuste,
    'saldo_novo', v_conta.saldo_atual + v_ajuste
  );
END;
$$;

-- 3) RPC atômica de estorno (usada pela exclusão do lançamento de ajuste):
--    reverte o efeito no saldo da conta SEM criar Receita/Despesa.
CREATE OR REPLACE FUNCTION public.estornar_ajuste_saldo_rpc(
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
  v_mov RECORD;
  v_saldo_antes numeric;
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

  -- Idempotência: já estornado/excluído
  IF v_lanc.deleted_at IS NOT NULL OR v_lanc.status_pagamento = 'cancelado' THEN
    RETURN jsonb_build_object('sucesso', true, 'ja_estornado', true);
  END IF;

  IF v_lanc.tipo <> 'ajuste' OR v_lanc.subtipo_ajuste <> 'ajuste_saldo_conta' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é um ajuste de saldo da conta');
  END IF;

  SELECT * INTO v_mov
  FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE
  LIMIT 1;

  IF FOUND AND v_lanc.status_pagamento = 'pago' AND v_lanc.conta_origem_id IS NOT NULL THEN
    SELECT saldo_atual INTO v_saldo_antes
    FROM public.contas
    WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id
    FOR UPDATE;

    -- Reverte o efeito: entrada somou, saída subtraiu
    IF v_mov.tipo = 'entrada' THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_lanc.valor, updated_at = NOW()
      WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
    ELSE
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_lanc.valor, updated_at = NOW()
      WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
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
$$;
