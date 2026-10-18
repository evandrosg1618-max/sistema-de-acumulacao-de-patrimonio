-- Migration: Build 3 Cartões & Fix Grants + user_invitations RLS
-- 1. Redefinir a política de SELECT em user_invitations para usar public.profiles em vez de auth.users
-- 2. Garantir grants completos para authenticated e anon nas tabelas e sequências

DO $$
BEGIN
  -- Grants nas tabelas públicas
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
  GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon, authenticated;
END $$;

-- Recriar política em user_invitations sem consultar auth.users
DROP POLICY IF EXISTS "user_invitations_select" ON public.user_invitations;
CREATE POLICY "user_invitations_select" ON public.user_invitations
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_workspace(workspace_id)
    OR email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Garantir que a tabela parcelas tenha RLS consistente
DROP POLICY IF EXISTS "parcelas_all" ON public.parcelas;
CREATE POLICY "parcelas_all" ON public.parcelas
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- Garantir coluna numero_parcela e total_parcelas em lancamentos caso desejado para facilidade de consulta direta
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS numero_parcela integer DEFAULT 1;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS total_parcelas integer DEFAULT 1;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS lancamento_pai_id uuid REFERENCES public.lancamentos(id) ON DELETE CASCADE;
