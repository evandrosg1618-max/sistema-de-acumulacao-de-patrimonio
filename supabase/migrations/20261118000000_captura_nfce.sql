-- v0.0.98 — Captura de NFC-e (sessões de captura, imagens e itens candidatos)
-- Idempotente. Banco = fonte da verdade. RLS por workspace.
-- Regra crítica: lancamento_criado_id é APENAS rastreabilidade (sem FK em lancamentos):
-- excluir sessão/imagem NUNCA exclui lançamentos financeiros já criados.

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.captura_sessoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tipo_documento text not null default 'NFCE',           -- FATURA | NFCE | NFE
  trilha text not null default 'papel',                  -- papel (foto) | digital (captura de tela)
  status text not null default 'capturando',             -- capturando|processando|revisao|importada|parcial|erro|descartada
  data_captura date,
  data_documento date,
  meio_pagamento_id uuid references public.meios_pagamento(id) on delete set null,
  meio_pagamento_tipo text,
  meio_pagamento_nome text,
  valor_total_documento numeric default 0,
  quantidade_imagens integer not null default 0,
  quantidade_itens integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.captura_sessao_imagens (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.captura_sessoes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ordem integer not null default 1,
  storage_path text not null,
  recorte jsonb,                                         -- {x,y,w,h} da região confirmada
  trilha text not null default 'papel',
  created_at timestamptz not null default now()
);

create table if not exists public.captura_sessao_itens (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.captura_sessoes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ordem integer not null default 1,
  selecionado boolean not null default true,
  descricao text not null,
  valor numeric not null default 0,
  status text not null default 'pronto',                 -- pronto|revisar|repetido|agrupado|importado|erro
  confianca text default 'alta',
  repetido_entre_capturas boolean not null default false,
  data date,
  meio_pagamento_id uuid references public.meios_pagamento(id) on delete set null,
  meio_pagamento_tipo text,
  meio_pagamento_nome text,
  categoria_id uuid references public.categorias(id) on delete set null,
  subcategoria_id uuid references public.subcategorias(id) on delete set null,
  modalidade_saida text not null default 'compra_propria',
  valor_proprio numeric,
  valor_terceiros numeric,
  afeta_resultado boolean not null default true,
  afeta_orcamento boolean not null default true,
  observacao text,
  lancamento_criado_id uuid,                             -- rastreabilidade apenas, sem FK
  mensagem_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_captura_sessoes_ws on public.captura_sessoes(workspace_id, created_at desc);
create index if not exists idx_captura_sessoes_ws_status on public.captura_sessoes(workspace_id, status);
create index if not exists idx_captura_imagens_sessao on public.captura_sessao_imagens(sessao_id, ordem);
create index if not exists idx_captura_itens_sessao on public.captura_sessao_itens(sessao_id, ordem);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
alter table public.captura_sessoes enable row level security;
alter table public.captura_sessao_imagens enable row level security;
alter table public.captura_sessao_itens enable row level security;

drop policy if exists captura_sessoes_all on public.captura_sessoes;
create policy captura_sessoes_all on public.captura_sessoes for all to authenticated
  using (workspace_id in (select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'))
  with check (workspace_id in (select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'));

drop policy if exists captura_imagens_all on public.captura_sessao_imagens;
create policy captura_imagens_all on public.captura_sessao_imagens for all to authenticated
  using (workspace_id in (select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'))
  with check (workspace_id in (select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'));

drop policy if exists captura_itens_all on public.captura_sessao_itens;
create policy captura_itens_all on public.captura_sessao_itens for all to authenticated
  using (workspace_id in (select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'))
  with check (workspace_id in (select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'));

-- ---------------------------------------------------------------------------
-- 3. Bucket PRIVADO "capturas" + policies de Storage restritas ao workspace
--    (caminho: {workspace_id}/{sessao_id}/... ; sem URL pública, acesso por URL assinada)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capturas', 'capturas', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;

drop policy if exists capturas_select_ws on storage.objects;
create policy capturas_select_ws on storage.objects for select to authenticated
  using (
    bucket_id = 'capturas'
    and ((storage.foldername(name))[1])::uuid in (
      select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'
    )
  );

drop policy if exists capturas_insert_ws on storage.objects;
create policy capturas_insert_ws on storage.objects for insert to authenticated
  with check (
    bucket_id = 'capturas'
    and ((storage.foldername(name))[1])::uuid in (
      select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'
    )
  );

drop policy if exists capturas_update_ws on storage.objects;
create policy capturas_update_ws on storage.objects for update to authenticated
  using (
    bucket_id = 'capturas'
    and ((storage.foldername(name))[1])::uuid in (
      select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'
    )
  );

drop policy if exists capturas_delete_ws on storage.objects;
create policy capturas_delete_ws on storage.objects for delete to authenticated
  using (
    bucket_id = 'capturas'
    and ((storage.foldername(name))[1])::uuid in (
      select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.status = 'ativo'
    )
  );
