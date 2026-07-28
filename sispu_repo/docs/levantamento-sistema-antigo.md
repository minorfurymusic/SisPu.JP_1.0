# Levantamento inicial do sistema antigo

Arquivos analisados funcionalmente:

- `SisPubInt.exe`
- `OldSisPubInt.exe`
- `Temp.htm`
- `ErrorLog.txt`
- DLLs PostgreSQL `libpq`

## Indícios técnicos

- Aplicação desktop Windows 32-bit.
- Uso de PostgreSQL via `libpq`.
- Componentes compatíveis com Delphi/Zeos/QuickReport.

## Telas e módulos encontrados

- Cadastro de Secretarias
- Cadastro de Unidades
- Cadastro de Despesas
- Cadastro de Itens de Despesas
- Lançamento de Despesas
- Relatórios
- Resumo de Lançamentos por Secretaria
- Pessoas
- Contatos de e-mail

## Relatório HTML encontrado

`Temp.htm` contém relatório de resumo de lançamentos de despesas por secretaria, com colunas:

- Secretaria
- Despesa
- Número
- Nº Medidor
- Mês/Ano
- Consumo
- Valor Total
- Valor LP

## Campos legados identificados

- `CODSEC`, `DESSEC`
- `CODUNI`, `DESUNI`, `ENDUNI`
- `CODDSP`, `DESDSP`
- `CODNUM`, `MEDITM`, `TPFONE`
- `MESANO`, `CONSUMO`, `VLRTOT`, `VLRIMP`, `VLRCEL`, `VLRINT`, `VLRDIV`, `VLRLP`, `VLRCRED`, `DATALANC`
- `CODPES`, `NOMPES`, `TPPES`, `CNPJCPF`, `FRESPES`, `FCOMPES`, `FCELPES`
