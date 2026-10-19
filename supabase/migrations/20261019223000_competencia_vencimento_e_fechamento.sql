-- Migration: Competência da fatura por mês de vencimento e recálculo
-- 1. Nova função calcular_competencia_cartao com a regra do mês do vencimento:
--    A competência da fatura é identificada pelo mês do vencimento.
--    Se a compra foi realizada até a data do fechamento:
--       competência é a do mês em que cair o próximo vencimento após o fechamento.
--    Se a compra foi realizada após o fechamento:
--       competência é a do vencimento no segundo mês seguinte ao fechamento.
--
--    Exemplos:
--      - Fech. 17, Venc. 01:
--          17/10/2026 (<= 17) -> próx. venc. 01/11/2026 -> competência '2026-11'
--          18/10/2026 (> 17)  -> 2º próx. venc. 01/12/2026 -> competência '2026-12'
--      - Fech. 23 (ou 20), Venc. 05:
--          19/09/2026 (<= 23) -> próx. venc. 05/10/2026 -> competência '2026-10'
--      - Fech. 04, Venc. 10:
--          03/10/2026 ou 04/10/2026 (<= 04) -> próx. venc. 10/10/2026 -> competência '2026-10'
--          05/10/2026 (> 04) -> 2º próx. venc. 10/11/2026 -> competência '2026-11'

-- Assinatura com 3 parâmetros: data da compra, dia_fechamento, dia_vencimento
CREATE OR REPLACE FUNCTION public.calcular_competencia_cartao(
  p_data date,
  p_dia_fechamento integer,
  p_dia_vencimento integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ano integer;
  v_mes integer;
  v_dia integer;
  v_fech integer;
  v_venc integer;
  v_mes_venc integer;
  v_ano_venc integer;
BEGIN
  v_ano := EXTRACT(YEAR FROM p_data)::integer;
  v_mes := EXTRACT(MONTH FROM p_data)::integer;
  v_dia := EXTRACT(DAY FROM p_data)::integer;

  v_fech := COALESCE(p_dia_fechamento, 10);
  v_venc := COALESCE(p_dia_vencimento, 20);

  -- Começamos avaliando o ciclo de fechamento no mês da compra
  v_mes_venc := v_mes;
  v_ano_venc := v_ano;

  -- Se o vencimento é em dia menor ou igual ao fechamento (ex: fecha 17, vence 01),
  -- o vencimento deste fechamento ocorre no mês seguinte ao fechamento.
  IF v_venc <= v_fech THEN
    v_mes_venc := v_mes_venc + 1;
    IF v_mes_venc > 12 THEN
      v_mes_venc := 1;
      v_ano_venc := v_ano_venc + 1;
    END IF;
  END IF;

  -- Se a compra foi efetuada APÓS o fechamento, cai no ciclo seguinte (+1 mês)
  IF v_dia > v_fech THEN
    v_mes_venc := v_mes_venc + 1;
    IF v_mes_venc > 12 THEN
      v_mes_venc := 1;
      v_ano_venc := v_ano_venc + 1;
    END IF;
  END IF;

  RETURN v_ano_venc::text || '-' || LPAD(v_mes_venc::text, 2, '0');
END;
$$;

-- Sobrecarga com 2 parâmetros para manter compatibilidade retroativa
-- (assume vencimento padrão dia 20 se não fornecido)
CREATE OR REPLACE FUNCTION public.calcular_competencia_cartao(
  p_data date,
  p_dia_fechamento integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN public.calcular_competencia_cartao(p_data, p_dia_fechamento, 20);
END;
$$;

-- 2. Atualizar RPC recalcular_fatura_rpc:
--    A competência 'YYYY-MM' agora representa o MÊS DO VENCIMENTO da fatura.
--    Portanto:
--    - data_vencimento é no mês da competência (ano=v_ano, mes=v_mes, dia=dia_vencimento)
--    - data_fechamento é antes do vencimento:
--        Se dia_vencimento <= dia_fechamento (ex: fecha 17, vence 01), o fechamento ocorreu no mês ANTERIOR à competência.
--        Se dia_vencimento > dia_fechamento (ex: fecha 04, vence 10), o fechamento ocorreu no MESMO mês da competência.
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
  v_total_avulso numeric := 0;
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

  -- Data de vencimento: calculada diretamente no mês/ano da competência
  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_comp, v_mes_comp, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_data_venc := MAKE_DATE(v_ano_comp, v_mes_comp, LEAST(v_dia_venc, v_ult_dia));

  -- Data de fechamento correspondente:
  IF v_dia_venc <= v_dia_fech THEN
    -- Fechamento ocorreu no mês anterior ao vencimento
    v_mes_fech := v_mes_comp - 1;
    v_ano_fech := v_ano_comp;
    IF v_mes_fech < 1 THEN
      v_mes_fech := 12;
      v_ano_fech := v_ano_fech - 1;
    END IF;
  ELSE
    -- Fechamento ocorreu no mesmo mês do vencimento
    v_mes_fech := v_mes_comp;
    v_ano_fech := v_ano_comp;
  END IF;

  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_fech, v_mes_fech, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_data_fech := MAKE_DATE(v_ano_fech, v_mes_fech, LEAST(v_dia_fech, v_ult_dia));

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
  DO UPDATE SET
    data_fechamento = EXCLUDED.data_fechamento,
    data_vencimento = EXCLUDED.data_vencimento,
    updated_at = NOW();

  -- Se a fatura já estiver paga, NÃO alterar seu valor_total nem mexer nos lançamentos pagos
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

  -- 1. Soma parcelas ativas desta competência
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

  -- Atualiza o valor_total da fatura aberta
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

-- 3. Atualizar regenerar_parcelas_lancamento para usar calcular_competencia_cartao(data, fech, venc)
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
  v_dia_venc int;
  v_comp_inicial text;
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
  -- 1. Localizar lançamento original
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
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = v_orig.cartao_id AND workspace_id = p_workspace_id;

  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
  v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);

  -- 2. BLOQUEIO ÚNICO: verificar se QUALQUER fatura vinculada ao lançamento (atual ou anterior) está paga
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

  IF v_orig.competencia IS NOT NULL AND NOT (v_orig.competencia = ANY(v_competencias_afetadas)) THEN
    v_competencias_afetadas := array_append(v_competencias_afetadas, v_orig.competencia);
  END IF;

  v_desc_limpa := REGEXP_REPLACE(TRIM(p_nova_descricao), '\s*\(\d+\/\d+\)$', '', 'g');

  -- 4. Calcular nova competência inicial a partir da nova data, dia de fechamento e dia de vencimento
  v_comp_inicial := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);

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

  -- 6. Limpar lançamentos filhos antigos em lancamentos
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

-- 4. Nova RPC: atualizar_fechamento_cartao_rpc
-- Permite editar o dia de fechamento (e opcionalmente dia de vencimento) do cartão.
-- Ao aplicar a alteração:
-- - Bloqueia recálculo de qualquer fatura com status "paga" (preservando seus dados intactos).
-- - Recalcula as competências de parcelas e lançamentos em aberto (faturas abertas).
-- - Recalcula os valores de todas as faturas afetadas.
-- - Registra auditoria da operação.
CREATE OR REPLACE FUNCTION public.atualizar_fechamento_cartao_rpc(
  p_workspace_id uuid,
  p_cartao_id uuid,
  p_novo_dia_fechamento integer,
  p_novo_dia_vencimento integer DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cartao RECORD;
  v_venc_final integer;
  v_lanc RECORD;
  v_parc RECORD;
  v_comp_orig text;
  v_comp_nova text;
  v_comp_antiga text;
  v_offset integer;
  v_faturas_antigas text[] := ARRAY[]::text[];
  v_faturas_novas text[] := ARRAY[]::text[];
  v_todas_faturas text[] := ARRAY[]::text[];
  v_c text;
BEGIN
  -- Validar cartão
  SELECT * INTO v_cartao
  FROM public.cartoes
  WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cartão não encontrado';
  END IF;

  v_venc_final := COALESCE(p_novo_dia_vencimento, v_cartao.dia_vencimento, 20);

  -- Atualizar dias no cadastro do cartão
  UPDATE public.cartoes
  SET dia_fechamento = p_novo_dia_fechamento,
      dia_vencimento = v_venc_final,
      updated_at = NOW()
  WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

  -- 1. Realinhar compras parceladas cujas parcelas NÃO estejam em faturas pagas
  -- Para cada lançamento pai de cartão ativo:
  FOR v_lanc IN
    SELECT l.*
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.cartao_id = p_cartao_id
      AND l.deleted_at IS NULL
      AND (l.lancamento_pai_id = l.id OR (l.lancamento_pai_id IS NULL AND l.regime = 'parcelado'))
  LOOP
    -- Se tiver QUALQUER parcela em fatura 'paga', preserva tudo intacto (não realinha este lançamento)
    IF EXISTS (
      SELECT 1
      FROM public.parcelas p
      JOIN public.faturas f ON f.cartao_id = p.cartao_id
                           AND f.competencia = p.competencia
                           AND f.workspace_id = p.workspace_id
      WHERE p.lancamento_id = v_lanc.id
        AND f.status = 'paga'
    ) THEN
      CONTINUE;
    END IF;

    -- Nova competência inicial baseada na nova regra
    v_comp_nova := public.calcular_competencia_cartao(v_lanc.data, p_novo_dia_fechamento, v_venc_final);

    -- Coletar faturas antigas para recálculo
    SELECT ARRAY_AGG(DISTINCT p.competencia) INTO v_faturas_antigas
    FROM public.parcelas p
    WHERE p.lancamento_id = v_lanc.id;

    IF v_faturas_antigas IS NOT NULL THEN
      v_todas_faturas := v_todas_faturas || v_faturas_antigas;
    END IF;

    -- Atualiza lançamento pai
    UPDATE public.lancamentos
    SET competencia = v_comp_nova,
        updated_at = NOW()
    WHERE id = v_lanc.id;

    -- Atualiza cada parcela
    FOR v_parc IN
      SELECT * FROM public.parcelas
      WHERE lancamento_id = v_lanc.id
      ORDER BY numero_parcela ASC
    LOOP
      v_comp_orig := public.somar_meses_competencia(v_comp_nova, v_parc.numero_parcela - 1);
      v_faturas_novas := array_append(v_faturas_novas, v_comp_orig);

      UPDATE public.parcelas
      SET competencia = v_comp_orig,
          updated_at = NOW()
      WHERE id = v_parc.id;

      -- Atualiza também eventual lançamento filho correspondente
      UPDATE public.lancamentos
      SET competencia = v_comp_orig,
          updated_at = NOW()
      WHERE lancamento_pai_id = v_lanc.id
        AND numero_parcela = v_parc.numero_parcela
        AND id <> v_lanc.id;
    END LOOP;
  END LOOP;

  -- 2. Realinhar compras à vista no cartão (regime = 'unico') que não estejam em faturas pagas
  FOR v_lanc IN
    SELECT l.*
    FROM public.lancamentos l
    LEFT JOIN public.faturas f ON f.cartao_id = l.cartao_id
                              AND f.competencia = l.competencia
                              AND f.workspace_id = l.workspace_id
    WHERE l.workspace_id = p_workspace_id
      AND l.cartao_id = p_cartao_id
      AND l.regime = 'unico'
      AND l.deleted_at IS NULL
      AND (f.status IS NULL OR f.status <> 'paga')
  LOOP
    v_comp_antiga := v_lanc.competencia;
    v_comp_nova := public.calcular_competencia_cartao(v_lanc.data, p_novo_dia_fechamento, v_venc_final);

    IF v_comp_antiga IS NOT NULL THEN
      v_todas_faturas := array_append(v_todas_faturas, v_comp_antiga);
    END IF;
    v_todas_faturas := array_append(v_todas_faturas, v_comp_nova);

    UPDATE public.lancamentos
    SET competencia = v_comp_nova,
        updated_at = NOW()
    WHERE id = v_lanc.id;
  END LOOP;

  -- 3. Juntar e desduplicar lista de competências afetadas
  v_todas_faturas := v_todas_faturas || v_faturas_novas;
  SELECT ARRAY_AGG(DISTINCT c) INTO v_todas_faturas
  FROM UNNEST(v_todas_faturas) AS c;

  -- 4. Recalcular todas as faturas afetadas (o recálculo protege faturas com status='paga')
  IF v_todas_faturas IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_todas_faturas LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 5. Auditoria
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
    'cartoes',
    p_cartao_id,
    'update_billing_closing_day',
    to_jsonb(v_cartao),
    jsonb_build_object(
      'novo_dia_fechamento', p_novo_dia_fechamento,
      'novo_dia_vencimento', v_venc_final,
      'faturas_recalculadas', v_todas_faturas
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'cartao_id', p_cartao_id,
    'novo_dia_fechamento', p_novo_dia_fechamento,
    'novo_dia_vencimento', v_venc_final,
    'faturas_recalculadas', v_todas_faturas
  );
END;
$$;

-- 5. REALINHAMENTO DE DADOS EXISTENTES (MIGRATION DE REALINHAMENTO):
-- Recalcula as competências de todas as parcelas e compras em aberto de acordo com a nova regra,
-- preservando 100% intactas quaisquer faturas com status = 'paga'.
DO $$
DECLARE
  v_c RECORD;
BEGIN
  FOR v_c IN SELECT id, workspace_id, dia_fechamento, dia_vencimento FROM public.cartoes WHERE deleted_at IS NULL LOOP
    PERFORM public.atualizar_fechamento_cartao_rpc(
      v_c.workspace_id,
      v_c.id,
      v_c.dia_fechamento,
      v_c.dia_vencimento,
      NULL
    );
  END LOOP;
END $$;
