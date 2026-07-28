# SisPubInt Python

Recriação desktop do **Sistema Público Interno - Administração / Despesas** em Python, PySide6 e PostgreSQL.

Este projeto é uma base inicial para substituir o sistema legado preservando:

- dados antigos importados do banco legado;
- histórico completo de inclusão, alteração e exclusão;
- logs técnicos de erro;
- relatórios administrativos.

## Stack

- Python 3.11+
- PySide6 para interface desktop
- PostgreSQL para banco de dados
- psycopg 3 para acesso ao banco
- migrations SQL versionadas no GitHub

## Módulos iniciais

- Secretarias
- Unidades
- Despesas
- Itens de despesas
- Lançamentos mensais
- Auditoria de registros
- Logs de erro
- Relatórios baseados nos relatórios antigos identificados

## Configuração

1. Crie um banco PostgreSQL vazio.
2. Copie `.env.example` para `.env` e ajuste a conexão.
3. Execute as migrations em `database/migrations`.
4. Instale dependências:

```bash
pip install -e .
```

5. Execute:

```bash
sispubint
```

## Observação sobre o sistema antigo

A base foi criada a partir de levantamento funcional dos arquivos fornecidos, sem decompilar ou copiar código proprietário do executável legado.
