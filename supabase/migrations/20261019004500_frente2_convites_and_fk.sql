-- Adiciona FK explícita de workspace_members.user_id para profiles.id para suportar embeds automáticos no PostgREST
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_members_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Função RPC SECURITY DEFINER para consultar convite público por token de forma segura
-- Retorna os dados essenciais do convite (workspace_id, nome do workspace, email, perfil, status, se expirou)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(token_input text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_ws record;
BEGIN
  SELECT * INTO v_invite
  FROM public.user_invitations
  WHERE token_hash = token_input
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('encontrado', false, 'mensagem', 'Convite não encontrado ou inválido.');
  END IF;

  SELECT * INTO v_ws
  FROM public.workspaces
  WHERE id = v_invite.workspace_id;

  IF v_invite.status <> 'pendente' THEN
    RETURN json_build_object(
      'encontrado', true,
      'status', v_invite.status,
      'valido', false,
      'mensagem', 'Este convite já foi ' || v_invite.status || '.'
    );
  END IF;

  IF v_invite.expira_em < now() THEN
    UPDATE public.user_invitations SET status = 'expirado' WHERE id = v_invite.id;
    RETURN json_build_object(
      'encontrado', true,
      'status', 'expirado',
      'valido', false,
      'mensagem', 'Este convite expirou (validade máxima de 7 dias).'
    );
  END IF;

  RETURN json_build_object(
    'encontrado', true,
    'valido', true,
    'id', v_invite.id,
    'workspace_id', v_invite.workspace_id,
    'workspace_nome', COALESCE(v_ws.nome, 'Espaço Familiar'),
    'email', v_invite.email,
    'perfil', v_invite.perfil,
    'expira_em', v_invite.expira_em,
    'status', v_invite.status
  );
END;
$$;

-- Função RPC SECURITY DEFINER para aceitar o convite
CREATE OR REPLACE FUNCTION public.accept_invitation_by_token(token_input text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_email text;
  v_invite record;
  v_member_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('sucesso', false, 'mensagem', 'Usuário não autenticado.');
  END IF;

  -- Obter email do usuário logado
  SELECT email INTO v_user_email FROM public.profiles WHERE id = v_uid;
  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  END IF;

  SELECT * INTO v_invite
  FROM public.user_invitations
  WHERE token_hash = token_input
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('sucesso', false, 'mensagem', 'Convite não encontrado.');
  END IF;

  IF v_invite.status <> 'pendente' THEN
    RETURN json_build_object('sucesso', false, 'mensagem', 'Convite não está mais pendente.');
  END IF;

  IF v_invite.expira_em < now() THEN
    UPDATE public.user_invitations SET status = 'expirado' WHERE id = v_invite.id;
    RETURN json_build_object('sucesso', false, 'mensagem', 'Este convite expirou.');
  END IF;

  -- Insere ou atualiza o membro no workspace
  INSERT INTO public.workspace_members (
    workspace_id,
    user_id,
    perfil,
    status,
    convidado_por,
    accepted_at
  )
  VALUES (
    v_invite.workspace_id,
    v_uid,
    v_invite.perfil,
    'ativo',
    v_invite.convidado_por,
    now()
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    perfil = EXCLUDED.perfil,
    status = 'ativo',
    accepted_at = now()
  RETURNING id INTO v_member_id;

  -- Marca convite como aceito
  UPDATE public.user_invitations
  SET status = 'aceito'
  WHERE id = v_invite.id;

  -- Registra auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id,
    entidade,
    entidade_id,
    acao,
    estado_posterior,
    created_by
  )
  VALUES (
    v_invite.workspace_id,
    'workspace_members',
    v_member_id,
    'accept_invite',
    json_build_object('member_id', v_member_id, 'user_id', v_uid, 'invite_id', v_invite.id, 'perfil', v_invite.perfil),
    v_uid
  );

  RETURN json_build_object(
    'sucesso', true,
    'workspace_id', v_invite.workspace_id,
    'member_id', v_member_id,
    'mensagem', 'Convite aceito com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation_by_token(text) TO authenticated;
