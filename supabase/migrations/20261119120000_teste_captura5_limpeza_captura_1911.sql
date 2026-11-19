-- TESTE CAPTURA 5 / T5 — Limpeza dos lançamentos criados pela última captura
-- (reteste da mesma NFC-e do zero).
--
-- Regras:
-- - SOFT DELETE (deleted_at), NUNCA hard delete — reversível.
-- - Alvo EXCLUSIVO: lançamentos nascidos da captura (idempotency_key like 'captura:%')
--   criados em 2026-11-19 entre 19:22 e 19:25 UTC.
-- - NÃO toca no lançamento manual "Gasolina" (R$ 328,72, 18/11) nem em qualquer
--   outra origem/fatura — o filtro por idempotency_key já os exclui.
-- - public.parcelas NÃO tem deleted_at: não filtramos por ela; as parcelas dos
--   lançamentos soft-deletados ficam órfãs do pai invisível (pai escondido).
-- - Depois, RESETA os itens das sessões de captura que apontavam para esses
--   lançamentos: lancamento_criado_id = null, status 'revisao', sem mensagem_erro —
--   preservando valor_total, data e imagens da sessão para reimportar do zero.

-- 1) Soft delete dos lançamentos da captura
update public.lancamentos l
set deleted_at = now()
where l.deleted_at is null
  and l.idempotency_key like 'captura:%'
  and l.created_at >= '2026-11-19 19:22:00+00'
  and l.created_at <= '2026-11-19 19:25:00+00';

-- 2) Reset dos itens das sessões de captura vinculados aos lançamentos acima
update public.captura_sessao_itens i
set lancamento_criado_id = null,
    status = 'revisao',
    mensagem_erro = null,
    updated_at = now()
where i.lancamento_criado_id in (
  select l.id
  from public.lancamentos l
  where l.idempotency_key like 'captura:%'
    and l.created_at >= '2026-11-19 19:22:00+00'
    and l.created_at <= '2026-11-19 19:25:00+00'
    and l.deleted_at is not null
);
