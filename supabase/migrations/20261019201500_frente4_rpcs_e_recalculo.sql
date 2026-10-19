-- Migration: Frente 4 - Refatoração da edição/exclusão de compras parceladas e recálculo de faturas
-- 1. Helper function: calcular competência do cartão a partir da data da compra e dia de fechamento
CREATE OR REPLACE FUNCTION public.calcular_competencia_cartao(
  p_data date,
  p_dia_fechamento integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ano integer;
  v_mes integer;
  v_dia integer;
BEGIN
  v_ano := EXTRACT(YEAR FROM p_data)::integer;
  v_mes := EXTRACT(MONTH FROM p_data)::integer;
  v_dia := EXTRACT(DAY FROM p_data)::integer;

  -- Se o dia da compra for maior ou igual ao dia de fechamento, entra na fatura do mês seguinte
  IF v_dia >= p_dia_fechamento THEN
    v_mes := v_mes + 1;
    IF v_mes > 12 THEN
      v_mes := 1;
      v_ano := v_ano + 1;
    END IF;
  END IF;

  RETURN v_ano::text || '-' || LPAD(v_mes::text, 2, '0');
END;
$$;

-- 2. Helper function: somar N meses a uma competência 'YYYY-MM'
CREATE OR REPLACE FUNCTION public.somar_meses_competencia(
  p_competencia text,
  p_meses integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ano integer;
  v_mes integer;
  v_tot_meses integer;
  v_novo_ano integer;
  v_novo_mes integer;
BEGIN
  v_ano := CAST(SPLIT_PART(p_competencia, '-', 1) AS integer);
  v_mes := CAST(SPLIT_PART(p_competencia, '-', 2) AS integer);

  v_tot_meses := (v_ano * 12 + (v_mes - 1)) + p_meses;
  v_novo_ano := v_tot_meses / 12;
  v_novo_mes := (v_tot_meses % 12) + 1;

  RETURN v_novo_ano::text || '-' || LPAD(v_novo_mes::text, 2, '0');
END;
$$;

-- 3. RPC: recalcular_fatura_rpc
-- Garante a existência do cabeçalho da fatura e recalcula seu valor_total a partir de parcelas ativas e compras à vista (regime='unico')
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
  v_fatura RECORD;
  v_ano int;
  v_mes int;
  v_ult_dia int;
  v_dia_fech int;
  v_dia_venc int;
  v_data_fech date;
  v_data_venc date;
  v_mes_venc int;
  v_ano_venc int;
  v_total_parcelas numeric := 0;
  v_total_avulso numeric := 0;
  v_total_final numeric := 0;
BEGIN
  -- Verificar existência do cartão
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_ano := CAST(SPLIT_PART(p_competencia, '-', 1) AS int);
  v_mes := CAST(SPLIT_PART(p_competencia, '-', 2) AS int);

  -- Calcular data de fechamento
  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_dia_fech := LEAST(COALESCE(v_cartao.dia_fechamento, 10), v_ult_dia);
  v_data_fech := MAKE_DATE(v_ano, v_mes, v_dia_fech);

  -- Calcular data de vencimento
  v_ano_venc := v_ano;
  v_mes_venc := v_mes;
  IF COALESCE(v_cartao.dia_vencimento, 20) < COALESCE(v_cartao.dia_fechamento, 10) THEN
    v_mes_venc := v_mes_venc + 1;
    IF v_mes_venc > 12 THEN
      v_mes_venc := 1;
      v_ano_venc := v_ano_venc + 1;
    END IF;
  END IF;
  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_venc, v_mes_venc, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_dia_venc := LEAST(COALESCE(v_cartao.dia_vencimento, 20), v_ult_dia);
  v_data_venc := MAKE_DATE(v_ano_venc, v_mes_venc, v_dia_venc);

  -- Garantir fatura aberta
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
  DO NOTHING;

  -- 1. Soma parcelas de compras parceladas vinculadas a lançamentos ativos
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras à vista no cartão (regime='unico' e ativo)
  SELECT COALESCE(SUM(
    CASE WHEN l.tipo = 'despesa' THEN l.valor
         WHEN l.tipo = 'receita' THEN -l.valor
         ELSE 0 END
  ), 0)
  INTO v_total_avulso
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.regime = 'unico'
    AND l.deleted_at IS NULL;

  v_total_final := GREATEST(0, ROUND(v_total_parcelas + v_total_avulso, 2));

  -- Atualiza o valor_total da fatura
  UPDATE public.faturas
  SET valor_total = v_total_final,
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND competencia = p_competencia;

  RETURN v_total_final;
END;
$$;

-- 4. RPC: regenerar_parcelas_lancamento
-- Executa a edição atômica de um lançamento parcelado:
-- - Valida se alguma fatura implicada (anterior ou nova) está paga. Se sim, bloqueia com mensagem explicativa.
-- - Atualiza o lançamento original com nova descrição, valor total, nova data, nova competência e quantidade de parcelas.
-- - Remove e recria atomicamente todas as parcelas na tabela parcelas com divisão exata e centavos na última cota.
-- - Remove quaisquer lançamentos filhos antigos na tabela lancamentos.
-- - Recalcula todas as faturas impactadas (antigas e novas).
CREATE OR REPLACE FUNCTION public.regenerar_parcelas_lancamento(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_novo_valor numeric,
  p_nova_data date,
  p_nova_quantidade_parcelas integer,
  p_nova_descricao text,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig RECORD;
  v_cartao RECORD;
  v_pai_id uuid;
  v_dia_fech int;
  v_comp_inicial text;
  v_comp_antiga text;
  v_fatura_paga RECORD;
  v_valor_base numeric;
  v_dif_centavos numeric;
  v_valor_parcela numeric;
  v_i int;
  v_comp text;
  v_competencias_afetadas text[] := ARRAY[]::text[];
  v_c text;
  v_desc_limpa text;
  v_estado_anterior jsonb;
BEGIN
  -- 1. Localizar lançamento original (se chamado com id de filho, resolve para o pai)
  SELECT * INTO v_orig
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  v_pai_id := COALESCE(v_orig.lancamento_pai_id, v_orig.id);

  IF v_pai_id <> v_orig.id THEN
    SELECT * INTO v_orig
    FROM public.lancamentos
    WHERE id = v_pai_id AND workspace_id = p_workspace_id;
  END IF;

  v_estado_anterior := to_jsonb(v_orig);

  IF v_orig.cartao_id IS NULL THEN
    RAISE EXCEPTION 'O lançamento não está vinculado a um cartão de crédito';
  END IF;

  -- Buscar dados do cartão
  SELECT id, dia_fechamento INTO v_cartao
  FROM public.cartoes
  WHERE id = v_orig.cartao_id AND workspace_id = p_workspace_id;

  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);

  -- 2. BLOQUEIO ÚNICO: verificar se QUALQUER fatura vinculada ao lançamento (atual ou anterior) está paga
  -- a) Faturas com parcelas atuais do pai
  FOR v_fatura_paga IN
    SELECT DISTINCT f.competencia
    FROM public.parcelas p
    JOIN public.faturas f ON f.cartao_id = p.cartao_id 
                         AND f.competencia = p.competencia 
                         AND f.workspace_id = p.workspace_id
    WHERE p.lancamento_id = v_pai_id
      AND p.workspace_id = p_workspace_id
      AND f.status = 'paga'
  LOOP
    RAISE EXCEPTION 'A fatura de % já está paga e contém parcelas desta compra. Para editar, desfaça o pagamento da fatura de % na tela de Cartões.',
      v_fatura_paga.competencia, v_fatura_paga.competencia;
  END LOOP;

  -- b) Faturas ligadas aos lançamentos filhos/pai
  FOR v_fatura_paga IN
    SELECT DISTINCT f.competencia
    FROM public.lancamentos l
    JOIN public.faturas f ON f.cartao_id = l.cartao_id 
                         AND f.competencia = l.competencia 
                         AND f.workspace_id = l.workspace_id
    WHERE (l.id = v_pai_id OR l.lancamento_pai_id = v_pai_id)
      AND l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND f.status = 'paga'
  LOOP
    RAISE EXCEPTION 'A fatura de % já está paga e contém este lançamento. Para editar, desfaça o pagamento da fatura de % na tela de Cartões.',
      v_fatura_paga.competencia, v_fatura_paga.competencia;
  END LOOP;

  -- 3. Coletar competências antigas antes de regenerar para garantir recálculo
  SELECT ARRAY_AGG(DISTINCT p.competencia)
  INTO v_competencias_afetadas
  FROM public.parcelas p
  WHERE p.lancamento_id = v_pai_id;

  IF v_competencias_afetadas IS NULL THEN
    v_competencias_afetadas := ARRAY[]::text[];
  END IF;

  -- Incluir competência gravada no pai
  IF v_orig.competencia IS NOT NULL AND NOT (v_orig.competencia = ANY(v_competencias_afetadas)) THEN
    v_competencias_afetadas := array_append(v_competencias_afetadas, v_orig.competencia);
  END IF;

  -- Limpar a descrição: remover eventuais sufixos antigos '(X/Y)'
  v_desc_limpa := REGEXP_REPLACE(TRIM(p_nova_descricao), '\s*\(\d+\/\d+\)$', '', 'g');

  -- 4. Calcular nova competência inicial a partir da nova data e dia de fechamento
  v_comp_inicial := public.calcular_competencia_cartao(p_nova_data, v_dia_fech);

  -- 5. Atualizar o lançamento original (pai)
  UPDATE public.lancamentos
  SET
    descricao = v_desc_limpa,
    valor = ROUND(p_novo_valor, 2),
    data = p_nova_data,
    competencia = v_comp_inicial,
    quantidade_parcelas = p_nova_quantidade_parcelas,
    total_parcelas = p_nova_quantidade_parcelas,
    numero_parcela = 1,
    regime = 'parcelado',
    lancamento_pai_id = v_pai_id,
    categoria_id = COALESCE(p_categoria_id, v_orig.categoria_id),
    subcategoria_id = p_subcategoria_id,
    observacao = p_observacao,
    updated_at = NOW()
  WHERE id = v_pai_id AND workspace_id = p_workspace_id;

  -- 6. Limpar lançamentos filhos antigos em lancamentos (se existirem de implementações passadas)
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE lancamento_pai_id = v_pai_id
    AND id <> v_pai_id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  -- 7. Deletar atomicamente TODAS as parcelas antigas deste lançamento
  DELETE FROM public.parcelas
  WHERE lancamento_id = v_pai_id
    AND workspace_id = p_workspace_id;

  -- 8. Regenerar todas as parcelas do zero com divisão exata e centavos na última cota
  v_valor_base := TRUNC((p_novo_valor / p_nova_quantidade_parcelas), 2);
  v_dif_centavos := ROUND((p_novo_valor - (v_valor_base * p_nova_quantidade_parcelas)), 2);

  FOR v_i IN 1..p_nova_quantidade_parcelas LOOP
    v_comp := public.somar_meses_competencia(v_comp_inicial, v_i - 1);

    IF NOT (v_comp = ANY(v_competencias_afetadas)) THEN
      v_competencias_afetadas := array_append(v_competencias_afetadas, v_comp);
    END IF;

    IF v_i = p_nova_quantidade_parcelas THEN
      v_valor_parcela := v_valor_base + v_dif_centavos;
    ELSE
      v_valor_parcela := v_valor_base;
    END IF;

    INSERT INTO public.parcelas (
      workspace_id,
      lancamento_id,
      numero_parcela,
      total_parcelas,
      valor,
      competencia,
      data_vencimento,
      cartao_id,
      status
    ) VALUES (
      p_workspace_id,
      v_pai_id,
      v_i,
      p_nova_quantidade_parcelas,
      v_valor_parcela,
      v_comp,
      p_nova_data,
      v_orig.cartao_id,
      'pendente'
    );
  END LOOP;

  -- 9. Recalcular todas as faturas impactadas
  FOREACH v_c IN ARRAY v_competencias_afetadas LOOP
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_orig.cartao_id, v_c);
  END LOOP;

  -- 10. Auditoria da operação
  INSERT INTO public.auditoria_operacoes (
    workspace_id,
    entidade,
    entidade_id,
    acao,
    estado_anterior,
    estado_posterior,
    created_by
  ) VALUES (
    p_workspace_id,
    'lancamentos',
    v_pai_id,
    'regenerate_installments',
    v_estado_anterior,
    jsonb_build_object(
      'valor_total', p_novo_valor,
      'quantidade_parcelas', p_nova_quantidade_parcelas,
      'data', p_nova_data,
      'competencia_inicial', v_comp_inicial,
      'faturas_recalculadas', v_competencias_afetadas
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'pai_id', v_pai_id,
    'total_parcelas', p_nova_quantidade_parcelas,
    'valor_total', p_novo_valor,
    'faturas_recalculadas', v_competencias_afetadas
  );
END;
$$;

-- 5. RPC: excluir_lancamento_parcelado_rpc
-- Executa a exclusão de compra parcelada sempre sobre o lançamento original:
-- - Bloqueio único se qualquer fatura vinculada estiver paga.
-- - Deleta todas as parcelas e dá soft delete no pai e nos filhos.
-- - Recalcula todas as faturas afetadas.
CREATE OR REPLACE FUNCTION public.excluir_lancamento_parcelado_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig RECORD;
  v_pai_id uuid;
  v_fatura_paga RECORD;
  v_competencias_afetadas text[] := ARRAY[]::text[];
  v_c text;
BEGIN
  SELECT * INTO v_orig
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  v_pai_id := COALESCE(v_orig.lancamento_pai_id, v_orig.id);

  -- 1. BLOQUEIO ÚNICO: se qualquer fatura vinculada estiver paga, impedir
  FOR v_fatura_paga IN
    SELECT DISTINCT f.competencia
    FROM public.parcelas p
    JOIN public.faturas f ON f.cartao_id = p.cartao_id 
                         AND f.competencia = p.competencia 
                         AND f.workspace_id = p.workspace_id
    WHERE p.lancamento_id = v_pai_id
      AND p.workspace_id = p_workspace_id
      AND f.status = 'paga'
  LOOP
    RAISE EXCEPTION 'A fatura de % já está paga e contém parcelas desta compra. Para excluir, desfaça o pagamento da fatura de % na tela de Cartões.',
      v_fatura_paga.competencia, v_fatura_paga.competencia;
  END LOOP;

  -- 2. Coletar competências afetadas
  SELECT ARRAY_AGG(DISTINCT p.competencia)
  INTO v_competencias_afetadas
  FROM public.parcelas p
  WHERE p.lancamento_id = v_pai_id;

  IF v_competencias_afetadas IS NULL THEN
    v_competencias_afetadas := ARRAY[]::text[];
  END IF;

  IF v_orig.competencia IS NOT NULL AND NOT (v_orig.competencia = ANY(v_competencias_afetadas)) THEN
    v_competencias_afetadas := array_append(v_competencias_afetadas, v_orig.competencia);
  END IF;

  -- 3. Deletar todas as parcelas
  DELETE FROM public.parcelas
  WHERE lancamento_id = v_pai_id
    AND workspace_id = p_workspace_id;

  -- 4. Soft delete no pai e nos filhos
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE (id = v_pai_id OR lancamento_pai_id = v_pai_id)
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  -- 5. Recalcular faturas
  FOREACH v_c IN ARRAY v_competencias_afetadas LOOP
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_orig.cartao_id, v_c);
  END LOOP;

  -- 6. Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id,
    entidade,
    entidade_id,
    acao,
    estado_anterior,
    estado_posterior,
    created_by
  ) VALUES (
    p_workspace_id,
    'lancamentos',
    v_pai_id,
    'delete_installment_purchase',
    to_jsonb(v_orig),
    jsonb_build_object('faturas_recalculadas', v_competencias_afetadas),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'faturas_recalculadas', v_competencias_afetadas
  );
END;
$$;

-- 6. RPC: obter_cartoes_consolidado_rpc
-- Substitui loops de frontend na listagem de cartões: retorna lista de cartões com fatura_atual e total_comprometido já calculados via agregação direta no banco
CREATE OR REPLACE FUNCTION public.obter_cartoes_consolidado_rpc(
  p_workspace_id uuid,
  p_incluir_inativos boolean DEFAULT false
)
RETURNS TABLE (
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
  WITH faturas_abertas AS (
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
    WHERE p.workspace_id = p_workspace_id
      AND p.status = 'pendente'
      AND l.deleted_at IS NULL
    GROUP BY p.cartao_id
  ),
  avulsos_pendentes AS (
    SELECT
      l.cartao_id,
      COALESCE(SUM(
        CASE WHEN l.tipo = 'despesa' THEN l.valor
             WHEN l.tipo = 'receita' THEN -l.valor
             ELSE 0 END
      ), 0) AS total_avulso
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND l.regime = 'unico'
      AND l.status_pagamento = 'pendente'
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
    COALESCE(fa.total_aberta, 0)::numeric AS fatura_atual,
    GREATEST(0, COALESCE(pp.total_parcelas, 0) + COALESCE(ap.total_avulso, 0))::numeric AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN faturas_abertas fa ON fa.cartao_id = c.id
  LEFT JOIN parcelas_pendentes pp ON pp.cartao_id = c.id
  LEFT JOIN avulsos_pendentes ap ON ap.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo = true)
  ORDER BY c.nome ASC;
END;
$$;
