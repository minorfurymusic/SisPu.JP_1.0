# SisPu.JP 2.0

Sistema de gestão de despesas públicas (energia, água, telefonia) do Município de Rio do Sul.

## Stack ativa

Este repositório é o sistema web em uso: **React + Vite** no front-end e **Express**
no back-end (`server.ts`), com extração de faturas assistida por IA (Gemini) e
fallback heurístico local quando a IA não está disponível.

```bash
bun install
bun run dev    # sobe o servidor em http://localhost:3000
bun run test   # testes do parser de faturas
bun run lint   # type-check (tsc --noEmit)
```

Configure `.env` (veja `.env.example`) com `GEMINI_API_KEY` e `SESSION_SECRET` antes
de rodar em produção. No primeiro início, um usuário `admin` é criado com a senha
padrão definida em `SENHA_PADRAO_INICIAL` (ou `TrocarSenha123!` se não configurada) —
troque-a assim que possível e use a tela **Usuários** (menu superior, visível apenas
para administradores) para criar as contas dos demais servidores.

## sispu_repo/

Esse diretório contém um protótipo desktop separado em Python/PySide6/PostgreSQL que
nunca chegou a compartilhar banco ou código com o sistema web acima. Está arquivado
como referência histórica — veja o aviso no início de `sispu_repo/README.md`.
