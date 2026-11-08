-- =====================================================================
-- R5 (PDF seção 15) — Saneamento da carga inicial: lançamentos FILHOS
-- duplicados de compras parceladas.
--
-- Diagnóstico verificado no banco (2026-11): a importação inicial
-- ("Dados Iniciais de Cartões / Fatura inicial / Importado via Fatura PDF")
-- criou, além da estrutura correta (1 lançamento PAI + N registros na
-- tabela `parcelas`), também N lançamentos FILHOS duplicados
-- (numero_parcela > 1, serie_id IS NULL, lancamento_pai_id = pai).
-- Isso causava a exibição "pai + parcelas" na tela Lançamentos com
-- badges duplamente divididos ("5 vezes de 6,40").
--
-- Estrutura correta preservada (PDF seção 5):
--   1 lançamento pai (valor TOTAL da compra)
--   + N registros na tabela `parcelas` (valor exato de cada cobrança)
--
-- Segurança:
--   • Idempotente: roda quantas vezes for preciso sem efeito extra
--     (só soft-deleta filhos ATIVOS; um filho já deletado não é tocado).
--   • NUNCA destrutivo: soft-delete (deleted_at), nenhuma linha removida.
--   • Só afeta filhos cujo pai está ATIVO e possui registros em
--     `parcelas` (garantia de que a fatura continua íntegra).
--   • Filhos com pais pagos: mantêm status 'pago' apenas quando o PAI
--     também está pago (consistência de competência); um filho pago com
--     pai pendente não é alterado além do soft-delete, pois o valor da
--     fatura vem exclusivamente da tabela `parcelas` (regulado por
--     20261025160000_bloco1_fatura_somente_parcelas_e_recalculo.sql).
--   • Auditoria preservada: registra em auditoria_operacoes antes do
--     soft-delete e não apaga o histórico existente dos filhos.
--   • RLS: roda como migration (acesso full do dono do schema), sem
--     alterar nenhuma policy.
--   • Resultado/Orçamento não mudam: filhos já eram EXCLUÍDOS do
--     Resultado (RPC Competência Integral) e das faturas (só `parcelas`).
-- =====================================================================

-- 1) Soft-delete dos filhos duplicados (idempotente)
WITH filhos_duplicados AS (
  SELECT l.id,
         l.workspace_id,
         l.lancamento_pai_id,
         l.status_pagamento,
         to_jsonb(l) AS estado_anterior
  FROM public.lancamentos l
  JOIN public.lancamentos pai
    ON pai.id = l.lancamento_pai_id
   AND pai.deleted_at IS NULL
  WHERE l.deleted_at IS NULL
    AND l.serie_id IS NULL
    AND l.numero_parcela > 1
    AND EXISTS (
      SELECT 1 FROM public.parcelas p
      WHERE p.lancamento_id = pai.id
    )
)
INSERT INTO public.auditoria_operacoes (
  workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
)
SELECT
  f.workspace_id,
  'lancamentos',
  f.id,
  'saneamento_filhos_parcelados',
  f.estado_anterior,
  jsonb_build_object(
    'deleted_at', NOW(),
    'motivo', 'duplicidade carga inicial: pai + filhos + parcelas (PDF seção 15)',
    'lancamento_pai_id', f.lancamento_pai_id,
    'status_pagamento_filho', f.status_pagamento
  ),
  NULL
FROM filhos_duplicados f
WHERE NOT EXISTS (
  SELECT 1 FROM public.auditoria_operacoes a
  WHERE a.entidade = 'lancamentos'
    AND a.entidade_id = f.id
    AND a.acao = 'saneamento_filhos_parcelados'
);

UPDATE public.lancamentos l
SET deleted_at = NOW(),
    updated_at = NOW()
FROM public.lancamentos pai
WHERE pai.id = l.lancamento_pai_id
  AND pai.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.parcelas p WHERE p.lancamento_id = pai.id
  )
  AND l.deleted_at IS NULL
  AND l.serie_id IS NULL
  AND l.numero_parcela > 1;

-- 2) Verificação de integridade pós-saneamento (não destrutivo): se
-- sobrasse qualquer filho ativo sem pai ativo com parcelas, a migration
-- falha e nada é aplicado — evita ocultar cobrança real por engano.
DO $$
DECLARE
  v_restantes int;
BEGIN
  SELECT count(*) INTO v_restantes
  FROM public.lancamentos l
  WHERE l.deleted_at IS NULL
    AND l.serie_id IS NULL
    AND l.numero_parcela > 1;

  IF v_restantes > 0 THEN
    RAISE EXCEPTION
      'Saneamento R5: ainda existem % lançamentos filhos ativos de compras parceladas sem pai ativo com parcelas — revisar manualmente antes de prosseguir.',
      v_restantes;
  END IF;
END $$;
