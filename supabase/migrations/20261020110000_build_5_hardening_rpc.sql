-- Migration: Hardening da RPC criar_serie_fixa_rpc (Build 5)
-- Adiciona validações estritas de engenharia:
-- 1. Transferência fixa: exigir conta_origem_id e conta_destino_id preenchidos e DIFERENTES; recusar caso contrário.
-- 2. Exclusividade de meio: recusar série com conta_origem_id e cartao_id preenchidos simultaneamente.

CREATE OR REPLACE FUNCTION public.criar_serie_fixa_rpc(
  p_workspace_id uuid,
  p_tipo text,
  p_descricao text,
  p_valor numeric,
  p_data_inicio date,
  p_prazo text, -- 'indeterminado' | 'determinado'
  p_periodicidade text, -- 'mensal' | 'semestral' | 'anual'
  p_quantidade_total integer DEFAULT NULL,
  p_meio_pagamento_tipo text DEFAULT 'CONTA',
  p_conta_origem_id uuid DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_cartao_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_pago_primeira boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_serie_id uuid;
  v_data_limite date;
  v_data_cur date;
  v_comp_cur text;
  v_cartao RECORD;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_passo int := 1;
  v_total_alvo int;
  v_primeira boolean := true;
  v_deve_materializar boolean;
  v_hoje date := CURRENT_DATE;
  v_natureza_prev boolean;
  v_status_pagamento text;
  v_data_pagamento date;
  v_lanc_criado RECORD;
  v_ocorrencias_geradas int := 0;
  v_proxima_comp text := NULL;
  v_faturas_afetadas text[] := ARRAY[]::text[];
  v_fatura_paga RECORD;
BEGIN
  -- Validações básicas
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'O valor do lançamento deve ser maior que zero.';
  END IF;

  IF p_prazo = 'determinado' AND (p_quantidade_total IS NULL OR p_quantidade_total < 1) THEN
    RAISE EXCEPTION 'Para prazo determinado, especifique a quantidade de ocorrências.';
  END IF;

  -- HARDENING 1: Exclusividade de meio — recusar série com conta_origem_id e cartao_id simultâneos
  IF p_conta_origem_id IS NOT NULL AND p_cartao_id IS NOT NULL THEN
    RAISE EXCEPTION 'Exclusividade de meio violada: não é permitido informar conta de origem e cartão de crédito simultaneamente para a série.';
  END IF;

  -- HARDENING 2: Transferência fixa — exigir conta_origem_id e conta_destino_id preenchidos e diferentes
  IF p_tipo = 'transferencia' THEN
    IF p_conta_origem_id IS NULL OR p_conta_destino_id IS NULL THEN
      RAISE EXCEPTION 'Transferência fixa exige conta de origem e conta de destino preenchidas.';
    END IF;

    IF p_conta_origem_id = p_conta_destino_id THEN
      RAISE EXCEPTION 'Transferência fixa exige que a conta de origem seja diferente da conta de destino.';
    END IF;

    IF p_cartao_id IS NOT NULL THEN
      RAISE EXCEPTION 'Transferências financeiras ocorrem exclusivamente entre contas bancárias, não em cartão de crédito.';
    END IF;
  END IF;

  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = p_cartao_id AND workspace_id = p_workspace_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cartão não encontrado.';
    END IF;
    v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
    v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
  END IF;

  -- Definir data limite de projeção
  IF p_prazo = 'indeterminado' THEN
    v_data_limite := public.calcular_limite_projecao_fixo(p_data_inicio);
    v_total_alvo := 9999;
  ELSE
    v_total_alvo := p_quantidade_total;
    v_data_limite := MAKE_DATE(2099, 12, 31);
  END IF;

  -- Criar registro mestre na tabela series_lancamentos
  INSERT INTO public.series_lancamentos (
    workspace_id,
    descricao,
    tipo,
    periodicidade,
    prazo,
    quantidade_total,
    ocorrencias_geradas,
    proxima_competencia,
    ativo,
    data_inicio,
    dia_vencimento,
    valor,
    meio_pagamento_tipo,
    conta_origem_id,
    conta_destino_id,
    cartao_id,
    categoria_id,
    subcategoria_id,
    observacao,
    data_limite_projecao,
    created_by
  ) VALUES (
    p_workspace_id,
    p_descricao,
    p_tipo,
    p_periodicidade,
    p_prazo,
    p_quantidade_total,
    0,
    TO_CHAR(p_data_inicio, 'YYYY-MM'),
    true,
    p_data_inicio,
    EXTRACT(DAY FROM p_data_inicio)::int,
    p_valor,
    p_meio_pagamento_tipo,
    p_conta_origem_id,
    p_conta_destino_id,
    p_cartao_id,
    p_categoria_id,
    p_subcategoria_id,
    p_observacao,
    v_data_limite,
    p_user_id
  )
  RETURNING id INTO v_serie_id;

  -- Gerar as ocorrências (materializadas se data <= hoje, senão projeções)
  v_data_cur := p_data_inicio;
  WHILE v_passo <= v_total_alvo AND v_data_cur <= v_data_limite LOOP
    -- Competência: se cartão, usa regra de vencimento/fechamento; se conta/dinheiro, YYYY-MM da data
    IF p_meio_pagamento_tipo = 'CARTAO' THEN
      v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
    END IF;

    -- Se for cartão e a competência já estiver numa fatura PAGA, para e bloqueia
    IF p_meio_pagamento_tipo = 'CARTAO' THEN
      FOR v_fatura_paga IN
        SELECT competencia FROM public.faturas
        WHERE workspace_id = p_workspace_id
          AND cartao_id = p_cartao_id
          AND competencia = v_comp_cur
          AND status = 'paga'
      LOOP
        RAISE EXCEPTION 'A fatura de % já está paga. Não é possível criar lançamentos fixos incidentes em fatura já quitada.',
          v_fatura_paga.competencia;
      END LOOP;
    END IF;

    -- Materialização: se a data do lançamento já chegou (v_data_cur <= v_hoje) OU se é a 1ª ocorrência criada no app
    IF v_data_cur <= v_hoje THEN
      v_deve_materializar := true;
    ELSE
      v_deve_materializar := false;
    END IF;

    -- Natureza previsional: se não materializou, é previsão (natureza_previsao = true)
    v_natureza_prev := NOT v_deve_materializar;

    -- Regra de pagamento da 1ª ocorrência:
    -- Se marcado pago_primeira e for meio conta/dinheiro:
    IF v_primeira AND p_pago_primeira AND p_meio_pagamento_tipo <> 'CARTAO' THEN
      v_status_pagamento := 'pago';
      v_data_pagamento := v_data_cur;
      v_natureza_prev := false; -- pagamento torna realizado
      v_deve_materializar := true;
    ELSE
      v_status_pagamento := 'pendente';
      v_data_pagamento := NULL;
    END IF;

    -- Inserir na tabela lancamentos de forma idempotente (ON CONFLICT DO NOTHING)
    INSERT INTO public.lancamentos (
      workspace_id,
      tipo,
      regime,
      serie_id,
      data,
      competencia,
      descricao,
      valor,
      meio_pagamento_tipo,
      conta_origem_id,
      conta_destino_id,
      cartao_id,
      categoria_id,
      subcategoria_id,
      status_pagamento,
      data_pagamento,
      observacao,
      quantidade_parcelas,
      numero_parcela,
      total_parcelas,
      natureza_previsao,
      eh_excecao,
      conciliado,
      created_by
    ) VALUES (
      p_workspace_id,
      p_tipo,
      'fixo',
      v_serie_id,
      v_data_cur,
      v_comp_cur,
      p_descricao,
      p_valor,
      p_meio_pagamento_tipo,
      p_conta_origem_id,
      p_conta_destino_id,
      p_cartao_id,
      p_categoria_id,
      p_subcategoria_id,
      v_status_pagamento,
      v_data_pagamento,
      p_observacao,
      1,
      v_passo,
      (CASE WHEN p_prazo = 'determinado' THEN p_quantidade_total ELSE NULL END),
      v_natureza_prev,
      false,
      false,
      p_user_id
    )
    ON CONFLICT (workspace_id, serie_id, competencia) WHERE serie_id IS NOT NULL AND deleted_at IS NULL
    DO NOTHING
    RETURNING * INTO v_lanc_criado;

    IF v_lanc_criado.id IS NOT NULL THEN
      v_ocorrencias_geradas := v_ocorrencias_geradas + 1;

      -- Se materializado no cartão, recalcular fatura aberta
      IF p_meio_pagamento_tipo = 'CARTAO' AND NOT v_natureza_prev THEN
        IF NOT (v_comp_cur = ANY(v_faturas_afetadas)) THEN
          v_faturas_afetadas := array_append(v_faturas_afetadas, v_comp_cur);
        END IF;
      END IF;

      -- Se foi pago na 1ª ocorrência, aplicar movimentação de saldo
      IF v_status_pagamento = 'pago' AND p_conta_origem_id IS NOT NULL THEN
        IF p_tipo = 'despesa' THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual - p_valor, updated_at = NOW()
          WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

          INSERT INTO public.movimentacoes_conta (
            workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
          ) VALUES (
            p_workspace_id, p_conta_origem_id, v_lanc_criado.id, 'saida', p_valor, v_data_cur, p_descricao, p_user_id
          );
        ELSIF p_tipo = 'receita' THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual + p_valor, updated_at = NOW()
          WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

          INSERT INTO public.movimentacoes_conta (
            workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
          ) VALUES (
            p_workspace_id, p_conta_origem_id, v_lanc_criado.id, 'entrada', p_valor, v_data_cur, p_descricao, p_user_id
          );
        ELSIF p_tipo = 'transferencia' AND p_conta_destino_id IS NOT NULL THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual - p_valor, updated_at = NOW()
          WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

          UPDATE public.contas
          SET saldo_atual = saldo_atual + p_valor, updated_at = NOW()
          WHERE id = p_conta_destino_id AND workspace_id = p_workspace_id;

          INSERT INTO public.movimentacoes_conta (
            workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
          ) VALUES
            (p_workspace_id, p_conta_origem_id, v_lanc_criado.id, 'transferencia_saida', p_valor, v_data_cur, p_descricao, p_user_id),
            (p_workspace_id, p_conta_destino_id, v_lanc_criado.id, 'transferencia_entrada', p_valor, v_data_cur, p_descricao, p_user_id);
        END IF;
      END IF;
    END IF;

    -- Próxima competência da série
    v_data_cur := public.avancar_data_periodicidade(p_data_inicio, p_periodicidade, v_passo);
    v_passo := v_passo + 1;
    v_primeira := false;
  END LOOP;

  -- Próxima competência a materializar
  SELECT competencia INTO v_proxima_comp
  FROM public.lancamentos
  WHERE serie_id = v_serie_id AND workspace_id = p_workspace_id AND natureza_previsao = true AND deleted_at IS NULL
  ORDER BY data ASC LIMIT 1;

  IF v_proxima_comp IS NULL THEN
    v_proxima_comp := TO_CHAR(v_data_cur, 'YYYY-MM');
  END IF;

  -- Atualizar mestre
  UPDATE public.series_lancamentos
  SET ocorrencias_geradas = v_ocorrencias_geradas,
      proxima_competencia = v_proxima_comp,
      updated_at = NOW()
  WHERE id = v_serie_id;

  -- Recalcular faturas impactadas
  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    DECLARE
      v_c text;
    BEGIN
      FOREACH v_c IN ARRAY v_faturas_afetadas LOOP
        PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_cartao_id, v_c);
      END LOOP;
    END;
  END IF;

  -- Auditoria da criação
  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    v_serie_id,
    'criacao_serie_fixa',
    'todos',
    jsonb_build_object(
      'descricao', p_descricao,
      'tipo', p_tipo,
      'valor', p_valor,
      'periodicidade', p_periodicidade,
      'prazo', p_prazo,
      'ocorrencias_geradas', v_ocorrencias_geradas,
      'data_limite_projecao', v_data_limite
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'serie_id', v_serie_id,
    'ocorrencias_geradas', v_ocorrencias_geradas,
    'data_limite_projecao', v_data_limite,
    'proxima_competencia', v_proxima_comp
  );
END;
$$;
