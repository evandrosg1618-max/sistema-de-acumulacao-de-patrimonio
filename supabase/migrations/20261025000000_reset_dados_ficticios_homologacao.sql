-- Migration: 20261025000000_reset_dados_ficticios_homologacao.sql
-- Objetivo: Rotina única controlada de reset de dados fictícios dos 37 testes de homologação do SAP.
-- Apaga todos os lançamentos, séries/parcelas, movimentações de conta, faturas e pagamentos de fatura.
-- Restaura o saldo_atual de cada conta para 10.000,00 (saldo inicial cadastrado).
-- Preserva estritamente: contas, cartões, categorias, subcategorias, meios de pagamento, workspaces, usuários, RLS e auditoria.

DO $$
DECLARE
  r_conta RECORD;
  v_workspace_id UUID;
  v_total_lancamentos INT;
  v_total_movimentacoes INT;
  v_total_faturas INT;
  v_total_pagamentos INT;
  v_total_series INT;
BEGIN
  -- Contagem prévia para registro em auditoria
  SELECT count(*) INTO v_total_lancamentos FROM public.lancamentos;
  SELECT count(*) INTO v_total_movimentacoes FROM public.movimentacoes_conta;
  SELECT count(*) INTO v_total_faturas FROM public.faturas;
  SELECT count(*) INTO v_total_pagamentos FROM public.pagamentos_fatura;
  SELECT count(*) INTO v_total_series FROM public.series_lancamentos;

  -- 1. Desvincular e apagar referências de parcelas e faturas
  DELETE FROM public.fatura_parcelas;
  DELETE FROM public.parcelas;

  -- 2. Apagar movimentações de conta (FKs apontam para contas, lançamentos e pagamentos_fatura)
  DELETE FROM public.movimentacoes_conta;

  -- 3. Apagar pagamentos de faturas (FKs apontam para faturas e contas)
  DELETE FROM public.pagamentos_fatura;

  -- 4. Apagar faturas geradas (FKs apontam para cartões)
  DELETE FROM public.faturas;

  -- 5. Apagar lançamentos (filhos e pais)
  -- Primeiro desvincula lancamento_pai_id para evitar ciclo de FK
  UPDATE public.lancamentos SET lancamento_pai_id = NULL WHERE lancamento_pai_id IS NOT NULL;
  DELETE FROM public.lancamentos;

  -- 6. Apagar séries de lançamentos recorrentes/fixos
  DELETE FROM public.series_lancamentos;

  -- 7. Restaurar saldos de todas as contas para 10.000,00 (saldo_inicial)
  FOR r_conta IN SELECT id, workspace_id, saldo_inicial, saldo_atual FROM public.contas LOOP
    UPDATE public.contas
    SET saldo_inicial = 10000.00,
        saldo_atual = 10000.00,
        updated_at = NOW()
    WHERE id = r_conta.id;
  END LOOP;

  -- 8. Limpar orçamentos ou metas gerados nos testes se houver, preservando estrutura
  DELETE FROM public.orcamentos;
  DELETE FROM public.metas_acumulacao;

  -- 9. Registrar evento na auditoria de operações para cada workspace
  FOR v_workspace_id IN SELECT id FROM public.workspaces LOOP
    INSERT INTO public.auditoria_operacoes (
      workspace_id,
      entidade,
      entidade_id,
      acao,
      estado_anterior,
      estado_posterior
    ) VALUES (
      v_workspace_id,
      'sistema',
      v_workspace_id,
      'reset_dados_ficticios_homologacao',
      jsonb_build_object(
        'lancamentos_removidos', v_total_lancamentos,
        'movimentacoes_removidas', v_total_movimentacoes,
        'faturas_removidas', v_total_faturas,
        'pagamentos_removidos', v_total_pagamentos,
        'series_removidas', v_total_series
      ),
      jsonb_build_object(
        'status', 'banco_zerado_pronto_para_producao',
        'saldo_restaurado_por_conta', 10000.00,
        'executado_em', NOW()
      )
    );
  END LOOP;
END $$;
