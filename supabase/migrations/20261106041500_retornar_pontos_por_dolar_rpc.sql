-- Migration: 20261106041500_retornar_pontos_por_dolar_rpc.sql
-- Descrição: Atualiza obter_cartoes_consolidado_rpc para incluir a coluna pontos_por_dolar no retorno

DROP FUNCTION IF EXISTS public.obter_cartoes_consolidado_rpc(uuid, boolean);

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
  icone text,
  ativo boolean,
  pontos_por_dolar numeric,
  fatura_atual numeric,
  total_comprometido numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
      -- Comprometimento: soma dos SALDOS não pagos de todas as faturas
      SUM(GREATEST(fc.valor_total - fc.pago_efetivado, 0)) AS total_comprometido
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
$$;
