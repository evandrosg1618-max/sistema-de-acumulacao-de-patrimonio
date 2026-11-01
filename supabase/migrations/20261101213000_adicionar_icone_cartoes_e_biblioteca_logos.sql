-- ==============================================================================
-- Migração: Adiciona coluna icone em cartoes e atualiza obter_cartoes_consolidado_rpc
-- ==============================================================================

-- 1. Adicionar coluna icone em cartoes
ALTER TABLE public.cartoes
ADD COLUMN IF NOT EXISTS icone text DEFAULT NULL;

-- 2. Atualizar obter_cartoes_consolidado_rpc para retornar icone
-- Atenção: para alterar o tipo de retorno TABLE(...), primeiro dropar a função
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
    ORDER BY f.cartao_id, f.competencia ASC
  ),
  totais_comprometidos AS (
    -- Faturas abertas e fechadas não pagas
    SELECT
      f.cartao_id,
      COALESCE(SUM(f.valor_total), 0) AS soma_faturas
    FROM public.faturas f
    WHERE f.workspace_id = p_workspace_id
      AND f.status <> 'paga'
    GROUP BY f.cartao_id
  ),
  parcelas_futuras AS (
    -- Parcelas com competência maior que faturas existentes ou avulsas não pagas
    SELECT
      p.cartao_id,
      COALESCE(SUM(p.valor), 0) AS soma_parcelas
    FROM public.parcelas p
    LEFT JOIN public.faturas f ON f.id = p.fatura_id
    WHERE p.workspace_id = p_workspace_id
      AND (p.status IS NULL OR p.status <> 'paga')
      AND (f.id IS NULL OR f.status <> 'paga')
    GROUP BY p.cartao_id
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
    COALESCE(fav.valor_total, 0.00) AS fatura_atual,
    COALESCE(tc.soma_faturas, 0.00) AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN fatura_a_vencer fav ON fav.cartao_id = c.id
  LEFT JOIN totais_comprometidos tc ON tc.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo = true)
  ORDER BY c.nome ASC;
END;
$$;

-- 3. Limpeza e migração de registros existentes:
-- Iniciar com os identificadores duráveis correspondentes ao nome de cada cartão existente
UPDATE public.cartoes
SET icone = CASE
  WHEN LOWER(nome) LIKE '%c6%' THEN 'c6'
  WHEN LOWER(nome) LIKE '%caixa%' THEN 'caixa'
  WHEN LOWER(nome) LIKE '%bradesco%' THEN 'bradesco'
  WHEN LOWER(nome) LIKE '%ita%' THEN 'itau'
  WHEN LOWER(nome) LIKE '%brasil%' OR LOWER(nome) LIKE '%bb%' THEN 'banco-do-brasil'
  WHEN LOWER(nome) LIKE '%sicoob%' THEN 'sicoob'
  WHEN LOWER(nome) LIKE '%sofisa%' THEN 'sofisa'
  WHEN LOWER(nome) LIKE '%btg%' THEN 'btg'
  WHEN LOWER(nome) LIKE '%xp%' THEN 'xp'
  ELSE icone
END
WHERE icone IS NULL OR icone LIKE 'blob:%' OR icone LIKE 'data:%';

-- 4. Normalizar contas existentes que tinham 'logo-sicoob', 'logo-bb', etc. ou URLs temporárias
UPDATE public.contas
SET icone = CASE
  WHEN icone = 'logo-sicoob' THEN 'sicoob'
  WHEN icone = 'logo-bb' THEN 'banco-do-brasil'
  WHEN icone = 'logo-itau' THEN 'itau'
  WHEN icone = 'logo-bradesco' THEN 'bradesco'
  WHEN icone = 'logo-c6' THEN 'c6'
  WHEN icone = 'logo-xp' THEN 'xp'
  WHEN icone = 'logo-btg' THEN 'btg'
  WHEN icone = 'logo-caixa' THEN 'caixa'
  WHEN icone = 'logo-sofisa' THEN 'sofisa'
  WHEN icone LIKE 'blob:%' OR icone LIKE 'data:%' THEN 'wallet'
  ELSE icone
END
WHERE icone IS NOT NULL;
