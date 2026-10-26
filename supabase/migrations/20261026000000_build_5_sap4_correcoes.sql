-- Migration: 20261026000000_build_5_sap4_correcoes.sql
-- SAP-4: Correções da 4ª bateria de testes
-- 1. Total Comprometido global e valor único (obter_cartoes_consolidado_rpc)
-- 2. Recorrente em fatura fechada no valor total e no Total Comprometido (recalcular_fatura_rpc)
-- 3. Toggle "Lançamento pago" na alteração de série fixa (alterar_fixo_escopo_rpc)

-- 1. Recalcular Fatura RPC: Fatura Fechada soma recorrentes; Fatura Aberta não soma recorrentes (previsão)
CREATE OR REPLACE FUNCTION public.recalcular_fatura_rpc(
  p_workspace_id uuid,
  p_cartao_id uuid,
  p_competencia text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cartao RECORD;
  v_ano_comp int;
  v_mes_comp int;
  v_dia_fech int;
  v_dia_venc int;
  v_ano_fech int;
  v_mes_fech int;
  v_ult_dia int;
  v_data_fech date;
  v_data_venc date;
  v_total_parcelas numeric := 0;
  v_total_avulso_sem_parcela numeric := 0;
  v_total_recorrente numeric := 0;
  v_total_final numeric := 0;
BEGIN
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
  v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);

  v_ano_comp := CAST(SPLIT_PART(p_competencia, '-', 1) AS int);
  v_mes_comp := CAST(SPLIT_PART(p_competencia, '-', 2) AS int);

  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_comp, v_mes_comp, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_data_venc := MAKE_DATE(v_ano_comp, v_mes_comp, LEAST(v_dia_venc, v_ult_dia));

  IF v_dia_venc <= v_dia_fech THEN
    v_mes_fech := v_mes_comp - 1;
    v_ano_fech := v_ano_comp;
    IF v_mes_fech < 1 THEN
      v_mes_fech := 12;
      v_ano_fech := v_ano_fech - 1;
    END IF;
  ELSE
    v_mes_fech := v_mes_comp;
    v_ano_fech := v_ano_comp;
  END IF;

  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_fech, v_mes_fech, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_data_fech := MAKE_DATE(v_ano_fech, v_mes_fech, LEAST(v_dia_fech, v_ult_dia));

  -- Garantir registro de fatura
  INSERT INTO public.faturas (
    workspace_id,
    cartao_id,
    competencia,
    data_fechamento,
    data_vencimento,
    status,
    valor_total
  ) VALUES (
    p_workspace_id,
    p_cartao_id,
    p_competencia,
    v_data_fech,
    v_data_venc,
    'aberta',
    0.00
  )
  ON CONFLICT (workspace_id, cartao_id, competencia)
  DO UPDATE SET
    data_fechamento = EXCLUDED.data_fechamento,
    data_vencimento = EXCLUDED.data_vencimento,
    updated_at = NOW();

  -- Se a fatura já estiver paga, NÃO alterar seu valor_total
  IF EXISTS (
    SELECT 1 FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = p_cartao_id
      AND competencia = p_competencia
      AND status = 'paga'
  ) THEN
    SELECT valor_total INTO v_total_final
    FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = p_cartao_id
      AND competencia = p_competencia;
    RETURN COALESCE(v_total_final, 0);
  END IF;

  -- 1. Soma cotas da tabela 'parcelas' desta competência (inclui parcelados E compras únicas de cartão)
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras no cartão avulsas ESTRITAMENTE de regime = 'unico' E sem filhos em parcelas
  SELECT COALESCE(SUM(
    CASE WHEN l.tipo = 'despesa' THEN l.valor
         WHEN l.tipo = 'receita' THEN -l.valor
         ELSE 0 END
  ), 0)
  INTO v_total_avulso_sem_parcela
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.regime = 'unico'
    AND l.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.parcelas p2
      WHERE p2.lancamento_id = l.id
    );

  -- 3. Regra Definitiva SAP-4 BLOCO 2:
  -- (a) Fatura FECHADA (CURRENT_DATE >= v_data_fech): lançamentos recorrentes dela ENTRAM no valor total da fatura
  -- (b) Fatura ABERTA (CURRENT_DATE < v_data_fech): lançamentos recorrentes NÃO entram na soma (ficam como previsão)
  IF CURRENT_DATE >= v_data_fech THEN
    SELECT COALESCE(SUM(
      CASE WHEN l.tipo = 'despesa' THEN l.valor
           WHEN l.tipo = 'receita' THEN -l.valor
           ELSE 0 END
    ), 0)
    INTO v_total_recorrente
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.cartao_id = p_cartao_id
      AND l.competencia = p_competencia
      AND (l.regime = 'fixo' OR l.serie_id IS NOT NULL)
      AND l.deleted_at IS NULL;
  ELSE
    v_total_recorrente := 0;
  END IF;

  v_total_final := GREATEST(0, ROUND(v_total_parcelas + v_total_avulso_sem_parcela + v_total_recorrente, 2));

  UPDATE public.faturas
  SET valor_total = v_total_final,
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND competencia = p_competencia
    AND status <> 'paga';

  RETURN v_total_final;
END;
$$;


-- 2. Regra definitiva do Total Comprometido (obter_cartoes_consolidado_rpc)
-- Valor global de comprometimento do cartão:
-- (a) Faturas ABERTAS e não pagas: parcelas pendentes futuras, EXCETO recorrentes de fatura ainda não fechada
-- (b) Faturas FECHADAS e não pagas: todas as parcelas dessas faturas, INCLUSIVE as oriundas de recorrentes
-- (c) NUNCA somar faturas pagas nem recorrentes de faturas abertas
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
  WITH fatura_a_vencer AS (
    SELECT DISTINCT ON (f.cartao_id)
      f.cartao_id,
      f.competencia,
      f.valor_total
    FROM public.faturas f
    WHERE f.workspace_id = p_workspace_id
      AND f.status <> 'paga'
    ORDER BY f.cartao_id, f.data_vencimento ASC
  ),
  parcelas_pendentes AS (
    -- Parcelas futuras/pendentes em faturas que NÃO estão pagas
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
      AND (f.id IS NULL OR f.status <> 'paga')
      AND l.deleted_at IS NULL
    GROUP BY p.cartao_id
  ),
  avulsos_sem_parcela AS (
    -- Compras únicas avulsas que não geraram parcela e pertencem a fatura não paga
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
      AND l.status_pagamento <> 'pago'
      AND (f.id IS NULL OR f.status <> 'paga')
      AND l.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.parcelas p WHERE p.lancamento_id = l.id
      )
    GROUP BY l.cartao_id
  ),
  recorrentes_faturas_fechadas AS (
    -- SAP-4 BLOCO 1 e 2: Lançamentos recorrentes entram no comprometimento SE E SOMENTE SE a fatura estiver FECHADA e NÃO paga
    SELECT
      l.cartao_id,
      COALESCE(SUM(
        CASE WHEN l.tipo = 'despesa' THEN l.valor
             WHEN l.tipo = 'receita' THEN -l.valor
             ELSE 0 END
      ), 0) AS total_recorrente
    FROM public.lancamentos l
    JOIN public.faturas f ON f.cartao_id = l.cartao_id 
                         AND f.competencia = l.competencia 
                         AND f.workspace_id = l.workspace_id
    WHERE l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND (l.regime = 'fixo' OR l.serie_id IS NOT NULL)
      AND l.deleted_at IS NULL
      AND f.status <> 'paga'
      AND CURRENT_DATE >= f.data_fechamento
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
    COALESCE(fav.valor_total, 0)::numeric AS fatura_atual,
    GREATEST(0, COALESCE(pp.total_parcelas, 0) + COALESCE(asp.total_avulso, 0) + COALESCE(rff.total_recorrente, 0))::numeric AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN fatura_a_vencer fav ON fav.cartao_id = c.id
  LEFT JOIN parcelas_pendentes pp ON pp.cartao_id = c.id
  LEFT JOIN avulsos_sem_parcela asp ON asp.cartao_id = c.id
  LEFT JOIN recorrentes_faturas_fechadas rff ON rff.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo = true)
  ORDER BY c.nome ASC;
END;
$$;


-- 3. Atualizar alterar_fixo_escopo_rpc para aplicar toggle "Lançamento pago" em despesa e receita na alteração
CREATE OR REPLACE FUNCTION public.alterar_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text DEFAULT 'todos',
  p_nova_descricao text DEFAULT NULL,
  p_novo_valor numeric DEFAULT NULL,
  p_nova_data date DEFAULT NULL,
  p_novo_meio_pagamento_tipo text DEFAULT NULL,
  p_novo_cartao_id uuid DEFAULT NULL,
  p_novo_prazo text DEFAULT NULL,
  p_nova_periodicidade text DEFAULT NULL,
  p_nova_quantidade_total integer DEFAULT NULL,
  p_nova_categoria_id uuid DEFAULT NULL,
  p_nova_subcategoria_id uuid DEFAULT NULL,
  p_nova_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_nova_conta_origem_id uuid DEFAULT NULL,
  p_nova_conta_destino_id uuid DEFAULT NULL,
  p_pago_primeira boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_cartao RECORD;
  v_ids_nao_pagos uuid[] := ARRAY[]::uuid[];
  v_ids_pagos uuid[] := ARRAY[]::uuid[];
  v_faturas_afetadas_antigas text[] := ARRAY[]::text[];
  v_faturas_afetadas_novas text[] := ARRAY[]::text[];
  v_antigo_cartao_id uuid;
  v_novo_cartao_id uuid;
  v_antigo_meio text;
  v_novo_meio text;
  v_antiga_conta_origem uuid;
  v_antiga_conta_destino uuid;
  v_nova_conta_origem uuid;
  v_nova_conta_destino uuid;
  v_prazo text;
  v_qtd_total int;
  v_periodicidade text;
  v_data_limite date;
  v_total_alvo int;
  v_data_cur date;
  v_passo int := 1;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_comp_cur text;
  v_comp_primeira text;
  v_c text;
  v_ja_pago boolean;
  v_lanc_criado RECORD;
  v_novos_criados int := 0;
  v_total_ativas_pos int := 0;
  v_hoje date := CURRENT_DATE;
  v_deve_materializar boolean;
  v_natureza_prev boolean;
  v_primeiro_criado_id uuid;
  v_status_primeiro text;
  v_c_orig RECORD;
  v_c_dest RECORD;
  v_rec_pago RECORD;
BEGIN
  -- 1. Buscar lançamento base com lock
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  IF v_lanc.serie_id IS NULL THEN
    RAISE EXCEPTION 'O lançamento não pertence a uma série recorrente fixa.';
  END IF;

  SELECT * INTO v_serie
  FROM public.series_lancamentos
  WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Série recorrente não encontrada.';
  END IF;

  -- 2. Guardar referências antigas para recálculo
  v_antigo_meio := v_serie.meio_pagamento_tipo;
  v_antigo_cartao_id := v_serie.cartao_id;
  v_antiga_conta_origem := v_serie.conta_origem_id;
  v_antiga_conta_destino := v_serie.conta_destino_id;

  -- 3. Resolver novos valores definidos pelo usuário
  v_novo_meio := COALESCE(p_novo_meio_pagamento_tipo, v_serie.meio_pagamento_tipo, 'CONTA');
  IF v_novo_meio = 'CARTAO' THEN
    v_novo_cartao_id := COALESCE(p_novo_cartao_id, v_serie.cartao_id);
    v_nova_conta_origem := NULL;
    v_nova_conta_destino := NULL;
  ELSE
    v_novo_cartao_id := NULL;
    v_nova_conta_origem := COALESCE(p_nova_conta_origem_id, v_serie.conta_origem_id);
    v_nova_conta_destino := CASE WHEN v_serie.tipo = 'transferencia' THEN COALESCE(p_nova_conta_destino_id, v_serie.conta_destino_id) ELSE NULL END;
  END IF;

  v_prazo := COALESCE(p_novo_prazo, v_serie.prazo, 'indeterminado');
  v_qtd_total := CASE
    WHEN v_prazo = 'determinado' THEN COALESCE(p_nova_quantidade_total, v_serie.quantidade_total, 12)
    ELSE NULL
  END;
  v_periodicidade := COALESCE(p_nova_periodicidade, v_serie.periodicidade, 'mensal');

  IF v_novo_meio = 'CARTAO' AND v_novo_cartao_id IS NOT NULL THEN
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_novo_cartao_id AND workspace_id = p_workspace_id;
    IF FOUND THEN
      v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
      v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
    END IF;
  END IF;

  -- Competência da 1ª ocorrência a ser gerada
  IF v_novo_meio = 'CARTAO' THEN
    v_comp_primeira := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);
  ELSE
    v_comp_primeira := TO_CHAR(p_nova_data, 'YYYY-MM');
  END IF;

  -- 4. Identificar lançamentos NÃO PAGOS (alvos para exclusão/recriação) e PAGOS (preservados intactos)
  SELECT
    ARRAY_AGG(id) FILTER (WHERE NOT (
      (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
      OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
        SELECT 1 FROM public.faturas f
        WHERE f.cartao_id = lancamentos.cartao_id
          AND f.competencia = lancamentos.competencia
          AND f.workspace_id = lancamentos.workspace_id
          AND f.status = 'paga'
      ))
    )),
    ARRAY_AGG(id) FILTER (WHERE (
      (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
      OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
        SELECT 1 FROM public.faturas f
        WHERE f.cartao_id = lancamentos.cartao_id
          AND f.competencia = lancamentos.competencia
          AND f.workspace_id = lancamentos.workspace_id
          AND f.status = 'paga'
      ))
    ))
  INTO v_ids_nao_pagos, v_ids_pagos
  FROM public.lancamentos
  WHERE serie_id = v_serie.id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  -- Se p_pago_primeira estiver ATIVO ou se o lançamento base v_lanc estava pago em conta bancária/dinheiro:
  -- Precisamos estornar a movimentação anterior da conta antiga para permitir a alteração e correta aplicação na conta nova
  FOR v_rec_pago IN
    SELECT * FROM public.lancamentos
    WHERE serie_id = v_serie.id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND status_pagamento = 'pago'
      AND meio_pagamento_tipo <> 'CARTAO'
      AND (id = v_lanc.id OR competencia = v_comp_primeira)
  LOOP
    IF v_rec_pago.tipo = 'despesa' AND v_rec_pago.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas SET saldo_atual = saldo_atual + v_rec_pago.valor, updated_at = NOW()
      WHERE id = v_rec_pago.conta_origem_id AND workspace_id = p_workspace_id;
    ELSIF v_rec_pago.tipo = 'receita' AND v_rec_pago.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas SET saldo_atual = saldo_atual - v_rec_pago.valor, updated_at = NOW()
      WHERE id = v_rec_pago.conta_origem_id AND workspace_id = p_workspace_id;
    ELSIF v_rec_pago.tipo = 'transferencia' THEN
      IF v_rec_pago.conta_origem_id IS NOT NULL THEN
        UPDATE public.contas SET saldo_atual = saldo_atual + v_rec_pago.valor, updated_at = NOW()
        WHERE id = v_rec_pago.conta_origem_id AND workspace_id = p_workspace_id;
      END IF;
      IF v_rec_pago.conta_destino_id IS NOT NULL THEN
        UPDATE public.contas SET saldo_atual = saldo_atual - v_rec_pago.valor, updated_at = NOW()
        WHERE id = v_rec_pago.conta_destino_id AND workspace_id = p_workspace_id;
      END IF;
    END IF;

    DELETE FROM public.movimentacoes_conta WHERE lancamento_id = v_rec_pago.id AND workspace_id = p_workspace_id;

    -- Movê-lo para o conjunto a ser recriado com os novos dados
    v_ids_nao_pagos := array_append(COALESCE(v_ids_nao_pagos, ARRAY[]::uuid[]), v_rec_pago.id);
    v_ids_pagos := array_remove(v_ids_pagos, v_rec_pago.id);
  END LOOP;

  -- Coletar faturas antigas que podem perder lançamentos para posterior recálculo
  IF v_antigo_cartao_id IS NOT NULL AND v_ids_nao_pagos IS NOT NULL THEN
    SELECT ARRAY_AGG(DISTINCT competencia) INTO v_faturas_afetadas_antigas
    FROM public.lancamentos
    WHERE id = ANY(v_ids_nao_pagos) AND cartao_id = v_antigo_cartao_id;
  END IF;

  -- 5. EXCLUIR SOMENTE as ocorrências NÃO PAGAS da série (soft-delete seguro em transação)
  IF v_ids_nao_pagos IS NOT NULL AND array_length(v_ids_nao_pagos, 1) > 0 THEN
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        updated_at = NOW()
    WHERE id = ANY(v_ids_nao_pagos) AND workspace_id = p_workspace_id;
  END IF;

  -- 6. Atualizar a definição mestre na tabela series_lancamentos com todos os novos campos
  IF v_prazo = 'indeterminado' THEN
    v_data_limite := public.calcular_limite_projecao_fixo(p_nova_data);
    v_total_alvo := 9999;
  ELSE
    v_total_alvo := v_qtd_total;
    v_data_limite := MAKE_DATE(2099, 12, 31);
  END IF;

  UPDATE public.series_lancamentos
  SET descricao = p_nova_descricao,
      valor = p_novo_valor,
      meio_pagamento_tipo = v_novo_meio,
      cartao_id = v_novo_cartao_id,
      conta_origem_id = v_nova_conta_origem,
      conta_destino_id = v_nova_conta_destino,
      prazo = v_prazo,
      quantidade_total = v_qtd_total,
      periodicidade = v_periodicidade,
      categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
      subcategoria_id = p_nova_subcategoria_id,
      observacao = p_nova_observacao,
      data_inicio = p_nova_data,
      dia_vencimento = EXTRACT(DAY FROM p_nova_data)::int,
      data_limite_projecao = v_data_limite,
      ativo = true,
      updated_at = NOW()
  WHERE id = v_serie.id AND workspace_id = p_workspace_id;

  -- 7. RECRIAR as recorrências a partir da nova data inicial
  v_data_cur := p_nova_data;
  v_passo := 1;

  WHILE v_passo <= v_total_alvo AND v_data_cur <= v_data_limite LOOP
    IF v_novo_meio = 'CARTAO' THEN
      v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
    END IF;

    -- Verificar se já existe recorrência PAGA preservada nesta competência
    SELECT EXISTS (
      SELECT 1 FROM public.lancamentos
      WHERE serie_id = v_serie.id
        AND workspace_id = p_workspace_id
        AND competencia = v_comp_cur
        AND deleted_at IS NULL
    ) INTO v_ja_pago;

    -- Se não houver ocorrência paga ativa ocupando a competência, gerar a nova ocorrência
    IF NOT v_ja_pago THEN
      v_deve_materializar := (v_data_cur <= v_hoje);
      v_natureza_prev := NOT v_deve_materializar;

      -- Determinar status do pagamento:
      IF v_passo = 1 AND p_pago_primeira AND v_novo_meio <> 'CARTAO' THEN
        v_status_primeiro := 'pago';
      ELSE
        v_status_primeiro := 'pendente';
      END IF;

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
        v_serie.tipo,
        'fixo',
        v_serie.id,
        v_data_cur,
        v_comp_cur,
        p_nova_descricao,
        p_novo_valor,
        v_novo_meio,
        v_nova_conta_origem,
        v_nova_conta_destino,
        v_novo_cartao_id,
        COALESCE(p_nova_categoria_id, v_serie.categoria_id),
        p_nova_subcategoria_id,
        v_status_primeiro,
        (CASE WHEN v_status_primeiro = 'pago' THEN v_data_cur ELSE NULL END),
        p_nova_observacao,
        1,
        v_passo,
        (CASE WHEN v_prazo = 'determinado' THEN v_qtd_total ELSE NULL END),
        v_natureza_prev,
        false,
        false,
        p_user_id
      )
      ON CONFLICT (workspace_id, serie_id, competencia) WHERE serie_id IS NOT NULL AND deleted_at IS NULL
      DO UPDATE SET
        data = EXCLUDED.data,
        valor = EXCLUDED.valor,
        descricao = EXCLUDED.descricao,
        meio_pagamento_tipo = EXCLUDED.meio_pagamento_tipo,
        conta_origem_id = EXCLUDED.conta_origem_id,
        conta_destino_id = EXCLUDED.conta_destino_id,
        cartao_id = EXCLUDED.cartao_id,
        categoria_id = EXCLUDED.categoria_id,
        subcategoria_id = EXCLUDED.subcategoria_id,
        status_pagamento = EXCLUDED.status_pagamento,
        data_pagamento = EXCLUDED.data_pagamento,
        observacao = EXCLUDED.observacao,
        natureza_previsao = EXCLUDED.natureza_previsao,
        numero_parcela = EXCLUDED.numero_parcela,
        total_parcelas = EXCLUDED.total_parcelas,
        updated_at = NOW()
      RETURNING * INTO v_lanc_criado;

      IF v_lanc_criado.id IS NOT NULL THEN
        v_novos_criados := v_novos_criados + 1;
        IF v_passo = 1 THEN
          v_primeiro_criado_id := v_lanc_criado.id;

          -- Se a 1ª ocorrência foi marcada como paga, atualizar saldo e movimentações da nova conta
          IF v_status_primeiro = 'pago' AND v_novo_meio <> 'CARTAO' THEN
            IF v_serie.tipo = 'despesa' AND v_nova_conta_origem IS NOT NULL THEN
              UPDATE public.contas
              SET saldo_atual = saldo_atual - p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_origem AND workspace_id = p_workspace_id;

              INSERT INTO public.movimentacoes_conta (
                workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
              ) VALUES (
                p_workspace_id, v_nova_conta_origem, v_lanc_criado.id, 'saida', p_novo_valor, v_data_cur, p_nova_descricao, p_user_id
              );
            ELSIF v_serie.tipo = 'receita' AND v_nova_conta_origem IS NOT NULL THEN
              UPDATE public.contas
              SET saldo_atual = saldo_atual + p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_origem AND workspace_id = p_workspace_id;

              INSERT INTO public.movimentacoes_conta (
                workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
              ) VALUES (
                p_workspace_id, v_nova_conta_origem, v_lanc_criado.id, 'entrada', p_novo_valor, v_data_cur, p_nova_descricao, p_user_id
              );
            ELSIF v_serie.tipo = 'transferencia' AND v_nova_conta_origem IS NOT NULL AND v_nova_conta_destino IS NOT NULL THEN
              UPDATE public.contas
              SET saldo_atual = saldo_atual - p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_origem AND workspace_id = p_workspace_id;

              UPDATE public.contas
              SET saldo_atual = saldo_atual + p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_destino AND workspace_id = p_workspace_id;

              SELECT nome INTO v_c_dest FROM public.contas WHERE id = v_nova_conta_destino;
              SELECT nome INTO v_c_orig FROM public.contas WHERE id = v_nova_conta_origem;

              INSERT INTO public.movimentacoes_conta (
                workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
              ) VALUES 
              (p_workspace_id, v_nova_conta_origem, v_lanc_criado.id, 'transferencia_saida', p_novo_valor, v_data_cur, 'Transf. saída para ' || COALESCE(v_c_dest.nome, 'Conta destino'), p_user_id),
              (p_workspace_id, v_nova_conta_destino, v_lanc_criado.id, 'transferencia_entrada', p_novo_valor, v_data_cur, 'Transf. entrada de ' || COALESCE(v_c_orig.nome, 'Conta origem'), p_user_id);
            END IF;
          END IF;
        END IF;

        IF v_novo_meio = 'CARTAO' THEN
          v_faturas_afetadas_novas := array_append(COALESCE(v_faturas_afetadas_novas, ARRAY[]::text[]), v_comp_cur);
        END IF;
      END IF;
    END IF;

    v_data_cur := public.avancar_data_periodicidade(p_nova_data, v_periodicidade, v_passo);
    v_passo := v_passo + 1;
  END LOOP;

  -- 8. Verificação de estado
  SELECT COUNT(*) INTO v_total_ativas_pos
  FROM public.lancamentos
  WHERE serie_id = v_serie.id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  IF v_novos_criados = 0 AND (v_ids_nao_pagos IS NOT NULL AND array_length(v_ids_nao_pagos, 1) > 0) THEN
    RAISE EXCEPTION 'Não foi possível regenerar as novas ocorrências da série recorrente no período especificado.';
  END IF;

  -- 9. Recalcular faturas antigas e novas afetadas se envolveu cartão
  IF v_antigo_cartao_id IS NOT NULL AND v_faturas_afetadas_antigas IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_afetadas_antigas LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_antigo_cartao_id, v_c);
    END LOOP;
  END IF;

  IF v_novo_cartao_id IS NOT NULL AND v_faturas_afetadas_novas IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_afetadas_novas LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_novo_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 10. Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'series_lancamentos', v_serie.id, 'update_series_scope',
    to_jsonb(v_serie),
    jsonb_build_object(
      'novos_criados', v_novos_criados,
      'total_ativas', v_total_ativas_pos,
      'pago_primeira', p_pago_primeira,
      'primeiro_criado_id', v_primeiro_criado_id
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'alterados', v_novos_criados,
    'total_ativas', v_total_ativas_pos,
    'faturas_recalculadas', ARRAY_CAT(COALESCE(v_faturas_afetadas_antigas, ARRAY[]::text[]), COALESCE(v_faturas_afetadas_novas, ARRAY[]::text[]))
  );
END;
$$;


-- 4. Recalcular todas as faturas existentes não pagas com as regras atualizadas
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT workspace_id, cartao_id, competencia
    FROM public.faturas
    WHERE status <> 'paga'
  LOOP
    PERFORM public.recalcular_fatura_rpc(v_rec.workspace_id, v_rec.cartao_id, v_rec.competencia);
  END LOOP;
END $$;
