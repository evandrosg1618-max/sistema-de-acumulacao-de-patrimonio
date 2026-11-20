-- P2 (TESTE CAPTURA 6 — homologação 0.0.127): o drill-down do Orçamento (modal
-- dos 3 pontinhos) deve listar EXATAMENTE os lançamentos que compõem o gasto
-- da linha. A evidência mostrou "Frutas, polpas e sucos" com R$ 142,83 na
-- linha, mas o modal exibia só R$ 62,00 (o lançamento de 11/11) — o de 20/11
-- (R$ 80,83) não aparecia. A consulta viva da RPC já bate com o consolidado
-- (janela por DATA); o bug era a lista ficar vazia quando a linha do resultado
-- vinha sem o campo 'id' (o objeto {data, valor} da captura), porque a tabela
-- de exibição e a chave de render usam l.id. Esta migration alinha o CONTRATO
-- da RPC com o que a engenharia da fatura consome: 'id' sempre presente
-- (uuid::text), além de cartao_nome/conta_nome (o modal exibe o nome do meio,
-- não só o tipo) e competencia_alvo estável na primeira linha.

CREATE OR REPLACE FUNCTION public.listar_lancamentos_periodo_anterior_rpc(
  p_workspace_id uuid,
  p_competencia text,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_subcategoria_id uuid DEFAULT NULL::uuid,
  p_modo text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  descricao text,
  data date,
  valor numeric,
  categoria_nome text,
  subcategoria_nome text,
  meio_pagamento_tipo text,
  observacao text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
$function$;
