import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export function getDbUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

let pool: pg.Pool | null = null;

export async function resetPool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch (e) {
      // ignore
    }
    pool = null;
  }
}

export function getPool(): pg.Pool | null {
  const dbUrl = getDbUrl();
  if (!dbUrl) return null;

  if (!pool) {
    // Configure ssl based on connection string
    const isSsl = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') || dbUrl.includes('.postgres.database.azure.com') || dbUrl.includes('supabase.co');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000, // 30s timeout so serverless wakeups (e.g. Neon) don't timeout
      keepAlive: true,
    });
    pool.on('error', (err) => {
      console.warn('[DB] Erro no pool de conexões do PostgreSQL:', err.message || err);
    });
  }
  return pool;
}

export async function connectWithRetry(p: pg.Pool, maxRetries = 3, initialDelayMs = 1500): Promise<pg.PoolClient> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await p.connect();
    } catch (err: any) {
      lastError = err;
      console.warn(`[DB] Tentativa ${attempt}/${maxRetries} de conectar ao PostgreSQL falhou: ${err.message || err}`);
      if (attempt < maxRetries) {
        await delayMs(initialDelayMs * attempt);
      }
    }
  }
  throw lastError;
}

export async function initPostgresSchema(): Promise<boolean> {
  const p = getPool();
  if (!p) {
    console.log("[DB] DATABASE_URL não informada. Operando em modo de memória local.");
    return false;
  }

  try {
    const client = await connectWithRetry(p);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id TEXT PRIMARY KEY,
          login TEXT UNIQUE NOT NULL,
          nome TEXT NOT NULL,
          ativo BOOLEAN DEFAULT true,
          criado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS secretarias (
          id TEXT PRIMARY KEY,
          codigo_legado INTEGER,
          nome TEXT UNIQUE NOT NULL,
          ativo BOOLEAN DEFAULT true,
          criado_em TEXT,
          atualizado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS unidades (
          id TEXT PRIMARY KEY,
          codigo_legado INTEGER,
          secretaria_id TEXT NOT NULL,
          nome TEXT NOT NULL,
          endereco TEXT,
          ativo BOOLEAN DEFAULT true,
          criado_em TEXT,
          atualizado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS despesas (
          id TEXT PRIMARY KEY,
          codigo_legado INTEGER,
          descricao TEXT UNIQUE NOT NULL,
          ativo BOOLEAN DEFAULT true,
          criado_em TEXT,
          atualizado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS itens_despesas (
          id TEXT PRIMARY KEY,
          codigo_numero TEXT NOT NULL,
          despesa_id TEXT NOT NULL,
          unidade_id TEXT NOT NULL,
          tipo_fone TEXT,
          medidor TEXT,
          ativo BOOLEAN DEFAULT true,
          criado_em TEXT,
          atualizado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS lancamentos (
          id TEXT PRIMARY KEY,
          item_despesa_id TEXT NOT NULL,
          mes_ano TEXT NOT NULL,
          consumo NUMERIC(14,2) DEFAULT 0,
          valor_total NUMERIC(14,2) DEFAULT 0,
          valor_imposto NUMERIC(14,2) DEFAULT 0,
          valor_celular NUMERIC(14,2) DEFAULT 0,
          valor_internet NUMERIC(14,2) DEFAULT 0,
          valor_diversos NUMERIC(14,2) DEFAULT 0,
          valor_linha_privada NUMERIC(14,2) DEFAULT 0,
          valor_credito NUMERIC(14,2) DEFAULT 0,
          data_lancamento TEXT,
          codigo_legado_numero TEXT,
          mes_ano_legado TEXT,
          criado_em TEXT,
          atualizado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS pessoas (
          id TEXT PRIMARY KEY,
          codigo_legado INTEGER,
          nome TEXT NOT NULL,
          tipo_pessoa TEXT,
          cpf_cnpj TEXT,
          telefone_residencial TEXT,
          telefone_comercial TEXT,
          telefone_celular TEXT,
          criado_em TEXT,
          atualizado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS contatos_email (
          id TEXT PRIMARY KEY,
          descricao TEXT NOT NULL,
          email TEXT NOT NULL,
          criado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS logs_erros (
          id TEXT PRIMARY KEY,
          origem TEXT,
          mensagem TEXT NOT NULL,
          ocorrido_em TEXT,
          arquivo_origem TEXT,
          linha_original TEXT,
          criado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS auditoria_registros (
          id TEXT PRIMARY KEY,
          tabela TEXT NOT NULL,
          registro_pk TEXT,
          acao TEXT NOT NULL,
          usuario TEXT NOT NULL,
          valor_antigo JSONB,
          valor_novo JSONB,
          criado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS documentos_processados (
          id TEXT PRIMARY KEY,
          nome_arquivo TEXT NOT NULL,
          layout TEXT NOT NULL,
          tamanho TEXT,
          status TEXT NOT NULL,
          origem_conteudo TEXT,
          dados_extraidos JSONB,
          logs_validacao JSONB,
          historico_alteracoes JSONB,
          observacoes TEXT,
          score NUMERIC(5,2),
          score_logs JSONB,
          criado_em TEXT,
          atualizado_em TEXT
        );

        CREATE TABLE IF NOT EXISTS cadastro_mestre_ucs (
          id TEXT PRIMARY KEY,
          uc TEXT UNIQUE NOT NULL,
          codnum TEXT NOT NULL,
          concessionaria TEXT NOT NULL,
          secretaria TEXT,
          unidade_administrativa TEXT,
          endereco TEXT,
          classe TEXT,
          grupo_tarifario TEXT,
          situacao TEXT DEFAULT 'Ativa',
          criado_em TEXT,
          atualizado_em TEXT
        );
      `);
      console.log("[DB] Schema do PostgreSQL verificado e inicializado com sucesso.");
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[DB] Falha ao conectar/inicializar PostgreSQL:", err.message || err);
    return false;
  }
}

export async function loadStateFromPostgres(): Promise<any | null> {
  const p = getPool();
  if (!p) return null;

  try {
    const client = await connectWithRetry(p);
    try {
      const resUsuarios = await client.query(`SELECT * FROM usuarios ORDER BY id`);
      const resSecretarias = await client.query(`SELECT * FROM secretarias ORDER BY id`);
      const resUnidades = await client.query(`SELECT * FROM unidades ORDER BY id`);
      const resDespesas = await client.query(`SELECT * FROM despesas ORDER BY id`);
      const resItensDespesas = await client.query(`SELECT * FROM itens_despesas ORDER BY id`);
      const resLancamentos = await client.query(`SELECT * FROM lancamentos ORDER BY id`);
      const resPessoas = await client.query(`SELECT * FROM pessoas ORDER BY id`);
      const resContatosEmail = await client.query(`SELECT * FROM contatos_email ORDER BY id`);
      const resLogsErros = await client.query(`SELECT * FROM logs_erros ORDER BY id DESC`);
      const resAuditoria = await client.query(`SELECT * FROM auditoria_registros ORDER BY id DESC`);
      const resDocumentos = await client.query(`SELECT * FROM documentos_processados ORDER BY id DESC`);
      const resCadastroMestreUcs = await client.query(`SELECT * FROM cadastro_mestre_ucs ORDER BY uc`);

      return {
        usuarios: resUsuarios.rows,
        secretarias: resSecretarias.rows,
        unidades: resUnidades.rows,
        despesas: resDespesas.rows,
        itens_despesas: resItensDespesas.rows,
        lancamentos: resLancamentos.rows.map(r => ({
          ...r,
          consumo: Number(r.consumo || 0),
          valor_total: Number(r.valor_total || 0),
          valor_imposto: Number(r.valor_imposto || 0),
          valor_celular: Number(r.valor_celular || 0),
          valor_internet: Number(r.valor_internet || 0),
          valor_diversos: Number(r.valor_diversos || 0),
          valor_linha_privada: Number(r.valor_linha_privada || 0),
          valor_credito: Number(r.valor_credito || 0),
        })),
        pessoas: resPessoas.rows,
        contatos_email: resContatosEmail.rows,
        logs_erros: resLogsErros.rows,
        auditoria_registros: resAuditoria.rows,
        documentos_processados: resDocumentos.rows.map(d => ({
          ...d,
          score: d.score !== null ? Number(d.score) : undefined,
          dados_extraidos: typeof d.dados_extraidos === 'string' ? JSON.parse(d.dados_extraidos) : d.dados_extraidos,
          logs_validacao: typeof d.logs_validacao === 'string' ? JSON.parse(d.logs_validacao) : (d.logs_validacao || []),
          historico_alteracoes: typeof d.historico_alteracoes === 'string' ? JSON.parse(d.historico_alteracoes) : (d.historico_alteracoes || []),
          score_logs: typeof d.score_logs === 'string' ? JSON.parse(d.score_logs) : d.score_logs
        })),
        cadastro_mestre_ucs: resCadastroMestreUcs.rows
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[DB] Erro ao carregar dados do PostgreSQL:", err.message || err);
    return null;
  }
}

// Descreve, por tabela, como montar o INSERT ... ON CONFLICT: as colunas (na ordem dos
// placeholders), como extrair os valores de uma linha do estado em memória, e o SET do upsert
// (ou null para tabelas de log, que são só insert-once / DO NOTHING). Fonte única usada tanto
// pelo upsert de 1 linha quanto pelo upsert em lote (várias linhas num só INSERT multi-VALUES)
// logo abaixo — evita ter a lista de colunas/valores duplicada em dois lugares.
type TableUpsertSpec = {
  columns: string[];
  toValues: (row: any) => any[];
  updateSet: string | null; // null = ON CONFLICT DO NOTHING
};

const TABLE_UPSERT_SPECS: Record<string, TableUpsertSpec> = {
  usuarios: {
    columns: ['id', 'login', 'nome', 'ativo', 'criado_em'],
    toValues: (row) => [row.id, row.login, row.nome, row.ativo !== false, row.criado_em],
    updateSet: 'login = EXCLUDED.login, nome = EXCLUDED.nome, ativo = EXCLUDED.ativo'
  },
  secretarias: {
    columns: ['id', 'codigo_legado', 'nome', 'ativo', 'criado_em', 'atualizado_em'],
    toValues: (row) => [row.id, row.codigo_legado || null, row.nome, row.ativo !== false, row.criado_em, row.atualizado_em],
    updateSet: 'codigo_legado = EXCLUDED.codigo_legado, nome = EXCLUDED.nome, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em'
  },
  unidades: {
    columns: ['id', 'codigo_legado', 'secretaria_id', 'nome', 'endereco', 'ativo', 'criado_em', 'atualizado_em'],
    toValues: (row) => [row.id, row.codigo_legado || null, row.secretaria_id, row.nome, row.endereco || '', row.ativo !== false, row.criado_em, row.atualizado_em],
    updateSet: 'codigo_legado = EXCLUDED.codigo_legado, secretaria_id = EXCLUDED.secretaria_id, nome = EXCLUDED.nome, endereco = EXCLUDED.endereco, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em'
  },
  despesas: {
    columns: ['id', 'codigo_legado', 'descricao', 'ativo', 'criado_em', 'atualizado_em'],
    toValues: (row) => [row.id, row.codigo_legado || null, row.descricao, row.ativo !== false, row.criado_em, row.atualizado_em],
    updateSet: 'codigo_legado = EXCLUDED.codigo_legado, descricao = EXCLUDED.descricao, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em'
  },
  itens_despesas: {
    columns: ['id', 'codigo_numero', 'despesa_id', 'unidade_id', 'tipo_fone', 'medidor', 'ativo', 'criado_em', 'atualizado_em'],
    toValues: (row) => [row.id, row.codigo_numero, row.despesa_id, row.unidade_id, row.tipo_fone || null, row.medidor || null, row.ativo !== false, row.criado_em, row.atualizado_em],
    updateSet: 'codigo_numero = EXCLUDED.codigo_numero, despesa_id = EXCLUDED.despesa_id, unidade_id = EXCLUDED.unidade_id, tipo_fone = EXCLUDED.tipo_fone, medidor = EXCLUDED.medidor, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em'
  },
  lancamentos: {
    columns: ['id', 'item_despesa_id', 'mes_ano', 'consumo', 'valor_total', 'valor_imposto', 'valor_celular', 'valor_internet', 'valor_diversos', 'valor_linha_privada', 'valor_credito', 'data_lancamento', 'codigo_legado_numero', 'mes_ano_legado', 'criado_em', 'atualizado_em'],
    toValues: (row) => [row.id, row.item_despesa_id, row.mes_ano, row.consumo || 0, row.valor_total || 0, row.valor_imposto || 0, row.valor_celular || 0, row.valor_internet || 0, row.valor_diversos || 0, row.valor_linha_privada || 0, row.valor_credito || 0, row.data_lancamento || null, row.codigo_legado_numero || null, row.mes_ano_legado || null, row.criado_em, row.atualizado_em],
    updateSet: 'item_despesa_id = EXCLUDED.item_despesa_id, mes_ano = EXCLUDED.mes_ano, consumo = EXCLUDED.consumo, valor_total = EXCLUDED.valor_total, valor_imposto = EXCLUDED.valor_imposto, valor_celular = EXCLUDED.valor_celular, valor_internet = EXCLUDED.valor_internet, valor_diversos = EXCLUDED.valor_diversos, valor_linha_privada = EXCLUDED.valor_linha_privada, valor_credito = EXCLUDED.valor_credito, data_lancamento = EXCLUDED.data_lancamento, codigo_legado_numero = EXCLUDED.codigo_legado_numero, mes_ano_legado = EXCLUDED.mes_ano_legado, atualizado_em = EXCLUDED.atualizado_em'
  },
  pessoas: {
    columns: ['id', 'codigo_legado', 'nome', 'tipo_pessoa', 'cpf_cnpj', 'telefone_residencial', 'telefone_comercial', 'telefone_celular', 'criado_em', 'atualizado_em'],
    toValues: (row) => [row.id, row.codigo_legado || null, row.nome, row.tipo_pessoa || null, row.cpf_cnpj || null, row.telefone_residencial || null, row.telefone_comercial || null, row.telefone_celular || null, row.criado_em, row.atualizado_em],
    updateSet: 'codigo_legado = EXCLUDED.codigo_legado, nome = EXCLUDED.nome, tipo_pessoa = EXCLUDED.tipo_pessoa, cpf_cnpj = EXCLUDED.cpf_cnpj, telefone_residencial = EXCLUDED.telefone_residencial, telefone_comercial = EXCLUDED.telefone_comercial, telefone_celular = EXCLUDED.telefone_celular, atualizado_em = EXCLUDED.atualizado_em'
  },
  contatos_email: {
    columns: ['id', 'descricao', 'email', 'criado_em'],
    toValues: (row) => [row.id, row.descricao, row.email, row.criado_em],
    updateSet: 'descricao = EXCLUDED.descricao, email = EXCLUDED.email'
  },
  logs_erros: {
    columns: ['id', 'origem', 'mensagem', 'ocorrido_em', 'arquivo_origem', 'linha_original', 'criado_em'],
    toValues: (row) => [row.id, row.origem || null, row.mensagem, row.ocorrido_em || null, row.arquivo_origem || null, row.linha_original || null, row.criado_em],
    updateSet: null
  },
  auditoria_registros: {
    columns: ['id', 'tabela', 'registro_pk', 'acao', 'usuario', 'valor_antigo', 'valor_novo', 'criado_em'],
    toValues: (row) => [row.id, row.tabela, row.registro_pk || null, row.acao, row.usuario, row.valor_antigo ? JSON.stringify(row.valor_antigo) : null, row.valor_novo ? JSON.stringify(row.valor_novo) : null, row.criado_em],
    updateSet: null
  },
  documentos_processados: {
    columns: ['id', 'nome_arquivo', 'layout', 'tamanho', 'status', 'origem_conteudo', 'dados_extraidos', 'logs_validacao', 'historico_alteracoes', 'observacoes', 'score', 'score_logs', 'criado_em', 'atualizado_em'],
    toValues: (row) => [
      row.id,
      row.nome_arquivo,
      row.layout,
      row.tamanho || null,
      row.status,
      row.origem_conteudo || null,
      row.dados_extraidos ? JSON.stringify(row.dados_extraidos) : null,
      row.logs_validacao ? JSON.stringify(row.logs_validacao) : null,
      row.historico_alteracoes ? JSON.stringify(row.historico_alteracoes) : null,
      row.observacoes || null,
      row.score !== undefined ? row.score : null,
      row.score_logs ? JSON.stringify(row.score_logs) : null,
      row.criado_em,
      row.updated_at || row.atualizado_em || row.criado_em
    ],
    updateSet: 'nome_arquivo = EXCLUDED.nome_arquivo, layout = EXCLUDED.layout, tamanho = EXCLUDED.tamanho, status = EXCLUDED.status, origem_conteudo = EXCLUDED.origem_conteudo, dados_extraidos = EXCLUDED.dados_extraidos, logs_validacao = EXCLUDED.logs_validacao, historico_alteracoes = EXCLUDED.historico_alteracoes, observacoes = EXCLUDED.observacoes, score = EXCLUDED.score, score_logs = EXCLUDED.score_logs, atualizado_em = EXCLUDED.atualizado_em'
  },
  cadastro_mestre_ucs: {
    columns: ['id', 'uc', 'codnum', 'concessionaria', 'secretaria', 'unidade_administrativa', 'endereco', 'classe', 'grupo_tarifario', 'situacao', 'criado_em', 'atualizado_em'],
    toValues: (row) => [
      row.id, row.uc, row.codnum, row.concessionaria, row.secretaria || null, row.unidade_administrativa || null,
      row.endereco || null, row.classe || null, row.grupo_tarifario || null, row.situacao || 'Ativa',
      row.criado_em, row.atualizado_em || row.criado_em
    ],
    updateSet: 'uc = EXCLUDED.uc, codnum = EXCLUDED.codnum, concessionaria = EXCLUDED.concessionaria, secretaria = EXCLUDED.secretaria, unidade_administrativa = EXCLUDED.unidade_administrativa, endereco = EXCLUDED.endereco, classe = EXCLUDED.classe, grupo_tarifario = EXCLUDED.grupo_tarifario, situacao = EXCLUDED.situacao, atualizado_em = EXCLUDED.atualizado_em'
  }
};

// Monta 1 INSERT multi-linha (VALUES (...), (...), ...) para N linhas da mesma tabela — usado
// pelo upsert em lote para virar 1 comando SQL por tabela em vez de 1 por linha. Cada ida-e-volta
// ao banco carrega o custo total da latência de rede até o Neon; reduzir a QUANTIDADE de
// comandos importa mais do que o tamanho de cada um.
function buildMultiRowUpsertQuery(tableName: string, rows: any[]): { text: string; values: any[] } {
  const spec = TABLE_UPSERT_SPECS[tableName];
  if (!spec) throw new Error(`Tabela não suportada para upsert: ${tableName}`);

  const values: any[] = [];
  const valueGroups: string[] = [];
  let paramIdx = 1;
  for (const row of rows) {
    const rowValues = spec.toValues(row);
    valueGroups.push(`(${rowValues.map(() => `$${paramIdx++}`).join(', ')})`);
    values.push(...rowValues);
  }

  const conflictClause = spec.updateSet
    ? `ON CONFLICT (id) DO UPDATE SET ${spec.updateSet}`
    : `ON CONFLICT (id) DO NOTHING`;

  return {
    text: `INSERT INTO ${tableName} (${spec.columns.join(', ')}) VALUES ${valueGroups.join(', ')} ${conflictClause}`,
    values
  };
}

// Upsert (ou insert-only, para tabelas de log) de uma única linha, usada pela sincronização
// completa (saveAllStateToPostgres, abaixo). É o caso de 1 linha só do upsert em lote acima.
async function execUpsertRow(client: pg.PoolClient, tableName: string, row: any): Promise<void> {
  const { text, values } = buildMultiRowUpsertQuery(tableName, [row]);
  await client.query(text, values);
}

export async function saveAllStateToPostgres(state: any): Promise<void> {
  const p = getPool();
  if (!p) return;

  try {
    const client = await connectWithRetry(p);
    try {
      await client.query('BEGIN');

      for (const u of state.usuarios || []) await execUpsertRow(client, 'usuarios', u);
      for (const s of state.secretarias || []) await execUpsertRow(client, 'secretarias', s);
      for (const u of state.unidades || []) await execUpsertRow(client, 'unidades', u);
      for (const d of state.despesas || []) await execUpsertRow(client, 'despesas', d);
      for (const it of state.itens_despesas || []) await execUpsertRow(client, 'itens_despesas', it);
      for (const l of state.lancamentos || []) await execUpsertRow(client, 'lancamentos', l);
      for (const pRow of state.pessoas || []) await execUpsertRow(client, 'pessoas', pRow);
      for (const c of state.contatos_email || []) await execUpsertRow(client, 'contatos_email', c);
      for (const lg of state.logs_erros || []) await execUpsertRow(client, 'logs_erros', lg);
      for (const a of state.auditoria_registros || []) await execUpsertRow(client, 'auditoria_registros', a);
      for (const doc of state.documentos_processados || []) await execUpsertRow(client, 'documentos_processados', doc);
      for (const u of state.cadastro_mestre_ucs || []) await execUpsertRow(client, 'cadastro_mestre_ucs', u);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[DB] Erro ao sincronizar estado com PostgreSQL:", err.message || err);
    // Repassa o erro: quem chama precisa saber que a gravação não foi confirmada no banco —
    // silenciar aqui era o que fazia o servidor responder "sucesso" para o cliente mesmo
    // quando a escrita real no Postgres tinha falhado.
    throw err;
  }
}

// Máximo de linhas por comando multi-VALUES — puramente uma trava de segurança contra o limite
// de parâmetros do Postgres (65535). Nos tamanhos de lote reais do sistema (dezenas de linhas
// por tabela) isso nunca chega perto de ser atingido; existe só para não quebrar se algum dia
// alguém passar um volume bem maior de uma vez.
const MAX_ROWS_PER_UPSERT_STATEMENT = 300;

// Upsert pontual de um pequeno conjunto de linhas (1 fatura = doc + unidade + item + lançamento,
// ou um lote inteiro de faturas de uma vez), sem percorrer as demais linhas das tabelas. Usado
// pelos endpoints que só criam/alteram algumas linhas por chamada — antes disso, esses endpoints
// chamavam saveAllStateToPostgres, que reconstrói TODAS as linhas de TODAS as tabelas a cada
// chamada. Com centenas de lançamentos/documentos já cadastrados, salvar um lote de faturas
// disparava um full-sync por fatura, deixando o processo cada vez mais lento conforme o banco
// cresce.
//
// Duas otimizações em cima disso: (1) todas as linhas passadas usam a MESMA conexão — abrir uma
// conexão nova por linha é o que fazia até um lote pequeno demorar muito mais do que deveria,
// sobretudo quando o Neon precisa "acordar" de um período de inatividade; e (2) as linhas são
// agrupadas por tabela e cada tabela vira 1 único INSERT multi-linha, em vez de 1 INSERT por
// linha — um lote de 15 faturas (~45-60 linhas em até 4 tabelas) virava até 60 comandos SQL
// sequenciais; agora vira só 1 comando por tabela tocada (no máximo 4). Cada ida-e-volta ao
// banco carrega o custo total da latência de rede até o Neon, então reduzir a QUANTIDADE de
// comandos importa mais do que reduzir o tamanho de cada um.
export async function upsertRowsToPostgres(rows: { table: string; row: any }[]): Promise<void> {
  const p = getPool();
  if (!p || rows.length === 0) return;

  const byTable = new Map<string, any[]>();
  for (const { table, row } of rows) {
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table)!.push(row);
  }

  const client = await connectWithRetry(p);
  try {
    await client.query('BEGIN');
    for (const [table, tableRows] of byTable) {
      for (let i = 0; i < tableRows.length; i += MAX_ROWS_PER_UPSERT_STATEMENT) {
        const slice = tableRows.slice(i, i + MAX_ROWS_PER_UPSERT_STATEMENT);
        const { text, values } = buildMultiRowUpsertQuery(table, slice);
        await client.query(text, values);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Tables a single row can be explicitly deleted from. Exclusion here is deliberate: saves
// only ever INSERT/UPDATE (see saveAllStateToPostgres above) — a row leaves Postgres only when
// one of these is called for its own id, never as a side effect of some other save producing a
// smaller in-memory array. That's what protects real data from a stale/partial in-memory `db`.
const DELETABLE_TABLES = new Set([
  'lancamentos',
  'documentos_processados',
  'itens_despesas',
  'unidades',
  'secretarias',
  'despesas',
  'cadastro_mestre_ucs',
]);

function delayMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Aguarda de verdade a exclusão no Postgres e tenta de novo uma vez (o plano Free do Neon
// hiberna o compute quando ocioso, e a 1ª conexão depois de um tempo parado pode falhar por
// timeout). Antes esse erro era só logado e engolido — o endpoint respondia "excluído com
// sucesso" para o cliente mesmo quando a linha continuava intacta no banco real, e ela
// reaparecia sozinha na próxima vez que o servidor recarregasse do Postgres.
export async function deleteRowFromPostgres(tableName: string, id: string): Promise<void> {
  if (!DELETABLE_TABLES.has(tableName)) {
    throw new Error(`Tabela não permitida para exclusão: ${tableName}`);
  }
  const p = getPool();
  if (!p || !id) return;
  
  const client = await connectWithRetry(p);
  try {
    await client.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
  } finally {
    client.release();
  }
}
