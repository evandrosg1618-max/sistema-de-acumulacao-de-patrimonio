-- Migration: Correção de Associação de Membros e Suporte Completo a Colaboradores
-- 1. Garante que qualquer membro ativo consiga ler e operar no workspace
-- 2. Alinha membros já convidados para o workspace correto e perfil correspondente do convite aceito

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Se houver algum convite aceito cujo usuário não esteja como membro no workspace do convite, adiciona/atualiza
  FOR v_rec IN 
    SELECT ui.workspace_id, ui.email, ui.perfil, p.id as user_id
    FROM public.user_invitations ui
    JOIN public.profiles p ON LOWER(p.email) = LOWER(ui.email)
    WHERE ui.status = 'aceito'
  LOOP
    INSERT INTO public.workspace_members (workspace_id, user_id, perfil, status, accepted_at)
    VALUES (v_rec.workspace_id, v_rec.user_id, v_rec.perfil, 'ativo', NOW())
    ON CONFLICT (workspace_id, user_id)
    DO UPDATE SET
      perfil = EXCLUDED.perfil,
      status = 'ativo',
      accepted_at = COALESCE(public.workspace_members.accepted_at, NOW());
  END LOOP;
END $$;

-- 3. Atualizar função RPC de aceitar convite para garantir que defina o perfil exatamente como no convite
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

  -- Insere ou atualiza o membro no workspace com o perfil EXATO do convite
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
