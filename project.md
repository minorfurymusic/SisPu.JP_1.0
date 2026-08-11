# Project Issues & Technical Incident Reports (project.md)

---

## Item Documentado: Incidente de Perda de Dados em Memória e Sobrescrita de Banco (Neon PostgreSQL)

### 1. Perda do Lote de Lançamentos em Rascunho (Sessão / Atualização / Standby)

#### **Sintoma / Descrição do Problema**
Ao realizar a extração e conferência manual de faturas via lote de documentos, todos os lançamentos digitados ou extraídos eram mantidos exclusivamente no estado interno volátil do React (`useState`). Quando o operador atualizava a página (`F5`), alternava entre as abas e visões do sistema (ex: saindo do Portal para o Painel Administrativo ou Relatórios), ou a tela entrava em inatividade/bloqueio temporário, os componentes do React desmontavam. Toda a digitação não salva era perdida, exigindo que o usuário re-importasse e re-digitasse o lote completo do zero.

#### **Causa Raiz Técnica**
Ausência de sincronização intermediária contínua do estado do lote em uma camada de armazenamento cliente-side persistente ou rascunho de servidor (`draft endpoint`). Como o estado do lote em edição existia apenas na memória Heap da aplicação SPA (`DocumentManager.tsx` e `WebPortal.tsx`), qualquer descarte de ciclo de vida do componente zerava a variável de memória.

#### **Correção Técnica Aplicada**
- **Persistência Reativa de Rascunho:** Adicionou-se persistência contínua do lote via `localStorage` (chave `sispu_lote_rascunho`) utilizando hooks de efeito reativo (`useEffect`) que escutam alterações na estrutura do lote em edição.
- **Restauração Automática:** Ao recarregar a aplicação ou navegar entre as abas do sistema, a inicialização do módulo verifica a existência do rascunho salvo e o restaura no estado do React.
- **Purga Controlada:** O rascunho mantido em disco local é purgado estritamente após a confirmação com sucesso da rota `/api/lancamentos` (gravação efetiva no banco) ou quando o operador clica no botão explícito "Descartar Lote".

#### **Limitações Conhecidas**
- **Escopo por Navegador/Dispositivo:** A persistência em rascunho local fica atrelada ao navegador e dispositivo em que o lote foi iniciado. Se o operador trocar de computador antes de clicar em "Salvar Lançamentos", o rascunho não estará visível na segunda máquina.

---

### 2. Perda de Tabelas do Banco de Dados Neon (Condição de Corrida no Boot do Servidor)

#### **Sintoma / Descrição do Problema**
Ao reiniciar ou realizar o boot da aplicação Node/Express conectada ao banco de dados PostgreSQL/Neon (`DATABASE_URL`), as tabelas da base remota eram zeradas ou sobrescritas por um conjunto inicial de dados vazios ou de exemplo.

#### **Causa Raiz Técnica**
Condição de corrida (`Race Condition`) na inicialização do servidor `server.ts` e na rotina de sincronização bidirecional do banco de dados:
1. No carregamento síncrono do módulo `server.ts`, a função `loadDB()` inicializava a variável em memória `db` lendo um arquivo local ou gerando `initialDBState`.
2. Em seguida, a função de gravação `saveDB()` era disparada para persistir o estado inicial no disco e invocava de forma assíncrona e não bloqueante a função `saveAllStateToPostgres(initialDBState)`.
3. Simultaneamente, o servidor Express iniciava o `app.listen()` antes de aguardar o término da promessa de `loadStateFromPostgres()`.
4. Com isso, requisições HTTP recebidas do cliente ou a própria chamada `saveAllStateToPostgres` disparada precocemente realizavam operações de `INSERT ... ON CONFLICT DO UPDATE` ou truncamento de dados com o estado inicial da memória (vazio/zerado), sobrescrevendo o banco relacional Neon antes que o download dos dados reais do Postgres fosse concluído.

#### **Correção Técnica Aplicada**
- **Orquestração Sequencial do Boot:** O ponto de entrada da aplicação (`startServer`) foi refatorado para que a abertura de porta HTTP (`app.listen`) seja bloqueada até que a promessa `initDatabasePersistence()` conclua sequencialmente:
  1. `initPostgresSchema()` (criação/verificação de tabelas no PostgreSQL).
  2. `loadStateFromPostgres()` (leitura do estado real mantido no banco em nuvem).
  3. Atualização da variável global `db` com o estado autêntico vindo do PostgreSQL antes de aceitar qualquer requisição de leitura ou gravação.
- **Flag de Trava de Sincronização:** Implementaram-se travas de inicialização e tratamento de exceções para impedir que chamadas assíncronas de gravação executem `saveAllStateToPostgres` sobre o banco de dados remoto antes da restauração completa dos dados em memória.

#### **Limitações Conhecidas**
- **Latência Inicial de Cold Start:** Durante o primeiro boot do contêiner (tempo de handshake TLS com o servidor PostgreSQL/Neon, cerca de 1 a 3 segundos), as requisições HTTP do cliente podem experimentar uma pequena retenção até a conclusão da sincronização do estado inicial.
