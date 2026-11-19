-- T6 / TESTE CAPTURA 4 — limpeza das importações de captura de 18–19/11/2026.
-- Contexto: bug de idempotência na importação criou grupos duplicados ("aberrações",
-- 4 cópias idênticas de cada grupo) e lançamentos com competencia '2026-12' para
-- compra de 18/11 (dessincroniza o Orçamento). O usuário vai reimportar a mesma NFC-e.
--
-- Estratégia (restritiva):
-- 1. Sessões de captura criadas 18–19/11/2026.
-- 2. Lançamentos a excluir = vinculados via captura_sessao_itens.lancamento_criado_id
--    dessas sessões, MAIS os grupos duplicados sem vínculo (reconhecíveis por
--    idempotency_key IS NULL, meio CARTAO, categoria_id IS NULL e descrição/valor
--    idênticos aos de um item de sessão do período, criados no mesmo intervalo).
-- 3. Lançamentos manuais/de fatura são preservados (só entram os que casam com itens
--    de captura ou são duplicados exatos desses itens).
-- 4. Reset dos itens: lancamento_criado_id = null, status 'revisar', mensagem_erro null.
--    Sessão volta a 'revisao' (preserva data/valor/imagens).
-- 5. idempotency_key NULA é preservada (não viola a unique parcial) — o fix do código
--    (T2) passa a gravar a chave a partir de agora.

BEGIN;

-- Guarda: nada a fazer se não houver sessões no período
DO $$
DECLARE
  ids_sessoes uuid[];
  ids_itens uuid[];
  qtd_lanc int := 0;
BEGIN
  SELECT array_agg(id) INTO ids_sessoes
  FROM public.captura_sessoes
  WHERE created_at >= '2026-11-18 00:00:00+00' AND created_at < '2026-11-20 00:00:00+00';

  IF ids_sessoes IS NULL THEN
    RAISE NOTICE 'T6: nenhuma sessão de captura em 18-19/11/2026 — nada a limpar';
    RETURN;
  END IF;

  SELECT array_agg(id) INTO ids_itens
  FROM public.captura_sessao_itens
  WHERE sessao_id = ANY(ids_sessoes);

  -- Exclusão dos lançamentos vinculados aos itens dessas sessões
  IF ids_itens IS NOT NULL THEN
    WITH alvos AS (
      SELECT l.id
      FROM public.lancamentos l
      JOIN public.captura_sessao_itens i ON i.lancamento_criado_id = l.id
      WHERE i.id = ANY(ids_itens)
    )
    UPDATE public.lancamentos l
    SET deleted_at = now(), updated_at = now()
    FROM alvos
    WHERE l.id = alvos.id AND l.deleted_at IS NULL;
    GET DIAGNOSTICS qtd_lanc = ROW_COUNT;
    RAISE NOTICE 'T6: % lançamentos vinculados a itens de captura (soft delete)', qtd_lanc;

    -- Grupos "aberrações": cópias SEM vínculo, criadas no mesmo intervalo, com o MESMO
    -- valor e descrição de um item de captura (o create sucedeu e o vínculo falhou).
    -- Restritivo: precisa casar com item de sessão do período (descricao + valor) e
    -- ser do tipo despesa/CARTAO, sem categoria e sem idempotency_key.
    WITH alvos AS (
      SELECT DISTINCT l.id
      FROM public.lancamentos l
      JOIN public.captura_sessao_itens i
        ON upper(rtrim(i.descricao)) = upper(rtrim(l.descricao))
       AND i.valor = l.valor
      JOIN public.captura_sessoes s ON s.id = i.sessao_id
      WHERE s.id = ANY(ids_sessoes)
        AND i.lancamento_criado_id IS NULL
        AND l.created_at >= '2026-11-18 00:00:00+00'
        AND l.created_at < '2026-11-20 00:00:00+00'
        AND l.tipo = 'despesa'
        AND l.meio_pagamento_tipo = 'CARTAO'
        AND l.categoria_id IS NULL
        AND l.idempotency_key IS NULL
        AND l.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.captura_sessao_itens i2
          WHERE i2.lancamento_criado_id = l.id
        )
    )
    UPDATE public.lancamentos l
    SET deleted_at = now(), updated_at = now()
    FROM alvos
    WHERE l.id = alvos.id AND l.deleted_at IS NULL;
    GET DIAGNOSTICS qtd_lanc = ROW_COUNT;
    RAISE NOTICE 'T6: % lançamentos sem vínculo (cópias) excluídos', qtd_lanc;
  END IF;

  -- Reset dos itens: volta a revisão, sem vínculo nem erro
  UPDATE public.captura_sessao_itens
  SET lancamento_criado_id = NULL,
      status = 'revisar',
      mensagem_erro = NULL,
      updated_at = now()
  WHERE sessao_id = ANY(ids_sessoes);
  GET DIAGNOSTICS qtd_lanc = ROW_COUNT;
  RAISE NOTICE 'T6: % itens de captura resetados', qtd_lanc;

  -- Sessão volta a revisão (preserva data, valor_total e imagens)
  UPDATE public.captura_sessoes
  SET status = 'revisao', updated_at = now()
  WHERE id = ANY(ids_sessoes) AND status <> 'revisao';
END $$;

COMMIT;

-- Idempotência estrutural para o T2: impede dois lançamentos com a MESMA chave
-- (unique parcial — chaves nulas continuam livres).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lancamentos_workspace_idempotency_key
  ON public.lancamentos (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
