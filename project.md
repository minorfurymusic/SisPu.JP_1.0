# Relatório de Diagnóstico de Erros, Soluções e Aprendizados do Projeto (SISPU)

Este documento centraliza o histórico completo, consolidação sem duplicidades e documentação técnica de todos os erros identificados no projeto **SISPU (Sistema de Gestão de Serviços Públicos)**, abordando suas causas raízes, soluções aplicadas e aprendizados arquiteturais.

---

## 📋 Sumário de Erros Consolidados

| ID Erro | Origem / Componente | Classificação do Erro | Status | Solução Aplicada |
|---|---|---|---|---|
| **ERR-01** | `server.ts` (Gemini API) | HTTP 429 - Quota / Rate Limit Exceeded | **Resolvido** | Enfileiramento em lotes (`CONCURRENCY = 3`), retardo inteligente (`setTimeout`) e rotação de modelos. |
| **ERR-02** | `server.ts` / SDK Gemini | HTTP 404 - Deprecated Model Name | **Resolvido** | Atualização dos nomes dos modelos na lista de candidatos e ignoramento automático de modelos descontinuados. |
| **ERR-03** | `server.ts` (Gemini API) | HTTP 503 - Service Unavailable / High Demand | **Resolvido** | Exponential backoff, retentativa automática e transição suave para parser heurístico local. |
| **ERR-04** | `documentParser.ts` / `DocumentManager.tsx` | Divergência e Perda de Páginas em PDFs Volumosos (ex: 109 pág -> 94 pág) | **Resolvido** | Sistema de Jobs assíncronos (`/api/pdf-jobs`) com rastreamento individual de status por página e re-tentativa seletiva. |
| **ERR-05** | `server.ts` / `sispu_db.json` | Concorrência de Escrita no Banco de Dados JSON | **Resolvido** | Repositório com escrita atômica e inclusão da tabela de auditoria e captura centralizada de erros (`logs_erros`). |

---

## 🔍 Detalhamento dos Erros, Soluções e Aprendizados

### 1. ERR-01: Excesso de Cota e Limite de Taxa da API de IA (HTTP 429 - Quota Exceeded)

- **Descrição do Log de Erro**:
  ```json
  {
    "error": {
      "code": 429,
      "message": "You exceeded your current quota, please check your plan and billing details... Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20",
      "status": "RESOURCE_EXHAUSTED"
    }
  }
  ```
- **Causa Raiz**:
  O envio simultâneo de requisições de extração de texto em PDFs com múltiplas páginas estourava o limite de requisições por minuto (RPM) da cota gratuita do modelo Gemini (`gemini-3.6-flash`).
- **Solução Aplicada**:
  1. **Controle de Concorrência**: Limitação de processamento em blocos pequenos (`CONCURRENCY = 3`).
  2. **Pacing / Delays Ativos**: Introdução de pausa de retardo de 800ms a 1500ms entre as iterações dos lotes e retentativas em caso de status 429.
  3. **Fallback Automático de Modelos**: Tentativa sequencial em múltiplos candidatos (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`).
  4. **Parser Heurístico Local**: Como última camada de segurança para garantir que o usuário receba a extração de dados mesmo sob indisponibilidade total da API externa.
- **Aprendizado**:
  Chamadas para APIs de Inteligência Artificial em processamento em lote (*batch processing*) nunca devem ser disparadas concorrentemente de forma ilimitada (`Promise.all` em um array gigante). É fundamental ter pacing, limitação de concorrência e estratégias de fallback resilientes.

---

### 2. ERR-02: Modelo Obsoleto ou Não Encontrado (HTTP 404 - Not Found)

- **Descrição do Log de Erro**:
  ```json
  {
    "error": {
      "code": 404,
      "message": "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.",
      "status": "NOT_FOUND"
    }
  }
  ```
- **Causa Raiz**:
  Utilização de identificadores de modelos específicos ou legados na lista de fallback que foram descontinuados pela plataforma de IA.
- **Solução Aplicada**:
  1. Atualização e padronização da lista de candidatos de IA no backend (`server.ts`) para os alias mais recentes e ativos.
  2. Tratamento do erro 404 no bloco `catch` para avançar imediatamente para o próximo modelo ativo sem logar como falha fatal do sistema.
- **Aprendizado**:
  Modelos de IA possuem ciclo de vida e descontinuações frequentes. As aplicações devem utilizar apelidos estáveis ou tratar degradação e rotação de modelos dinamicamente.

---

### 3. ERR-03: Indisponibilidade Temporária do Serviço por Alta Demanda (HTTP 503 - Service Unavailable)

- **Descrição do Log de Erro**:
  ```json
  {
    "error": {
      "code": 503,
      "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
      "status": "UNAVAILABLE"
    }
  }
  ```
- **Causa Raiz**:
  Picos momentâneos de carga nos servidores da infraestrutura de IA.
- **Solução Aplicada**:
  1. Algoritmo de retry com aguardo configurado no backend.
  2. Transição transparente para extração heurística por Expressões Regulares (Regex/OCR local) para não interromper a produtividade do usuário na interface.
- **Aprendizado**:
  Erros 503 são transitórios. A aplicação não deve falhar nem travar a UI; ela deve fallbackear graciosamente para mecanismos locais determinísticos e notificar o sistema de auditoria.

---

### 4. ERR-04: Divergência de Leitura em Lotes Volumosos de PDFs (Ex: 109 Páginas Enviadas vs. 94 Processadas)

- **Descrição do Erro**:
  Incompletude na extração e perda de páginas quando múltiplos PDFs volumosos eram submetidos em um único lote síncrono HTTP.
- **Causa Raiz**:
  Requisições HTTP síncronas para leitura de PDFs com dezenas/centenas de páginas estouravam limites de tempo de resposta (*time-out*) ou estouro de memória do worker de PDF. As páginas que falhavam eram descartadas sem registrar o motivo do erro.
- **Solução Aplicada**:
  1. **Arquitetura de Jobs de Fundo**: Implementação do endpoint `/api/pdf-jobs` que gerencia o processamento assíncrono.
  2. **Estatísticas por Página (`pageStats`)**: Cada página individual possui estado rastreado (`pending`, `success`, `error`).
  3. **Relatório de Diagnóstico de Processamento**: Exibição detalhada na interface de quantas páginas foram lidas, quais falharam e possibilidade de re-processar especificamente as páginas com falha.
- **Aprendizado**:
  Leitura e parser de documentos volumosos exige arquitetura orientada a **Jobs de Segundo Plano** com persisted state e feedback granular por página para o usuário, ao invés de requisições HTTP do tipo "tudo ou nada".

---

### 5. ERR-05: Concorrência e Gravação no Banco de Dados JSON (`sispu_db.json`)

- **Descrição do Erro**:
  Possibilidade de corrupção ou sobrescrita de dados ao realizar múltiplas operações simultâneas de edição, homologação de documentos e auditoria.
- **Causa Raiz**:
  Escrita em arquivo de banco JSON local sem bloqueio atômico de arquivo ou isolamento de concorrência no servidor Express.
- **Solução Aplicada**:
  1. Centralização de todas as operações de banco em Repositórios virtuais no Express (`server.ts`).
  2. Implementação de escrita atômica no arquivo `sispu_db.json`.
  3. Tabela dedicada `logs_erros` para rastreabilidade de todas as inconsistências ocorridas durante a execução do sistema.
- **Aprendizado**:
  Manter uma tabela de logs estruturada no próprio banco de dados possibilita identificar problemas de forma preventiva e diagnosticar falhas sem depender unicamente do console do servidor.

---

## 📌 Recomendações e Boas Práticas para a Aplicação

1. **Monitoramento de Cotas**:
   - Acompanhar a cota no console do Google AI Studio para ajustar os intervalos entre requisições conforme o volume de documentos exigido pelo órgão/secretaria.
2. **Homologação Gradual de Documentos**:
   - Manter o pipeline de 8 etapas ativo (**Seleção -> Identificação -> Parser -> Normalização -> Validação -> Conferência -> Homologação -> Persistência -> Auditoria**), pois ele garante que qualquer divergência numérica ou de valor seja corrigida antes da gravação final no banco de dados.
3. **Auditoria de Erros Ativa**:
   - A tabela `logs_erros` no sistema continuará registrando eventuais exceções com timestamp, origem e arquivo, permitindo auditorias contínuas do sistema.
