-- Migration: RPCs atômicas e idempotentes para edição de lançamentos e estorno/pagamento
-- Bloqueio contra saldo órfão, reversão exata com SELECT FOR UPDATE e garantia de integridade

-- 1. RPC Atômica para Edição de Lançamento com Ajuste e Transferência de Saldos
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
  p_status_pagamento text DEFAULT 'pendente',
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
  v_origem_antiga RECORD;
  v_destino_antigo RECORD;
  v_origem_nova RECORD;
  v_destino_novo RECORD;
  v_cartao RECORD;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_nova_competencia text;
  v_antiga_competencia text;
  v_antigo_status text;
  v_novo_status text;
  v_antigo_valor numeric;
  v_novo_valor numeric;
  v_fatura_paga boolean;
  v_lanc_atualizado RECORD;
BEGIN
  -- 1. Lock exclusivo no lançamento a ser editado
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

      -- Verificar se a fatura do novo cartão nessa competência já está paga
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
      -- Trava a conta de origem antiga e estorna a saída (re-credita o valor)
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

      -- Remove movimentações anteriores associadas a este lançamento
      DELETE FROM public.movimentacoes_conta
      WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

    ELSIF v_antigo.tipo = 'receita' AND v_antigo.conta_origem_id IS NOT NULL AND v_antigo.meio_pagamento_tipo <> 'CARTAO' THEN
      -- Trava a conta de origem antiga e estorna a entrada (re-debita o valor)
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
      -- Estorna ambos os lados da transferência antiga
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
      -- Trava nova conta de origem e debita
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
      -- Trava nova conta de origem e credita
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
