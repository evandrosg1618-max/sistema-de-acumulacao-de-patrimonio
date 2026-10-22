-- Migration: 20261022110000_build_5_conversao_tipo_e_higienizacao_completa.sql
-- Conversão atômica de tipos na edição (Único <-> Fixo <-> Parcelado)
-- com escopo único "Todos", preservação/bloqueio de pagos e recálculo de faturas

CREATE OR REPLACE FUNCTION public.converter_regime_lancamento_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_novo_regime text, -- 'unico', 'fixo', 'parcelado'
  p_nova_descricao text,
  p_novo_valor numeric,
  p_nova_data date,
  p_novo_meio_pagamento text,
  p_nova_conta_origem uuid DEFAULT NULL::uuid,
  p_nova_conta_destino uuid DEFAULT NULL::uuid,
  p_novo_cartao_id uuid DEFAULT NULL::uuid,
  p_nova_categoria_id uuid DEFAULT NULL::uuid,
  p_nova_subcategoria_id uuid DEFAULT NULL::uuid,
  p_nova_observacao text DEFAULT NULL::text,
  p_nova_quantidade_parcelas int DEFAULT 1,
  p_novo_prazo text DEFAULT 'indeterminado',
  p_nova_periodicidade text DEFAULT 'mensal',
  p_novo_total_ocorrencias int DEFAULT 12,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_regime_atual text;
  v_res jsonb;
  v_cartao RECORD;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_comp_base text;
  v_data_cur date;
  v_passo int := 1;
  v_comp_cur text;
  v_faturas_afetadas text[] := ARRAY[]::text[];
  v_c text;
  v_novo_pai_id uuid;
  v_valor_parc numeric;
  v_nova_serie_id uuid;
  v_data_limite date;
  v_total_alvo int;
BEGIN
  -- 1. Obter lançamento atual com bloqueio FOR UPDATE
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  v_regime_atual := COALESCE(v_lanc.regime, 'unico');

  -- Se o regime atual e o novo forem idênticos, não é conversão estrutural
  -- (mas a função garante a atualização segura dos dados)

  -- ========================================================
  -- CASO 1: De FIXO ou PARCELADO para ÚNICO
  -- "remove as não pagas da série/parcelas e mantém apenas o lançamento único editado (pagos preservados e bloqueados)"
  -- ========================================================
  IF p_novo_regime = 'unico' THEN
    -- Se era fixo com série
    IF v_lanc.serie_id IS NOT NULL THEN
      -- Se a ocorrência atual já for paga ou estiver em fatura paga, verificar
      IF v_lanc.meio_pagamento_tipo = 'CARTAO' AND v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM public.faturas
          WHERE cartao_id = v_lanc.cartao_id AND competencia = v_lanc.competencia AND workspace_id = p_workspace_id AND status = 'paga'
        ) THEN
          RAISE EXCEPTION 'Não é possível converter para único: a fatura % deste lançamento já está paga.', v_lanc.competencia;
        END IF;
      END IF;

      -- Excluir as demais ocorrências NÃO PAGAS da série (exceto a que está sendo editada)
      UPDATE public.lancamentos
      SET deleted_at = NOW(),
          status_pagamento = 'cancelado',
          updated_at = NOW()
      WHERE serie_id = v_lanc.serie_id
        AND id <> v_lanc.id
        AND workspace_id = p_workspace_id
        AND NOT (
          (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
          OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
            SELECT 1 FROM public.faturas f
            WHERE f.cartao_id = lancamentos.cartao_id
              AND f.competencia = lancamentos.competencia
              AND f.workspace_id = lancamentos.workspace_id
              AND f.status = 'paga'
          ))
        );

      -- Desativar a série
      UPDATE public.series_lancamentos
      SET ativo = false, updated_at = NOW()
      WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
    END IF;

    -- Se era parcelado com outras parcelas (lancamento_pai_id)
    IF v_regime_atual = 'parcelado' OR v_lanc.lancamento_pai_id IS NOT NULL OR (v_lanc.total_parcelas > 1) THEN
      DECLARE
        v_pai uuid := COALESCE(v_lanc.lancamento_pai_id, v_lanc.id);
      BEGIN
        -- Remover outras parcelas não pagas
        UPDATE public.lancamentos
        SET deleted_at = NOW(),
            status_pagamento = 'cancelado',
            updated_at = NOW()
        WHERE (lancamento_pai_id = v_pai OR id = v_pai)
          AND id <> v_lanc.id
          AND workspace_id = p_workspace_id
          AND NOT (
            (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
            OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
              SELECT 1 FROM public.faturas f
              WHERE f.cartao_id = lancamentos.cartao_id
                AND f.competencia = lancamentos.competencia
                AND f.workspace_id = lancamentos.workspace_id
                AND f.status = 'paga'
            ))
          );

        -- Limpar tabela de parcelas
        DELETE FROM public.parcelas WHERE lancamento_id = v_pai;
      END;
    END IF;

    -- Determinar competência base do lançamento único
    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
      SELECT dia_fechamento, dia_vencimento INTO v_cartao
      FROM public.cartoes WHERE id = p_novo_cartao_id;
      IF FOUND THEN
        v_dia_fech := v_cartao.dia_fechamento;
        v_dia_venc := v_cartao.dia_vencimento;
      END IF;
      v_comp_base := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_base := TO_CHAR(p_nova_data, 'YYYY-MM');
    END IF;

    -- Atualizar o lançamento em si para regime único
    UPDATE public.lancamentos
    SET regime = 'unico',
        serie_id = NULL,
        lancamento_pai_id = NULL,
        numero_parcela = 1,
        total_parcelas = 1,
        quantidade_parcelas = 1,
        descricao = p_nova_descricao,
        valor = p_novo_valor,
        data = p_nova_data,
        competencia = v_comp_base,
        meio_pagamento_tipo = p_novo_meio_pagamento,
        conta_origem_id = p_nova_conta_origem,
        conta_destino_id = p_nova_conta_destino,
        cartao_id = p_novo_cartao_id,
        categoria_id = p_nova_categoria_id,
        subcategoria_id = p_nova_subcategoria_id,
        observacao = p_nova_observacao,
        natureza_previsao = false,
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    -- Recalcular faturas
    IF v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_lanc.cartao_id, v_lanc.competencia);
    END IF;
    IF p_novo_cartao_id IS NOT NULL AND v_comp_base IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_novo_cartao_id, v_comp_base);
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'novo_regime', 'unico',
      'lancamento_id', v_lanc.id
    );
  END IF;

  -- ========================================================
  -- CASO 2: Conversão para FIXO (Único -> Fixo OU Parcelado -> Fixo)
  -- "cria a série e as recorrências a partir da data"
  -- ========================================================
  IF p_novo_regime = 'fixo' THEN
    -- Se vinha de parcelado, higienizar parcelas não pagas
    IF v_regime_atual = 'parcelado' OR v_lanc.lancamento_pai_id IS NOT NULL THEN
      DECLARE
        v_pai uuid := COALESCE(v_lanc.lancamento_pai_id, v_lanc.id);
      BEGIN
        UPDATE public.lancamentos
        SET deleted_at = NOW(),
            status_pagamento = 'cancelado',
            updated_at = NOW()
        WHERE (lancamento_pai_id = v_pai OR id = v_pai)
          AND id <> v_lanc.id
          AND workspace_id = p_workspace_id
          AND NOT (status_pagamento = 'pago');
        DELETE FROM public.parcelas WHERE lancamento_id = v_pai;
      END;
    END IF;

    -- Criar a série fixa via RPC mestre
    v_res := public.criar_serie_fixa_rpc(
      p_workspace_id := p_workspace_id,
      p_tipo := v_lanc.tipo,
      p_descricao := p_nova_descricao,
      p_valor := p_novo_valor,
      p_data_inicio := p_nova_data,
      p_prazo := COALESCE(p_novo_prazo, 'indeterminado'),
      p_periodicidade := COALESCE(p_nova_periodicidade, 'mensal'),
      p_quantidade_total := CASE WHEN p_novo_prazo = 'determinado' THEN p_novo_total_ocorrencias ELSE NULL END,
      p_meio_pagamento_tipo := p_novo_meio_pagamento,
      p_conta_origem_id := p_nova_conta_origem,
      p_conta_destino_id := p_nova_conta_destino,
      p_cartao_id := p_novo_cartao_id,
      p_categoria_id := p_nova_categoria_id,
      p_subcategoria_id := p_nova_subcategoria_id,
      p_observacao := p_nova_observacao,
      p_pago_primeira := (v_lanc.status_pagamento = 'pago'),
      p_user_id := p_user_id
    );

    -- Marcar o lançamento original antigo como cancelado para ser substituído pela nova série
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    RETURN jsonb_build_object(
      'sucesso', true,
      'novo_regime', 'fixo',
      'serie_id', v_res->>'serie_id'
    );
  END IF;

  -- ========================================================
  -- CASO 3: Conversão para PARCELADO (Único -> Parcelado OU Fixo -> Parcelado)
  -- ========================================================
  IF p_novo_regime = 'parcelado' THEN
    -- Se vinha de fixo com série, desativar série e cancelar projeções não pagas
    IF v_lanc.serie_id IS NOT NULL THEN
      UPDATE public.lancamentos
      SET deleted_at = NOW(),
          status_pagamento = 'cancelado',
          updated_at = NOW()
      WHERE serie_id = v_lanc.serie_id
        AND id <> v_lanc.id
        AND workspace_id = p_workspace_id
        AND NOT (status_pagamento = 'pago');

      UPDATE public.series_lancamentos
      SET ativo = false, updated_at = NOW()
      WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
    END IF;

    -- Obter regras de fatura do cartão se for cartão
    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
      SELECT dia_fechamento, dia_vencimento INTO v_cartao
      FROM public.cartoes WHERE id = p_novo_cartao_id;
      IF FOUND THEN
        v_dia_fech := v_cartao.dia_fechamento;
        v_dia_venc := v_cartao.dia_vencimento;
      END IF;
      v_comp_base := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_base := TO_CHAR(p_nova_data, 'YYYY-MM');
    END IF;

    -- Atualizar lançamento base como parcela 1
    v_valor_parc := ROUND((p_novo_valor / GREATEST(1, p_nova_quantidade_parcelas))::numeric, 2);

    UPDATE public.lancamentos
    SET regime = 'parcelado',
        serie_id = NULL,
        lancamento_pai_id = v_lanc.id,
        numero_parcela = 1,
        total_parcelas = p_nova_quantidade_parcelas,
        quantidade_parcelas = p_nova_quantidade_parcelas,
        descricao = TRIM(p_nova_descricao) || ' (1/' || p_nova_quantidade_parcelas || ')',
        valor = v_valor_parc,
        data = p_nova_data,
        competencia = v_comp_base,
        meio_pagamento_tipo = p_novo_meio_pagamento,
        conta_origem_id = p_nova_conta_origem,
        conta_destino_id = p_nova_conta_destino,
        cartao_id = p_novo_cartao_id,
        categoria_id = p_nova_categoria_id,
        subcategoria_id = p_nova_subcategoria_id,
        observacao = p_nova_observacao,
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    -- Gerar parcelas 2 a N
    FOR v_passo IN 2..p_nova_quantidade_parcelas LOOP
      v_data_cur := (p_nova_data + ((v_passo - 1) || ' month')::interval)::date;
      IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
        v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
      ELSE
        v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
      END IF;

      INSERT INTO public.lancamentos (
        workspace_id,
        tipo,
        regime,
        lancamento_pai_id,
        numero_parcela,
        total_parcelas,
        quantidade_parcelas,
        descricao,
        valor,
        data,
        competencia,
        meio_pagamento_tipo,
        conta_origem_id,
        conta_destino_id,
        cartao_id,
        categoria_id,
        subcategoria_id,
        status_pagamento,
        observacao,
        created_by
      ) VALUES (
        p_workspace_id,
        v_lanc.tipo,
        'parcelado',
        v_lanc.id,
        v_passo,
        p_nova_quantidade_parcelas,
        p_nova_quantidade_parcelas,
        TRIM(p_nova_descricao) || ' (' || v_passo || '/' || p_nova_quantidade_parcelas || ')',
        v_valor_parc,
        v_data_cur,
        v_comp_cur,
        p_novo_meio_pagamento,
        p_nova_conta_origem,
        p_nova_conta_destino,
        p_novo_cartao_id,
        p_nova_categoria_id,
        p_nova_subcategoria_id,
        'pendente',
        p_nova_observacao,
        p_user_id
      );

      IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
        PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_novo_cartao_id, v_comp_cur);
      END IF;
    END LOOP;

    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_novo_cartao_id, v_comp_base);
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'novo_regime', 'parcelado',
      'lancamento_pai_id', v_lanc.id
    );
  END IF;

  RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Regime não reconhecido');
END;
$$;
