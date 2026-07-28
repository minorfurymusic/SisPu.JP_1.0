begin;

create table if not exists usuarios (
    id bigserial primary key,
    login text not null unique,
    nome text not null,
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

create table if not exists secretarias (
    id bigserial primary key,
    codigo_legado integer unique,
    nome text not null unique,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create table if not exists unidades (
    id bigserial primary key,
    codigo_legado integer unique,
    secretaria_id bigint not null references secretarias(id),
    nome text not null,
    endereco text,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    unique (secretaria_id, nome)
);

create table if not exists despesas (
    id bigserial primary key,
    codigo_legado integer unique,
    descricao text not null unique,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create table if not exists itens_despesas (
    id bigserial primary key,
    codigo_numero text not null unique,
    despesa_id bigint not null references despesas(id),
    unidade_id bigint not null references unidades(id),
    tipo_fone text,
    medidor text,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create table if not exists lancamentos (
    id bigserial primary key,
    item_despesa_id bigint not null references itens_despesas(id),
    mes_ano date not null,
    consumo numeric(14,2) not null default 0,
    valor_total numeric(14,2) not null default 0,
    valor_imposto numeric(14,2) not null default 0,
    valor_celular numeric(14,2) not null default 0,
    valor_internet numeric(14,2) not null default 0,
    valor_diversos numeric(14,2) not null default 0,
    valor_linha_privada numeric(14,2) not null default 0,
    valor_credito numeric(14,2) not null default 0,
    data_lancamento date,
    codigo_legado_numero text,
    mes_ano_legado text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    unique (item_despesa_id, mes_ano)
);

create table if not exists pessoas (
    id bigserial primary key,
    codigo_legado integer unique,
    nome text not null,
    tipo_pessoa text,
    cpf_cnpj text unique,
    telefone_residencial text,
    telefone_comercial text,
    telefone_celular text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create table if not exists contatos_email (
    id bigserial primary key,
    descricao text not null,
    email text not null,
    criado_em timestamptz not null default now()
);

create table if not exists logs_erros (
    id bigserial primary key,
    origem text,
    mensagem text not null,
    ocorrido_em timestamptz,
    arquivo_origem text,
    linha_original text,
    criado_em timestamptz not null default now()
);

create table if not exists auditoria_registros (
    id bigserial primary key,
    tabela text not null,
    registro_pk text,
    acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
    usuario text not null default coalesce(current_setting('app.usuario', true), current_user),
    valor_antigo jsonb,
    valor_novo jsonb,
    criado_em timestamptz not null default now()
);

create or replace function set_atualizado_em()
returns trigger language plpgsql as $$
begin
    new.atualizado_em = now();
    return new;
end;
$$;

create or replace function auditar_registro()
returns trigger language plpgsql as $$
declare
    pk text;
    antigo jsonb;
    novo jsonb;
begin
    if tg_op = 'DELETE' then
        antigo = to_jsonb(old);
        pk = coalesce(antigo->>'id', antigo->>'codigo_legado', antigo->>'codigo_numero', antigo->>'cpf_cnpj');
        insert into auditoria_registros(tabela, registro_pk, acao, valor_antigo)
        values (tg_table_name, pk, tg_op, antigo);
        return old;
    elsif tg_op = 'UPDATE' then
        antigo = to_jsonb(old);
        novo = to_jsonb(new);
        pk = coalesce(novo->>'id', novo->>'codigo_legado', novo->>'codigo_numero', novo->>'cpf_cnpj');
        insert into auditoria_registros(tabela, registro_pk, acao, valor_antigo, valor_novo)
        values (tg_table_name, pk, tg_op, antigo, novo);
        return new;
    else
        novo = to_jsonb(new);
        pk = coalesce(novo->>'id', novo->>'codigo_legado', novo->>'codigo_numero', novo->>'cpf_cnpj');
        insert into auditoria_registros(tabela, registro_pk, acao, valor_novo)
        values (tg_table_name, pk, tg_op, novo);
        return new;
    end if;
end;
$$;

create trigger trg_secretarias_atualizado before update on secretarias
for each row execute function set_atualizado_em();
create trigger trg_unidades_atualizado before update on unidades
for each row execute function set_atualizado_em();
create trigger trg_despesas_atualizado before update on despesas
for each row execute function set_atualizado_em();
create trigger trg_itens_despesas_atualizado before update on itens_despesas
for each row execute function set_atualizado_em();
create trigger trg_lancamentos_atualizado before update on lancamentos
for each row execute function set_atualizado_em();
create trigger trg_pessoas_atualizado before update on pessoas
for each row execute function set_atualizado_em();

create trigger aud_secretarias after insert or update or delete on secretarias
for each row execute function auditar_registro();
create trigger aud_unidades after insert or update or delete on unidades
for each row execute function auditar_registro();
create trigger aud_despesas after insert or update or delete on despesas
for each row execute function auditar_registro();
create trigger aud_itens_despesas after insert or update or delete on itens_despesas
for each row execute function auditar_registro();
create trigger aud_lancamentos after insert or update or delete on lancamentos
for each row execute function auditar_registro();
create trigger aud_pessoas after insert or update or delete on pessoas
for each row execute function auditar_registro();

insert into usuarios(login, nome)
values ('admin', 'Administrador')
on conflict (login) do nothing;

commit;
