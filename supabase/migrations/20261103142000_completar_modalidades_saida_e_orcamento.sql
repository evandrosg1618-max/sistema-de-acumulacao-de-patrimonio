-- ==============================================================================
-- Migration: 20261103142000_completar_modalidades_saida_e_orcamento.sql
-- Descrição:
-- 1. Garante colunas de modalidades em public.lancamentos
-- 2. Backfill definitivo de modalidade_saida, valor_proprio, valor_terceiros, afeta_resultado, afeta_orcamento
-- 3. Atualiza RPC editar_lancamento_atomico_rpc (com 20 parâmetros e wrapper 15)
-- 4. Atualiza RPC obter_orcamento_consolidado_rpc removendo qualquer filtro por competencia para despesas
--    e somando estritamente por l.data e valor_proprio > 0 onde afeta_orcamento = true
-- 5. Atualiza RPC listar_lancamentos_periodo_anterior_rpc para suportar modo atual/anterior por l.data
-- 6. Atualiza RPC calcular_regime_competencia_integral_rpc garantindo regras exatas do Resumo do Período
-- ==============================================================================

-- 1. Colunas em public.lancamentos (idempotente)
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS modalidade_saida TEXT DEFAULT 'compra_propria',
  ADD COLUMN IF NOT EXISTS valor_proprio NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_terceiros NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS afeta_resultado BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS afeta_orcamento BOOLEAN DEFAULT true;

-- 2. Backfill em public.lancamentos
UPDATE public.lancamentos
SET modalidade_saida = 'compra_propria'
WHERE modalidade_saida IS NULL;

UPDATE public.lancamentos
SET valor_proprio = valor
WHERE tipo = 'despesa' AND (valor_proprio IS NULL OR modalidade_saida = 'compra_propria');

UPDATE public.lancamentos
SET valor_terceiros = 0.00
WHERE tipo = 'despesa' AND (valor_terceiros IS NULL OR modalidade_saida = 'compra_propria');

UPDATE public.lancamentos
SET afeta_resultado = true
WHERE tipo = 'despesa' AND modalidade_saida = 'compra_propria' AND afeta_resultado IS NULL;

UPDATE public.lancamentos
SET afeta_orcamento = true
WHERE tipo = 'despesa' AND modalidade_saida = 'compra_propria' AND afeta_orcamento IS NULL;

UPDATE public.lancamentos
SET afeta_resultado = true
WHERE tipo = 'receita' AND afeta_resultado IS NULL;

-- 3. RPC editar_lancamento_atomico_rpc (20 parâmetros)
CREATE OR REPLACE FUNCTION public.editar_lancamento_atomico_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data date,
  p_meio_pagamento_tipo text,
  p_conta_origem_id uuid DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_cartao_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL,
  p_status_pagamento text DEFAULT 'pendente',
  p_observacao text DEFAULT NULL,
  p_quantidade_parcelas integer DEFAULT 1,
  p_user_id uuid DEFAULT NULL,
  p_modalidade_saida text DEFAULT 'compra_propria',
  p_valor_proprio numeric DEFAULT NULL,
  p_valor_terceiros numeric DEFAULT NULL,
  p_afeta_resultado boolean DEFAULT NULL,
  p_afeta_orcamento boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_antigo RECORD;
  v_novo_valor NUMERIC;
  v_diferenca NUMERIC;
  v_nova_competencia text;
  v_cartao RECORD;
  v_dia_fech integer;
  v_dia_venc integer;
  v_origem_antiga RECORD;
  v_destino_antigo RECORD;
  v_origem_nova RECORD;
  v_destino_novo RECORD;
  v_modalidade text;
  v_valor_proprio_final numeric;
  v_valor_terceiros_final numeric;
  v_afeta_res_final boolean;
  v_afeta_orc_final boolean;
BEGIN
  -- 1. Travar lançamento para leitura/escrita atômica
  SELECT * INTO v_antigo
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado.');
  END IF;

  IF v_antigo.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento excluído não pode ser alterado.');
  END IF;

  v_novo_valor := COALESCE(p_valor, v_antigo.valor);
  IF v_novo_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'O valor deve ser maior que zero.');
  END IF;

  -- 2. Tratamento das dimensões de modalidade da saída para despesas
  IF v_antigo.tipo = 'despesa' THEN
    v_modalidade := COALESCE(p_modalidade_saida, v_antigo.modalidade_saida, 'compra_propria');

    IF v_modalidade = 'compra_compartilhada' THEN
      v_valor_proprio_final := COALESCE(p_valor_proprio, v_antigo.valor_proprio, v_novo_valor);
      IF v_valor_proprio_final <= 0 OR v_valor_proprio_final >= v_novo_valor THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Em compra compartilhada, o valor próprio deve ser maior que zero e menor que o valor total.');
      END IF;
      v_valor_terceiros_final := ROUND((v_novo_valor - v_valor_proprio_final)::numeric, 2);
      v_afeta_res_final := true;
      v_afeta_orc_final := true;

    ELSIF v_modalidade = 'compra_terceiros' THEN
      v_valor_proprio_final := 0.00;
      v_valor_terceiros_final := v_novo_valor;
      v_afeta_res_final := false;
      v_afeta_orc_final := false;

    ELSIF v_modalidade = 'emprestimo_terceiros' THEN
      IF p_meio_pagamento_tipo = 'CARTAO' THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Não é permitido cartão de crédito para Empréstimo a Terceiros.');
      END IF;
      v_valor_proprio_final := 0.00;
      v_valor_terceiros_final := v_novo_valor;
      v_afeta_res_final := false;
      v_afeta_orc_final := false;

    ELSE -- 'compra_propria'
      v_modalidade := 'compra_propria';
      v_valor_proprio_final := v_novo_valor;
      v_valor_terceiros_final := 0.00;
      v_afeta_res_final := true;
      v_afeta_orc_final := true;
    END IF;
  ELSE
    -- Receita ou transferência
    v_modalidade := 'compra_propria';
    v_valor_proprio_final := v_novo_valor;
    v_valor_terceiros_final := 0.00;
    v_afeta_res_final := COALESCE(p_afeta_resultado, v_antigo.afeta_resultado, true);
    v_afeta_orc_final := false;
  END IF;

  -- 3. Calcular competência do lançamento
  v_nova_competencia := TO_CHAR(p_data, 'YYYY-MM');
  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    SELECT dia_fechamento, dia_vencimento INTO v_cartao
    FROM public.cartoes
    WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

    IF FOUND THEN
      v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
      v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
      v_nova_competencia := public.calcular_competencia_cartao(p_data, v_dia_fech, v_dia_venc);
    END IF;
  END IF;

  -- 4. Reverter movimentações de saldo antigas se o lançamento antigo estava pago
  IF v_antigo.status_pagamento = 'pago' AND v_antigo.meio_pagamento_tipo != 'CARTAO' THEN
    IF v_antigo.tipo = 'despesa' AND v_antigo.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
    ELSIF v_antigo.tipo = 'receita' AND v_antigo.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
    ELSIF v_antigo.tipo = 'transferencia' AND v_antigo.conta_origem_id IS NOT NULL AND v_antigo.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;

      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_destino_id AND workspace_id = p_workspace_id;
    END IF;

    DELETE FROM public.movimentacoes_conta WHERE lancamento_id = p_lancamento_id;
  END IF;

  -- 5. Atualizar o lançamento
  UPDATE public.lancamentos
  SET descricao = TRIM(p_descricao),
      valor = v_novo_valor,
      data = p_data,
      competencia = v_nova_competencia,
      meio_pagamento_tipo = p_meio_pagamento_tipo,
      conta_origem_id = p_conta_origem_id,
      conta_destino_id = p_conta_destino_id,
      cartao_id = p_cartao_id,
      categoria_id = p_categoria_id,
      subcategoria_id = p_subcategoria_id,
      status_pagamento = CASE WHEN p_meio_pagamento_tipo = 'CARTAO' THEN 'pendente' ELSE p_status_pagamento END,
      data_pagamento = CASE WHEN p_status_pagamento = 'pago' AND p_meio_pagamento_tipo != 'CARTAO' THEN p_data ELSE NULL END,
      observacao = p_observacao,
      quantidade_parcelas = COALESCE(p_quantidade_parcelas, 1),
      modalidade_saida = v_modalidade,
      valor_proprio = v_valor_proprio_final,
      valor_terceiros = v_valor_terceiros_final,
      afeta_resultado = v_afeta_res_final,
      afeta_orcamento = v_afeta_orc_final,
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- 6. Aplicar movimentações de saldo novas se o status for pago
  IF p_status_pagamento = 'pago' AND p_meio_pagamento_tipo != 'CARTAO' THEN
    IF v_antigo.tipo = 'despesa' AND p_conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_novo_valor,
          updated_at = NOW()
      WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

      INSERT INTO public.movimentacoes_conta (
        workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
      ) VALUES (
        p_workspace_id, p_conta_origem_id, p_lancamento_id, 'saida', v_novo_valor, p_data, TRIM(p_descricao), p_user_id
      );
    ELSIF v_antigo.tipo = 'receita' AND p_conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_novo_valor,
          updated_at = NOW()
      WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

      INSERT INTO public.movimentacoes_conta (
        workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
      ) VALUES (
        p_workspace_id, p_conta_origem_id, p_lancamento_id, 'entrada', v_novo_valor, p_data, TRIM(p_descricao), p_user_id
      );
    ELSIF v_antigo.tipo = 'transferencia' AND p_conta_origem_id IS NOT NULL AND p_conta_destino_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_novo_valor,
          updated_at = NOW()
      WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_novo_valor,
          updated_at = NOW()
      WHERE id = p_conta_destino_id AND workspace_id = p_workspace_id;

      INSERT INTO public.movimentacoes_conta (
        workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
      ) VALUES
      (p_workspace_id, p_conta_origem_id, p_lancamento_id, 'transferencia_saida', v_novo_valor, p_data, TRIM(p_descricao), p_user_id),
      (p_workspace_id, p_conta_destino_id, p_lancamento_id, 'transferencia_entrada', v_novo_valor, p_data, TRIM(p_descricao), p_user_id);
    END IF;
  END IF;

  -- 7. Recalcular fatura se aplicável
  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_cartao_id, v_nova_competencia);
  END IF;
  IF v_antigo.cartao_id IS NOT NULL AND v_antigo.competencia != v_nova_competencia THEN
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_antigo.cartao_id, v_antigo.competencia);
  END IF;

  -- 8. Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id,
    'lancamentos',
    p_lancamento_id,
    'update_atomico_modalidade',
    to_jsonb(v_antigo),
    jsonb_build_object(
      'id', p_lancamento_id,
      'descricao', p_descricao,
      'valor', v_novo_valor,
      'modalidade_saida', v_modalidade,
      'valor_proprio', v_valor_proprio_final,
      'valor_terceiros', v_valor_terceiros_final,
      'afeta_resultado', v_afeta_res_final,
      'afeta_orcamento', v_afeta_orc_final
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Lançamento atualizado com sucesso.',
    'id', p_lancamento_id,
    'valor', v_novo_valor,
    'modalidade_saida', v_modalidade,
    'valor_proprio', v_valor_proprio_final,
    'valor_terceiros', v_valor_terceiros_final
  );
END;
$$;

-- Wrapper de 15 parâmetros para compatibilidade com chamadas legadas
DROP FUNCTION IF EXISTS public.editar_lancamento_atomico_rpc(uuid, uuid, text, numeric, date, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, uuid);
DROP FUNCTION IF EXISTS public.listar_lancamentos_periodo_anterior_rpc(uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.editar_lancamento_atomico_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data date,
  p_meio_pagamento_tipo text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_cartao_id uuid,
  p_categoria_id uuid,
  p_subcategoria_id uuid,
  p_status_pagamento text,
  p_observacao text,
  p_quantidade_parcelas integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.editar_lancamento_atomico_rpc(
    p_workspace_id => p_workspace_id,
    p_lancamento_id => p_lancamento_id,
    p_descricao => p_descricao,
    p_valor => p_valor,
    p_data => p_data,
    p_meio_pagamento_tipo => p_meio_pagamento_tipo,
    p_conta_origem_id => p_conta_origem_id,
    p_conta_destino_id => p_conta_destino_id,
    p_cartao_id => p_cartao_id,
    p_categoria_id => p_categoria_id,
    p_subcategoria_id => p_subcategoria_id,
    p_status_pagamento => p_status_pagamento,
    p_observacao => p_observacao,
    p_quantidade_parcelas => p_quantidade_parcelas,
    p_user_id => p_user_id,
    p_modalidade_saida => NULL,
    p_valor_proprio => NULL,
    p_valor_terceiros => NULL,
    p_afeta_resultado => NULL,
    p_afeta_orcamento => NULL
  );
END;
$$;

-- 4. RPC obter_orcamento_consolidado_rpc:
-- FONTE DA VERDADE DEFINITIVA: l.data no período (mês da competência p_competencia),
-- somando COALESCE(l.valor_proprio, l.valor) onde afeta_orcamento = true e valor_proprio > 0.
-- NENHUM filtro por l.competencia para despesas!
CREATE OR REPLACE FUNCTION public.obter_orcamento_consolidado_rpc(
  p_workspace_id uuid,
  p_competencia text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano INT;
  v_mes INT;
  v_comp_anterior TEXT;
  v_ano_ant INT;
  v_mes_ant INT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_data_inicio_ant DATE;
  v_data_fim_ant DATE;
  v_tem_limites BOOLEAN := false;
  v_tem_limites_anterior BOOLEAN := false;
  v_total_efetivado NUMERIC := 0.00;
  v_total_limite NUMERIC := 0.00;
  v_categorias_json JSONB := '[]'::jsonb;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RETURN jsonb_build_object(
      'competencia', p_competencia,
      'competencia_anterior', '',
      'tem_limites', false,
      'tem_limites_anterior', false,
      'despesas_efetivado', 0.00,
      'despesas_limite', 0.00,
      'categorias', '[]'::jsonb
    );
  END IF;

  v_ano := split_part(p_competencia, '-', 1)::INT;
  v_mes := split_part(p_competencia, '-', 2)::INT;
  v_data_inicio := make_date(v_ano, v_mes, 1);
  v_data_fim := (v_data_inicio + interval '1 month - 1 day')::date;

  -- Calcular competência anterior e suas datas
  IF v_mes = 1 THEN
    v_ano_ant := v_ano - 1;
    v_mes_ant := 12;
  ELSE
    v_ano_ant := v_ano;
    v_mes_ant := v_mes - 1;
  END IF;
  v_comp_anterior := v_ano_ant || '-' || lpad(v_mes_ant::text, 2, '0');
  v_data_inicio_ant := make_date(v_ano_ant, v_mes_ant, 1);
  v_data_fim_ant := (v_data_inicio_ant + interval '1 month - 1 day')::date;

  -- Verificar limites
  SELECT EXISTS(
    SELECT 1 FROM public.orcamento_limites
    WHERE workspace_id = p_workspace_id
      AND competencia = p_competencia
      AND limite_definido > 0
  ) INTO v_tem_limites;

  SELECT EXISTS(
    SELECT 1 FROM public.orcamento_limites
    WHERE workspace_id = p_workspace_id
      AND competencia = v_comp_anterior
      AND limite_definido > 0
  ) INTO v_tem_limites_anterior;

  -- Tabelas temporárias de agregação
  CREATE TEMP TABLE temp_gastos_atual ON COMMIT DROP AS
  SELECT
    l.subcategoria_id,
    COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00) as gasto
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_orcamento, true) = true
    AND COALESCE(l.valor_proprio, l.valor) > 0
    AND l.data >= v_data_inicio
    AND l.data <= v_data_fim
  GROUP BY l.subcategoria_id;

  CREATE TEMP TABLE temp_gastos_anterior ON COMMIT DROP AS
  SELECT
    l.subcategoria_id,
    COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00) as gasto
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_orcamento, true) = true
    AND COALESCE(l.valor_proprio, l.valor) > 0
    AND l.data >= v_data_inicio_ant
    AND l.data <= v_data_fim_ant
  GROUP BY l.subcategoria_id;

  CREATE TEMP TABLE temp_recorrentes_periodo ON COMMIT DROP AS
  SELECT
    l.subcategoria_id,
    COALESCE(AVG(COALESCE(l.valor_proprio, l.valor)), 0.00) as valor_recorrente
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento != 'cancelado'
    AND l.serie_id IS NOT NULL
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_orcamento, true) = true
    AND l.data >= v_data_inicio
    AND l.data <= v_data_fim
  GROUP BY l.subcategoria_id;

  -- Total efetivado do período geral do orçamento
  SELECT COALESCE(SUM(gasto), 0.00) INTO v_total_efetivado FROM temp_gastos_atual;

  -- Total limites definidos
  SELECT COALESCE(SUM(limite_definido), 0.00) INTO v_total_limite
  FROM public.orcamento_limites
  WHERE workspace_id = p_workspace_id
    AND competencia = p_competencia;

  -- Montagem da árvore de categorias e subcategorias
  WITH subcat_calc AS (
    SELECT
      s.id,
      s.categoria_id,
      s.nome,
      s.classificacao,
      s.natureza,
      COALESCE(ol.limite_definido, 0.00) as limite_definido,
      COALESCE(ga.gasto, 0.00) as valor_efetivado,
      COALESCE(gant.gasto, 0.00) as gasto_periodo_anterior,
      COALESCE(rec.valor_recorrente, 0.00) as valor_recorrente_periodo
    FROM public.subcategorias s
    JOIN public.categorias c ON c.id = s.categoria_id AND c.tipo = 'despesa'
    LEFT JOIN public.orcamento_limites ol ON ol.subcategoria_id = s.id AND ol.competencia = p_competencia AND ol.workspace_id = p_workspace_id
    LEFT JOIN temp_gastos_atual ga ON ga.subcategoria_id = s.id
    LEFT JOIN temp_gastos_anterior gant ON gant.subcategoria_id = s.id
    LEFT JOIN temp_recorrentes_periodo rec ON rec.subcategoria_id = s.id
    WHERE s.workspace_id = p_workspace_id
      AND s.ativo = true
      AND s.deleted_at IS NULL
      AND (s.arquivado = false OR ol.limite_definido > 0 OR ga.gasto > 0)
    ORDER BY s.nome ASC
  ),
  cat_agg AS (
    SELECT
      c.id,
      c.nome,
      c.cor,
      c.icone,
      COALESCE(SUM(sc.limite_definido), 0.00) as limite_definido,
      COALESCE(SUM(sc.valor_efetivado), 0.00) as valor_efetivado,
      COALESCE(SUM(sc.gasto_periodo_anterior), 0.00) as gasto_periodo_anterior,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', sc.id,
            'nome', sc.nome,
            'classificacao', sc.classificacao,
            'natureza', sc.natureza,
            'limite_definido', sc.limite_definido,
            'valor_efetivado', sc.valor_efetivado,
            'gasto_periodo_anterior', sc.gasto_periodo_anterior,
            'valor_recorrente_periodo', sc.valor_recorrente_periodo
          ) ORDER BY sc.nome ASC
        ) FILTER (WHERE sc.id IS NOT NULL),
        '[]'::jsonb
      ) as subcategorias
    FROM public.categorias c
    LEFT JOIN subcat_calc sc ON sc.categoria_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND c.tipo = 'despesa'
      AND c.ativo = true
      AND c.deleted_at IS NULL
      AND (c.arquivado = false OR EXISTS (SELECT 1 FROM subcat_calc sc2 WHERE sc2.categoria_id = c.id AND (sc2.limite_definido > 0 OR sc2.valor_efetivado > 0)))
    GROUP BY c.id, c.nome, c.cor, c.icone
    ORDER BY c.nome ASC
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'nome', nome,
      'cor', cor,
      'icone', icone,
      'limite_definido', limite_definido,
      'valor_efetivado', valor_efetivado,
      'gasto_periodo_anterior', gasto_periodo_anterior,
      'subcategorias', subcategorias
    ) ORDER BY nome ASC
  ) INTO v_categorias_json
  FROM cat_agg;

  RETURN jsonb_build_object(
    'competencia', p_competencia,
    'competencia_anterior', v_comp_anterior,
    'tem_limites', v_tem_limites,
    'tem_limites_anterior', v_tem_limites_anterior,
    'despesas_efetivado', v_total_efetivado,
    'despesas_limite', v_total_limite,
    'categorias', COALESCE(v_categorias_json, '[]'::jsonb)
  );
END;
$$;

-- 5. RPC listar_lancamentos_periodo_anterior_rpc (com suporte ao parâmetro p_modo 'atual'/'anterior')
CREATE OR REPLACE FUNCTION public.listar_lancamentos_periodo_anterior_rpc(
  p_workspace_id uuid,
  p_competencia text,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL,
  p_modo text DEFAULT 'anterior'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano INT;
  v_mes INT;
  v_comp_alvo TEXT;
  v_ano_alvo INT;
  v_mes_alvo INT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_total NUMERIC := 0.00;
  v_lancamentos_json JSONB := '[]'::jsonb;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RETURN jsonb_build_object(
      'competencia_anterior', '',
      'competencia_alvo', '',
      'modo', p_modo,
      'data_inicio', '',
      'data_fim', '',
      'total', 0.00,
      'lancamentos', '[]'::jsonb
    );
  END IF;

  v_ano := split_part(p_competencia, '-', 1)::INT;
  v_mes := split_part(p_competencia, '-', 2)::INT;

  IF p_modo = 'atual' THEN
    v_comp_alvo := p_competencia;
    v_ano_alvo := v_ano;
    v_mes_alvo := v_mes;
  ELSE
    IF v_mes = 1 THEN
      v_ano_alvo := v_ano - 1;
      v_mes_alvo := 12;
    ELSE
      v_ano_alvo := v_ano;
      v_mes_alvo := v_mes - 1;
    END IF;
    v_comp_alvo := v_ano_alvo || '-' || lpad(v_mes_alvo::text, 2, '0');
  END IF;

  v_data_inicio := make_date(v_ano_alvo, v_mes_alvo, 1);
  v_data_fim := (v_data_inicio + interval '1 month - 1 day')::date;

  SELECT
    COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'data', l.data,
          'descricao', l.descricao,
          'valor', COALESCE(l.valor_proprio, l.valor),
          'valor_total', l.valor,
          'valor_proprio', l.valor_proprio,
          'valor_terceiros', l.valor_terceiros,
          'modalidade_saida', l.modalidade_saida,
          'tipo', l.tipo,
          'status_pagamento', l.status_pagamento,
          'meio_pagamento_tipo', l.meio_pagamento_tipo,
          'categoria_nome', c.nome,
          'subcategoria_nome', s.nome,
          'conta_nome', ct.nome,
          'cartao_nome', cr.nome
        ) ORDER BY l.data DESC, l.created_at DESC
      ),
      '[]'::jsonb
    )
  INTO v_total, v_lancamentos_json
  FROM public.lancamentos l
  LEFT JOIN public.categorias c ON c.id = l.categoria_id
  LEFT JOIN public.subcategorias s ON s.id = l.subcategoria_id
  LEFT JOIN public.contas ct ON ct.id = l.conta_origem_id
  LEFT JOIN public.cartoes cr ON cr.id = l.cartao_id
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_orcamento, true) = true
    AND COALESCE(l.valor_proprio, l.valor) > 0
    AND l.data >= v_data_inicio
    AND l.data <= v_data_fim
    AND (p_categoria_id IS NULL OR l.categoria_id = p_categoria_id)
    AND (p_subcategoria_id IS NULL OR l.subcategoria_id = p_subcategoria_id);

  RETURN jsonb_build_object(
    'competencia_anterior', v_comp_alvo,
    'competencia_alvo', v_comp_alvo,
    'modo', p_modo,
    'data_inicio', v_data_inicio::text,
    'data_fim', v_data_fim::text,
    'total', v_total,
    'lancamentos', v_lancamentos_json
  );
END;
$$;

-- Wrapper de 4 parâmetros para manter compatibilidade
CREATE OR REPLACE FUNCTION public.listar_lancamentos_periodo_anterior_rpc(
  p_workspace_id uuid,
  p_competencia text,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.listar_lancamentos_periodo_anterior_rpc(
    p_workspace_id => p_workspace_id,
    p_competencia => p_competencia,
    p_categoria_id => p_categoria_id,
    p_subcategoria_id => p_subcategoria_id,
    p_modo => 'anterior'
  );
END;
$$;

-- Garantir concessões
GRANT EXECUTE ON FUNCTION public.editar_lancamento_atomico_rpc(uuid, uuid, text, numeric, date, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, uuid, text, numeric, numeric, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.editar_lancamento_atomico_rpc(uuid, uuid, text, numeric, date, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_orcamento_consolidado_rpc(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_lancamentos_periodo_anterior_rpc(uuid, text, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_lancamentos_periodo_anterior_rpc(uuid, text, uuid, uuid) TO authenticated, service_role;
