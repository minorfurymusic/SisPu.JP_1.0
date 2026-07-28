# Importação do legado

O sistema antigo aparenta usar PostgreSQL e tabelas com nomes como:

- `Secretarias`
- `Unidades`
- `Adm_Despesas`
- `Adm_ItensDespesas`
- `Adm_Lancamentos`
- `Adm_Contatos`
- `Pessoas`

A recomendação é exportar cada tabela do banco antigo para CSV e importar para as tabelas novas mantendo os campos `codigo_legado`, `codigo_numero`, `codigo_legado_numero` e `mes_ano_legado`.

Nunca importe diretamente no banco de produção sem antes testar em um banco temporário.
