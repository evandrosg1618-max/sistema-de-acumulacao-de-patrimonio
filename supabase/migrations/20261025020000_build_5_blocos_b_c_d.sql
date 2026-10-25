-- ==============================================================================
-- MIGRATION: 20261025020000_build_5_blocos_b_c_d.sql
-- BLOCO B: Bloqueio de alteração e exclusão de lançamento único pago
-- BLOCO C: Atualização imediata de resumos ao pagar fatura (apenas abertas)
-- ==============================================================================

-- 1. Atualizar pagar_fatura_rpc para marcar parcelas e lançamentos da fatura como pagos
CREATE OR REPLACE FUNCTION public.pagar_fatura_rpc(
  p_workspace_id uuid,
  p_fatura_id uuid,
  p_conta_id uuid,
  p_valor numeric,
  p_data_pagamento date,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fatura RECORD;
  v_conta RECORD;
  v_cartao RECORD;
  v_pagamento_id uuid;
BEGIN
  IF p_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Valor do pagamento deve ser maior que zero');
  END IF;

  -- Trava a fatura para evitar pagamentos concorrentes
  SELECT * INTO v_fatura
  FROM public.faturas
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Fatura não encontrada');
  END IF;

  -- IDEMPOTÊNCIA: Se a fatura já está marcada como 'paga', NÃO debitar a conta de novo!
  IF v_fatura.status = 'paga' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_paga', true,
      'mensagem', 'Esta fatura já está paga. Nenhum pagamento duplicado foi realizado.'
    );
  END IF;

  -- Trava a conta bancária
  SELECT * INTO v_conta
  FROM public.contas
  WHERE id = p_conta_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta bancária informada não foi encontrada');
  END IF;

  SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_fatura.cartao_id;

  -- Debita conta
  UPDATE public.contas
  SET saldo_atual = saldo_atual - p_valor,
      updated_at = NOW()
  WHERE id = p_conta_id AND workspace_id = p_workspace_id;

  -- Insere pagamento da fatura
  INSERT INTO public.pagamentos_fatura (
    workspace_id, fatura_id, conta_id, valor, data_pagamento, status, created_by
  ) VALUES (
    p_workspace_id, p_fatura_id, p_conta_id, p_valor, p_data_pagamento, 'efetivado', p_user_id
  )
  RETURNING id INTO v_pagamento_id;

  -- Registra movimentação de saída na conta com rótulo
  INSERT INTO public.movimentacoes_conta (
    workspace_id, conta_id, pagamento_fatura_id, tipo, valor, data, descricao, created_by
  ) VALUES (
    p_workspace_id, p_conta_id, v_pagamento_id, 'saida', p_valor, p_data_pagamento,
    'Pagamento fatura ' || COALESCE(v_cartao.nome, 'Cartão') || ' (' || v_fatura.competencia || ')',
    p_user_id
  );

  -- Atualiza status da fatura para 'paga'
  UPDATE public.faturas
  SET status = 'paga',
      updated_at = NOW()
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id;

  -- Marca parcelas vinculadas a esta fatura como pagas para reduzir imediatamente o total comprometido
  UPDATE public.parcelas
  SET status = 'paga',
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia;

  -- Marca lançamentos desta fatura como pagos
  UPDATE public.lancamentos
  SET status_pagamento = 'pago',
      data_pagamento = p_data_pagamento,
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia
    AND deleted_at IS NULL;

  -- Registra auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'faturas', p_fatura_id, 'pay_invoice',
    to_jsonb(v_fatura), jsonb_build_object('status', 'paga', 'pagamento_id', v_pagamento_id), p_user_id
  );

  RETURN jsonb_build_object('sucesso', true, 'pagamento_id', v_pagamento_id);
END;
$$;


-- 2. Atualizar estornar_fatura_rpc para reverter parcelas e lançamentos
CREATE OR REPLACE FUNCTION public.estornar_fatura_rpc(
  p_workspace_id uuid,
  p_fatura_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fatura RECORD;
  v_pag RECORD;
  v_total_estornado numeric := 0;
BEGIN
  -- Trava a fatura
  SELECT * INTO v_fatura
  FROM public.faturas
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Fatura não encontrada');
  END IF;

  -- IDEMPOTÊNCIA: Se a fatura NÃO estiver paga (já reaberta), nada a fazer
  IF v_fatura.status <> 'paga' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_reaberta', true,
      'mensagem', 'Fatura já se encontra reaberta/não paga.'
    );
  END IF;

  -- Estorna todos os pagamentos efetivados desta fatura
  FOR v_pag IN 
    SELECT * FROM public.pagamentos_fatura 
    WHERE fatura_id = p_fatura_id AND status = 'efetivado' AND workspace_id = p_workspace_id
    FOR UPDATE
  LOOP
    -- Restaura saldo na conta
    UPDATE public.contas
    SET saldo_atual = saldo_atual + v_pag.valor,
        updated_at = NOW()
    WHERE id = v_pag.conta_id AND workspace_id = p_workspace_id;

    -- Marca pagamento como estornado
    UPDATE public.pagamentos_fatura
    SET status = 'estornado',
        updated_at = NOW()
    WHERE id = v_pag.id;

    -- Registra movimentação de estorno na conta
    INSERT INTO public.movimentacoes_conta (
      workspace_id, conta_id, pagamento_fatura_id, tipo, valor, data, descricao, created_by
    ) VALUES (
      p_workspace_id, v_pag.conta_id, v_pag.id, 'estorno', v_pag.valor, CURRENT_DATE,
      'Estorno de pagamento de fatura (' || v_fatura.competencia || ')', p_user_id
    );

    v_total_estornado := v_total_estornado + v_pag.valor;
  END LOOP;

  -- Atualiza fatura para aberta
  UPDATE public.faturas
  SET status = 'aberta',
      updated_at = NOW()
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id;

  -- Reverte parcelas para pendente
  UPDATE public.parcelas
  SET status = 'pendente',
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia;

  -- Reverte lançamentos avulsos para pendente
  UPDATE public.lancamentos
  SET status_pagamento = 'pendente',
      data_pagamento = NULL,
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia
    AND deleted_at IS NULL;

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'faturas', p_fatura_id, 'reverse_invoice_payment',
    to_jsonb(v_fatura), jsonb_build_object('status', 'aberta', 'total_estornado', v_total_estornado), p_user_id
  );

  RETURN jsonb_build_object('sucesso', true, 'total_estornado', v_total_estornado);
END;
$$;


-- 3. Atualizar obter_cartoes_consolidado_rpc para considerar APENAS faturas abertas e excluir parcelas de faturas pagas
CREATE OR REPLACE FUNCTION public.obter_cartoes_consolidado_rpc(
  p_workspace_id uuid,
  p_incluir_inativos boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  workspace_id uuid,
  nome text,
  bandeira text,
  dia_fechamento integer,
  dia_vencimento integer,
  limite numeric,
  cor text,
  ativo boolean,
  fatura_atual numeric,
  total_comprometido numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH proxima_fatura AS (
    SELECT DISTINCT ON (f.cartao_id)
      f.cartao_id,
      f.competencia,
      f.valor_total
    FROM public.faturas f
    WHERE f.workspace_id = p_workspace_id
      AND f.status = 'aberta'
      AND f.data_vencimento >= CURRENT_DATE
    ORDER BY f.cartao_id, f.data_vencimento ASC
  ),
  faturas_abertas AS (
    SELECT
      f.cartao_id,
      COALESCE(SUM(f.valor_total), 0) AS total_aberta
    FROM public.faturas f
    WHERE f.workspace_id = p_workspace_id
      AND f.status = 'aberta'
    GROUP BY f.cartao_id
  ),
  parcelas_pendentes AS (
    SELECT
      p.cartao_id,
      COALESCE(SUM(p.valor), 0) AS total_parcelas
    FROM public.parcelas p
    JOIN public.lancamentos l ON l.id = p.lancamento_id
    LEFT JOIN public.faturas f ON f.cartao_id = p.cartao_id 
                               AND f.competencia = p.competencia 
                               AND f.workspace_id = p.workspace_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status = 'pendente'
      AND (f.id IS NULL OR f.status = 'aberta')
      AND l.deleted_at IS NULL
    GROUP BY p.cartao_id
  ),
  avulsos_sem_parcela AS (
    SELECT
      l.cartao_id,
      COALESCE(SUM(
        CASE WHEN l.tipo = 'despesa' THEN l.valor
             WHEN l.tipo = 'receita' THEN -l.valor
             ELSE 0 END
      ), 0) AS total_avulso
    FROM public.lancamentos l
    LEFT JOIN public.faturas f ON f.cartao_id = l.cartao_id 
                               AND f.competencia = l.competencia 
                               AND f.workspace_id = l.workspace_id
    WHERE l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND l.regime = 'unico'
      AND l.status_pagamento = 'pendente'
      AND (f.id IS NULL OR f.status = 'aberta')
      AND l.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.parcelas p WHERE p.lancamento_id = l.id
      )
    GROUP BY l.cartao_id
  ),
  recorrente_proxima AS (
    SELECT
      l.cartao_id,
      COALESCE(SUM(
        CASE WHEN l.tipo = 'despesa' THEN l.valor
             WHEN l.tipo = 'receita' THEN -l.valor
             ELSE 0 END
      ), 0) AS total_recorrente
    FROM public.lancamentos l
    JOIN proxima_fatura pf ON pf.cartao_id = l.cartao_id AND pf.competencia = l.competencia
    WHERE l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND (l.regime = 'fixo' OR l.serie_id IS NOT NULL)
      AND l.deleted_at IS NULL
    GROUP BY l.cartao_id
  )
  SELECT
    c.id,
    c.workspace_id,
    c.nome,
    c.bandeira,
    c.dia_fechamento,
    c.dia_vencimento,
    c.limite,
    c.cor,
    c.ativo,
    COALESCE(pf.valor_total, fa.total_aberta, 0)::numeric AS fatura_atual,
    GREATEST(0, COALESCE(pp.total_parcelas, 0) + COALESCE(asp.total_avulso, 0) + COALESCE(rp.total_recorrente, 0))::numeric AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN proxima_fatura pf ON pf.cartao_id = c.id
  LEFT JOIN faturas_abertas fa ON fa.cartao_id = c.id
  LEFT JOIN parcelas_pendentes pp ON pp.cartao_id = c.id
  LEFT JOIN avulsos_sem_parcela asp ON asp.cartao_id = c.id
  LEFT JOIN recorrente_proxima rp ON rp.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo = true)
  ORDER BY c.nome ASC;
END;
$$;


-- 4. BLOCO B: Bloqueio de alteração em editar_lancamento_atomico_rpc para lançamentos únicos pagos
CREATE OR REPLACE FUNCTION public.editar_lancamento_atomico_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data date,
  p_meio_pagamento_tipo text,
  p_conta_origem_id uuid DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_cartao_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL,
  p_status_pagamento text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_quantidade_parcelas integer DEFAULT 1,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_antigo RECORD;
  v_lanc_atualizado RECORD;
  v_antigo_status text;
  v_novo_status text;
  v_antigo_valor numeric;
  v_novo_valor numeric;
  v_nova_competencia text;
  v_fatura_paga boolean := false;
  v_cartao RECORD;
  v_dia_fech integer;
  v_dia_venc integer;
  v_origem_antiga RECORD;
  v_destino_antigo RECORD;
  v_origem_nova RECORD;
  v_destino_novo RECORD;
BEGIN
  -- 1. Obter e travar o lançamento antigo
  SELECT * INTO v_antigo
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado.');
  END IF;

  IF v_antigo.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento excluído não pode ser editado.');
  END IF;

  -- REGRA BLOCO B (Teste 13): Bloqueio de lançamento ÚNICO já pago
  -- Se o lançamento estiver pago e for único (não recorrente), não pode ser alterado diretamente sem estorno prévio
  IF v_antigo.status_pagamento = 'pago' 
     AND (v_antigo.regime = 'unico' OR v_antigo.serie_id IS NULL)
     AND v_antigo.meio_pagamento_tipo <> 'CARTAO' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'bloqueio_pago', true,
      'mensagem', 'Este lançamento está pago. É necessário desfazer o pagamento para alterar.'
    );
  END IF;

  v_antigo_valor := COALESCE(v_antigo.valor, 0);
  v_novo_valor := COALESCE(p_valor, 0);
  IF v_novo_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'O valor deve ser maior que zero.');
  END IF;

  v_antigo_status := COALESCE(v_antigo.status_pagamento, 'pendente');
  -- Cartão de crédito SEMPRE tem status pendente no lançamento individual (quitado via fatura)
  IF p_meio_pagamento_tipo = 'CARTAO' THEN
    v_novo_status := 'pendente';
  ELSE
    v_novo_status := COALESCE(p_status_pagamento, v_antigo_status);
  END IF;

  -- 2. Se pertencia a cartão, verificar se a fatura antiga estava paga (bloqueio PRD)
  IF v_antigo.cartao_id IS NOT NULL AND v_antigo.competencia IS NOT NULL THEN
    SELECT (status = 'paga') INTO v_fatura_paga
    FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = v_antigo.cartao_id
      AND competencia = v_antigo.competencia;

    IF v_fatura_paga IS TRUE THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'fatura_paga', true,
        'mensagem', 'Este lançamento afeta uma fatura quitada. Desfaça o pagamento da fatura na tela de Cartões antes de alterá-lo.'
      );
    END IF;
  END IF;

  -- 3. Calcular nova competência
  v_nova_competencia := TO_CHAR(p_data, 'YYYY-MM');
  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = p_cartao_id AND workspace_id = p_workspace_id;
    IF FOUND THEN
      v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
      v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
      v_nova_competencia := public.calcular_competencia_cartao(p_data, v_dia_fech, v_dia_venc);

      SELECT (status = 'paga') INTO v_fatura_paga
      FROM public.faturas
      WHERE workspace_id = p_workspace_id
        AND cartao_id = p_cartao_id
        AND competencia = v_nova_competencia;

      IF v_fatura_paga IS TRUE THEN
        RETURN jsonb_build_object(
          'sucesso', false,
          'fatura_paga', true,
          'mensagem', 'Não é possível mover este lançamento para uma fatura já quitada (' || v_nova_competencia || ').'
        );
      END IF;
    END IF;
  END IF;

  -- 4. ESTORNO DA MOVIMENTAÇÃO ANTERIOR (se o lançamento antigo estava efetivamente PAGO)
  IF v_antigo_status = 'pago' AND v_antigo_valor > 0 THEN
    IF v_antigo.tipo = 'despesa' AND v_antigo.conta_origem_id IS NOT NULL AND v_antigo.meio_pagamento_tipo <> 'CARTAO' THEN
      SELECT * INTO v_origem_antiga
      FROM public.contas
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual + v_antigo_valor,
            updated_at = NOW()
        WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
      END IF;

      DELETE FROM public.movimentacoes_conta
      WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

    ELSIF v_antigo.tipo = 'receita' AND v_antigo.conta_origem_id IS NOT NULL AND v_antigo.meio_pagamento_tipo <> 'CARTAO' THEN
      SELECT * INTO v_origem_antiga
      FROM public.contas
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual - v_antigo_valor,
            updated_at = NOW()
        WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
      END IF;

      DELETE FROM public.movimentacoes_conta
      WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

    ELSIF v_antigo.tipo = 'transferencia' THEN
      IF v_antigo.conta_origem_id IS NOT NULL THEN
        SELECT * INTO v_origem_antiga
        FROM public.contas
        WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id
        FOR UPDATE;

        IF FOUND THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual + v_antigo_valor,
              updated_at = NOW()
          WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
        END IF;
      END IF;

      IF v_antigo.conta_destino_id IS NOT NULL THEN
        SELECT * INTO v_destino_antigo
        FROM public.contas
        WHERE id = v_antigo.conta_destino_id AND workspace_id = p_workspace_id
        FOR UPDATE;

        IF FOUND THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual - v_antigo_valor,
              updated_at = NOW()
          WHERE id = v_antigo.conta_destino_id AND workspace_id = p_workspace_id;
        END IF;
      END IF;

      DELETE FROM public.movimentacoes_conta
      WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;
    END IF;
  END IF;

  -- 5. APLICAÇÃO DA NOVA MOVIMENTAÇÃO (se o lançamento novo tiver status PAGO)
  IF v_novo_status = 'pago' AND v_novo_valor > 0 THEN
    IF v_antigo.tipo = 'despesa' AND p_conta_origem_id IS NOT NULL AND p_meio_pagamento_tipo <> 'CARTAO' THEN
      SELECT * INTO v_origem_nova
      FROM public.contas
      WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual - v_novo_valor,
            updated_at = NOW()
        WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

        INSERT INTO public.movimentacoes_conta (
          workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
        ) VALUES (
          p_workspace_id, p_conta_origem_id, p_lancamento_id, 'saida',
          v_novo_valor, p_data, p_descricao, p_user_id
        );
      END IF;

    ELSIF v_antigo.tipo = 'receita' AND p_conta_origem_id IS NOT NULL AND p_meio_pagamento_tipo <> 'CARTAO' THEN
      SELECT * INTO v_origem_nova
      FROM public.contas
      WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual + v_novo_valor,
            updated_at = NOW()
        WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

        INSERT INTO public.movimentacoes_conta (
          workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
        ) VALUES (
          p_workspace_id, p_conta_origem_id, p_lancamento_id, 'entrada',
          v_novo_valor, p_data, p_descricao, p_user_id
        );
      END IF;

    ELSIF v_antigo.tipo = 'transferencia' THEN
      IF p_conta_origem_id IS NOT NULL AND p_conta_destino_id IS NOT NULL THEN
        SELECT * INTO v_origem_nova
        FROM public.contas
        WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id
        FOR UPDATE;

        SELECT * INTO v_destino_novo
        FROM public.contas
        WHERE id = p_conta_destino_id AND workspace_id = p_workspace_id
        FOR UPDATE;

        IF v_origem_nova.id IS NOT NULL AND v_destino_novo.id IS NOT NULL THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual - v_novo_valor,
              updated_at = NOW()
          WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

          UPDATE public.contas
          SET saldo_atual = saldo_atual + v_novo_valor,
              updated_at = NOW()
          WHERE id = p_conta_destino_id AND workspace_id = p_workspace_id;

          INSERT INTO public.movimentacoes_conta (
            workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
          ) VALUES 
          (
            p_workspace_id, p_conta_origem_id, p_lancamento_id, 'transferencia_saida',
            v_novo_valor, p_data, 'Transf. saída para ' || COALESCE(v_destino_novo.nome, 'Conta destino'), p_user_id
          ),
          (
            p_workspace_id, p_conta_destino_id, p_lancamento_id, 'transferencia_entrada',
            v_novo_valor, p_data, 'Transf. entrada de ' || COALESCE(v_origem_nova.nome, 'Conta origem'), p_user_id
          );
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. Atualizar os dados do lançamento
  UPDATE public.lancamentos
  SET descricao = p_descricao,
      valor = v_novo_valor,
      data = p_data,
      competencia = v_nova_competencia,
      meio_pagamento_tipo = p_meio_pagamento_tipo,
      conta_origem_id = p_conta_origem_id,
      conta_destino_id = p_conta_destino_id,
      cartao_id = p_cartao_id,
      categoria_id = p_categoria_id,
      subcategoria_id = p_subcategoria_id,
      status_pagamento = v_novo_status,
      data_pagamento = CASE WHEN v_novo_status = 'pago' THEN p_data ELSE NULL END,
      observacao = p_observacao,
      quantidade_parcelas = COALESCE(p_quantidade_parcelas, 1),
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  RETURNING * INTO v_lanc_atualizado;

  -- 7. Se houve cartão antigo ou novo, recalcular faturas
  IF v_antigo.cartao_id IS NOT NULL AND v_antigo.competencia IS NOT NULL THEN
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_antigo.cartao_id, v_antigo.competencia);
  END IF;

  IF p_cartao_id IS NOT NULL AND v_nova_competencia IS NOT NULL THEN
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_cartao_id, v_nova_competencia);
  END IF;

  -- 8. Auditoria completa
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'update_lancamento_atomico',
    to_jsonb(v_antigo), to_jsonb(v_lanc_atualizado), p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'status_pagamento', v_novo_status,
    'lancamento', to_jsonb(v_lanc_atualizado)
  );
END;
$$;


-- 5. BLOCO B: Bloqueio de exclusão em excluir_transferencia_rpc se paga
CREATE OR REPLACE FUNCTION public.excluir_transferencia_rpc(
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
  v_valor numeric;
BEGIN
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Transferência não encontrada.');
  END IF;

  IF v_lanc.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'ja_excluido', true);
  END IF;

  -- BLOCO B: Bloquear exclusão direta de transferência paga
  IF v_lanc.status_pagamento = 'pago' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'bloqueio_pago', true,
      'mensagem', 'Esta transferência está paga/efetivada. Desfaça o pagamento para excluir.'
    );
  END IF;

  -- Remove movimentações
  DELETE FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Soft delete
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'delete_transferencia',
    to_jsonb(v_lanc), p_user_id
  );

  RETURN jsonb_build_object('sucesso', true);
END;
$$;
