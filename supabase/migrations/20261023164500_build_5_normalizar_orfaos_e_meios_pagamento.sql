-- 20261023164500_build_5_normalizar_orfaos_e_meios_pagamento.sql
-- Build 5: Normalização de lançamentos órfãos (fixo/parcelado sem série válida) e garantia de integridade

-- 1. Normalizar registros marcados como regime='fixo' mas com serie_id NULL ou inexistente em series_lancamentos
UPDATE public.lancamentos
SET regime = 'unico',
    updated_at = NOW()
WHERE regime = 'fixo'
  AND (serie_id IS NULL OR serie_id NOT IN (SELECT id FROM public.series_lancamentos));

-- 2. Normalizar registros de cartão ou outros marcados como parcelado que não possuam parcelas ou série
UPDATE public.lancamentos
SET regime = 'unico',
    updated_at = NOW()
WHERE regime = 'parcelado'
  AND lancamento_pai_id IS NULL
  AND (serie_id IS NULL OR serie_id NOT IN (SELECT id FROM public.series_lancamentos))
  AND (total_parcelas IS NULL OR total_parcelas <= 1)
  AND (quantidade_parcelas IS NULL OR quantidade_parcelas <= 1);

-- 3. Tratar o caso do lançamento "Mercado" (ou qualquer lançamento com meio_pagamento_tipo='DINHEIRO' sem conta nem cartão)
-- Garantir que existe o meio de pagamento DINHEIRO ativo no workspace correspondente para manter integridade
INSERT INTO public.meios_pagamento (workspace_id, tipo, nome, ativo, created_at)
SELECT DISTINCT l.workspace_id, 'DINHEIRO', 'Dinheiro em Espécie', true, NOW()
FROM public.lancamentos l
WHERE l.meio_pagamento_tipo = 'DINHEIRO'
  AND NOT EXISTS (
    SELECT 1 FROM public.meios_pagamento mp
    WHERE mp.workspace_id = l.workspace_id AND mp.tipo = 'DINHEIRO'
  );

-- 4. Atualizar a RPC excluir_fixo_escopo_rpc para NUNCA falhar ao receber um lançamento órfão
-- Caso o lançamento não possua serie_id válida, a RPC exclui o lançamento único diretamente com soft-delete e idempotência
CREATE OR REPLACE FUNCTION public.excluir_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text DEFAULT 'todos'::text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_ids_nao_pagos uuid[] := ARRAY[]::uuid[];
  v_ids_pagos uuid[] := ARRAY[]::uuid[];
  v_faturas_cartao text[] := ARRAY[]::text[];
  v_cartao_id uuid;
  v_c text;
  v_total_excluidos int := 0;
BEGIN
  -- 1. Buscar lançamento base com FOR UPDATE
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  -- Se for órfão (sem serie_id ou série inexistente), tratar como exclusão de lançamento único seguro
  IF v_lanc.serie_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.series_lancamentos WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id
  ) THEN
    -- Verificar se fatura de cartão já está paga
    IF v_lanc.meio_pagamento_tipo = 'CARTAO' AND v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.faturas
        WHERE cartao_id = v_lanc.cartao_id
          AND competencia = v_lanc.competencia
          AND workspace_id = p_workspace_id
          AND status = 'paga'
      ) THEN
        RETURN jsonb_build_object(
          'sucesso', false,
          'bloqueado', true,
          'mensagem', 'Não é possível excluir: a fatura já está quitada.'
        );
      END IF;
    END IF;

    -- Executar soft-delete do lançamento órfão
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        regime = 'unico',
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    -- Se estava pago em conta bancária, reverter movimentação/saldo se aplicável
    IF v_lanc.status_pagamento = 'pago' AND v_lanc.conta_origem_id IS NOT NULL THEN
      IF v_lanc.tipo = 'receita' THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual - v_lanc.valor,
            updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
      ELSIF v_lanc.tipo = 'despesa' THEN
        UPDATE public.contas
        SET saldo_atual = saldo_atual + v_lanc.valor,
            updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
      END IF;
    END IF;

    -- Se for em cartão, recalcular a fatura afetada
    IF v_lanc.meio_pagamento_tipo = 'CARTAO' AND v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_lanc.cartao_id, v_lanc.competencia);
      v_faturas_cartao := ARRAY[v_lanc.competencia];
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'bloqueado', false,
      'excluidos', 1,
      'pagas_preservadas', 0,
      'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
    );
  END IF;

  -- 2. Série mestre existe
  SELECT * INTO v_serie
  FROM public.series_lancamentos
  WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  -- 3. Separar ocorrências NÃO PAGAS (a serem excluídas) e PAGAS (preservadas intactas)
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

  -- Se houver cartão, coletar competências para recálculo
  IF v_serie.meio_pagamento_tipo = 'CARTAO' AND v_serie.cartao_id IS NOT NULL AND v_ids_nao_pagos IS NOT NULL THEN
    v_cartao_id := v_serie.cartao_id;
    SELECT ARRAY_AGG(DISTINCT competencia) INTO v_faturas_cartao
    FROM public.lancamentos
    WHERE id = ANY(v_ids_nao_pagos);
  END IF;

  -- 4. Executar soft-delete de todas as não pagas
  IF v_ids_nao_pagos IS NOT NULL AND array_length(v_ids_nao_pagos, 1) > 0 THEN
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        updated_at = NOW()
    WHERE id = ANY(v_ids_nao_pagos) AND workspace_id = p_workspace_id;

    GET DIAGNOSTICS v_total_excluidos = ROW_COUNT;
  END IF;

  -- 5. Desativar a série para que não gere novas projeções
  UPDATE public.series_lancamentos
  SET ativo = false,
      ocorrencias_geradas = COALESCE(array_length(v_ids_pagos, 1), 0),
      updated_at = NOW()
  WHERE id = v_serie.id AND workspace_id = p_workspace_id;

  -- 6. Recalcular faturas afetadas no cartão
  IF v_cartao_id IS NOT NULL AND v_faturas_cartao IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_cartao LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 7. Auditoria da exclusão
  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    v_serie.id,
    'exclusao_fixo_escopo',
    'todos',
    jsonb_build_object(
      'lancamento_base_id', p_lancamento_id,
      'total_excluidos', v_total_excluidos,
      'pagas_preservadas', COALESCE(array_length(v_ids_pagos, 1), 0),
      'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'bloqueado', false,
    'excluidos', v_total_excluidos,
    'pagas_preservadas', COALESCE(array_length(v_ids_pagos, 1), 0),
    'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
  );
END;
$$;
