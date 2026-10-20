-- Migration: Build 4 - Idempotência Financeira, Proteção contra Duplo Clique, RPCs Atômicas e Reconciliação de Saldos
-- Versão: 20261020020000

-- 1. RPC Atômica e Idempotente para RESTAURAR saldo de transferência (com FOR UPDATE e garantia de status)
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
  v_valor numeric;
  v_origem RECORD;
  v_destino RECORD;
BEGIN
  -- Lock exclusivo no lançamento para evitar concorrência
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.tipo <> 'transferencia' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é uma transferência');
  END IF;

  v_valor := COALESCE(v_lanc.valor, 0);

  -- IDEMPOTÊNCIA CRÍTICA: Se a transferência NÃO estiver com status 'pago', não estornar saldos de novo!
  IF v_lanc.status_pagamento <> 'pago' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_desfeito', true,
      'mensagem', 'Transferência já está pendente/desfeita. Nenhum saldo alterado.',
      'valor_restaurado', 0
    );
  END IF;

  IF v_valor > 0 THEN
    -- Lock exclusivo nas contas para evitar corrida
    IF v_lanc.conta_origem_id IS NOT NULL THEN
      SELECT * INTO v_origem FROM public.contas 
      WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id FOR UPDATE;
      
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_valor,
          updated_at = NOW()
      WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
    END IF;

    IF v_lanc.conta_destino_id IS NOT NULL THEN
      SELECT * INTO v_destino FROM public.contas 
      WHERE id = v_lanc.conta_destino_id AND workspace_id = p_workspace_id FOR UPDATE;
      
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_valor,
          updated_at = NOW()
      WHERE id = v_lanc.conta_destino_id AND workspace_id = p_workspace_id;
    END IF;

    -- Remove movimentações
    DELETE FROM public.movimentacoes_conta
    WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;
  END IF;

  -- Atualiza o status do lançamento no banco atomicamente
  UPDATE public.lancamentos
  SET status_pagamento = 'pendente',
      data_pagamento = NULL,
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object('sucesso', true, 'valor_restaurado', v_valor);
END;
$$;

-- 2. RPC Atômica e Idempotente para APLICAR saldo de transferência (com FOR UPDATE)
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
  v_valor numeric;
  v_origem RECORD;
  v_destino RECORD;
BEGIN
  -- Lock exclusivo no lançamento
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.tipo <> 'transferencia' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é uma transferência');
  END IF;

  -- IDEMPOTÊNCIA CRÍTICA: Se já estiver pago, não aplicar de novo
  IF v_lanc.status_pagamento = 'pago' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_pago', true,
      'mensagem', 'Transferência já está paga. Nenhum saldo duplicado.',
      'valor_aplicado', 0
    );
  END IF;

  v_valor := COALESCE(v_lanc.valor, 0);

  IF v_valor > 0 AND v_lanc.conta_origem_id IS NOT NULL AND v_lanc.conta_destino_id IS NOT NULL THEN
    -- Lock exclusivo nas contas
    SELECT * INTO v_origem FROM public.contas 
    WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id FOR UPDATE;

    SELECT * INTO v_destino FROM public.contas 
    WHERE id = v_lanc.conta_destino_id AND workspace_id = p_workspace_id FOR UPDATE;

    -- Debita origem
    UPDATE public.contas
    SET saldo_atual = saldo_atual - v_valor,
        updated_at = NOW()
    WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;

    -- Credita destino
    UPDATE public.contas
    SET saldo_atual = saldo_atual + v_valor,
        updated_at = NOW()
    WHERE id = v_lanc.conta_destino_id AND workspace_id = p_workspace_id;

    -- Limpa antigas movimentações se houver
    DELETE FROM public.movimentacoes_conta
    WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

    -- Insere movimentações
    INSERT INTO public.movimentacoes_conta (
      workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
    ) VALUES 
    (
      p_workspace_id, v_lanc.conta_origem_id, p_lancamento_id, 'transferencia_saida',
      v_valor, COALESCE(v_lanc.data, CURRENT_DATE), 'Transf. saída para ' || COALESCE(v_destino.nome, 'Conta destino'), p_user_id
    ),
    (
      p_workspace_id, v_lanc.conta_destino_id, p_lancamento_id, 'transferencia_entrada',
      v_valor, COALESCE(v_lanc.data, CURRENT_DATE), 'Transf. entrada de ' || COALESCE(v_origem.nome, 'Conta origem'), p_user_id
    );
  END IF;

  -- Marca como pago
  UPDATE public.lancamentos
  SET status_pagamento = 'pago',
      data_pagamento = COALESCE(v_lanc.data, CURRENT_DATE),
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object('sucesso', true, 'valor_aplicado', v_valor);
END;
$$;

-- 3. RPC Atômica e Idempotente para EXCLUIR transferência com segurança total contra duplo clique
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
  -- Lock exclusivo no lançamento
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  -- IDEMPOTÊNCIA: Se já foi excluído (deleted_at não nulo), apenas retorne sucesso sem fazer nada!
  IF v_lanc.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_excluido', true,
      'mensagem', 'Transferência já se encontrava excluída.'
    );
  END IF;

  -- Se a transferência estava PAGA, restauramos os saldos primeiro (via rpc que já trava as contas)
  IF v_lanc.status_pagamento = 'pago' THEN
    PERFORM public.restaurar_saldo_transferencia_rpc(p_workspace_id, p_lancamento_id);
  END IF;

  -- Remove qualquer movimentação de conta residual
  DELETE FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Soft delete seguro e marcação como cancelado
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Trilha de auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'delete_transferencia',
    to_jsonb(v_lanc), jsonb_build_object('status', 'cancelado', 'deleted_at', NOW()), p_user_id
  );

  RETURN jsonb_build_object('sucesso', true, 'excluido', true);
END;
$$;

-- 4. RPC Atômica e Idempotente para PAGAR FATURA (com FOR UPDATE e bloqueio a pagamento duplicado)
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

  -- Registra movimentação de saída na conta
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

-- 5. RPC Atômica e Idempotente para ESTORNAR / REABRIR FATURA (com FOR UPDATE)
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

-- 6. RPC Atômica e Idempotente para TOGGLE PAGO de Lançamentos Únicos (Receita, Despesa e Transferência)
CREATE OR REPLACE FUNCTION public.toggle_pago_lancamento_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_pago boolean,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_valor numeric;
  v_origem RECORD;
BEGIN
  -- Lock exclusivo no lançamento
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento excluído');
  END IF;

  IF v_lanc.meio_pagamento_tipo = 'CARTAO' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Lançamentos em cartão de crédito são quitados através da fatura.'
    );
  END IF;

  -- Se for transferência, delega para as RPCs especializadas
  IF v_lanc.tipo = 'transferencia' THEN
    IF p_pago THEN
      RETURN public.aplicar_saldo_transferencia_rpc(p_workspace_id, p_lancamento_id, p_user_id);
    ELSE
      RETURN public.restaurar_saldo_transferencia_rpc(p_workspace_id, p_lancamento_id);
    END IF;
  END IF;

  -- IDEMPOTÊNCIA: Se já está no estado desejado, retorna sem modificar saldos
  IF (p_pago AND v_lanc.status_pagamento = 'pago') OR ((NOT p_pago) AND v_lanc.status_pagamento <> 'pago') THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_no_estado', true,
      'status_atual', v_lanc.status_pagamento,
      'mensagem', 'Lançamento já está no estado solicitado.'
    );
  END IF;

  v_valor := COALESCE(v_lanc.valor, 0);

  IF p_pago THEN
    -- Mudar para PAGO: baixar saldo
    IF v_valor > 0 AND v_lanc.conta_origem_id IS NOT NULL THEN
      SELECT * INTO v_origem FROM public.contas 
      WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id FOR UPDATE;

      IF v_lanc.tipo = 'despesa' THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual - v_valor,
            updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;

        INSERT INTO public.movimentacoes_conta (
          workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
        ) VALUES (
          p_workspace_id, v_lanc.conta_origem_id, p_lancamento_id, 'saida',
          v_valor, COALESCE(v_lanc.data, CURRENT_DATE), v_lanc.descricao, p_user_id
        );
      ELSIF v_lanc.tipo = 'receita' THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual + v_valor,
            updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;

        INSERT INTO public.movimentacoes_conta (
          workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
        ) VALUES (
          p_workspace_id, v_lanc.conta_origem_id, p_lancamento_id, 'entrada',
          v_valor, COALESCE(v_lanc.data, CURRENT_DATE), v_lanc.descricao, p_user_id
        );
      END IF;
    END IF;

    UPDATE public.lancamentos
    SET status_pagamento = 'pago',
        data_pagamento = COALESCE(v_lanc.data, CURRENT_DATE),
        updated_at = NOW()
    WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  ELSE
    -- Mudar para NÃO PAGO (pendente): estornar saldo
    IF v_valor > 0 AND v_lanc.conta_origem_id IS NOT NULL THEN
      SELECT * INTO v_origem FROM public.contas 
      WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id FOR UPDATE;

      IF v_lanc.tipo = 'despesa' THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual + v_valor,
            updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
      ELSIF v_lanc.tipo = 'receita' THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual - v_valor,
            updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
      END IF;

      DELETE FROM public.movimentacoes_conta
      WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;
    END IF;

    UPDATE public.lancamentos
    SET status_pagamento = 'pendente',
        data_pagamento = NULL,
        updated_at = NOW()
    WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'novo_status', (CASE WHEN p_pago THEN 'pago' ELSE 'pendente' END));
END;
$$;

-- 7. RECONCILIAÇÃO E AUDITORIA DE SALDOS CORROMPIDOS POR DUPLICAÇÕES
-- Recalcula os saldos das contas a partir do saldo_inicial + soma de lançamentos reais pagos
-- Preserva estritamente faturas com status 'paga'
CREATE OR REPLACE FUNCTION public.reconciliar_saldos_contas_rpc(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r_conta RECORD;
  v_saldo_calculado numeric;
  v_receitas numeric;
  v_despesas numeric;
  v_transf_in numeric;
  v_transf_out numeric;
  v_faturas_pagas numeric;
  v_corrigidas integer := 0;
BEGIN
  FOR r_conta IN
    SELECT * FROM public.contas 
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
    FOR UPDATE
  LOOP
    -- 1. Receitas pagas da conta (fora de faturas de cartão)
    SELECT COALESCE(SUM(valor), 0) INTO v_receitas
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND conta_origem_id = r_conta.id
      AND tipo = 'receita'
      AND status_pagamento = 'pago'
      AND deleted_at IS NULL;

    -- 2. Despesas pagas da conta (excluindo compras com meio de pagamento CARTAO, pois estas são pagas via fatura)
    SELECT COALESCE(SUM(valor), 0) INTO v_despesas
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND conta_origem_id = r_conta.id
      AND tipo = 'despesa'
      AND meio_pagamento_tipo <> 'CARTAO'
      AND status_pagamento = 'pago'
      AND deleted_at IS NULL;

    -- 3. Transferências de entrada (destino = r_conta.id) com status 'pago'
    SELECT COALESCE(SUM(valor), 0) INTO v_transf_in
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND conta_destino_id = r_conta.id
      AND tipo = 'transferencia'
      AND status_pagamento = 'pago'
      AND deleted_at IS NULL;

    -- 4. Transferências de saída (origem = r_conta.id) com status 'pago'
    SELECT COALESCE(SUM(valor), 0) INTO v_transf_out
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND conta_origem_id = r_conta.id
      AND tipo = 'transferencia'
      AND status_pagamento = 'pago'
      AND deleted_at IS NULL;

    -- 5. Pagamentos efetivados de faturas debitados desta conta
    SELECT COALESCE(SUM(pf.valor), 0) INTO v_faturas_pagas
    FROM public.pagamentos_fatura pf
    JOIN public.faturas f ON f.id = pf.fatura_id
    WHERE pf.workspace_id = p_workspace_id
      AND pf.conta_id = r_conta.id
      AND pf.status = 'efetivado'
      AND f.status = 'paga';

    -- Saldo correto reconstruído a partir da verdade real dos lançamentos e faturas
    v_saldo_calculado := COALESCE(r_conta.saldo_inicial, 0)
      + v_receitas
      - v_despesas
      + v_transf_in
      - v_transf_out
      - v_faturas_pagas;

    IF ABS(r_conta.saldo_atual - v_saldo_calculado) > 0.001 THEN
      -- Registra auditoria da reconciliação
      INSERT INTO public.auditoria_operacoes (
        workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior
      ) VALUES (
        p_workspace_id, 'contas', r_conta.id, 'reconciliacao_saldo_duplicado',
        jsonb_build_object('saldo_anterior', r_conta.saldo_atual),
        jsonb_build_object('saldo_reconciliado', v_saldo_calculado, 'saldo_inicial', r_conta.saldo_inicial,
                           'receitas', v_receitas, 'despesas', v_despesas,
                           'transf_in', v_transf_in, 'transf_out', v_transf_out,
                           'faturas_pagas', v_faturas_pagas)
      );

      UPDATE public.contas
      SET saldo_atual = v_saldo_calculado,
          updated_at = NOW()
      WHERE id = r_conta.id;

      v_corrigidas := v_corrigidas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sucesso', true, 'contas_corrigidas', v_corrigidas);
END;
$$;

-- Executa a reconciliação automática para todos os workspaces existentes agora na migration
DO $$
DECLARE
  ws RECORD;
BEGIN
  FOR ws IN SELECT id FROM public.workspaces LOOP
    PERFORM public.reconciliar_saldos_contas_rpc(ws.id);
  END LOOP;
END $$;
