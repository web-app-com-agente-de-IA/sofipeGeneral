-- ============================================================
-- SOFIPE - Initial database schema
-- Generated from the existing Supabase database
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id uuid not null,
  nome text not null,
  email text not null,
  perfil text not null default 'vendedor'::text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_pkey primary key (id),
  constraint profiles_email_key unique (email),
  constraint profiles_id_fkey
    foreign key (id) references auth.users(id),
  constraint profiles_perfil_check
    check (perfil = any (array['admin'::text, 'gestor'::text, 'vendedor'::text]))
);

create table public.canais_captacao (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  tipo text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),

  constraint canais_captacao_pkey primary key (id),
  constraint canais_tipo_check
    check (
      tipo = any (
        array[
          'site'::text,
          'landing_page'::text,
          'whatsapp'::text,
          'rede_social'::text,
          'meta_ads'::text,
          'google_ads'::text,
          'rd_marketing'::text,
          'crm'::text,
          'api'::text,
          'webhook'::text,
          'outro'::text
        ]
      )
    )
);

create table public.integracoes (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  tipo text not null,
  sistema text not null,
  url_api text,
  ativo boolean not null default true,
  ultimo_sync timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integracoes_pkey primary key (id),
  constraint integracoes_tipo_check
    check (
      tipo = any (
        array[
          'crm'::text,
          'api'::text,
          'webhook'::text,
          'marketing'::text,
          'outro'::text
        ]
      )
    )
);

create table public.leads (
  id uuid not null default gen_random_uuid(),
  canal_id uuid,
  responsavel_id uuid,
  nome text not null,
  empresa text,
  cargo text,
  email text,
  telefone text,
  cpf_cnpj text,
  interesse_principal text,
  status text not null default 'novo'::text,
  dados_extras jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_pkey primary key (id),
  constraint leads_canal_id_fkey
    foreign key (canal_id) references public.canais_captacao(id),
  constraint leads_responsavel_id_fkey
    foreign key (responsavel_id) references public.profiles(id),
  constraint leads_status_check
    check (
      status = any (
        array[
          'novo'::text,
          'em_qualificacao'::text,
          'qualificado'::text,
          'em_atendimento'::text,
          'proposta_enviada'::text,
          'ganho'::text,
          'perdido'::text,
          'inativo'::text
        ]
      )
    )
);

create table public.historico_status_lead (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  status_anterior text,
  status_novo text not null,
  alterado_por uuid,
  observacao text,
  created_at timestamptz not null default now(),

  constraint historico_status_lead_pkey primary key (id),
  constraint historico_status_lead_lead_id_fkey
    foreign key (lead_id) references public.leads(id),
  constraint historico_status_lead_alterado_por_fkey
    foreign key (alterado_por) references public.profiles(id)
);

create table public.interacoes_agente (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  mensagem text not null,
  remetente text not null,
  tipo_mensagem text not null default 'texto'::text,
  modelo_ia text,
  sessao_id uuid,
  created_at timestamptz not null default now(),

  constraint interacoes_agente_pkey primary key (id),
  constraint interacoes_agente_lead_id_fkey
    foreign key (lead_id) references public.leads(id),
  constraint interacoes_remetente_check
    check (
      remetente = any (
        array[
          'lead'::text,
          'agente_ia'::text,
          'usuario'::text,
          'sistema'::text
        ]
      )
    ),
  constraint interacoes_tipo_check
    check (
      tipo_mensagem = any (
        array[
          'texto'::text,
          'pergunta'::text,
          'resposta'::text,
          'sistema'::text
        ]
      )
    )
);

create table public.logs_integracao (
  id uuid not null default gen_random_uuid(),
  integracao_id uuid not null,
  lead_id uuid,
  acao text not null,
  status text not null,
  mensagem text,
  created_at timestamptz not null default now(),

  constraint logs_integracao_pkey primary key (id),
  constraint logs_integracao_integracao_id_fkey
    foreign key (integracao_id) references public.integracoes(id),
  constraint logs_integracao_lead_id_fkey
    foreign key (lead_id) references public.leads(id),
  constraint logs_integracao_status_check
    check (
      status = any (
        array[
          'sucesso'::text,
          'erro'::text,
          'pendente'::text
        ]
      )
    )
);

create table public.qualificacoes (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  pontuacao numeric not null,
  nivel_prioridade text not null,
  fit text not null,
  observacoes text,
  modelo_ia text,
  versao_prompt text,
  created_at timestamptz not null default now(),

  constraint qualificacoes_pkey primary key (id),
  constraint qualificacoes_lead_id_fkey
    foreign key (lead_id) references public.leads(id),
  constraint qualificacoes_pontuacao_check
    check (pontuacao >= 0 and pontuacao <= 100),
  constraint qualificacoes_prioridade_check
    check (
      nivel_prioridade = any (
        array[
          'baixa'::text,
          'media'::text,
          'alta'::text,
          'urgente'::text
        ]
      )
    ),
  constraint qualificacoes_fit_check
    check (
      fit = any (
        array[
          'baixo'::text,
          'medio'::text,
          'alto'::text
        ]
      )
    )
);

create table public.recomendacoes_comerciais (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  proximo_passo text not null,
  justificativa text not null,
  produto_sugerido text,
  modelo_ia text,
  versao_prompt text,
  status text not null default 'pendente'::text,
  created_at timestamptz not null default now(),

  constraint recomendacoes_comerciais_pkey primary key (id),
  constraint recomendacoes_comerciais_lead_id_fkey
    foreign key (lead_id) references public.leads(id),
  constraint recomendacoes_status_check
    check (
      status = any (
        array[
          'pendente'::text,
          'aceita'::text,
          'recusada'::text,
          'executada'::text
        ]
      )
    )
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_historico_status_lead
  on public.historico_status_lead using btree (lead_id);

create index idx_interacoes_lead
  on public.interacoes_agente using btree (lead_id);

create index idx_leads_canal
  on public.leads using btree (canal_id);

create index idx_leads_email
  on public.leads using btree (email);

create index idx_leads_responsavel
  on public.leads using btree (responsavel_id);

create index idx_leads_status
  on public.leads using btree (status);

create index idx_leads_telefone
  on public.leads using btree (telefone);

create index idx_logs_integracao
  on public.logs_integracao using btree (integracao_id);

create index idx_qualificacoes_lead
  on public.qualificacoes using btree (lead_id);

create index idx_recomendacoes_lead
  on public.recomendacoes_comerciais using btree (lead_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

create or replace function public.eh_gestor_ou_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and perfil in ('admin', 'gestor')
      and ativo = true
  );
$function$;

create or replace function public.tem_perfil(perfil_procurado text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and perfil = perfil_procurado
      and ativo = true
  );
$function$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.canais_captacao enable row level security;
alter table public.historico_status_lead enable row level security;
alter table public.integracoes enable row level security;
alter table public.interacoes_agente enable row level security;
alter table public.leads enable row level security;
alter table public.logs_integracao enable row level security;
alter table public.profiles enable row level security;
alter table public.qualificacoes enable row level security;
alter table public.recomendacoes_comerciais enable row level security;

-- ============================================================
-- POLICIES: canais_captacao
-- ============================================================

create policy "Usuários visualizam canais"
on public.canais_captacao
for select
to authenticated
using (true);

create policy "Admin e gestor criam canais"
on public.canais_captacao
for insert
to authenticated
with check (eh_gestor_ou_admin());

create policy "Admin e gestor atualizam canais"
on public.canais_captacao
for update
to authenticated
using (eh_gestor_ou_admin())
with check (eh_gestor_ou_admin());

create policy "Admin e gestor removem canais"
on public.canais_captacao
for delete
to authenticated
using (eh_gestor_ou_admin());

-- ============================================================
-- POLICIES: historico_status_lead
-- ============================================================

create policy "Acesso ao histórico de leads"
on public.historico_status_lead
for select
to authenticated
using (
  exists (
    select 1
    from public.leads
    where leads.id = historico_status_lead.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);

create policy "Inserir histórico de lead permitido"
on public.historico_status_lead
for insert
to authenticated
with check (
  exists (
    select 1
    from public.leads
    where leads.id = historico_status_lead.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);

-- ============================================================
-- POLICIES: integracoes
-- ============================================================

create policy "Admin e gestor visualizam integrações"
on public.integracoes
for select
to authenticated
using (eh_gestor_ou_admin());

create policy "Admin gerencia integrações"
on public.integracoes
for all
to authenticated
using (tem_perfil('admin'::text))
with check (tem_perfil('admin'::text));

-- ============================================================
-- POLICIES: interacoes_agente
-- ============================================================

create policy "Inserir interações permitidas"
on public.interacoes_agente
for insert
to authenticated
with check (
  exists (
    select 1
    from public.leads
    where leads.id = interacoes_agente.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);

create policy "Visualizar interações permitidas"
on public.interacoes_agente
for select
to authenticated
using (
  exists (
    select 1
    from public.leads
    where leads.id = interacoes_agente.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);

-- ============================================================
-- POLICIES: leads
-- ============================================================

create policy "Usuários visualizam leads permitidos"
on public.leads
for select
to authenticated
using (
  responsavel_id = auth.uid()
  or eh_gestor_ou_admin()
);

create policy "Usuários criam leads"
on public.leads
for insert
to authenticated
with check (
  responsavel_id = auth.uid()
  or eh_gestor_ou_admin()
);

create policy "Usuários atualizam leads permitidos"
on public.leads
for update
to authenticated
using (
  responsavel_id = auth.uid()
  or eh_gestor_ou_admin()
)
with check (
  responsavel_id = auth.uid()
  or eh_gestor_ou_admin()
);

create policy "Admin e gestor removem leads"
on public.leads
for delete
to authenticated
using (eh_gestor_ou_admin());

-- ============================================================
-- POLICIES: logs_integracao
-- ============================================================

create policy "Admin e gestor visualizam logs"
on public.logs_integracao
for select
to authenticated
using (eh_gestor_ou_admin());

create policy "Admin gerencia logs"
on public.logs_integracao
for all
to authenticated
using (tem_perfil('admin'::text))
with check (tem_perfil('admin'::text));

-- ============================================================
-- POLICIES: profiles
-- ============================================================

create policy "Admin cria perfis"
on public.profiles
for insert
to authenticated
with check (tem_perfil('admin'::text));

create policy "Admin remove perfis"
on public.profiles
for delete
to authenticated
using (tem_perfil('admin'::text));

create policy "Usuário atualiza próprio perfil"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or tem_perfil('admin'::text)
)
with check (
  id = auth.uid()
  or tem_perfil('admin'::text)
);

create policy "Usuário visualiza próprio perfil"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or tem_perfil('admin'::text)
);

-- ============================================================
-- POLICIES: qualificacoes
-- ============================================================

create policy "Inserir qualificações permitidas"
on public.qualificacoes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.leads
    where leads.id = qualificacoes.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);

create policy "Visualizar qualificações permitidas"
on public.qualificacoes
for select
to authenticated
using (
  exists (
    select 1
    from public.leads
    where leads.id = qualificacoes.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);

-- ============================================================
-- POLICIES: recomendacoes_comerciais
-- ============================================================

create policy "Inserir recomendações permitidas"
on public.recomendacoes_comerciais
for insert
to authenticated
with check (
  exists (
    select 1
    from public.leads
    where leads.id = recomendacoes_comerciais.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);

create policy "Visualizar recomendações permitidas"
on public.recomendacoes_comerciais
for select
to authenticated
using (
  exists (
    select 1
    from public.leads
    where leads.id = recomendacoes_comerciais.lead_id
      and (
        leads.responsavel_id = auth.uid()
        or eh_gestor_ou_admin()
      )
  )
);
