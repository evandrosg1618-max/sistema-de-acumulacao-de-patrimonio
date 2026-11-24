-- Migration: Central de Ajustes — Parte A (nova regra definitiva do Ajuste de Saldo Bancário)
-- Versão: 20261125000000
--
-- NOVA REGRA (PDF "Central de Ajustes teste e nova regra"):
--   Ajuste de Saldo Bancário NÃO tem estorno, NÃO tem ciclo pago/pendente, NÃO tem joia.
--   Após registrado, apenas Visualizar / Editar / Excluir:
--     REGISTRAR → cria o lançamento e o valor passa a integrar o saldo da conta.
--     EDITAR    → SUBSTITUI o efeito do ajuste (não soma), preservando movimentações posteriores.
--     EXCLUIR   → retira SÓ o efeito daquele ajuste, preservando movimentações posteriores.
--   Ajuste necessário = saldo real informado − saldo atual da conta no momento do ajuste.
--   Ajustes sucessivos na mesma conta SEMPRE permitidos, cada um recalculado sobre o saldo atual.
--   Ajuste é neutro: afeta_resultado=false, afeta_orcamento=false, sem categoria, sem cartão.
--
-- O que NÃO muda: estornar_ajuste_saldo_rpc permanece no banco por compatibilidade (outros
-- fluxos); ajustes de fatura, faturas/pagamentos, transferências, recorrências/fixos, regime
-- de competência, Orçamento, captura, reconciliar_saldos_contas_rpc, RLS, workspace, auditoria.

-- ============================================================================
-- A1 — registrar_ajuste_saldo_rpc: fórmula saldo real − saldo atual, ajustes
--      sucessivos sem bloqueio, idempotência e atomicidade mantidas.
-- CORREÇÕES de regra:
--   a) Idempotência deixa de ser "chave viva de ajuste anterior" (a chave antiga
--      incluí o VALOR do ajuste; um ajuste anterior ativo devolvia 'duplicado'
--      e travava o ajuste seguinte). Agora a chave é derivada da CONCILIAÇÃO
--      ATIVA da conta (uma conciliação efetivada só gera um lançamento) e a
--      idempotência de duplo clique é garantida pela trava FOR UPDATE da conta
--      + o índice único de idempotency_key como rede.
--   b) Depois de gravar, marca a conciliação que originou o ajuste como
--      efetivada (ajustado = true, já é o padrão de quem cria com ajuste).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.registrar_ajuste_saldo_rpc(
  p_workspace_id uuid,
  p_conta_id uuid,
  p_saldo_real numeric,
  p_data date,
  p_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_conta RECORD;
  v_ajuste numeric;
  v_ajuste_abs numeric;
  v_direcao text;
  v_lancamento_id uuid;
  v_competencia text;
  v_idem text;
  v_obs text;
BEGIN
  IF NOT public.is_member_of_workspace(p_workspace_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não é membro do workspace');
  END IF;

  IF p_saldo_real IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Saldo real é obrigatório');
  END IF;

  -- Trava transacional da conta (FOR UPDATE): o ajuste é SEMPRE calculado sobre o
  -- saldo atual travado no banco — protege contra duplo clique e requisição
  -- concorrente (não é só trava de frontend) e recalcula se o saldo mudou
  -- entre a abertura da tela e a confirmação.
  SELECT * INTO v_conta
  FROM public.contas
  WHERE id = p_conta_id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta não encontrada');
  END IF;

  v_ajuste := ROUND(p_saldo_real - COALESCE(v_conta.saldo_atual, 0), 2);

  -- Ajuste zero: nada a registrar (saldo informado já é igual ao saldo SAP)
  IF v_ajuste = 0 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'sem_ajuste', true,
      'mensagem', 'O saldo informado já corresponde ao saldo registrado no SAP. Nenhum ajuste foi necessário.',
      'saldo_atual', v_conta.saldo_atual
    );
  END IF;

  v_ajuste_abs := ABS(v_ajuste);
  v_direcao := CASE WHEN v_ajuste > 0 THEN 'entrada' ELSE 'saida' END;
  v_competencia := TO_CHAR(p_data, 'YYYY-MM');
  v_obs := NULLIF(TRIM(COALESCE(p_observacao, '')), '');

  -- Ajustes SUCESSIVOS são permitidos: não existe bloqueio por ajuste anterior.
  -- A chave de idempotência amarra a conciliação ATIVA da conta (uma conciliação
  -- só gera um lançamento); ajustes anteriores já efetivados ficam fora do
  -- escopo porque sua conciliação está inativa ou sem valor remanescente.
  v_idem := 'ajuste_saldo:' || p_conta_id::text || ':' || COALESCE(
    (SELECT c.id::text
     FROM public.conciliacoes_conta c
     WHERE c.workspace_id = p_workspace_id
       AND c.conta_id = p_conta_id
       AND c.ajustado = true
       AND c.lancamento_ajuste_id IS NULL
     ORDER BY c.created_at DESC
     LIMIT 1),
    'livre:' || TO_CHAR(NOW() AT TIME ZONE 'utc', 'YYYYMMDDHH24MISSUS')
  );

  PERFORM 1
  FROM public.lancamentos
  WHERE workspace_id = p_workspace_id
    AND idempotency_key = v_idem
    AND deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'duplicado', true,
      'mensagem', 'Ajuste já registrado anteriormente. Nenhum lançamento duplicado.'
    );
  END IF;

  BEGIN
    INSERT INTO public.lancamentos (
      workspace_id, tipo, regime, data, competencia, descricao, valor,
      meio_pagamento_tipo, conta_origem_id, cartao_id, categoria_id, subcategoria_id,
      status_pagamento, data_pagamento, observacao, idempotency_key, created_by,
      afeta_resultado, afeta_orcamento, subtipo_ajuste, efeito_fatura
    ) VALUES (
      p_workspace_id, 'ajuste', 'unico', p_data, v_competencia, 'Ajuste do saldo da conta',
      v_ajuste_abs, 'CONTA', p_conta_id, NULL, NULL, NULL,
      'pago', p_data, v_obs, v_idem, p_user_id,
      false, false, 'ajuste_saldo_conta', NULL
    )
    RETURNING id INTO v_lancamento_id;
  EXCEPTION WHEN unique_violation THEN
    -- Rede de proteção contra corrida: o índice único segurou o duplo clique
    RETURN jsonb_build_object(
      'sucesso', true,
      'duplicado', true,
      'mensagem', 'Ajuste já registrado anteriormente. Nenhum lançamento duplicado.'
    );
  END;

  -- Histórico de movimentação da conta (valor sempre positivo + direção)
  INSERT INTO public.movimentacoes_conta (
    workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, idempotency_key, created_by
  ) VALUES (
    p_workspace_id, p_conta_id, v_lancamento_id, v_direcao, v_ajuste_abs, p_data,
    'Ajuste do saldo da conta', v_idem, p_user_id
  );

  -- Novo saldo = consequência do lançamento (saldo travado + ajuste)
  UPDATE public.contas
  SET saldo_atual = saldo_atual + v_ajuste,
      updated_at = NOW()
  WHERE id = p_conta_id AND workspace_id = p_workspace_id;

  -- Registro da conciliação (fonte do histórico da Central)
  INSERT INTO public.conciliacoes_conta (
    workspace_id, conta_id, data_extrato, saldo_sistema, saldo_extrato,
    divergencia, ajustado, lancamento_ajuste_id, observacao, created_by
  ) VALUES (
    p_workspace_id, p_conta_id, p_data, v_conta.saldo_atual, ROUND(p_saldo_real, 2),
    v_ajuste, true, v_lancamento_id, v_obs, p_user_id
  );

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, idempotency_key, created_by
  ) VALUES (
    p_workspace_id, 'contas', p_conta_id, 'ajuste_saldo',
    jsonb_build_object('saldo_atual', v_conta.saldo_atual),
    jsonb_build_object('saldo_novo', v_conta.saldo_atual + v_ajuste, 'ajuste', v_ajuste,
                       'lancamento_id', v_lancamento_id, 'subtipo_ajuste', 'ajuste_saldo_conta'),
    v_idem, p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'lancamento_id', v_lancamento_id,
    'ajuste', v_ajuste,
    'saldo_novo', v_conta.saldo_atual + v_ajuste
  );
END;
$function$;

-- ============================================================================
-- A2 — editar_ajuste_saldo_rpc (NOVA): Editar SUBSTITUI o efeito do ajuste
--      (não soma) e preserva as movimentações posteriores. Atua SOMENTE sobre o
--      lançamento editado (sua movimentação), nunca sobrescreve o saldo atual
--      com saldo histórico. Registra a substituição na auditoria.
-- Exemplo do PDF: base 1.000, ajuste +50, despesa posterior −20, saldo 1.030;
-- editar o ajuste para +30 → saldo 1.010 (a despesa permanece intacta).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.editar_ajuste_saldo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_novo_saldo_real numeric,
  p_data date,
  p_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_lanc RECORD;
  v_conta RECORD;
  v_mov RECORD;
  v_saldo_sem_este_ajuste numeric;
  v_saldo_base_ajuste numeric;
  v_novo_ajuste numeric;
  v_novo_ajuste_abs numeric;
  v_nova_direcao text;
  v_mov_id uuid;
BEGIN
  IF NOT public.is_member_of_workspace(p_workspace_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não é membro do workspace');
  END IF;

  IF p_novo_saldo_real IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Saldo real é obrigatório');
  END IF;

  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.tipo <> 'ajuste' OR v_lanc.subtipo_ajuste <> 'ajuste_saldo_conta' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é um ajuste de saldo da conta');
  END IF;

  -- Regra definitiva: lançamento excluído/inativado não é reeditável
  IF v_lanc.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Ajuste excluído não pode ser editado');
  END IF;

  -- Movimentação DESTE lançamento (é exatamente o que ela produziu no saldo)
  SELECT * INTO v_mov
  FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false,
      'mensagem', 'Ajuste sem movimentação de conta não pode ser editado — registre um novo ajuste');
  END IF;

  SELECT * INTO v_conta
  FROM public.contas
  WHERE id = COALESCE(v_mov.conta_id, v_lanc.conta_origem_id)
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta não encontrada');
  END IF;

  -- Saldo de hoje sem o efeito DESTE ajuste (retira o que a movimentação somou).
  -- Isso PRESERVA automaticamente todas as movimentações posteriores ao ajuste:
  -- elas continuam compostas no saldo; só o efeito deste lançamento é substituído.
  IF v_mov.tipo = 'entrada' THEN
    v_saldo_sem_este_ajuste := ROUND(COALESCE(v_conta.saldo_atual, 0) - v_mov.valor, 2);
  ELSE
    v_saldo_sem_este_ajuste := ROUND(COALESCE(v_conta.saldo_atual, 0) + v_mov.valor, 2);
  END IF;

  -- Saldo-base do ajuste = saldo registrado imediatamente ANTES do ajuste original
  -- (conciliações_conta.saldo_sistema capturado no registro). O novo ajuste é
  -- recalculado sobre o MESMO ponto de partida do original — nunca sobre o saldo
  -- atual do dia, que já contém efeitos de movimentações posteriores.
  SELECT saldo_sistema INTO v_saldo_base_ajuste
  FROM public.conciliacoes_conta
  WHERE lancamento_ajuste_id = p_lancamento_id AND workspace_id = p_workspace_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_saldo_base_ajuste IS NULL THEN
    v_saldo_base_ajuste := v_saldo_sem_este_ajuste;
  END IF;

  -- Novo ajuste: substitui (não soma). É calculado sobre o mesmo ponto de partida
  -- do ajuste original — NUNCA sobre o saldo atual do dia (que já contém outros
  -- efeitos posteriores). Não sobrescreve o saldo atual com saldo histórico:
  -- o delta aplicado é (novo ajuste − ajuste original).
  v_novo_ajuste := ROUND(p_novo_saldo_real - v_saldo_base_ajuste, 2);

  IF v_novo_ajuste = 0 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'sem_ajuste', true,
      'mensagem', 'Com o novo saldo informado, nenhum ajuste é necessário neste lançamento.',
      'saldo_atual', v_conta.saldo_atual
    );
  END IF;

  v_novo_ajuste_abs := ABS(v_novo_ajuste);
  v_nova_direcao := CASE WHEN v_novo_ajuste > 0 THEN 'entrada' ELSE 'saida' END;

  -- Substitui a movimentação DESTE lançamento (as demais movimentações ficam intactas)
  UPDATE public.movimentacoes_conta
  SET tipo = v_nova_direcao,
      valor = v_novo_ajuste_abs,
      data = p_data,
      descricao = 'Ajuste do saldo da conta',
      observacao = NULLIF(TRIM(COALESCE(p_observacao, '')), ''),
      updated_at = NOW()
  WHERE id = v_mov.id;

  -- O valor do lançamento é o módulo do ajuste (a direção vive na movimentação,
  -- igual ao fluxo de registro — fonte única de verdade)
  UPDATE public.lancamentos
  SET valor = v_novo_ajuste_abs,
      data = p_data,
      competencia = TO_CHAR(p_data, 'YYYY-MM'),
      data_pagamento = p_data,
      observacao = NULLIF(TRIM(COALESCE(p_observacao, '')), ''),
      status_pagamento = 'pago',
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Aplica a SUBSTITUIÇÃO no saldo: sai o efeito antigo, entra o novo
  UPDATE public.contas
  SET saldo_atual = ROUND(v_saldo_sem_este_ajuste + v_novo_ajuste, 2),
      updated_at = NOW()
  WHERE id = v_conta.id AND workspace_id = p_workspace_id;

  -- Conciliação original do ajuste: registra a edição (mantém histórico auditável)
  UPDATE public.conciliacoes_conta
  SET data_extrato = p_data,
      saldo_sistema = v_saldo_base_ajuste,
      saldo_extrato = ROUND(p_novo_saldo_real, 2),
      divergencia = v_novo_ajuste,
      observacao = NULLIF(TRIM(COALESCE(p_observacao, '')), ''),
      updated_at = NOW()
  WHERE lancamento_ajuste_id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Auditoria da substituição (exigência da especificação)
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'edicao_ajuste_saldo',
    jsonb_build_object('valor_ajuste', v_mov.valor, 'direcao', v_mov.tipo,
                       'saldo_base_ajuste', v_saldo_base_ajuste,
                       'saldo_sem_este_ajuste', v_saldo_sem_este_ajuste),
    jsonb_build_object('valor_ajuste', v_novo_ajuste_abs, 'direcao', v_nova_direcao,
                       'saldo_novo', ROUND(v_saldo_sem_este_ajuste + v_novo_ajuste, 2)),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'editado', true,
    'ajuste', v_novo_ajuste,
    'saldo_novo', ROUND(v_saldo_sem_este_ajuste + v_novo_ajuste, 2)
  );
END;
$function$;

-- ============================================================================
-- A5 — SANAMENTO do registro preso de R$ 7.047,79 (conta Bradesco): ajustes
--      antigos de saldo com status 'cancelado' pelo estorno antigo, sem
--      movimentacao_conta e com o efeito já fora do saldo. Ficariam como
--      fantasmas e o idempotency_key deles devolvia 'duplicado' a novos
--      ajustes. Sanado: soft delete (histórico inativo), NUNCA reversão dupla
--      (o reparo anterior de 20261123181500 já havia devolvido o saldo).
-- ============================================================================
UPDATE public.lancamentos l
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE l.tipo = 'ajuste'
  AND l.subtipo_ajuste = 'ajuste_saldo_conta'
  AND l.status_pagamento = 'cancelado'
  AND l.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes_conta m
    WHERE m.lancamento_id = l.id AND m.workspace_id = l.workspace_id
  );

-- ============================================================================
-- A3 — excluir_ajuste_saldo_rpc (NOVA): retira SÓ o efeito daquele ajuste do
--      saldo, preservando movimentações posteriores. Registro fica como
--      histórico inativo (soft delete da arquitetura vigente, NÃO volta a
--      aparecer como pendente). Uma lógica só: servirá depois para a lista
--      geral, o histórico da Central e o histórico da conta (Partes B e C).
-- Exemplo do PDF: base 1.000, ajuste +50, movimentação posterior −20,
-- saldo 1.030; excluir o ajuste → saldo 980 (a movimentação permanece).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.excluir_ajuste_saldo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_lanc RECORD;
  v_conta RECORD;
  v_mov RECORD;
  v_saldo_novo numeric;
  v_saldo_antes numeric;
BEGIN
  IF NOT public.is_member_of_workspace(p_workspace_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não é membro do workspace');
  END IF;

  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.tipo <> 'ajuste' OR v_lanc.subtipo_ajuste <> 'ajuste_saldo_conta' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não é um ajuste de saldo da conta');
  END IF;

  -- Idempotência: já excluído → confirma sem tocar de novo no saldo
  IF v_lanc.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'ja_excluido', true);
  END IF;

  -- Movimentação DESTE lançamento: se existir, é o efeito a retirar do saldo
  SELECT * INTO v_mov
  FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_conta
    FROM public.contas
    WHERE id = COALESCE(v_mov.conta_id, v_lanc.conta_origem_id)
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta não encontrada');
    END IF;

    -- Retira SÓ o efeito deste ajuste (entrada somou → subtrai; saída subtraiu → soma).
    -- As movimentações POSTERIORES permanecem compostas no saldo.
    IF v_mov.tipo = 'entrada' THEN
      v_saldo_novo := ROUND(COALESCE(v_conta.saldo_atual, 0) - v_mov.valor, 2);
    ELSE
      v_saldo_novo := ROUND(COALESCE(v_conta.saldo_atual, 0) + v_mov.valor, 2);
    END IF;

    v_saldo_antes := v_conta.saldo_atual;

    UPDATE public.contas
    SET saldo_atual = v_saldo_novo,
        updated_at = NOW()
    WHERE id = v_conta.id AND workspace_id = p_workspace_id;
  ELSE
    -- Sem movimentação (caso do registro antigo travado): o efeito já não está
    -- no saldo — nada a reverter, evita REVERSÃO DUPLA.
    v_saldo_novo := NULL;
    v_saldo_antes := NULL;
  END IF;

  -- Remove a movimentação do ajuste (o histórico do saldo volta ao estado sem ele)
  DELETE FROM public.movimentacoes_conta
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Soft delete da arquitetura vigente: registro fica como histórico inativo
  -- (deleted_at preenchido), NUNCA volta a aparecer como pendente/joia para baixo
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Histórico da conciliação passa a refletir a exclusão (ajustado = false:
  -- a divergência apurada permanece como registro, mas o ajuste não está mais
  -- efetivado no saldo)
  UPDATE public.conciliacoes_conta
  SET ajustado = false,
      updated_at = NOW()
  WHERE lancamento_ajuste_id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'exclusao_ajuste_saldo',
    jsonb_build_object('valor_ajuste', v_lanc.valor,
                       'direcao', v_mov.tipo,
                       'saldo_antes', v_saldo_antes),
    jsonb_build_object('status', 'excluido', 'deleted_at', true,
                       'saldo_novo', v_saldo_novo),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'excluido', true,
    'saldo_novo', v_saldo_novo
  );
END;
$function$;
