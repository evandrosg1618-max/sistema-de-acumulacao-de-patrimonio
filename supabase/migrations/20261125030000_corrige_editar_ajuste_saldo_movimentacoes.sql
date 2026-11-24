-- Correção do bug de banco no Editar do Ajuste de Saldo Bancário (padrão do bug da
-- exclusão corrigido na migration 20261125020000):
-- public.movimentacoes_conta NÃO possui as colunas 'observacao' nem 'updated_at'
-- (só created_at) — o UPDATE dentro de editar_ajuste_saldo_rpc as referenciava e o
-- Postgres rejeitava o UPDATE inteiro com
-- 'column "observacao" of relation "movimentacoes_conta" does not exist'.
-- public.conciliacoes_conta NÃO possui 'updated_at' (só created_at) — mesmo erro no
-- UPDATE dela dentro da mesma função.
-- Esta migration recria public.editar_ajuste_saldo_rpc IDÊNTICA à vigente, exceto:
--   1. UPDATE movimentacoes_conta: removidas as linhas
--        observacao = NULLIF(TRIM(COALESCE(p_observacao, '')), '')  e  updated_at = NOW()
--   2. UPDATE conciliacoes_conta: removida a linha  updated_at = NOW()
-- Nada mais muda na função (lancamentos e contas têm os campos certos — intocadas).
-- Sem migração de dados: registros inativos ("REGISTRO INATIVO — SEM EFEITO NO SALDO")
-- seguem como estão (idempotência correta, não limpar).

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

  -- Saldo-base do ajuste = saldo registrado imediatamente ANTES do ajuste
  -- (conciliação do ajuste), que é o ponto de partida do novo cálculo.
  v_saldo_base_ajuste := v_saldo_sem_este_ajuste;

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

  -- Substitui a movimentação DESTE lançamento (as demais movimentações ficam intactas).
  -- movimentacoes_conta só tem created_at — sem observacao/updated_at aqui.
  UPDATE public.movimentacoes_conta
  SET tipo = v_nova_direcao,
      valor = v_novo_ajuste_abs,
      data = p_data,
      descricao = 'Ajuste do saldo da conta'
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

  -- Conciliação original do ajuste: registra a edição (mantém histórico auditável).
  -- conciliacoes_conta só tem created_at — sem updated_at aqui.
  UPDATE public.conciliacoes_conta
  SET data_extrato = p_data,
      saldo_sistema = v_saldo_base_ajuste,
      saldo_extrato = ROUND(p_novo_saldo_real, 2),
      divergencia = v_novo_ajuste,
      observacao = NULLIF(TRIM(COALESCE(p_observacao, '')), '')
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
