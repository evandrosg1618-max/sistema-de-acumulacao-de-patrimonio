-- Migration Build 5: Fixos (Lançamentos Recorrentes), Materialização Preguiçosa e Projeções
-- Requisitos PRD Build 5:
-- 1. Unicidade garantida por índice único no banco (workspace_id + serie_id + competencia)
-- 2. Suporte a periodicidade: mensal, semestral, anual
-- 3. Suporte a prazo: determinado ou indeterminado
-- 4. RPC idempotente de materialização preguiçosa no PostgreSQL
-- 5. Projeção até 31/12 do ano subsequente para prazo indeterminado
-- 6. Escopos de alteração e exclusão: 'este', 'este_e_proximos', 'todos' com proteção contra ocorrências pagas
-- 7. RPC de renovação de projeção para séries indeterminadas

-- 1. Atualizar constraints da tabela series_lancamentos
ALTER TABLE public.series_lancamentos
  DROP CONSTRAINT IF EXISTS series_lancamentos_periodicidade_check;

ALTER TABLE public.series_lancamentos
  ADD CONSTRAINT series_lancamentos_periodicidade_check
  CHECK (periodicidade = ANY (ARRAY['mensal'::text, 'semestral'::text, 'anual'::text, 'semanal'::text]));

ALTER TABLE public.series_lancamentos
  DROP CONSTRAINT IF EXISTS series_lancamentos_tipo_check;

ALTER TABLE public.series_lancamentos
  ADD CONSTRAINT series_lancamentos_tipo_check
  CHECK (tipo = ANY (ARRAY['despesa'::text, 'receita'::text, 'transferencia'::text]));

-- Adicionar colunas de suporte à série fixa caso não existam
ALTER TABLE public.series_lancamentos
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER,
  ADD COLUMN IF NOT EXISTS valor NUMERIC,
  ADD COLUMN IF NOT EXISTS meio_pagamento_tipo TEXT DEFAULT 'CONTA',
  ADD COLUMN IF NOT EXISTS conta_origem_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conta_destino_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategoria_id UUID REFERENCES public.subcategorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS data_limite_projecao DATE;

-- Adicionar coluna na tabela lancamentos para distinguir previsão x realizado
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS natureza_previsao BOOLEAN NOT NULL DEFAULT false;

-- Coluna para marcar exceção de série (desvinculada do valor/data padrão da série)
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS eh_excecao BOOLEAN NOT NULL DEFAULT false;

-- 2. Garantir unicidade física contra duplicação de competência na mesma série
-- Ocorrências não excluídas não podem ter a mesma competência dentro do mesmo workspace e série
CREATE UNIQUE INDEX IF NOT EXISTS uq_lancamentos_workspace_serie_comp
  ON public.lancamentos (workspace_id, serie_id, competencia)
  WHERE serie_id IS NOT NULL AND deleted_at IS NULL;

-- 3. Função auxiliar para adicionar periodicidade a uma data
CREATE OR REPLACE FUNCTION public.avancar_data_periodicidade(
  p_data date,
  p_periodicidade text,
  p_passos integer DEFAULT 1
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_res date;
  v_dia_orig int;
  v_meses_adicionar int;
BEGIN
  IF p_periodicidade = 'semestral' THEN
    v_meses_adicionar := 6 * p_passos;
  ELSIF p_periodicidade = 'anual' THEN
    v_meses_adicionar := 12 * p_passos;
  ELSIF p_periodicidade = 'semanal' THEN
    RETURN p_data + (7 * p_passos);
  ELSE
    -- padrão mensal
    v_meses_adicionar := 1 * p_passos;
  END IF;

  v_dia_orig := EXTRACT(DAY FROM p_data)::int;
  -- Adiciona meses e ajusta o dia caso o mês de destino tenha menos dias
  v_res := (DATE_TRUNC('month', p_data) + (v_meses_adicionar || ' months')::interval)::date;
  v_res := v_res + LEAST(
    v_dia_orig - 1,
    (EXTRACT(DAY FROM (DATE_TRUNC('month', v_res) + INTERVAL '1 month - 1 day'))::int) - 1
  );

  RETURN v_res;
END;
$$;

-- 4. Função auxiliar para calcular data limite da janela de projeção (31/12 do ano subsequente)
CREATE OR REPLACE FUNCTION public.calcular_limite_projecao_fixo(p_data_inicio date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ano int;
BEGIN
  v_ano := EXTRACT(YEAR FROM p_data_inicio)::int;
  -- Até 31 de dezembro do ano subsequente ao ano de início da janela
  RETURN MAKE_DATE(v_ano + 1, 12, 31);
END;
$$;

-- 5. RPC Atômica para Criar uma Série Fixa e gerar suas projeções até o limite
CREATE OR REPLACE FUNCTION public.criar_serie_fixa_rpc(
  p_workspace_id uuid,
  p_tipo text,
  p_descricao text,
  p_valor numeric,
  p_data_inicio date,
  p_prazo text, -- 'indeterminado' | 'determinado'
  p_periodicidade text, -- 'mensal' | 'semestral' | 'anual'
  p_quantidade_total integer DEFAULT NULL,
  p_meio_pagamento_tipo text DEFAULT 'CONTA',
  p_conta_origem_id uuid DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_cartao_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_pago_primeira boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_serie_id uuid;
  v_data_limite date;
  v_data_cur date;
  v_comp_cur text;
  v_cartao RECORD;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_passo int := 1;
  v_total_alvo int;
  v_primeira boolean := true;
  v_deve_materializar boolean;
  v_hoje date := CURRENT_DATE;
  v_natureza_prev boolean;
  v_status_pagamento text;
  v_data_pagamento date;
  v_lanc_criado RECORD;
  v_ocorrencias_geradas int := 0;
  v_proxima_comp text := NULL;
  v_faturas_afetadas text[] := ARRAY[]::text[];
  v_fatura_paga RECORD;
BEGIN
  -- Validações básicas
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'O valor do lançamento deve ser maior que zero.';
  END IF;

  IF p_prazo = 'determinado' AND (p_quantidade_total IS NULL OR p_quantidade_total < 1) THEN
    RAISE EXCEPTION 'Para prazo determinado, especifique a quantidade de ocorrências.';
  END IF;

  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = p_cartao_id AND workspace_id = p_workspace_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cartão não encontrado.';
    END IF;
    v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
    v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
  END IF;

  -- Definir data limite de projeção
  IF p_prazo = 'indeterminado' THEN
    v_data_limite := public.calcular_limite_projecao_fixo(p_data_inicio);
    v_total_alvo := 9999;
  ELSE
    v_total_alvo := p_quantidade_total;
    v_data_limite := MAKE_DATE(2099, 12, 31);
  END IF;

  -- Criar registro mestre na tabela series_lancamentos
  INSERT INTO public.series_lancamentos (
    workspace_id,
    descricao,
    tipo,
    periodicidade,
    prazo,
    quantidade_total,
    ocorrencias_geradas,
    proxima_competencia,
    ativo,
    data_inicio,
    dia_vencimento,
    valor,
    meio_pagamento_tipo,
    conta_origem_id,
    conta_destino_id,
    cartao_id,
    categoria_id,
    subcategoria_id,
    observacao,
    data_limite_projecao,
    created_by
  ) VALUES (
    p_workspace_id,
    p_descricao,
    p_tipo,
    p_periodicidade,
    p_prazo,
    p_quantidade_total,
    0,
    TO_CHAR(p_data_inicio, 'YYYY-MM'),
    true,
    p_data_inicio,
    EXTRACT(DAY FROM p_data_inicio)::int,
    p_valor,
    p_meio_pagamento_tipo,
    p_conta_origem_id,
    p_conta_destino_id,
    p_cartao_id,
    p_categoria_id,
    p_subcategoria_id,
    p_observacao,
    v_data_limite,
    p_user_id
  )
  RETURNING id INTO v_serie_id;

  -- Gerar as ocorrências (materializadas se data <= hoje, senão projeções)
  v_data_cur := p_data_inicio;
  WHILE v_passo <= v_total_alvo AND v_data_cur <= v_data_limite LOOP
    -- Competência: se cartão, usa regra de vencimento/fechamento; se conta/dinheiro, YYYY-MM da data
    IF p_meio_pagamento_tipo = 'CARTAO' THEN
      v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
    END IF;

    -- Se for cartão e a competência já estiver numa fatura PAGA, para e bloqueia
    IF p_meio_pagamento_tipo = 'CARTAO' THEN
      FOR v_fatura_paga IN
        SELECT competencia FROM public.faturas
        WHERE workspace_id = p_workspace_id
          AND cartao_id = p_cartao_id
          AND competencia = v_comp_cur
          AND status = 'paga'
      LOOP
        RAISE EXCEPTION 'A fatura de % já está paga. Não é possível criar lançamentos fixos incidentes em fatura já quitada.',
          v_fatura_paga.competencia;
      END LOOP;
    END IF;

    -- Materialização: se a data do lançamento já chegou (v_data_cur <= v_hoje) OU se é a 1ª ocorrência criada no app
    IF v_data_cur <= v_hoje THEN
      v_deve_materializar := true;
    ELSE
      v_deve_materializar := false;
    END IF;

    -- Natureza previsional: se não materializou, é previsão (natureza_previsao = true)
    v_natureza_prev := NOT v_deve_materializar;

    -- Regra de pagamento da 1ª ocorrência:
    -- Se marcado pago_primeira e for meio conta/dinheiro:
    IF v_primeira AND p_pago_primeira AND p_meio_pagamento_tipo <> 'CARTAO' THEN
      v_status_pagamento := 'pago';
      v_data_pagamento := v_data_cur;
      v_natureza_prev := false; -- pagamento torna realizado
      v_deve_materializar := true;
    ELSE
      v_status_pagamento := 'pendente';
      v_data_pagamento := NULL;
    END IF;

    -- Inserir na tabela lancamentos de forma idempotente (ON CONFLICT DO NOTHING)
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
      p_tipo,
      'fixo',
      v_serie_id,
      v_data_cur,
      v_comp_cur,
      p_descricao,
      p_valor,
      p_meio_pagamento_tipo,
      p_conta_origem_id,
      p_conta_destino_id,
      p_cartao_id,
      p_categoria_id,
      p_subcategoria_id,
      v_status_pagamento,
      v_data_pagamento,
      p_observacao,
      1,
      v_passo,
      (CASE WHEN p_prazo = 'determinado' THEN p_quantidade_total ELSE NULL END),
      v_natureza_prev,
      false,
      false,
      p_user_id
    )
    ON CONFLICT (workspace_id, serie_id, competencia) WHERE serie_id IS NOT NULL AND deleted_at IS NULL
    DO NOTHING
    RETURNING * INTO v_lanc_criado;

    IF v_lanc_criado.id IS NOT NULL THEN
      v_ocorrencias_geradas := v_ocorrencias_geradas + 1;

      -- Se materializado no cartão, recalcular fatura aberta
      IF p_meio_pagamento_tipo = 'CARTAO' AND NOT v_natureza_prev THEN
        IF NOT (v_comp_cur = ANY(v_faturas_afetadas)) THEN
          v_faturas_afetadas := array_append(v_faturas_afetadas, v_comp_cur);
        END IF;
      END IF;

      -- Se foi pago na 1ª ocorrência, aplicar movimentação de saldo
      IF v_status_pagamento = 'pago' AND p_conta_origem_id IS NOT NULL THEN
        IF p_tipo = 'despesa' THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual - p_valor, updated_at = NOW()
          WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

          INSERT INTO public.movimentacoes_conta (
            workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
          ) VALUES (
            p_workspace_id, p_conta_origem_id, v_lanc_criado.id, 'saida', p_valor, v_data_cur, p_descricao, p_user_id
          );
        ELSIF p_tipo = 'receita' THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual + p_valor, updated_at = NOW()
          WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

          INSERT INTO public.movimentacoes_conta (
            workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
          ) VALUES (
            p_workspace_id, p_conta_origem_id, v_lanc_criado.id, 'entrada', p_valor, v_data_cur, p_descricao, p_user_id
          );
        ELSIF p_tipo = 'transferencia' AND p_conta_destino_id IS NOT NULL THEN
          UPDATE public.contas
          SET saldo_atual = saldo_atual - p_valor, updated_at = NOW()
          WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

          UPDATE public.contas
          SET saldo_atual = saldo_atual + p_valor, updated_at = NOW()
          WHERE id = p_conta_destino_id AND workspace_id = p_workspace_id;

          INSERT INTO public.movimentacoes_conta (
            workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
          ) VALUES
            (p_workspace_id, p_conta_origem_id, v_lanc_criado.id, 'transferencia_saida', p_valor, v_data_cur, p_descricao, p_user_id),
            (p_workspace_id, p_conta_destino_id, v_lanc_criado.id, 'transferencia_entrada', p_valor, v_data_cur, p_descricao, p_user_id);
        END IF;
      END IF;
    END IF;

    -- Próxima competência da série
    v_data_cur := public.avancar_data_periodicidade(p_data_inicio, p_periodicidade, v_passo);
    v_passo := v_passo + 1;
    v_primeira := false;
  END LOOP;

  -- Próxima competência a materializar
  SELECT competencia INTO v_proxima_comp
  FROM public.lancamentos
  WHERE serie_id = v_serie_id AND workspace_id = p_workspace_id AND natureza_previsao = true AND deleted_at IS NULL
  ORDER BY data ASC LIMIT 1;

  IF v_proxima_comp IS NULL THEN
    v_proxima_comp := TO_CHAR(v_data_cur, 'YYYY-MM');
  END IF;

  -- Atualizar mestre
  UPDATE public.series_lancamentos
  SET ocorrencias_geradas = v_ocorrencias_geradas,
      proxima_competencia = v_proxima_comp,
      updated_at = NOW()
  WHERE id = v_serie_id;

  -- Recalcular faturas impactadas
  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    DECLARE
      v_c text;
    BEGIN
      FOREACH v_c IN ARRAY v_faturas_afetadas LOOP
        PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_cartao_id, v_c);
      END LOOP;
    END;
  END IF;

  -- Auditoria da criação
  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    v_serie_id,
    'criacao_serie_fixa',
    'todos',
    jsonb_build_object(
      'descricao', p_descricao,
      'tipo', p_tipo,
      'valor', p_valor,
      'periodicidade', p_periodicidade,
      'prazo', p_prazo,
      'ocorrencias_geradas', v_ocorrencias_geradas,
      'data_limite_projecao', v_data_limite
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'serie_id', v_serie_id,
    'ocorrencias_geradas', v_ocorrencias_geradas,
    'data_limite_projecao', v_data_limite,
    'proxima_competencia', v_proxima_comp
  );
END;
$$;

-- 6. RPC de Materialização Preguiçosa Idempotente
-- Executada ao carregar o app e antes de pagar/filtrar:
-- Converte de natureza_previsao = true para false toda ocorrência cuja data de recorrência já chegou
-- (data <= CURRENT_DATE), garantindo atomicidade com FOR UPDATE e recálculo de faturas de cartão.
CREATE OR REPLACE FUNCTION public.materializar_fixos_pendentes_rpc(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_materializados int := 0;
  v_faturas_cartao text[] := ARRAY[]::text[];
  v_cartao_id uuid;
  v_c text;
  v_hoje date := CURRENT_DATE;
BEGIN
  -- Percorre com FOR UPDATE ocorrências previsionais cuja data já chegou
  FOR v_lanc IN
    SELECT l.*
    FROM public.lancamentos l
    JOIN public.series_lancamentos s ON s.id = l.serie_id
    WHERE l.workspace_id = p_workspace_id
      AND l.regime = 'fixo'
      AND l.natureza_previsao = true
      AND l.deleted_at IS NULL
      AND l.data <= v_hoje
      AND s.ativo = true
    ORDER BY l.data ASC
    FOR UPDATE OF l
  LOOP
    -- Converte a ocorrência para realizada (materializada)
    UPDATE public.lancamentos
    SET natureza_previsao = false,
        updated_at = NOW()
    WHERE id = v_lanc.id;

    v_materializados := v_materializados + 1;

    -- Se for no cartão, registra a fatura para recálculo
    IF v_lanc.meio_pagamento_tipo = 'CARTAO' AND v_lanc.cartao_id IS NOT NULL THEN
      v_cartao_id := v_lanc.cartao_id;
      IF NOT (v_lanc.competencia = ANY(v_faturas_cartao)) THEN
        v_faturas_cartao := array_append(v_faturas_cartao, v_lanc.competencia);
      END IF;
    END IF;

    -- Atualiza proxima_competencia no registro da série
    UPDATE public.series_lancamentos
    SET proxima_competencia = (
      SELECT COALESCE(
        (SELECT competencia FROM public.lancamentos
         WHERE serie_id = v_lanc.serie_id AND workspace_id = p_workspace_id AND natureza_previsao = true AND deleted_at IS NULL
         ORDER BY data ASC LIMIT 1),
        public.somar_meses_competencia(v_lanc.competencia, 1)
      )
    ),
    updated_at = NOW()
    WHERE id = v_lanc.serie_id;

    -- Registrar auditoria de operação
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
      v_lanc.id,
      'materializar_ocorrencia_fixa',
      jsonb_build_object('natureza_previsao', true, 'data', v_lanc.data),
      jsonb_build_object('natureza_previsao', false, 'data', v_lanc.data),
      p_user_id
    );
  END LOOP;

  -- Recalcular faturas de cartão impactadas
  IF v_cartao_id IS NOT NULL AND array_length(v_faturas_cartao, 1) > 0 THEN
    FOREACH v_c IN ARRAY v_faturas_cartao LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, v_c);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'materializados', v_materializados,
    'faturas_recalculadas', v_faturas_cartao
  );
END;
$$;

-- 7. RPC de Renovação de Projeções (Série Indeterminada)
-- Gera projeções da série fixa até 31 de dezembro do ano seguinte sem duplicar competências já existentes.
-- Permite atualizar valor, dia de vencimento e categoria para a extensão da projeção.
CREATE OR REPLACE FUNCTION public.renovar_projecao_fixo_rpc(
  p_workspace_id uuid,
  p_serie_id uuid,
  p_novo_valor numeric DEFAULT NULL,
  p_nova_data_base date DEFAULT NULL,
  p_nova_categoria_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_serie RECORD;
  v_data_limite_atual date;
  v_novo_limite date;
  v_ano_base int;
  v_ultima_data date;
  v_data_cur date;
  v_comp_cur text;
  v_valor_final numeric;
  v_cartao RECORD;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_passo int := 1;
  v_novas_geradas int := 0;
  v_max_passos int := 120;
BEGIN
  SELECT * INTO v_serie
  FROM public.series_lancamentos
  WHERE id = p_serie_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Série fixa não encontrada.';
  END IF;

  IF v_serie.prazo <> 'indeterminado' THEN
    RAISE EXCEPTION 'Apenas séries de prazo indeterminado podem ter sua janela de projeção estendida.';
  END IF;

  v_valor_final := COALESCE(p_novo_valor, v_serie.valor);
  v_data_limite_atual := COALESCE(v_serie.data_limite_projecao, public.calcular_limite_projecao_fixo(v_serie.data_inicio));

  -- Novo limite: estender para 31 de dezembro do próximo ano em relação ao limite atual
  v_ano_base := EXTRACT(YEAR FROM v_data_limite_atual)::int;
  v_novo_limite := MAKE_DATE(v_ano_base + 1, 12, 31);

  -- Buscar a última data de lançamento da série
  SELECT MAX(data) INTO v_ultima_data
  FROM public.lancamentos
  WHERE serie_id = p_serie_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF v_ultima_data IS NULL THEN
    v_ultima_data := v_serie.data_inicio;
  END IF;

  IF v_serie.meio_pagamento_tipo = 'CARTAO' AND v_serie.cartao_id IS NOT NULL THEN
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_serie.cartao_id AND workspace_id = p_workspace_id;
    IF FOUND THEN
      v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
      v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
    END IF;
  END IF;

  -- Começar a gerar do ponto imediatamente seguinte à última data
  v_data_cur := public.avancar_data_periodicidade(v_ultima_data, v_serie.periodicidade, 1);

  WHILE v_data_cur <= v_novo_limite AND v_passo <= v_max_passos LOOP
    IF v_serie.meio_pagamento_tipo = 'CARTAO' THEN
      v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
    END IF;

    -- Inserir nova ocorrência previsional idempotente
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
      v_serie.descricao,
      v_valor_final,
      v_serie.meio_pagamento_tipo,
      v_serie.conta_origem_id,
      v_serie.conta_destino_id,
      v_serie.cartao_id,
      COALESCE(p_nova_categoria_id, v_serie.categoria_id),
      v_serie.subcategoria_id,
      'pendente',
      NULL,
      v_serie.observacao,
      1,
      1,
      NULL,
      true, -- Previsão
      false,
      false,
      p_user_id
    )
    ON CONFLICT (workspace_id, serie_id, competencia) WHERE serie_id IS NOT NULL AND deleted_at IS NULL
    DO NOTHING;

    v_novas_geradas := v_novas_geradas + 1;
    v_data_cur := public.avancar_data_periodicidade(v_data_cur, v_serie.periodicidade, 1);
    v_passo := v_passo + 1;
  END LOOP;

  -- Atualizar mestre
  UPDATE public.series_lancamentos
  SET data_limite_projecao = v_novo_limite,
      valor = v_valor_final,
      categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
      ocorrencias_geradas = ocorrencias_geradas + v_novas_geradas,
      updated_at = NOW()
  WHERE id = p_serie_id;

  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    p_serie_id,
    'renovacao_projecao_fixo',
    'todos',
    jsonb_build_object(
      'novo_limite', v_novo_limite,
      'novas_geradas', v_novas_geradas,
      'novo_valor', v_valor_final
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'novo_limite', v_novo_limite,
    'novas_geradas', v_novas_geradas
  );
END;
$$;

-- 8. RPC de Exclusão por Escopo de Lançamento Fixo ('este' | 'este_e_proximos' | 'todos')
-- Proteção estrita de ocorrências pagas: se qualquer ocorrência atingida pelo escopo estiver paga em conta
-- ou vinculada a fatura quitada, a operação é BLOQUEADA informando detalhadamente as datas e competências que impedem.
CREATE OR REPLACE FUNCTION public.excluir_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text, -- 'este' | 'este_e_proximos' | 'todos'
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_alvos RECORD;
  v_ids_alvo uuid[] := ARRAY[]::uuid[];
  v_bloqueios_pagamento text[] := ARRAY[]::text[];
  v_bloqueios_fatura text[] := ARRAY[]::text[];
  v_faturas_cartao text[] := ARRAY[]::text[];
  v_cartao_id uuid;
  v_c text;
  v_total_excluidos int := 0;
BEGIN
  -- Buscar lançamento alvo com FOR UPDATE
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

  -- 1. Determinar lista de IDs alvo conforme escopo
  IF p_escopo = 'este' THEN
    v_ids_alvo := ARRAY[v_lanc.id];
  ELSIF p_escopo = 'este_e_proximos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND data >= v_lanc.data;
  ELSIF p_escopo = 'todos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Escopo inválido: use "este", "este_e_proximos" ou "todos".';
  END IF;

  IF v_ids_alvo IS NULL OR array_length(v_ids_alvo, 1) = 0 THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;

  -- 2. PROTEÇÃO DE PAGOS: verificar se qualquer lançamento alvo está pago ou em fatura paga
  -- A) Pagamentos em conta bancária / dinheiro
  SELECT ARRAY_AGG(DISTINCT TO_CHAR(data, 'DD/MM/YYYY') || ' (R$ ' || valor || ')')
  INTO v_bloqueios_pagamento
  FROM public.lancamentos
  WHERE id = ANY(v_ids_alvo)
    AND workspace_id = p_workspace_id
    AND status_pagamento = 'pago'
    AND meio_pagamento_tipo <> 'CARTAO';

  -- B) Faturas quitadas no cartão
  SELECT ARRAY_AGG(DISTINCT f.competencia)
  INTO v_bloqueios_fatura
  FROM public.lancamentos l
  JOIN public.faturas f ON f.cartao_id = l.cartao_id
                       AND f.competencia = l.competencia
                       AND f.workspace_id = l.workspace_id
  WHERE l.id = ANY(v_ids_alvo)
    AND l.workspace_id = p_workspace_id
    AND l.meio_pagamento_tipo = 'CARTAO'
    AND f.status = 'paga';

  IF (v_bloqueios_pagamento IS NOT NULL AND array_length(v_bloqueios_pagamento, 1) > 0) OR
     (v_bloqueios_fatura IS NOT NULL AND array_length(v_bloqueios_fatura, 1) > 0) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'bloqueado', true,
      'motivo', 'protecao_pagos',
      'datas_pagamento', COALESCE(v_bloqueios_pagamento, ARRAY[]::text[]),
      'faturas_pagas', COALESCE(v_bloqueios_fatura, ARRAY[]::text[]),
      'mensagem', 'Não é possível excluir ocorrências que já foram pagas. Desfaça os pagamentos ou exclua apenas ocorrências futuras pendentes.'
    );
  END IF;

  -- 3. Coletar competências de cartão afetadas para recálculo
  SELECT ARRAY_AGG(DISTINCT competencia), MAX(cartao_id)
  INTO v_faturas_cartao, v_cartao_id
  FROM public.lancamentos
  WHERE id = ANY(v_ids_alvo)
    AND meio_pagamento_tipo = 'CARTAO'
    AND natureza_previsao = false; -- apenas materializadas alteram fatura

  -- 4. Executar soft delete dos lançamentos alvos
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE id = ANY(v_ids_alvo) AND workspace_id = p_workspace_id;

  GET DIAGNOSTICS v_total_excluidos = ROW_COUNT;

  -- Se o escopo for "todos" ou "este_e_proximos" a partir da primeira ocorrência, desativa a série
  IF p_escopo = 'todos' THEN
    UPDATE public.series_lancamentos
    SET ativo = false, updated_at = NOW()
    WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
  ELSIF p_escopo = 'este_e_proximos' THEN
    -- Se não sobrou nenhum lançamento ativo para a série, desativa a série
    IF NOT EXISTS (
      SELECT 1 FROM public.lancamentos
      WHERE serie_id = v_lanc.serie_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
    ) THEN
      UPDATE public.series_lancamentos
      SET ativo = false, updated_at = NOW()
      WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
    END IF;
  END IF;

  -- 5. Recalcular faturas impactadas
  IF v_cartao_id IS NOT NULL AND v_faturas_cartao IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_cartao LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 6. Auditoria da exclusão
  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    v_lanc.serie_id,
    'exclusao_fixo_escopo',
    p_escopo,
    jsonb_build_object(
      'lancamento_base_id', p_lancamento_id,
      'total_excluidos', v_total_excluidos,
      'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'bloqueado', false,
    'excluidos', v_total_excluidos,
    'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
  );
END;
$$;

-- 9. RPC de Alteração por Escopo de Lançamento Fixo ('este' | 'este_e_proximos' | 'todos')
-- 'este': transforma em exceção pontual (eh_excecao = true, desvinculada do valor/data padrão da série). As demais continuam inalteradas.
-- 'este_e_proximos' e 'todos': atualiza a série e as ocorrências do escopo.
-- Proteção de pagos: se escopo contempla ocorrência paga e altera valor/conta/data que exija estorno, bloqueia.
CREATE OR REPLACE FUNCTION public.alterar_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text, -- 'este' | 'este_e_proximos' | 'todos'
  p_novo_valor numeric,
  p_nova_data date,
  p_nova_descricao text,
  p_nova_categoria_id uuid DEFAULT NULL,
  p_nova_subcategoria_id uuid DEFAULT NULL,
  p_nova_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_ids_alvo uuid[] := ARRAY[]::uuid[];
  v_bloqueios_pagamento text[] := ARRAY[]::text[];
  v_bloqueios_fatura text[] := ARRAY[]::text[];
  v_faturas_cartao text[] := ARRAY[]::text[];
  v_cartao_id uuid;
  v_c text;
  v_total_alterados int := 0;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_cartao RECORD;
  v_comp_calculada text;
BEGIN
  -- Buscar lançamento com FOR UPDATE
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

  -- 1. Identificar alvos
  IF p_escopo = 'este' THEN
    v_ids_alvo := ARRAY[v_lanc.id];
  ELSIF p_escopo = 'este_e_proximos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND data >= v_lanc.data;
  ELSIF p_escopo = 'todos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Escopo inválido: use "este", "este_e_proximos" ou "todos".';
  END IF;

  IF v_ids_alvo IS NULL OR array_length(v_ids_alvo, 1) = 0 THEN
    RETURN jsonb_build_object('sucesso', true, 'alterados', 0);
  END IF;

  -- 2. PROTEÇÃO DE PAGOS:
  -- Se o escopo contemplar lançamento pago E alterar valor, bloqueia
  IF (p_novo_valor <> v_lanc.valor) THEN
    SELECT ARRAY_AGG(DISTINCT TO_CHAR(data, 'DD/MM/YYYY') || ' (R$ ' || valor || ')')
    INTO v_bloqueios_pagamento
    FROM public.lancamentos
    WHERE id = ANY(v_ids_alvo)
      AND workspace_id = p_workspace_id
      AND status_pagamento = 'pago'
      AND meio_pagamento_tipo <> 'CARTAO';

    SELECT ARRAY_AGG(DISTINCT f.competencia)
    INTO v_bloqueios_fatura
    FROM public.lancamentos l
    JOIN public.faturas f ON f.cartao_id = l.cartao_id
                         AND f.competencia = l.competencia
                         AND f.workspace_id = l.workspace_id
    WHERE l.id = ANY(v_ids_alvo)
      AND l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND f.status = 'paga';

    IF (v_bloqueios_pagamento IS NOT NULL AND array_length(v_bloqueios_pagamento, 1) > 0) OR
       (v_bloqueios_fatura IS NOT NULL AND array_length(v_bloqueios_fatura, 1) > 0) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'bloqueado', true,
        'motivo', 'protecao_pagos',
        'datas_pagamento', COALESCE(v_bloqueios_pagamento, ARRAY[]::text[]),
        'faturas_pagas', COALESCE(v_bloqueios_fatura, ARRAY[]::text[]),
        'mensagem', 'Não é possível alterar o valor de ocorrências que já foram pagas. Desfaça o pagamento antes de editar ou altere apenas as ocorrências futuras.'
      );
    END IF;
  END IF;

  -- Buscar dados do cartão se aplicável
  IF v_serie.meio_pagamento_tipo = 'CARTAO' AND v_serie.cartao_id IS NOT NULL THEN
    v_cartao_id := v_serie.cartao_id;
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_cartao_id AND workspace_id = p_workspace_id;
    IF FOUND THEN
      v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
      v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
    END IF;
  END IF;

  -- 3. APLICAR ALTERAÇÃO
  IF p_escopo = 'este' THEN
    -- Exceção: marca eh_excecao = true, atualiza data, competência e valor só deste lançamento
    IF v_serie.meio_pagamento_tipo = 'CARTAO' THEN
      v_comp_calculada := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_calculada := TO_CHAR(p_nova_data, 'YYYY-MM');
    END IF;

    -- Coletar faturas antigas e novas para recálculo
    IF v_serie.meio_pagamento_tipo = 'CARTAO' AND NOT v_lanc.natureza_previsao THEN
      v_faturas_cartao := array_append(v_faturas_cartao, v_lanc.competencia);
      IF NOT (v_comp_calculada = ANY(v_faturas_cartao)) THEN
        v_faturas_cartao := array_append(v_faturas_cartao, v_comp_calculada);
      END IF;
    END IF;

    UPDATE public.lancamentos
    SET valor = p_novo_valor,
        data = p_nova_data,
        competencia = v_comp_calculada,
        descricao = p_nova_descricao,
        categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
        subcategoria_id = p_nova_subcategoria_id,
        observacao = p_nova_observacao,
        eh_excecao = true,
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    v_total_alterados := 1;

  ELSIF p_escopo = 'este_e_proximos' THEN
    -- Atualiza ocorrências a partir desta data que NÃO sejam exceções manuais pontuais já feitas
    UPDATE public.lancamentos
    SET valor = p_novo_valor,
        descricao = p_nova_descricao,
        categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
        subcategoria_id = p_nova_subcategoria_id,
        observacao = p_nova_observacao,
        updated_at = NOW()
    WHERE id = ANY(v_ids_alvo) AND workspace_id = p_workspace_id AND eh_excecao = false;

    GET DIAGNOSTICS v_total_alterados = ROW_COUNT;

    -- Atualiza também a definição mestre da série para novos lançamentos futuros
    UPDATE public.series_lancamentos
    SET valor = p_novo_valor,
        descricao = p_nova_descricao,
        categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
        updated_at = NOW()
    WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;

    -- Coletar faturas para recálculo
    IF v_serie.meio_pagamento_tipo = 'CARTAO' THEN
      SELECT ARRAY_AGG(DISTINCT competencia) INTO v_faturas_cartao
      FROM public.lancamentos
      WHERE id = ANY(v_ids_alvo) AND natureza_previsao = false;
    END IF;

  ELSIF p_escopo = 'todos' THEN
    -- Atualiza todas as ocorrências não pagas
    UPDATE public.lancamentos
    SET valor = p_novo_valor,
        descricao = p_nova_descricao,
        categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
        subcategoria_id = p_nova_subcategoria_id,
        observacao = p_nova_observacao,
        updated_at = NOW()
    WHERE id = ANY(v_ids_alvo)
      AND workspace_id = p_workspace_id
      AND status_pagamento <> 'pago';

    GET DIAGNOSTICS v_total_alterados = ROW_COUNT;

    UPDATE public.series_lancamentos
    SET valor = p_novo_valor,
        descricao = p_nova_descricao,
        categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
        updated_at = NOW()
    WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;

    IF v_serie.meio_pagamento_tipo = 'CARTAO' THEN
      SELECT ARRAY_AGG(DISTINCT competencia) INTO v_faturas_cartao
      FROM public.lancamentos
      WHERE id = ANY(v_ids_alvo) AND natureza_previsao = false;
    END IF;
  END IF;

  -- 4. Recalcular faturas impactadas
  IF v_cartao_id IS NOT NULL AND v_faturas_cartao IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_cartao LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 5. Auditoria da alteração
  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    v_lanc.serie_id,
    'alteracao_fixo_escopo',
    p_escopo,
    jsonb_build_object(
      'lancamento_base_id', p_lancamento_id,
      'total_alterados', v_total_alterados,
      'novo_valor', p_novo_valor,
      'nova_data', p_nova_data
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'bloqueado', false,
    'alterados', v_total_alterados,
    'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
  );
END;
$$;
