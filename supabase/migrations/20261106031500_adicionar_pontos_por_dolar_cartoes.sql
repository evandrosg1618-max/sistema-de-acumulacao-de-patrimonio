-- Adicionar coluna pontos_por_dolar na tabela cartoes para pontuação de milhas/pontos
ALTER TABLE public.cartoes
ADD COLUMN IF NOT EXISTS pontos_por_dolar numeric NOT NULL DEFAULT 0;
