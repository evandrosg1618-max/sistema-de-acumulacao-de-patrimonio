-- TESTE CAPTURA 5 / T1 — Drill-down do Orçamento consistente com o total.
--
-- Problema: o consolidado (obter_orcamento_consolidado_rpc) soma os lançamentos
-- por DATA da compra (lan.data entre início/fim do mês) com filtros
-- tipo/afeta_orcamento/lancamento_pai_id/status != 'cancelado', mas a RPC do
-- drill-down (listar_lancamentos_periodo_anterior_rpc) filtrava por
-- COMPETÊNCIA. Lançamentos da captura nascem com competencia = '2026-12'
-- (ciclo de fatura do cartão) para compras de 19/11 — e por isso ficavam fora
-- da listagem, desalinhados do total exibido no card.
--
-- Correção: a listagem passa a usar o MESMO critério do consolidado (por DATA),
-- devolvendo descrição, data e valor de TODOS os lançamentos que compõem a
-- soma. Totais exibidos não mudam — a listagem passa a bater com eles.
--
-- A assinatura pública (p_workspace_id, p_competencia, p_categoria_id,
-- p_subcategoria_id, p_modo) é preservada: nenhuma chamada do app muda.

drop function if exists public.listar_lancamentos_periodo_anterior_rpc(uuid, text, uuid, uuid);
drop function if exists public.listar_lancamentos_periodo_anterior_rpc(uuid, text, uuid, uuid, text);

create function public.listar_lancamentos_periodo_anterior_rpc(
  p_workspace_id uuid,
  p_competencia text,
  p_categoria_id uuid default null,
  p_subcategoria_id uuid default null,
  p_modo text default null
)
returns table (
  id uuid,
  descricao text,
  data date,
  valor numeric,
  categoria_nome text,
  subcategoria_nome text,
  meio_pagamento_tipo text,
  observacao text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data_inicio date;
  v_data_fim date;
begin
  -- Janela pela DATA da compra, igual ao consolidado (mês da competência pedida)
  v_data_inicio := make_date(
    split_part(p_competencia, '-', 1)::int,
    split_part(p_competencia, '-', 2)::int,
    1
  );
  v_data_fim := (v_data_inicio + interval '1 month - 1 day')::date;

  return query
  select
    l.id,
    l.descricao,
    l.data,
    -- Mesma base de valor do consolidado: COALESCE(valor_proprio, valor)
    coalesce(l.valor_proprio, l.valor) as valor,
    c.nome as categoria_nome,
    sc.nome as subcategoria_nome,
    l.meio_pagamento_tipo::text,
    l.observacao
  from public.lancamentos l
  left join public.categorias c on c.id = l.categoria_id
  left join public.subcategorias sc on sc.id = l.subcategoria_id
  where l.workspace_id = p_workspace_id
    and l.deleted_at is null
    and l.tipo = 'despesa'
    and l.status_pagamento != 'cancelado'
    and (l.lancamento_pai_id is null or l.lancamento_pai_id = l.id)
    and coalesce(l.afeta_orcamento, true) = true
    and coalesce(l.valor_proprio, l.valor) > 0
    -- MESMO critério do consolidado: por DATA da compra (não por competência)
    and l.data >= v_data_inicio
    and l.data <= v_data_fim
    and (p_categoria_id is null or l.categoria_id = p_categoria_id)
    and (p_subcategoria_id is null or l.subcategoria_id = p_subcategoria_id)
  order by l.data asc, l.created_at asc;
end;
$$;
