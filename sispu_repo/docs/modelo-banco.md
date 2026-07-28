# Modelo de banco

## Objetivo

Preservar os dados antigos e permitir auditoria completa.

## Estratégia

- Usar novos IDs internos (`bigserial`).
- Guardar códigos antigos em campos `codigo_legado`.
- Auditar automaticamente alterações com triggers PostgreSQL.
- Guardar `valor_antigo` e `valor_novo` como JSONB.

## Tabelas principais

- `secretarias`
- `unidades`
- `despesas`
- `itens_despesas`
- `lancamentos`
- `pessoas`
- `contatos_email`
- `logs_erros`
- `auditoria_registros`

## Auditoria

Toda inserção, alteração e exclusão nas tabelas principais gera registro em `auditoria_registros`.
