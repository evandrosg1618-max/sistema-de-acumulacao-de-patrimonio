-- Migration: correção do UPDATE da conciliação em excluir_ajuste_saldo_rpc
-- Versão: 20261125020000
--
-- BUG PROVADO (homologação + toast do usuário): o UPDATE final em
-- public.conciliacoes_conta usava `updated_at = NOW()`, mas essa tabela NÃO
-- possui a coluna updated_at (apenas created_at — conferido no schema live).
-- O Postgres rejeita o UPDATE e a exclusão inteira falha com:
--   column "updated_at" of relation "conciliacoes_conta" does not exist
--
-- Correção: recriar a função SEM `updated_at` nesse UPDATE (mantém apenas
-- `ajustado = false`). NADA mais muda na função — nem lógica, nem auditoria,
-- nem RETURN (corpo idêntico à versão 20261125010000, inclusive a blindagem
-- E3 do caso sem movimentacao_conta).

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
  v_conta_encontrada boolean := false;
  v_mov RECORD;
  v_saldo_novo numeric;
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
    v_conta_encontrada := true;

    -- Retira SÓ o efeito deste ajuste (entrada somou → subtrai; saída subtraiu → soma).
    -- As movimentações POSTERIORES permanecem compostas no saldo.
    IF v_mov.tipo = 'entrada' THEN
      v_saldo_novo := ROUND(COALESCE(v_conta.saldo_atual, 0) - v_mov.valor, 2);
    ELSE
      v_saldo_novo := ROUND(COALESCE(v_conta.saldo_atual, 0) + v_mov.valor, 2);
    END IF;

    UPDATE public.contas
    SET saldo_atual = v_saldo_novo,
        updated_at = NOW()
    WHERE id = v_conta.id AND workspace_id = p_workspace_id;
  ELSE
    -- Sem movimentação (caso do registro antigo travado): o efeito já não está
    -- no saldo — nada a reverter, evita REVERSÃO DUPLA.
    -- Blindagem E3: resolve v_conta com segurança (pela conta de origem do
    -- lançamento) para a auditoria/RETURN não referenciarem RECORD vazio.
    v_saldo_novo := NULL;
    IF v_lanc.conta_origem_id IS NOT NULL THEN
      SELECT * INTO v_conta
      FROM public.contas
      WHERE id = v_lanc.conta_origem_id
        AND workspace_id = p_workspace_id
        AND deleted_at IS NULL
      FOR UPDATE;
      v_conta_encontrada := FOUND;
    END IF;
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
  -- efetivado no saldo).
  -- FIX: conciliacoes_conta NÃO tem coluna updated_at (só created_at) — o
  -- UPDATE anterior rejeitava e abortava a exclusão inteira.
  UPDATE public.conciliacoes_conta
  SET ajustado = false
  WHERE lancamento_ajuste_id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Auditoria — sempre usa COALESCE para não depender de v_conta atribuído
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'exclusao_ajuste_saldo',
    jsonb_build_object('valor_ajuste', v_lanc.valor,
                       'direcao', COALESCE(v_mov.tipo, NULL),
                       'saldo_antes', CASE WHEN v_conta_encontrada THEN v_conta.saldo_atual END),
    jsonb_build_object('status', 'excluido', 'deleted_at', true,
                       'saldo_novo', COALESCE(v_saldo_novo,
                         CASE WHEN v_conta_encontrada THEN v_conta.saldo_atual END)),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'excluido', true,
    'saldo_novo', COALESCE(v_saldo_novo,
      CASE WHEN v_conta_encontrada THEN v_conta.saldo_atual END)
  );
END;
$function$;
