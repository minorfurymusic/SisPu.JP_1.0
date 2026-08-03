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
    const isSsl = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function initPostgresSchema(): Promise<boolean> {
  const p = getPool();
  if (!p) {
    console.log("[DB] DATABASE_URL não informada. Operando em modo de memória local.");
    return false;
  }

  try {
    const client = await p.connect();
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
    const client = await p.connect();
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
        }))
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[DB] Erro ao carregar dados do PostgreSQL:", err.message || err);
    return null;
  }
}

export async function saveAllStateToPostgres(state: any): Promise<void> {
  const p = getPool();
  if (!p) return;

  try {
    const client = await p.connect();
    try {
      await client.query('BEGIN');

      // Usuarios
      for (const u of state.usuarios || []) {
        await client.query(
          `INSERT INTO usuarios (id, login, nome, ativo, criado_em)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             login = EXCLUDED.login, nome = EXCLUDED.nome, ativo = EXCLUDED.ativo`,
          [u.id, u.login, u.nome, u.ativo !== false, u.criado_em]
        );
      }

      // Secretarias
      for (const s of state.secretarias || []) {
        await client.query(
          `INSERT INTO secretarias (id, codigo_legado, nome, ativo, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             codigo_legado = EXCLUDED.codigo_legado, nome = EXCLUDED.nome, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em`,
          [s.id, s.codigo_legado || null, s.nome, s.ativo !== false, s.criado_em, s.atualizado_em]
        );
      }

      // Unidades
      for (const u of state.unidades || []) {
        await client.query(
          `INSERT INTO unidades (id, codigo_legado, secretaria_id, nome, endereco, ativo, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             codigo_legado = EXCLUDED.codigo_legado, secretaria_id = EXCLUDED.secretaria_id, nome = EXCLUDED.nome, endereco = EXCLUDED.endereco, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em`,
          [u.id, u.codigo_legado || null, u.secretaria_id, u.nome, u.endereco || '', u.ativo !== false, u.criado_em, u.atualizado_em]
        );
      }

      // Despesas
      for (const d of state.despesas || []) {
        await client.query(
          `INSERT INTO despesas (id, codigo_legado, descricao, ativo, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             codigo_legado = EXCLUDED.codigo_legado, descricao = EXCLUDED.descricao, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em`,
          [d.id, d.codigo_legado || null, d.descricao, d.ativo !== false, d.criado_em, d.atualizado_em]
        );
      }

      // Itens Despesas
      for (const it of state.itens_despesas || []) {
        await client.query(
          `INSERT INTO itens_despesas (id, codigo_numero, despesa_id, unidade_id, tipo_fone, medidor, ativo, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             codigo_numero = EXCLUDED.codigo_numero, despesa_id = EXCLUDED.despesa_id, unidade_id = EXCLUDED.unidade_id, tipo_fone = EXCLUDED.tipo_fone, medidor = EXCLUDED.medidor, ativo = EXCLUDED.ativo, atualizado_em = EXCLUDED.atualizado_em`,
          [it.id, it.codigo_numero, it.despesa_id, it.unidade_id, it.tipo_fone || null, it.medidor || null, it.ativo !== false, it.criado_em, it.atualizado_em]
        );
      }

      // Lancamentos
      for (const l of state.lancamentos || []) {
        await client.query(
          `INSERT INTO lancamentos (id, item_despesa_id, mes_ano, consumo, valor_total, valor_imposto, valor_celular, valor_internet, valor_diversos, valor_linha_privada, valor_credito, data_lancamento, codigo_legado_numero, mes_ano_legado, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO UPDATE SET
             item_despesa_id = EXCLUDED.item_despesa_id, mes_ano = EXCLUDED.mes_ano, consumo = EXCLUDED.consumo, valor_total = EXCLUDED.valor_total, valor_imposto = EXCLUDED.valor_imposto, valor_celular = EXCLUDED.valor_celular, valor_internet = EXCLUDED.valor_internet, valor_diversos = EXCLUDED.valor_diversos, valor_linha_privada = EXCLUDED.valor_linha_privada, valor_credito = EXCLUDED.valor_credito, data_lancamento = EXCLUDED.data_lancamento, codigo_legado_numero = EXCLUDED.codigo_legado_numero, mes_ano_legado = EXCLUDED.mes_ano_legado, atualizado_em = EXCLUDED.atualizado_em`,
          [l.id, l.item_despesa_id, l.mes_ano, l.consumo || 0, l.valor_total || 0, l.valor_imposto || 0, l.valor_celular || 0, l.valor_internet || 0, l.valor_diversos || 0, l.valor_linha_privada || 0, l.valor_credito || 0, l.data_lancamento || null, l.codigo_legado_numero || null, l.mes_ano_legado || null, l.criado_em, l.atualizado_em]
        );
      }

      // Pessoas
      for (const pRow of state.pessoas || []) {
        await client.query(
          `INSERT INTO pessoas (id, codigo_legado, nome, tipo_pessoa, cpf_cnpj, telefone_residencial, telefone_comercial, telefone_celular, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             codigo_legado = EXCLUDED.codigo_legado, nome = EXCLUDED.nome, tipo_pessoa = EXCLUDED.tipo_pessoa, cpf_cnpj = EXCLUDED.cpf_cnpj, telefone_residencial = EXCLUDED.telefone_residencial, telefone_comercial = EXCLUDED.telefone_comercial, telefone_celular = EXCLUDED.telefone_celular, atualizado_em = EXCLUDED.atualizado_em`,
          [pRow.id, pRow.codigo_legado || null, pRow.nome, pRow.tipo_pessoa || null, pRow.cpf_cnpj || null, pRow.telefone_residencial || null, pRow.telefone_comercial || null, pRow.telefone_celular || null, pRow.criado_em, pRow.atualizado_em]
        );
      }

      // Contatos Email
      for (const c of state.contatos_email || []) {
        await client.query(
          `INSERT INTO contatos_email (id, descricao, email, criado_em)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             descricao = EXCLUDED.descricao, email = EXCLUDED.email`,
          [c.id, c.descricao, c.email, c.criado_em]
        );
      }

      // Logs Erros
      for (const lg of state.logs_erros || []) {
        await client.query(
          `INSERT INTO logs_erros (id, origem, mensagem, ocorrido_em, arquivo_origem, linha_original, criado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [lg.id, lg.origem || null, lg.mensagem, lg.ocorrido_em || null, lg.arquivo_origem || null, lg.linha_original || null, lg.criado_em]
        );
      }

      // Auditoria
      for (const a of state.auditoria_registros || []) {
        await client.query(
          `INSERT INTO auditoria_registros (id, tabela, registro_pk, acao, usuario, valor_antigo, valor_novo, criado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [a.id, a.tabela, a.registro_pk || null, a.acao, a.usuario, a.valor_antigo ? JSON.stringify(a.valor_antigo) : null, a.valor_novo ? JSON.stringify(a.valor_novo) : null, a.criado_em]
        );
      }

      // Documentos Processados
      for (const doc of state.documentos_processados || []) {
        await client.query(
          `INSERT INTO documentos_processados (id, nome_arquivo, layout, tamanho, status, origem_conteudo, dados_extraidos, logs_validacao, historico_alteracoes, observacoes, score, score_logs, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             nome_arquivo = EXCLUDED.nome_arquivo, layout = EXCLUDED.layout, tamanho = EXCLUDED.tamanho, status = EXCLUDED.status, origem_conteudo = EXCLUDED.origem_conteudo, dados_extraidos = EXCLUDED.dados_extraidos, logs_validacao = EXCLUDED.logs_validacao, historico_alteracoes = EXCLUDED.historico_alteracoes, observacoes = EXCLUDED.observacoes, score = EXCLUDED.score, score_logs = EXCLUDED.score_logs, atualizado_em = EXCLUDED.atualizado_em`,
          [
            doc.id,
            doc.nome_arquivo,
            doc.layout,
            doc.tamanho || null,
            doc.status,
            doc.origem_conteudo || null,
            doc.dados_extraidos ? JSON.stringify(doc.dados_extraidos) : null,
            doc.logs_validacao ? JSON.stringify(doc.logs_validacao) : null,
            doc.historico_alteracoes ? JSON.stringify(doc.historico_alteracoes) : null,
            doc.observacoes || null,
            doc.score !== undefined ? doc.score : null,
            doc.score_logs ? JSON.stringify(doc.score_logs) : null,
            doc.criado_em,
            doc.updated_at || doc.atualizado_em || doc.criado_em
          ]
        );
      }

      // Sync Deletions for all tables
      const syncDeletes = async (table: string, list: any[]) => {
        const validIds = (list || []).map((x: any) => String(x.id)).filter(Boolean);
        if (validIds.length > 0) {
          await client.query(`DELETE FROM ${table} WHERE NOT (id = ANY($1::text[]))`, [validIds]);
        } else {
          await client.query(`DELETE FROM ${table}`);
        }
      };

      // Sync Deletions for all tables (child tables first)
      await syncDeletes('lancamentos', state.lancamentos);
      await syncDeletes('itens_despesas', state.itens_despesas);
      await syncDeletes('unidades', state.unidades);
      await syncDeletes('secretarias', state.secretarias);
      await syncDeletes('despesas', state.despesas);
      await syncDeletes('pessoas', state.pessoas);
      await syncDeletes('contatos_email', state.contatos_email);
      await syncDeletes('documentos_processados', state.documentos_processados);
      await syncDeletes('usuarios', state.usuarios);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[DB] Erro ao sincronizar estado com PostgreSQL:", err.message || err);
  }
}
