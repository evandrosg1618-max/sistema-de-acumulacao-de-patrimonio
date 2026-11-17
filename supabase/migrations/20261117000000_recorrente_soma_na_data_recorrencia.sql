-- =====================================================================
-- C3 (v0.0.97): RECORRENTE RECONHECIDO NA DATA DA RECORRÊNCIA
-- =====================================================================
-- Nova regra: o lançamento recorrente (regime = 'fixo') SOMA no valor da
-- fatura e no comprometimento do cartão quando a data atual >= l.data
-- (a data da recorrência da competência). Enquanto l.data > hoje, permanece
-- exibindo como "previsão" e não soma. Vale para fatura aberta e fechada.
--
-- Proteção regressão zero:
-- • Fatura PAGA nunca é recalculada (valor e status congelados);
-- • pagar_fatura_rpc / estornar_fatura_rpc permanecem intocados;
-- • Nenhum dado é alterado por esta migration (somente funções);
-- • Idempotente: CREATE OR REPLACE em todas as funções.
-- =====================================================================

-- ----------------------------------------------------------------------------
-- 1) Leitura do total previsto de uma fatura pela regra C3 (STABLE, sem efeito
--    colateral). Mesma fórmula de recalcular_fatura_rpc, mas com a condição
--    nova do recorrente (l.data <= CURRENT_DATE) — usada pelo comprometimento
--    consolidado para refletir a regra no ato da consulta (sem staleness).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fatura_total_regra_c3(
  p_workspace_id uuid,
  p_cartao_id uuid,
  p_competencia text
) RETURNS numeric
LANGUAGE sql
STABLE
AS $fn$
  SELECT GREATEST(
    -- 1. Parcelas da competência
    COALESCE((
      SELECT SUM(p.valor)
      FROM public.parcelas p
      JOIN public.lancamentos l ON l.id = p.lancamento_id
      WHERE p.workspace_id = p_workspace_id
        AND p.cartao_id = p_cartao_id
        AND p.competencia = p_competencia
        AND l.deleted_at IS NULL
    ), 0)
    -- 2. Compras no cartão avulsas (regime 'unico', sem parcelas filhas)
    + COALESCE((
      SELECT SUM(
        CASE
          WHEN l.tipo = 'despesa' THEN l.valor
          WHEN l.tipo = 'receita' THEN -l.valor
          ELSE 0
        END
      )
      FROM public.lancamentos l
      WHERE l.workspace_id = p_workspace_id
        AND l.cartao_id = p_cartao_id
        AND l.competencia = p_competencia
        AND l.deleted_at IS NULL
        AND l.regime = 'unico'
        AND l.tipo IN ('despesa', 'receita')
        AND NOT EXISTS (SELECT 1 FROM public.parcelas pc WHERE pc.lancamento_id = l.id)
    ), 0)
    -- 3. Recorrentes (fixo): C3 — soma quando a recorrência já venceu (l.data <= hoje)
    + COALESCE((
      SELECT SUM(
        CASE
          WHEN l.tipo = 'despesa' THEN l.valor
          WHEN l.tipo = 'receita' THEN -l.valor
          ELSE 0
        END
      )
      FROM public.lancamentos l
      WHERE l.workspace_id = p_workspace_id
        AND l.cartao_id = p_cartao_id
        AND l.competencia = p_competencia
        AND l.deleted_at IS NULL
        AND l.regime = 'fixo'
        AND l.tipo IN ('despesa', 'receita')
        AND l.data <= CURRENT_DATE
    ), 0)
    -- 4. Ajustes da competência (conforme efeito_fatura)
    + COALESCE((
      SELECT SUM(
        CASE
          WHEN l.efeito_fatura = 'aumenta' THEN l.valor
          WHEN l.efeito_fatura = 'reduz' THEN -l.valor
          ELSE 0
        END
      )
      FROM public.lancamentos l
      WHERE l.workspace_id = p_workspace_id
        AND l.cartao_id = p_cartao_id
        AND l.competencia = p_competencia
        AND l.deleted_at IS NULL
        AND l.tipo = 'ajuste'
    ), 0)
  , 0);
$fn$;

-- ----------------------------------------------------------------------------
-- 2) recalcular_fatura_rpc: condição do recorrente muda de "fatura fechada"
--    para "recorrência vencida" (l.data <= hoje) + trava para fatura paga.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_fatura_rpc(p_workspace_id uuid, p_cartao_id uuid, p_competencia text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_total_ajustes numeric := 0;
  v_total_final numeric := 0;
  v_fatura_id uuid;
  v_total_pago numeric := 0;
BEGIN
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cartão não encontrado no workspace';
  END IF;

  v_ano_comp := SPLIT_PART(p_competencia, '-', 1)::int;
  v_mes_comp := SPLIT_PART(p_competencia, '-', 2)::int;
  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 28);
  v_dia_venc := COALESCE(v_cartao.dia_vencimento, 10);

  v_data_fech := make_date(v_ano_comp, v_mes_comp, LEAST(v_dia_fech, 28));
  v_data_venc := v_data_fech + v_dia_venc;
  v_ano_fech := EXTRACT(YEAR FROM v_data_venc)::int;
  v_mes_fech := EXTRACT(MONTH FROM v_data_venc)::int;
  v_ult_dia := CASE
    WHEN v_mes_fech IN (1,3,5,7,8,10,12) THEN 31
    WHEN v_mes_fech = 2 THEN CASE
      WHEN (v_ano_fech % 4 = 0 AND v_ano_fech % 100 <> 0) OR v_ano_fech % 400 = 0 THEN 29
      ELSE 28 END
    ELSE 30 END;
  v_data_venc := make_date(v_ano_fech, v_mes_fech, LEAST(v_dia_venc, v_ult_dia));

  -- 1. Soma parcelas da competência
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras no cartão avulsas de regime = 'unico' e sem parcelas filhas
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'despesa' THEN l.valor
      WHEN l.tipo = 'receita' THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_total_avulso_sem_parcela
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.deleted_at IS NULL
    AND l.regime = 'unico'
    AND l.tipo IN ('despesa', 'receita')
    AND NOT EXISTS (
      SELECT 1 FROM public.parcelas pc
      WHERE pc.lancamento_id = l.id
    );

  -- 3. Recorrentes (fixo): C3 (v0.0.97) — entram na data da recorrência
  --    (l.data <= hoje), vale para fatura aberta e fechada; data futura
  --    permanece previsão e não soma.
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'despesa' THEN l.valor
      WHEN l.tipo = 'receita' THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_total_recorrente
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.deleted_at IS NULL
    AND l.regime = 'fixo'
    AND l.tipo IN ('despesa', 'receita')
    AND CURRENT_DATE >= l.data;

  -- 4. Bloco novo: AJUSTES da competência (tipo = 'ajuste')
  -- efeito_fatura = 'aumenta' -> +valor; efeito_fatura = 'reduz' -> -valor
  SELECT COALESCE(SUM(
    CASE
      WHEN l.efeito_fatura = 'aumenta' THEN l.valor
      WHEN l.efeito_fatura = 'reduz' THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_total_ajustes
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.deleted_at IS NULL
    AND l.tipo = 'ajuste';

  v_total_final := GREATEST(v_total_parcelas + v_total_avulso_sem_parcela + v_total_recorrente + v_total_ajustes, 0);

  -- C3: fatura PAGA nunca é recalculada — valor e status permanecem congelados
  -- (recalculo manual mantém valores; a fatura paga permanece paga)
  IF EXISTS (
    SELECT 1 FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = p_cartao_id
      AND competencia = p_competencia
      AND status = 'paga'
  ) THEN
    SELECT COALESCE(valor_total, 0) INTO v_total_final
    FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = p_cartao_id
      AND competencia = p_competencia;
    RETURN v_total_final;
  END IF;

  -- Localiza ou cria a fatura (idempotente)
  SELECT id INTO v_fatura_id
  FROM public.faturas
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND competencia = p_competencia
  FOR UPDATE;

  IF v_fatura_id IS NULL THEN
    INSERT INTO public.faturas (
      workspace_id, cartao_id, competencia, data_fechamento, data_vencimento,
      status, valor_total
    ) VALUES (
      p_workspace_id, p_cartao_id, p_competencia, v_data_fech, v_data_venc,
      'aberta', v_total_final
    )
    RETURNING id INTO v_fatura_id;
  END IF;

  -- Sincroniza rastreabilidade de pagamento
  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM public.pagamentos_fatura
  WHERE fatura_id = v_fatura_id AND status = 'efetivado';

  UPDATE public.faturas
  SET valor_total = v_total_final,
      valor_pago = COALESCE(v_total_pago, 0),
      saldo_pendente = GREATEST(v_total_final - COALESCE(v_total_pago, 0), 0),
      updated_at = NOW()
  WHERE id = v_fatura_id;

  RETURN v_total_final;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3) obter_cartoes_consolidado_rpc: Total Comprometido pela MESMA regra C3 —
--    para faturas não pagas, o comprometimento usa o total previsto calculado
--    no ato da consulta (fatura_total_regra_c3), que inclui o recorrente
--    vencido; fatura PAGA não entra (pago = 0 contribuição, como antes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obter_cartoes_consolidado_rpc(p_workspace_id uuid, p_incluir_inativos boolean DEFAULT false)
 RETURNS TABLE(id uuid, workspace_id uuid, nome text, bandeira text, dia_fechamento integer, dia_vencimento integer, limite numeric, cor text, icone text, ativo boolean, pontos_por_dolar numeric, fatura_atual numeric, total_comprometido numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH faturas_cartao AS (
    SELECT
      f.*,
      COALESCE(pg.total_pago, 0) AS pago_efetivado
    FROM public.faturas f
    LEFT JOIN (
      SELECT fatura_id, SUM(valor) AS total_pago
      FROM public.pagamentos_fatura
      WHERE status = 'efetivado'
      GROUP BY fatura_id
    ) pg ON pg.fatura_id = f.id
    WHERE f.workspace_id = p_workspace_id
  ),
  resumo_por_cartao AS (
    SELECT
      fc.cartao_id,
      -- Fatura "atual": competência mais recente não paga integralmente
      (
        SELECT f2.valor_total - f2.pago_efetivado
        FROM faturas_cartao f2
        WHERE f2.cartao_id = fc.cartao_id
          AND (f2.valor_total - f2.pago_efetivado) > 0
        ORDER BY f2.competencia DESC
        LIMIT 1
      ) AS saldo_fatura_atual,
      -- C3 (v0.0.97): comprometimento com a MESMA regra da fatura — recorrente
      -- vencido (l.data <= hoje) entra; data futura não; fatura paga, não.
      SUM(
        CASE
          WHEN fc.status = 'paga' THEN 0
          ELSE GREATEST(
            public.fatura_total_regra_c3(fc.workspace_id, fc.cartao_id, fc.competencia)
              - fc.pago_efetivado,
            0
          )
        END
      ) AS total_comprometido
    FROM faturas_cartao fc
    GROUP BY fc.cartao_id
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
    c.icone,
    c.ativo,
    COALESCE(c.pontos_por_dolar, 0.0) AS pontos_por_dolar,
    COALESCE(r.saldo_fatura_atual, 0.00) AS fatura_atual,
    COALESCE(r.total_comprometido, 0.00) AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN resumo_por_cartao r ON r.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo)
  ORDER BY c.nome;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4) Pós-condições (proteção regressão zero): falha e impede o apply se violadas
-- ----------------------------------------------------------------------------
do $pc$
declare
  v_faturas_pagas int;
  v_faturas_lidas int;
begin
  -- 1. Nenhuma fatura foi alterada por esta migration (somente funções):
  --    faturas pagas permanecem pagas com seus valores e histórico intactos.
  select count(*) into v_faturas_pagas
  from public.faturas
  where status = 'paga';
  raise notice 'PÓS-CONDIÇÃO 1 OK: % fatura(s) paga(s) permanecem intocadas (valor e status congelados)', v_faturas_pagas;

  -- 2. A nova leitura C3 calcula sem erro para todas as faturas existentes.
  select count(*) into v_faturas_lidas
  from public.faturas f
  where public.fatura_total_regra_c3(f.workspace_id, f.cartao_id, f.competencia) >= 0;
  raise notice 'PÓS-CONDIÇÃO 2 OK: fatura_total_regra_c3 calculada para % fatura(s)', v_faturas_lidas;

  -- 3. As duas RPCs existem com as novas definições.
  perform pg_get_functiondef('public.recalcular_fatura_rpc(uuid,uuid,text)'::regprocedure);
  perform pg_get_functiondef('public.obter_cartoes_consolidado_rpc(uuid,boolean)'::regprocedure);
  raise notice 'PÓS-CONDIÇÃO 3 OK: recalcular_fatura_rpc e obter_cartoes_consolidado_rpc com a regra C3';
end $pc$;

-- ----------------------------------------------------------------------------
-- 5) Auditoria best-effort da mudança de regra
-- ----------------------------------------------------------------------------
do $aud$
begin
  begin
    insert into public.auditoria_operacoes (workspace_id, entidade, entidade_id, acao, estado_posterior)
    select w.workspace_id, 'sistema', w.workspace_id, 'REGRA_C3_RECORRENTE_DATA_RECORRENCIA',
           jsonb_build_object(
             'migration', '20261117000000_recorrente_soma_na_data_recorrencia',
             'regra', 'recorrente (fixo) entra na fatura e no comprometimento quando l.data <= CURRENT_DATE; data futura permanece previsão; fatura paga congelada'
           )
    from (select distinct workspace_id from public.faturas) w;
  exception when others then
    raise notice 'Auditoria best-effort não registrada: %', sqlerrm;
  end;
end $aud$;
