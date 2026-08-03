import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Usuario, Secretaria, Unidade, Despesa, ItemDespesa, 
  Lancamento, Pessoa, ContatoEmail, LogError, AuditoriaRegistro, 
  DocumentoProcessado 
} from "./src/types";
import { runDeterministicParser } from "./src/utils/documentParser";
import { initPostgresSchema, loadStateFromPostgres, saveAllStateToPostgres, resetPool, getPool } from "./src/db/postgres";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini SDK with telemetry header as required by instructions
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// JSON Middleware
app.use(express.json({ limit: '10mb' }));

// Version Check Route for Deploy Sync Test
app.get("/api/version-check", (req, res) => {
  res.json({
    version: "TEST_AUTO_DEPLOY_CHECK_2026_08_03",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development"
  });
});

// In-Memory/JSON File Database State (Simulating PostgreSQL with triggers)
const DB_FILE = path.join(process.cwd(), "sispu_db.json");

interface DatabaseState {
  usuarios: Usuario[];
  secretarias: Secretaria[];
  unidades: Unidade[];
  despesas: Despesa[];
  itens_despesas: ItemDespesa[];
  lancamentos: Lancamento[];
  pessoas: Pessoa[];
  contatos_email: ContatoEmail[];
  logs_erros: LogError[];
  auditoria_registros: AuditoriaRegistro[];
  documentos_processados: DocumentoProcessado[];
}

// Initial Seed Data
const initialDBState: DatabaseState = {
  usuarios: [
    { id: "1", login: "admin", nome: "Administrador", ativo: true, criado_em: new Date().toISOString() },
    { id: "2", login: "joao", nome: "João Silva", ativo: true, criado_em: new Date().toISOString() }
  ],
  secretarias: [
    { id: "1", codigo_legado: 10, nome: "SECRETARIA DE ADMINISTRAÇÃO", ativo: true, criado_em: "2026-01-10T10:00:00Z", atualizado_em: "2026-01-10T10:00:00Z" },
    { id: "2", codigo_legado: 20, nome: "SECRETARIA DE FINANÇAS", ativo: true, criado_em: "2026-01-11T11:00:00Z", atualizado_em: "2026-01-11T11:00:00Z" },
    { id: "3", codigo_legado: 30, nome: "SECRETARIA DE EDUCAÇÃO", ativo: true, criado_em: "2026-01-12T09:00:00Z", atualizado_em: "2026-01-12T09:00:00Z" },
    { id: "4", codigo_legado: 40, nome: "SECRETARIA DE SAÚDE", ativo: true, criado_em: "2026-01-13T14:30:00Z", atualizado_em: "2026-01-13T14:30:00Z" },
    { id: "5", codigo_legado: 50, nome: "SECRETARIA DE OBRAS E SERVIÇOS", ativo: true, criado_em: "2026-01-14T08:15:00Z", atualizado_em: "2026-01-14T08:15:00Z" }
  ],
  unidades: [
    { id: "1", codigo_legado: 101, secretaria_id: "1", nome: "PREFEITURA MUNICIPAL - SEDE", endereco: "Praça dos Três Poderes, 100", ativo: true, criado_em: "2026-01-10T10:05:00Z", atualizado_em: "2026-01-10T10:05:00Z" },
    { id: "2", codigo_legado: 102, secretaria_id: "1", nome: "ANEXO ADMINISTRATIVO I", endereco: "Rua Lauro Müller, 25", ativo: true, criado_em: "2026-01-10T10:06:00Z", atualizado_em: "2026-01-10T10:06:00Z" },
    { id: "3", codigo_legado: 201, secretaria_id: "2", nome: "SETOR DE TRIBUTOS E FISCALIZAÇÃO", endereco: "Rua do Comércio, 150", ativo: true, criado_em: "2026-01-11T11:05:00Z", atualizado_em: "2026-01-11T11:05:00Z" },
    { id: "4", codigo_legado: 301, secretaria_id: "3", nome: "ESCOLA MUNICIPAL CASTELO BRANCO", endereco: "Rua das Flores, 450", ativo: true, criado_em: "2026-01-12T09:05:00Z", atualizado_em: "2026-01-12T09:05:00Z" },
    { id: "5", codigo_legado: 302, secretaria_id: "3", nome: "CRECHE MUNICIPAL TIA ANA", endereco: "Av. Beira Rio, S/N", ativo: true, criado_em: "2026-01-12T09:06:00Z", atualizado_em: "2026-01-12T09:06:00Z" },
    { id: "6", codigo_legado: 401, secretaria_id: "4", nome: "POSTO DE SAÚDE CENTRAL", endereco: "Av. Getúlio Vargas, 1200", ativo: true, criado_em: "2026-01-13T14:35:00Z", atualizado_em: "2026-01-13T14:35:00Z" },
    { id: "7", codigo_legado: 501, secretaria_id: "5", nome: "ALMOXARIFADO CENTRAL E GARAGEM", endereco: "Rua Industrial, 80", ativo: true, criado_em: "2026-01-14T08:20:00Z", atualizado_em: "2026-01-14T08:20:00Z" }
  ],
  despesas: [
    { id: "1", codigo_legado: 1001, descricao: "ENERGIA ELÉTRICA - CELESC", ativo: true, criado_em: "2026-01-10T10:10:00Z", atualizado_em: "2026-01-10T10:10:00Z" },
    { id: "2", codigo_legado: 1002, descricao: "ÁGUA E SANEAMENTO - CASAN", ativo: true, criado_em: "2026-01-10T10:11:00Z", atualizado_em: "2026-01-10T10:11:00Z" },
    { id: "3", codigo_legado: 1003, descricao: "TELEFONIA MÓVEL - TIM", ativo: true, criado_em: "2026-01-10T10:12:00Z", atualizado_em: "2026-01-10T10:12:00Z" },
    { id: "4", codigo_legado: 1004, descricao: "INTERNET E LINK DEDICADO - OI", ativo: true, criado_em: "2026-01-10T10:13:00Z", atualizado_em: "2026-01-10T10:13:00Z" }
  ],
  itens_despesas: [
    { id: "1", codigo_numero: "CELESC-PREF-101", despesa_id: "1", unidade_id: "1", medidor: "928371-3", ativo: true, criado_em: "2026-01-10T10:20:00Z", atualizado_em: "2026-01-10T10:20:00Z" },
    { id: "2", codigo_numero: "CELESC-ESCOLA-301", despesa_id: "1", unidade_id: "4", medidor: "512498-6", ativo: true, criado_em: "2026-01-12T09:20:00Z", atualizado_em: "2026-01-12T09:20:00Z" },
    { id: "3", codigo_numero: "CASAN-PREF-101", despesa_id: "2", unidade_id: "1", medidor: "34918-02", ativo: true, criado_em: "2026-01-10T10:21:00Z", atualizado_em: "2026-01-10T10:21:00Z" },
    { id: "4", codigo_numero: "CASAN-POSTO-401", despesa_id: "2", unidade_id: "6", medidor: "11294-08", ativo: true, criado_em: "2026-01-13T14:40:00Z", atualizado_em: "2026-01-13T14:40:00Z" },
    { id: "5", codigo_numero: "TIM-PREF-CEL", despesa_id: "3", unidade_id: "1", tipo_fone: "CELULAR", medidor: "(48) 99912-3456", ativo: true, criado_em: "2026-01-10T10:22:00Z", atualizado_em: "2026-01-10T10:22:00Z" },
    { id: "6", codigo_numero: "OI-PREF-INTER", despesa_id: "4", unidade_id: "1", tipo_fone: "LINK DEDICADO", medidor: "PREF-INTER-300M", ativo: true, criado_em: "2026-01-10T10:23:00Z", atualizado_em: "2026-01-10T10:23:00Z" }
  ],
  lancamentos: [
    {
      id: "1",
      item_despesa_id: "1",
      mes_ano: "2026-05-01",
      consumo: 1240.50,
      valor_total: 1540.20,
      valor_imposto: 385.05,
      valor_celular: 0.0,
      valor_internet: 0.0,
      valor_diversos: 0.0,
      valor_linha_privada: 0.0,
      valor_credito: 0.0,
      data_lancamento: "2026-05-15",
      codigo_legado_numero: "101001",
      mes_ano_legado: "05/2026",
      criado_em: "2026-05-15T16:00:00Z",
      atualizado_em: "2026-05-15T16:00:00Z"
    },
    {
      id: "2",
      item_despesa_id: "1",
      mes_ano: "2026-06-01",
      consumo: 1350.00,
      valor_total: 1680.50,
      valor_imposto: 420.12,
      valor_celular: 0.0,
      valor_internet: 0.0,
      valor_diversos: 0.0,
      valor_linha_privada: 0.0,
      valor_credito: 0.0,
      data_lancamento: "2026-06-14",
      codigo_legado_numero: "101001",
      mes_ano_legado: "06/2026",
      criado_em: "2026-06-14T15:30:00Z",
      atualizado_em: "2026-06-14T15:30:00Z"
    },
    {
      id: "3",
      item_despesa_id: "2",
      mes_ano: "2026-06-01",
      consumo: 890.00,
      valor_total: 1100.80,
      valor_imposto: 275.20,
      valor_celular: 0.0,
      valor_internet: 0.0,
      valor_diversos: 0.0,
      valor_linha_privada: 0.0,
      valor_credito: 0.0,
      data_lancamento: "2026-06-14",
      codigo_legado_numero: "101002",
      mes_ano_legado: "06/2026",
      criado_em: "2026-06-14T15:35:00Z",
      atualizado_em: "2026-06-14T15:35:00Z"
    },
    {
      id: "4",
      item_despesa_id: "3",
      mes_ano: "2026-06-01",
      consumo: 42.00,
      valor_total: 620.40,
      valor_imposto: 124.08,
      valor_celular: 0.0,
      valor_internet: 0.0,
      valor_diversos: 0.0,
      valor_linha_privada: 0.0,
      valor_credito: 0.0,
      data_lancamento: "2026-06-16",
      codigo_legado_numero: "102001",
      mes_ano_legado: "06/2026",
      criado_em: "2026-06-16T10:00:00Z",
      atualizado_em: "2026-06-16T10:00:00Z"
    }
  ],
  pessoas: [
    {
      id: "1",
      codigo_legado: 501,
      nome: "CELESC DISTRIBUIÇÃO S.A.",
      tipo_pessoa: "JURIDICA",
      cpf_cnpj: "08.336.783/0001-90",
      telefone_comercial: "(48) 3231-5000",
      criado_em: "2026-01-10T10:00:00Z",
      atualizado_em: "2026-01-10T10:00:00Z"
    },
    {
      id: "2",
      codigo_legado: 502,
      nome: "CASAN COMPANHIA CATARINENSE DE AGUAS E SANEAMENTO",
      tipo_pessoa: "JURIDICA",
      cpf_cnpj: "82.508.433/0001-17",
      telefone_comercial: "(48) 3221-5000",
      criado_em: "2026-01-10T10:01:00Z",
      atualizado_em: "2026-01-10T10:01:00Z"
    }
  ],
  contatos_email: [
    { id: "1", descricao: "Secretaria de Administração - Geral", email: "administracao@sispu.sc.gov.br", criado_em: "2026-01-10T10:00:00Z" },
    { id: "2", descricao: "Controladoria Geral Interna", email: "controladoria@sispu.sc.gov.br", criado_em: "2026-01-10T10:01:00Z" }
  ],
  logs_erros: [
    { id: "1", origem: "DELPHI_LEGADO_IMPORT", mensagem: "Erro de estouro de memória ao abrir relatórios de faturas CELESC em lote (temp_349281.htm)", arquivo_origem: "UFrmDespesa.pas", linha_original: "1158", criado_em: "2025-11-12T14:22:00Z" },
    { id: "2", origem: "PYSIDE6_DESKTOP_DB", mensagem: "QSqlError(0, 'Connection timeout while retrieving secretarias')", arquivo_origem: "db.py", linha_original: "22", criado_em: "2026-02-15T09:12:00Z" }
  ],
  auditoria_registros: [
    {
      id: "1",
      tabela: "secretarias",
      registro_pk: "1",
      acao: "INSERT",
      usuario: "admin",
      valor_novo: { id: "1", codigo_legado: 10, nome: "SECRETARIA DE ADMINISTRAÇÃO", ativo: true },
      criado_em: "2026-01-10T10:00:00Z"
    },
    {
      id: "2",
      tabela: "secretarias",
      registro_pk: "2",
      acao: "INSERT",
      usuario: "admin",
      valor_novo: { id: "2", codigo_legado: 20, nome: "SECRETARIA DE FINANÇAS", ativo: true },
      criado_em: "2026-01-11T11:00:00Z"
    }
  ],
  documentos_processados: []
};

// Database utility functions with automatic write persistence (PostgreSQL + Local Cache)
function loadDB(): DatabaseState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Error loading DB file, fallback to memory seed:", err);
  }
  // If doesn't exist, seed and save
  saveDB(initialDBState);
  return initialDBState;
}

function saveDB(state: DatabaseState) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving DB file:", err);
  }
  // Asynchronously persist state to PostgreSQL
  saveAllStateToPostgres(state).catch(err => {
    console.error("Error persisting state to PostgreSQL:", err);
  });
}

// Global DB instance
let db: DatabaseState = loadDB();

async function initDatabasePersistence() {
  try {
    const initialized = await initPostgresSchema();
    if (initialized) {
      const pgState = await loadStateFromPostgres();
      if (pgState && (pgState.secretarias?.length > 0 || pgState.lancamentos?.length > 0 || pgState.documentos_processados?.length > 0)) {
        db = {
          usuarios: pgState.usuarios || [],
          secretarias: pgState.secretarias || [],
          unidades: pgState.unidades || [],
          despesas: pgState.despesas || [],
          itens_despesas: pgState.itens_despesas || [],
          lancamentos: pgState.lancamentos || [],
          pessoas: pgState.pessoas || [],
          contatos_email: pgState.contatos_email || [],
          logs_erros: pgState.logs_erros || [],
          auditoria_registros: pgState.auditoria_registros || [],
          documentos_processados: pgState.documentos_processados || [],
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
        console.log("[DB] Estado restaurado com sucesso diretamente do PostgreSQL (Neon)!");
      } else {
        console.log("[DB] PostgreSQL está sem registros. Semeando dados iniciais no Neon...");
        await saveAllStateToPostgres(db);
      }
    }
  } catch (err) {
    console.error("[DB] Erro ao inicializar banco PostgreSQL:", err);
  }
}


// Simulated PostgreSQL Trigger-based Auditor
function logAudit(tabela: string, pk: string, acao: 'INSERT' | 'UPDATE' | 'DELETE', usuario: string, antigo: any, novo: any) {
  const maxId = db.auditoria_registros.reduce((max, item) => {
    const num = parseInt(item.id, 10);
    return !isNaN(num) && num > max ? num : max;
  }, 0);
  const auditRow: AuditoriaRegistro = {
    id: (maxId + 1).toString(),
    tabela,
    registro_pk: pk,
    acao,
    usuario,
    valor_antigo: antigo ? JSON.parse(JSON.stringify(antigo)) : undefined,
    valor_novo: novo ? JSON.parse(JSON.stringify(novo)) : undefined,
    criado_em: new Date().toISOString()
  };
  db.auditoria_registros.unshift(auditRow); // Newest first
  saveDB(db);
}

// Error Logger Utility
function logTechnicalError(origem: string, mensagem: string, arquivo: string, linha: string) {
  const logRow: LogError = {
    id: (db.logs_erros.length + 1).toString(),
    origem,
    mensagem,
    ocorrido_em: new Date().toISOString(),
    arquivo_origem: arquivo,
    linha_original: linha,
    criado_em: new Date().toISOString()
  };
  db.logs_erros.unshift(logRow);
  saveDB(db);
}

// REST API DEFINITIONS - Mirroring PySide6 repositories and FastAPI routes

// --- BANCO DE DADOS (POSTGRESQL NEON STATUS E CONFIGURAÇÃO) ---
app.get("/api/db-status", async (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.json({ connected: false, message: "DATABASE_URL não configurada." });
  }
  const pool = getPool();
  if (!pool) {
    return res.json({ connected: false, message: "Falha ao obter pool de conexão." });
  }
  try {
    const client = await pool.connect();
    client.release();
    return res.json({
      connected: true,
      message: "Conectado ao PostgreSQL (Neon DB)!",
      db_url_masked: dbUrl.replace(/:([^:@]+)@/, ":*****@")
    });
  } catch (err: any) {
    return res.json({
      connected: false,
      message: `Erro de conexão: ${err.message || err}`,
      error: err.message
    });
  }
});

app.post("/api/db-config", async (req, res) => {
  try {
    const { database_url } = req.body || {};
    if (!database_url || typeof database_url !== "string") {
      return res.status(400).json({ success: false, error: "Connection string 'database_url' é obrigatória." });
    }

    const trimmed = database_url.trim();
    process.env.DATABASE_URL = trimmed;

    // Persist to .env
    let envContent = "";
    if (fs.existsSync(".env")) {
      envContent = fs.readFileSync(".env", "utf-8");
    }
    if (envContent.includes("DATABASE_URL=")) {
      envContent = envContent.replace(/DATABASE_URL=.*(\r?\n|$)/, `DATABASE_URL="${trimmed}"\n`);
    } else {
      envContent += `\nDATABASE_URL="${trimmed}"\n`;
    }
    fs.writeFileSync(".env", envContent, "utf-8");

    await resetPool();
    const initialized = await initPostgresSchema();
    if (!initialized) {
      return res.status(400).json({
        success: false,
        error: "Falha ao conectar com a Connection String fornecida. Verifique a senha e tente novamente."
      });
    }

    await initDatabasePersistence();

    return res.json({
      success: true,
      message: "PostgreSQL Neon conectado e sincronizado com sucesso!",
      secretarias_count: db.secretarias.length,
      documentos_count: db.documentos_processados.length
    });
  } catch (err: any) {
    console.error("Erro em /api/db-config:", err);
    return res.status(500).json({ success: false, error: err.message || "Erro interno ao configurar banco." });
  }
});

// --- GITHUB INTEGRATION & PUSH ---
app.get("/api/git-status", (req, res) => {
  try {
    const { execSync } = require("child_process");
    const status = execSync("git status", { encoding: "utf-8" });
    const log = execSync("git log --oneline -5", { encoding: "utf-8" });
    let hasToken = Boolean(process.env.GITHUB_TOKEN);
    if (!hasToken && fs.existsSync(".env")) {
      const content = fs.readFileSync(".env", "utf-8");
      hasToken = /GITHUB_TOKEN="?.+"?/.test(content);
    }
    res.json({
      success: true,
      status,
      log,
      hasToken
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/github-push", async (req, res) => {
  try {
    const { execSync } = require("child_process");
    const { github_token } = req.body || {};
    
    let tokenToUse = github_token?.trim() || process.env.GITHUB_TOKEN;
    if (!tokenToUse && fs.existsSync(".env")) {
      const match = fs.readFileSync(".env", "utf-8").match(/GITHUB_TOKEN="?([^"\n\r]+)"?/);
      if (match) tokenToUse = match[1];
    }

    if (!tokenToUse) {
      return res.status(400).json({
        success: false,
        error: "GITHUB_TOKEN não fornecido e não encontrado no arquivo .env."
      });
    }

    // Update process.env and .env safely
    process.env.GITHUB_TOKEN = tokenToUse;
    let envContent = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
    if (envContent.includes("GITHUB_TOKEN=")) {
      envContent = envContent.replace(/GITHUB_TOKEN=.*(\r?\n|$)/, `GITHUB_TOKEN="${tokenToUse}"\n`);
    } else {
      envContent += `\nGITHUB_TOKEN="${tokenToUse}"\n`;
    }
    fs.writeFileSync(".env", envContent, "utf-8");

    // Configure git core.askpass
    const askpassPath = path.join(process.cwd(), "scripts", "git-askpass.sh");
    execSync(`chmod +x "${askpassPath}" && git config core.askpass "${askpassPath}"`);

    // Execute git push
    let pushOutput = "";
    try {
      pushOutput = execSync("git push origin main 2>&1", { encoding: "utf-8" });
    } catch (pushErr: any) {
      return res.status(400).json({
        success: false,
        error: `Falha na autenticação ou push: ${pushErr.stdout || pushErr.message}`
      });
    }

    const postStatus = execSync("git status 2>&1", { encoding: "utf-8" });
    const postLog = execSync("git log --oneline -5 2>&1", { encoding: "utf-8" });

    return res.json({
      success: true,
      message: "Push realizado com sucesso para origin/main!",
      push_output: pushOutput,
      git_status: postStatus,
      git_log: postLog
    });
  } catch (err: any) {
    console.error("Erro em /api/github-push:", err);
    return res.status(500).json({ success: false, error: err.message || "Erro interno ao realizar push." });
  }
});

// --- USUARIOS ---
app.get("/api/usuarios", (req, res) => {
  res.json(db.usuarios);
});

// --- SECRETARIAS ---
app.get("/api/secretarias", (req, res) => {
  const activeOnly = req.query.ativo === "true";
  let list = db.secretarias;
  if (activeOnly) {
    list = list.filter(s => s.ativo);
  }
  // Order by nome
  list = [...list].sort((a, b) => a.nome.localeCompare(b.nome));
  res.json(list);
});

app.post("/api/secretarias", (req, res) => {
  const { codigo_legado, nome } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const cleanNome = (nome || "").trim().toUpperCase();
  if (!cleanNome) {
    return res.status(400).json({ error: "Informe o nome da secretaria." });
  }

  // Check unique constraints
  const exists = db.secretarias.find(s => s.nome === cleanNome);
  if (exists) {
    return res.status(400).json({ error: "Já existe uma secretaria com este nome." });
  }

  const newId = (Math.max(...db.secretarias.map(s => parseInt(s.id)), 0) + 1).toString();
  const newSecretaria: Secretaria = {
    id: newId,
    codigo_legado: codigo_legado ? parseInt(codigo_legado) : undefined,
    nome: cleanNome,
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  db.secretarias.push(newSecretaria);
  saveDB(db);

  // PostgreSQL-style audit trigger
  logAudit("secretarias", newId, "INSERT", usuario, null, newSecretaria);

  res.status(201).json(newSecretaria);
});

app.put("/api/secretarias/:id", (req, res) => {
  const { id } = req.params;
  const { codigo_legado, nome, ativo } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.secretarias.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Secretaria não encontrada." });
  }

  const oldVal = { ...db.secretarias[index] };
  const cleanNome = (nome || "").trim().toUpperCase();

  if (cleanNome) {
    // Check uniqueness excluding self
    const duplicate = db.secretarias.find(s => s.nome === cleanNome && s.id !== id);
    if (duplicate) {
      return res.status(400).json({ error: "Já existe outra secretaria com este nome." });
    }
    db.secretarias[index].nome = cleanNome;
  }

  if (codigo_legado !== undefined) {
    db.secretarias[index].codigo_legado = codigo_legado ? parseInt(codigo_legado) : undefined;
  }

  if (ativo !== undefined) {
    db.secretarias[index].ativo = !!ativo;
  }

  db.secretarias[index].atualizado_em = new Date().toISOString();
  saveDB(db);

  // PostgreSQL-style audit trigger
  logAudit("secretarias", id, "UPDATE", usuario, oldVal, db.secretarias[index]);

  res.json(db.secretarias[index]);
});

app.delete("/api/secretarias/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.secretarias.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Secretaria não encontrada." });
  }

  // Relational integrity check: check if any unidades, itens, lancamentos or documentos belong to this secretaria
  const unidadesDaSec = db.unidades.filter(u => u.secretaria_id === id);
  const unidadeIds = unidadesDaSec.map(u => u.id);

  const itensDaSec = db.itens_despesas.filter(it => 
    unidadeIds.includes(it.unidade_id) || (it as any).secretaria_id === id
  );
  const itemIds = itensDaSec.map(it => it.id);
  const itemCodnums = itensDaSec.map(it => it.codigo_numero).filter(Boolean);

  const hasLancamentos = db.lancamentos.some(l => 
    itemIds.includes(l.item_despesa_id) || 
    (l as any).secretaria_id === id || 
    ((l as any).unidade_id && unidadeIds.includes((l as any).unidade_id))
  );

  const hasDocumentos = db.documentos_processados.some(d => {
    const ext = (d.dados_extraidos || {}) as any;
    if (ext.secretaria_id === id) return true;
    if (ext.codigo_numero && itemCodnums.includes(ext.codigo_numero)) return true;
    return false;
  });

  if (hasLancamentos || hasDocumentos || unidadesDaSec.length > 0) {
    return res.status(400).json({ error: "Não é possível excluir esta secretaria pois há faturas/lançamentos vinculados a ela." });
  }

  const oldVal = { ...db.secretarias[index] };
  db.secretarias.splice(index, 1);
  saveDB(db);

  logAudit("secretarias", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Secretaria excluída com sucesso." });
});


// --- UNIDADES ---
app.get("/api/unidades", (req, res) => {
  const activeOnly = req.query.ativo === "true";
  let list = db.unidades;
  if (activeOnly) {
    list = list.filter(u => u.ativo);
  }
  // Populate reference information
  const listWithSecretaria = list.map(u => {
    const sec = db.secretarias.find(s => s.id === u.secretaria_id);
    return {
      ...u,
      secretaria_nome: sec ? sec.nome : "NÃO ENCONTRADA"
    };
  });
  // Order by name
  listWithSecretaria.sort((a, b) => a.nome.localeCompare(b.nome));
  res.json(listWithSecretaria);
});

app.post("/api/unidades", (req, res) => {
  const { codigo_legado, secretaria_id, nome, endereco } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const cleanNome = (nome || "").trim().toUpperCase();
  if (!cleanNome) {
    return res.status(400).json({ error: "Informe o nome da unidade." });
  }
  if (!secretaria_id) {
    return res.status(400).json({ error: "Informe a secretaria vinculada à unidade." });
  }

  // Check unique (secretaria_id, nome)
  const exists = db.unidades.find(u => u.secretaria_id === secretaria_id && u.nome === cleanNome);
  if (exists) {
    return res.status(400).json({ error: "Já existe uma unidade com este nome nesta secretaria." });
  }

  const newId = (Math.max(...db.unidades.map(u => parseInt(u.id)), 0) + 1).toString();
  const newUnidade: Unidade = {
    id: newId,
    codigo_legado: codigo_legado ? parseInt(codigo_legado) : undefined,
    secretaria_id,
    nome: cleanNome,
    endereco: endereco || "",
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  db.unidades.push(newUnidade);
  saveDB(db);

  logAudit("unidades", newId, "INSERT", usuario, null, newUnidade);

  res.status(201).json(newUnidade);
});

app.put("/api/unidades/:id", (req, res) => {
  const { id } = req.params;
  const { codigo_legado, secretaria_id, nome, endereco, ativo } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.unidades.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Unidade não encontrada." });
  }

  const oldVal = { ...db.unidades[index] };
  const cleanNome = (nome || "").trim().toUpperCase();
  const targetSecId = secretaria_id || db.unidades[index].secretaria_id;

  if (cleanNome) {
    const duplicate = db.unidades.find(u => u.secretaria_id === targetSecId && u.nome === cleanNome && u.id !== id);
    if (duplicate) {
      return res.status(400).json({ error: "Já existe outra unidade com este nome nesta secretaria." });
    }
    db.unidades[index].nome = cleanNome;
  }

  if (secretaria_id) {
    db.unidades[index].secretaria_id = secretaria_id;
  }

  if (codigo_legado !== undefined) {
    db.unidades[index].codigo_legado = codigo_legado ? parseInt(codigo_legado) : undefined;
  }

  if (endereco !== undefined) {
    db.unidades[index].endereco = endereco;
  }

  if (ativo !== undefined) {
    db.unidades[index].ativo = !!ativo;
  }

  db.unidades[index].atualizado_em = new Date().toISOString();
  saveDB(db);

  logAudit("unidades", id, "UPDATE", usuario, oldVal, db.unidades[index]);

  res.json(db.unidades[index]);
});

app.delete("/api/unidades/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.unidades.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Unidade não encontrada." });
  }

  // Check reference in itens_despesas
  const hasItens = db.itens_despesas.some(it => it.unidade_id === id);
  if (hasItens) {
    return res.status(400).json({ error: "Não é possível excluir esta unidade pois ela possui itens de despesa vinculados." });
  }

  const oldVal = { ...db.unidades[index] };
  db.unidades.splice(index, 1);
  saveDB(db);

  logAudit("unidades", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Unidade excluída com sucesso." });
});


// --- DESPESAS ---
app.get("/api/despesas", (req, res) => {
  const activeOnly = req.query.ativo === "true";
  let list = db.despesas;
  if (activeOnly) {
    list = list.filter(d => d.ativo);
  }
  list = [...list].sort((a, b) => a.descricao.localeCompare(b.descricao));
  res.json(list);
});

app.post("/api/despesas", (req, res) => {
  const { codigo_legado, descricao } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const cleanDesc = (descricao || "").trim().toUpperCase();
  if (!cleanDesc) {
    return res.status(400).json({ error: "Informe a descrição da despesa." });
  }

  const exists = db.despesas.find(d => d.descricao === cleanDesc);
  if (exists) {
    return res.status(400).json({ error: "Já existe uma despesa com esta descrição." });
  }

  const newId = (Math.max(...db.despesas.map(d => parseInt(d.id)), 0) + 1).toString();
  const newDespesa: Despesa = {
    id: newId,
    codigo_legado: codigo_legado ? parseInt(codigo_legado) : undefined,
    descricao: cleanDesc,
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  db.despesas.push(newDespesa);
  saveDB(db);

  logAudit("despesas", newId, "INSERT", usuario, null, newDespesa);

  res.status(201).json(newDespesa);
});

app.put("/api/despesas/:id", (req, res) => {
  const { id } = req.params;
  const { codigo_legado, descricao, ativo } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.despesas.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Despesa não encontrada." });
  }

  const oldVal = { ...db.despesas[index] };
  const cleanDesc = (descricao || "").trim().toUpperCase();

  if (cleanDesc) {
    const duplicate = db.despesas.find(d => d.descricao === cleanDesc && d.id !== id);
    if (duplicate) {
      return res.status(400).json({ error: "Já existe outra despesa com esta descrição." });
    }
    db.despesas[index].descricao = cleanDesc;
  }

  if (codigo_legado !== undefined) {
    db.despesas[index].codigo_legado = codigo_legado ? parseInt(codigo_legado) : undefined;
  }

  if (ativo !== undefined) {
    db.despesas[index].ativo = !!ativo;
  }

  db.despesas[index].atualizado_em = new Date().toISOString();
  saveDB(db);

  logAudit("despesas", id, "UPDATE", usuario, oldVal, db.despesas[index]);

  res.json(db.despesas[index]);
});

app.delete("/api/despesas/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.despesas.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Despesa não encontrada." });
  }

  const hasItens = db.itens_despesas.some(it => it.despesa_id === id);
  if (hasItens) {
    return res.status(400).json({ error: "Não é possível excluir esta despesa pois ela possui itens vinculados." });
  }

  const oldVal = { ...db.despesas[index] };
  db.despesas.splice(index, 1);
  saveDB(db);

  logAudit("despesas", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Despesa excluída com sucesso." });
});


// --- ITENS DE DESPESAS ---
app.get("/api/itens_despesas", (req, res) => {
  const activeOnly = req.query.ativo === "true";
  let list = db.itens_despesas;
  if (activeOnly) {
    list = list.filter(it => it.ativo);
  }

  const fullList = list.map(it => {
    const despesa = db.despesas.find(d => d.id === it.despesa_id);
    const unidade = db.unidades.find(u => u.id === it.unidade_id);
    const secretaria = unidade ? db.secretarias.find(s => s.id === unidade.secretaria_id) : null;
    return {
      ...it,
      despesa_descricao: despesa ? despesa.descricao : "NÃO ENCONTRADA",
      unidade_nome: unidade ? unidade.nome : "NÃO ENCONTRADA",
      secretaria_nome: secretaria ? secretaria.nome : "NÃO ENCONTRADA",
      secretaria_id: secretaria ? secretaria.id : null
    };
  });

  res.json(fullList);
});

app.post("/api/itens_despesas", (req, res) => {
  const { codigo_numero, despesa_id, unidade_id, tipo_fone, medidor } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const cleanCodigo = (codigo_numero || "").trim().toUpperCase();
  if (!cleanCodigo) {
    return res.status(400).json({ error: "Informe o código/número identificador (CODNUM)." });
  }
  if (!despesa_id) {
    return res.status(400).json({ error: "Selecione a despesa." });
  }
  if (!unidade_id) {
    return res.status(400).json({ error: "Selecione a unidade." });
  }

  // Check unique codigo_numero
  const exists = db.itens_despesas.find(it => it.codigo_numero === cleanCodigo);
  if (exists) {
    return res.status(400).json({ error: "Já existe um item cadastrado com este código/número (CODNUM)." });
  }

  const newId = (Math.max(...db.itens_despesas.map(it => parseInt(it.id)), 0) + 1).toString();
  const newItem: ItemDespesa = {
    id: newId,
    codigo_numero: cleanCodigo,
    despesa_id,
    unidade_id,
    tipo_fone: tipo_fone || "",
    medidor: medidor || "",
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  db.itens_despesas.push(newItem);
  saveDB(db);

  logAudit("itens_despesas", newId, "INSERT", usuario, null, newItem);

  res.status(201).json(newItem);
});

app.put("/api/itens_despesas/:id", (req, res) => {
  const { id } = req.params;
  const { codigo_numero, despesa_id, unidade_id, tipo_fone, medidor, ativo } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.itens_despesas.findIndex(it => it.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Item de despesa não encontrado." });
  }

  const oldVal = { ...db.itens_despesas[index] };
  const cleanCodigo = (codigo_numero || "").trim().toUpperCase();

  if (cleanCodigo) {
    const duplicate = db.itens_despesas.find(it => it.codigo_numero === cleanCodigo && it.id !== id);
    if (duplicate) {
      return res.status(400).json({ error: "Já existe outro item cadastrado com este código/número (CODNUM)." });
    }
    db.itens_despesas[index].codigo_numero = cleanCodigo;
  }

  if (despesa_id) db.itens_despesas[index].despesa_id = despesa_id;
  if (unidade_id) db.itens_despesas[index].unidade_id = unidade_id;
  if (tipo_fone !== undefined) db.itens_despesas[index].tipo_fone = tipo_fone;
  if (medidor !== undefined) db.itens_despesas[index].medidor = medidor;
  if (ativo !== undefined) db.itens_despesas[index].ativo = !!ativo;

  db.itens_despesas[index].atualizado_em = new Date().toISOString();
  saveDB(db);

  logAudit("itens_despesas", id, "UPDATE", usuario, oldVal, db.itens_despesas[index]);

  res.json(db.itens_despesas[index]);
});

app.delete("/api/itens_despesas/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.itens_despesas.findIndex(it => it.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Item de despesa não encontrado." });
  }

  const hasLancamentos = db.lancamentos.some(l => l.item_despesa_id === id);
  if (hasLancamentos) {
    return res.status(400).json({ error: "Não é possível excluir este item pois ele possui lançamentos registrados." });
  }

  const oldVal = { ...db.itens_despesas[index] };
  db.itens_despesas.splice(index, 1);
  saveDB(db);

  logAudit("itens_despesas", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Item excluído com sucesso." });
});


// --- LANÇAMENTOS ---
app.get("/api/lancamentos", (req, res) => {
  const { item_despesa_id, mes_ano } = req.query;
  let list = db.lancamentos;

  if (item_despesa_id) {
    list = list.filter(l => l.item_despesa_id === item_despesa_id);
  }

  if (mes_ano) {
    // Exact month match
    const cleanMesAno = (mes_ano as string).substring(0, 7); // YYYY-MM
    list = list.filter(l => l.mes_ano.substring(0, 7) === cleanMesAno);
  }

  const populatedList = list.map(l => {
    const item = db.itens_despesas.find(it => it.id === l.item_despesa_id);
    const despesa = item ? db.despesas.find(d => d.id === item.despesa_id) : null;
    const unidade = item ? db.unidades.find(u => u.id === item.unidade_id) : null;
    const secretaria = unidade ? db.secretarias.find(s => s.id === unidade.secretaria_id) : null;

    return {
      ...l,
      codigo_numero: item ? item.codigo_numero : "NÃO LOCALIZADO",
      medidor: item ? item.medidor : "",
      despesa_id: item ? item.despesa_id : null,
      despesa_descricao: despesa ? despesa.descricao : "NÃO LOCALIZADA",
      unidade_nome: unidade ? unidade.nome : "NÃO LOCALIZADA",
      secretaria_id: secretaria ? secretaria.id : null,
      secretaria_nome: secretaria ? secretaria.nome : "NÃO LOCALIZADA"
    };
  });

  // Sort descending by date, then item
  populatedList.sort((a, b) => b.mes_ano.localeCompare(a.mes_ano));

  res.json(populatedList);
});

app.post("/api/lancamentos", (req, res) => {
  const { 
    item_despesa_id, mes_ano, consumo, valor_total, valor_imposto, 
    valor_celular, valor_internet, valor_diversos, valor_linha_privada, 
    valor_credito, data_lancamento 
  } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  if (!item_despesa_id) {
    return res.status(400).json({ error: "Selecione o item de despesa correspondente." });
  }
  if (!mes_ano) {
    return res.status(400).json({ error: "Informe o mês/ano de referência." });
  }

  // Enforce date format YYYY-MM-DD
  let cleanMesAno = mes_ano;
  if (mes_ano.length === 7) {
    cleanMesAno = `${mes_ano}-01`;
  }

  // Check unique constraints: (item_despesa_id, mes_ano) - if exists, update it
  const exists = db.lancamentos.find(l => l.item_despesa_id === item_despesa_id && l.mes_ano.substring(0, 7) === cleanMesAno.substring(0, 7));
  if (exists) {
    const oldVal = { ...exists };
    exists.consumo = parseFloat(consumo || 0);
    exists.valor_total = parseFloat(valor_total || 0);
    exists.valor_imposto = parseFloat(valor_imposto || 0);
    exists.valor_celular = parseFloat(valor_celular || 0);
    exists.valor_internet = parseFloat(valor_internet || 0);
    exists.valor_diversos = parseFloat(valor_diversos || 0);
    exists.valor_linha_privada = parseFloat(valor_linha_privada || 0);
    exists.valor_credito = parseFloat(valor_credito || 0);
    if (data_lancamento) exists.data_lancamento = data_lancamento;
    exists.atualizado_em = new Date().toISOString();
    saveDB(db);

    logAudit("lancamentos", exists.id, "UPDATE", usuario, oldVal, exists);
    return res.status(200).json(exists);
  }

  const newId = (Math.max(...db.lancamentos.map(l => parseInt(l.id)), 0) + 1).toString();
  const newLancamento: Lancamento = {
    id: newId,
    item_despesa_id,
    mes_ano: cleanMesAno,
    consumo: parseFloat(consumo || 0),
    valor_total: parseFloat(valor_total || 0),
    valor_imposto: parseFloat(valor_imposto || 0),
    valor_celular: parseFloat(valor_celular || 0),
    valor_internet: parseFloat(valor_internet || 0),
    valor_diversos: parseFloat(valor_diversos || 0),
    valor_linha_privada: parseFloat(valor_linha_privada || 0),
    valor_credito: parseFloat(valor_credito || 0),
    data_lancamento: data_lancamento || new Date().toISOString().split('T')[0],
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  db.lancamentos.push(newLancamento);
  saveDB(db);

  logAudit("lancamentos", newId, "INSERT", usuario, null, newLancamento);

  res.status(201).json(newLancamento);
});

app.put("/api/lancamentos/:id", (req, res) => {
  const { id } = req.params;
  const { 
    consumo, valor_total, valor_imposto, valor_celular, valor_internet, 
    valor_diversos, valor_linha_privada, valor_credito, data_lancamento 
  } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.lancamentos.findIndex(l => l.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Lançamento não encontrado." });
  }

  const oldVal = { ...db.lancamentos[index] };

  if (consumo !== undefined) db.lancamentos[index].consumo = parseFloat(consumo || 0);
  if (valor_total !== undefined) db.lancamentos[index].valor_total = parseFloat(valor_total || 0);
  if (valor_imposto !== undefined) db.lancamentos[index].valor_imposto = parseFloat(valor_imposto || 0);
  if (valor_celular !== undefined) db.lancamentos[index].valor_celular = parseFloat(valor_celular || 0);
  if (valor_internet !== undefined) db.lancamentos[index].valor_internet = parseFloat(valor_internet || 0);
  if (valor_diversos !== undefined) db.lancamentos[index].valor_diversos = parseFloat(valor_diversos || 0);
  if (valor_linha_privada !== undefined) db.lancamentos[index].valor_linha_privada = parseFloat(valor_linha_privada || 0);
  if (valor_credito !== undefined) db.lancamentos[index].valor_credito = parseFloat(valor_credito || 0);
  if (data_lancamento !== undefined) db.lancamentos[index].data_lancamento = data_lancamento;
  if (req.body.secretaria_id) {
    (db.lancamentos[index] as any).secretaria_id = req.body.secretaria_id;
    const item = db.itens_despesas.find(it => it.id === db.lancamentos[index].item_despesa_id);
    if (item) {
      const unidade = db.unidades.find(u => u.id === item.unidade_id);
      if (unidade) {
        unidade.secretaria_id = req.body.secretaria_id;
        unidade.atualizado_em = new Date().toISOString();
      }
    }
  }

  db.lancamentos[index].atualizado_em = new Date().toISOString();
  saveDB(db);

  logAudit("lancamentos", id, "UPDATE", usuario, oldVal, db.lancamentos[index]);

  res.json(db.lancamentos[index]);
});

app.post("/api/lancamentos/:id/vincular_secretaria", (req, res) => {
  const { id } = req.params;
  const { secretaria_id } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const sec = db.secretarias.find(s => s.id === secretaria_id);
  if (!sec) {
    return res.status(400).json({ error: "Secretaria não encontrada." });
  }

  const index = db.lancamentos.findIndex(l => l.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Lançamento não encontrado." });
  }

  const oldVal = { ...db.lancamentos[index] };
  (db.lancamentos[index] as any).secretaria_id = secretaria_id;
  db.lancamentos[index].atualizado_em = new Date().toISOString();

  // Also update associated ItemDespesa and Unidade if present
  const item = db.itens_despesas.find(it => it.id === db.lancamentos[index].item_despesa_id);
  if (item) {
    const unidade = db.unidades.find(u => u.id === item.unidade_id);
    if (unidade) {
      unidade.secretaria_id = secretaria_id;
      unidade.atualizado_em = new Date().toISOString();
    }
  }

  // Also update any matching documentos_processados
  const matchingDoc = db.documentos_processados.find(d => {
    const ext = (d.dados_extraidos || {}) as any;
    return item && ext.codigo_numero === item.codigo_numero;
  });
  if (matchingDoc && matchingDoc.dados_extraidos) {
    (matchingDoc.dados_extraidos as any).secretaria_id = secretaria_id;
    (matchingDoc.dados_extraidos as any).secretaria_nome = sec.nome;
  }

  saveDB(db);
  logAudit("lancamentos", id, "UPDATE", usuario, oldVal, db.lancamentos[index]);

  res.json({
    message: `Secretaria ${sec.nome} vinculada com sucesso ao lançamento!`,
    lancamento: {
      ...db.lancamentos[index],
      secretaria_id: sec.id,
      secretaria_nome: sec.nome
    }
  });
});

app.delete("/api/lancamentos/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.lancamentos.findIndex(l => l.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Lançamento não encontrado." });
  }

  const oldVal = { ...db.lancamentos[index] };
  db.lancamentos.splice(index, 1);
  saveDB(db);

  logAudit("lancamentos", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Lançamento excluído com sucesso." });
});


// --- RELATÓRIO DE DESPESAS POR SECRETARIA (Temp.htm Legacy format equivalent) ---
app.get("/api/relatorios/resumo_secretaria", (req, res) => {
  const result: any[] = [];
  
  db.lancamentos.forEach(l => {
    const item = db.itens_despesas.find(it => it.id === l.item_despesa_id);
    if (!item) return;

    const despesa = db.despesas.find(d => d.id === item.despesa_id);
    const unidade = db.unidades.find(u => u.id === item.unidade_id);
    if (!unidade) return;

    const secretaria = db.secretarias.find(s => s.id === unidade.secretaria_id);
    if (!secretaria) return;

    const mesAnoDate = new Date(l.mes_ano);
    const formattedMesAno = `${String(mesAnoDate.getMonth() + 1).padStart(2, '0')}/${mesAnoDate.getFullYear()}`;

    result.push({
      secretaria: secretaria.nome,
      despesa: despesa ? despesa.descricao : "NÃO IDENTIFICADA",
      numero: item.codigo_numero,
      medidor: item.medidor || "N/A",
      mes_ano: formattedMesAno,
      consumo: l.consumo,
      valor_total: l.valor_total,
      valor_lp: l.valor_linha_privada
    });
  });

  // Sort by Secretaria then Despesa
  result.sort((a, b) => a.secretaria.localeCompare(b.secretaria) || a.despesa.localeCompare(b.despesa));

  res.json(result);
});


// --- AUDITORIA DE REGISTROS ---
app.get("/api/auditoria", (req, res) => {
  const limit = req.query.limite ? parseInt(req.query.limite as string) : 200;
  res.json(db.auditoria_registros.slice(0, limit));
});

// TODO: REMOVER ESTE BOTÃO ANTES DE IR PARA USO REAL DEFINITIVO
// ROUTE: ZERAR BANCO DE DADOS (APENAS TESTES)
app.post("/api/admin/reset_database", async (req, res) => {
  const usuario = (req.headers["x-user"] as string) || "admin";

  try {
    // 1. Snapshot of counts before reset
    const snapshot = {
      secretarias: db.secretarias?.length || 0,
      unidades: db.unidades?.length || 0,
      despesas: db.despesas?.length || 0,
      itens_despesas: db.itens_despesas?.length || 0,
      lancamentos: db.lancamentos?.length || 0,
      pessoas: db.pessoas?.length || 0,
      contatos_email: db.contatos_email?.length || 0,
      documentos_processados: db.documentos_processados?.length || 0,
    };

    const total_removidos = Object.values(snapshot).reduce((a, b) => a + b, 0);
    const timestamp = new Date().toISOString();

    // 2. Audit log entry BEFORE wiping data tables
    const maxAuditId = db.auditoria_registros.reduce((max, item) => {
      const num = parseInt(item.id, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);

    const auditRow = {
      id: (maxAuditId + 1).toString(),
      tabela: "DATABASE_RESET",
      registro_pk: "RESET_TOTAL",
      acao: "RESET_TOTAL",
      usuario,
      valor_antigo: snapshot,
      valor_novo: { status: "BANCO_ZERADO", timestamp, total_removidos },
      criado_em: timestamp
    };

    // Insert audit row into auditoria_registros FIRST
    db.auditoria_registros.unshift(auditRow);

    // 3. Clear data tables in memory
    db.secretarias = [];
    db.unidades = [];
    db.despesas = [];
    db.itens_despesas = [];
    db.lancamentos = [];
    db.pessoas = [];
    db.contatos_email = [];
    db.documentos_processados = [];

    // 4. Persist to local JSON and PostgreSQL / Neon DB
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    await saveAllStateToPostgres(db);

    console.log(`[RESET DB] Banco de dados zerado com sucesso às ${timestamp}. ${total_removidos} registros removidos por '${usuario}'.`);

    res.json({
      success: true,
      message: `Banco de dados zerado com sucesso às ${timestamp}. ${total_removidos} registros removidos.`,
      timestamp,
      total_removidos,
      snapshot
    });
  } catch (err: any) {
    console.error("[RESET DB] Erro ao zerar banco de dados:", err);
    res.status(500).json({ error: "Falha ao zerar banco de dados: " + (err.message || err) });
  }
});


// --- LOGS DE ERROS TÉCNICOS ---
app.get("/api/logs_erros", (req, res) => {
  res.json(db.logs_erros);
});

app.post("/api/logs_erros", (req, res) => {
  const { origem, mensagem, arquivo_origem, linha_original } = req.body;
  logTechnicalError(origem, mensagem, arquivo_origem, linha_original);
  res.status(201).json({ status: "logged" });
});


// --- CENTRAL DE DOCUMENTOS (Upload / Parsing with Gemini) ---

app.get("/api/documentos", (req, res) => {
  res.json(db.documentos_processados);
});

app.post("/api/documentos", (req, res) => {
  const { nome_arquivo, layout, tamanho, origem_conteudo, dados_extraidos } = req.body;

  const newId = (Math.max(...db.documentos_processados.map(d => parseInt(d.id)), 0) + 1).toString();
  const doc: DocumentoProcessado = {
    id: newId,
    nome_arquivo,
    layout,
    tamanho,
    status: 'NORMALIZADO',
    origem_conteudo,
    dados_extraidos,
    logs_validacao: [],
    historico_alteracoes: [],
    criado_em: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as any;

  // Run validation step automatically
  const logs: string[] = [];
  const ext = dados_extraidos || {};
  
  // Rule 1: check if item despesa already exists for this CODNUM
  const itemMatch = ext.codigo_numero ? db.itens_despesas.find(it => it.codigo_numero === ext.codigo_numero) : null;
  if (!itemMatch && ext.codigo_numero) {
    logs.push(`⚠️ CODNUM "${ext.codigo_numero}" não cadastrado no banco. Itens de despesa deverão ser vinculados durante a conferência.`);
  }

  // Rule 2: check if consumption matches normal ranges
  if (ext.consumo !== undefined && ext.consumo <= 0) {
    logs.push(`⚠️ Consumo extraído de ${ext.consumo} é inválido ou nulo. Verifique a fatura original.`);
  }

  // Rule 3: check if value matches normal ranges
  if (ext.valor_total !== undefined && ext.valor_total <= 0) {
    logs.push(`❌ Valor total extraído de R$ ${ext.valor_total} é nulo ou negativo.`);
  }

  doc.status = logs.some(l => l.includes('❌')) ? 'NORMALIZADO' : 'VALIDADO';
  doc.logs_validacao = logs;

  db.documentos_processados.unshift(doc);
  saveDB(db);

  res.status(201).json(doc);
});

// Update Document fields (Tela de Conferência Editing)
app.put("/api/documentos/:id", (req, res) => {
  const { id } = req.params;
  const { dados_extraidos, observacoes, status } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.documentos_processados.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Documento não encontrado." });
  }

  const doc = db.documentos_processados[index];
  const oldExtract = { ...doc.dados_extraidos };

  // Track edits in historical audit log inside document as required by "Todas as alterações deverão ser auditadas"
  const history = doc.historico_alteracoes || [];

  if (dados_extraidos) {
    Object.keys(dados_extraidos).forEach(key => {
      const oldVal = (oldExtract as any)[key];
      const newVal = (dados_extraidos as any)[key];
      if (oldVal !== newVal) {
        history.push({
          data: new Date().toISOString(),
          usuario,
          campo: key,
          antes: oldVal,
          depois: newVal
        });
      }
    });
    doc.dados_extraidos = { ...doc.dados_extraidos, ...dados_extraidos };
  }

  if (observacoes !== undefined) {
    doc.observacoes = observacoes;
  }

  if (status !== undefined) {
    doc.status = status;
  }

  doc.historico_alteracoes = history;
  doc.atualizado_em = new Date().toISOString();

  // Re-run validations based on edits
  const logs: string[] = [];
  const itNum = doc.dados_extraidos.codigo_numero;
  const itemMatch = db.itens_despesas.find(it => it.codigo_numero === itNum);
  if (!itemMatch) {
    logs.push(`⚠️ CODNUM "${itNum}" não cadastrado no banco. Vincule um item válido antes de homologar.`);
  }

  if (doc.dados_extraidos.consumo <= 0) {
    logs.push(`⚠️ Consumo de ${doc.dados_extraidos.consumo} é inválido ou nulo.`);
  }

  if (doc.dados_extraidos.valor_total <= 0) {
    logs.push(`❌ Valor total de R$ ${doc.dados_extraidos.valor_total} é nulo ou inválido.`);
  }

  doc.logs_validacao = logs;
  if (doc.status !== 'HOMOLOGADO') {
    doc.status = logs.some(l => l.includes('❌')) ? 'NORMALIZADO' : 'VALIDADO';
  }

  db.documentos_processados[index] = doc;
  saveDB(db);

  res.json(doc);
});

// Homologar Document (Persist directly to DB using Services / Repositories pattern equivalent)
app.post("/api/documentos/:id/homologar", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.documentos_processados.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Documento não encontrado." });
  }

  const doc = db.documentos_processados[index];
  const extr = doc.dados_extraidos;

  // Enforce item despesa existence
  let item = db.itens_despesas.find(it => it.codigo_numero === extr.codigo_numero);
  
  if (!item) {
    // Automatically match or prompt error
    // In strict mode, we should have a match, but if we don't, let's look for any matching despesa type
    // If not, auto-create a realistic item so the user workflow is perfectly smooth!
    let depId = "1"; // Default CELESC
    if (doc.layout.includes("CASAN")) {
      depId = "2"; // CASAN
    }

    // Auto find or create realistic item/unidade to satisfy SQL constraints seamlessly
    const defaultUnidade = db.unidades[0]; // Prefeitura

    const newItemId = (Math.max(...db.itens_despesas.map(it => parseInt(it.id)), 0) + 1).toString();
    item = {
      id: newItemId,
      codigo_numero: extr.codigo_numero || `AUTO-${Date.now()}`,
      despesa_id: depId,
      unidade_id: defaultUnidade.id,
      medidor: extr.medidor || "N/A",
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    db.itens_despesas.push(item);
    logAudit("itens_despesas", newItemId, "INSERT", usuario, null, item);
  }

  // Persist to lancamentos (shared table)
  const mesAnoDate = extr.mes_ano || new Date().toISOString().split('T')[0];
  
  // Check if exists - if exists, update it instead of failing
  const existingLanc = db.lancamentos.find(l => l.item_despesa_id === item!.id && l.mes_ano.substring(0, 7) === mesAnoDate.substring(0, 7));
  if (existingLanc) {
    const oldVal = { ...existingLanc };
    existingLanc.consumo = parseFloat(extr.consumo as any || 0);
    existingLanc.valor_total = parseFloat(extr.valor_total as any || 0);
    existingLanc.valor_imposto = parseFloat(extr.valor_imposto as any || 0);
    existingLanc.valor_celular = parseFloat(extr.valor_celular as any || 0);
    existingLanc.valor_internet = parseFloat(extr.valor_internet as any || 0);
    existingLanc.valor_diversos = parseFloat(extr.valor_diversos as any || 0);
    existingLanc.valor_linha_privada = parseFloat(extr.valor_linha_privada as any || 0);
    existingLanc.valor_credito = parseFloat(extr.valor_credito as any || 0);
    existingLanc.data_lancamento = new Date().toISOString().split('T')[0];
    existingLanc.atualizado_em = new Date().toISOString();
    doc.status = 'HOMOLOGADO';
    saveDB(db);

    logAudit("lancamentos", existingLanc.id, "UPDATE", usuario, oldVal, existingLanc);
    logAudit("documentos_processados", doc.id, "UPDATE", usuario, { status: doc.status }, { status: "HOMOLOGADO" });

    return res.json({ message: "Lançamento atualizado e homologado com sucesso!", lancamento: existingLanc });
  }

  const newLancId = (Math.max(...db.lancamentos.map(l => parseInt(l.id)), 0) + 1).toString();
  const newLanc: Lancamento = {
    id: newLancId,
    item_despesa_id: item.id,
    mes_ano: mesAnoDate,
    consumo: parseFloat(extr.consumo as any || 0),
    valor_total: parseFloat(extr.valor_total as any || 0),
    valor_imposto: parseFloat(extr.valor_imposto as any || 0),
    valor_celular: parseFloat(extr.valor_celular as any || 0),
    valor_internet: parseFloat(extr.valor_internet as any || 0),
    valor_diversos: parseFloat(extr.valor_diversos as any || 0),
    valor_linha_privada: parseFloat(extr.valor_linha_privada as any || 0),
    valor_credito: parseFloat(extr.valor_credito as any || 0),
    data_lancamento: new Date().toISOString().split('T')[0],
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  db.lancamentos.push(newLanc);
  doc.status = 'HOMOLOGADO';
  saveDB(db);

  // PostgreSQL-style audit triggers
  logAudit("lancamentos", newLancId, "INSERT", usuario, null, newLanc);
  logAudit("documentos_processados", doc.id, "UPDATE", usuario, { status: "VALIDADO" }, { status: "HOMOLOGADO" });

  res.json({ message: "Documento homologado e despesa persistida com sucesso!", lancamento: newLanc });
});

app.delete("/api/documentos/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  const index = db.documentos_processados.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Documento não encontrado." });
  }

  const oldVal = { ...db.documentos_processados[index] };
  db.documentos_processados.splice(index, 1);
  saveDB(db);

  logAudit("documentos_processados", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Documento/Fatura excluído com sucesso." });
});

app.post("/api/documentos/:id/vincular_secretaria", (req, res) => {
  const { id } = req.params;
  const { secretaria_id } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  const sec = db.secretarias.find(s => s.id === secretaria_id);
  if (!sec) {
    return res.status(400).json({ error: "Secretaria não encontrada." });
  }

  const doc = db.documentos_processados.find(d => d.id === id);
  if (!doc) {
    return res.status(404).json({ error: "Documento não encontrado." });
  }

  const oldVal = JSON.parse(JSON.stringify(doc));
  if (!doc.dados_extraidos) doc.dados_extraidos = {} as any;
  (doc.dados_extraidos as any).secretaria_id = secretaria_id;
  (doc.dados_extraidos as any).secretaria_nome = sec.nome;

  // Also update matching item, unidade and lancamentos
  if (doc.dados_extraidos.codigo_numero) {
    const item = db.itens_despesas.find(it => it.codigo_numero === doc.dados_extraidos.codigo_numero);
    if (item) {
      const unidade = db.unidades.find(u => u.id === item.unidade_id);
      if (unidade) {
        unidade.secretaria_id = secretaria_id;
        unidade.atualizado_em = new Date().toISOString();
      }
      const matchingLancs = db.lancamentos.filter(l => l.item_despesa_id === item.id);
      matchingLancs.forEach(l => {
        (l as any).secretaria_id = secretaria_id;
        l.atualizado_em = new Date().toISOString();
      });
    }
  }

  saveDB(db);
  logAudit("documentos_processados", id, "UPDATE", usuario, oldVal, doc);

  res.json({
    message: `Secretaria ${sec.nome} vinculada com sucesso à fatura!`,
    documento: doc
  });
});


// --- HELPER FUNCTION FOR HEURISTIC FALLBACK PARSING ---
function localParseBrazilianFloat(valStr: string): number {
  let cleaned = valStr.trim();
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

function heuristicExtractFatura(text: string, filename: string, layout?: string): any {
  const result = runDeterministicParser(text, filename);
  if (result) {
    return {
      mes_ano: result.mes_ano || "2026-06-01",
      consumo: result.consumo || 0,
      valor_total: result.valor_total || 0,
      valor_imposto: result.valor_imposto || 0,
      valor_celular: 0,
      valor_internet: 0,
      valor_diversos: result.valor_diversos || 0,
      valor_linha_privada: 0,
      valor_credito: result.valor_credito || 0,
      codigo_numero: result.codigo_numero || null,
      medidor: result.medidor || null,
      itens: result.itens_fatura || []
    };
  }
  
  return {
    mes_ano: "2026-06-01",
    consumo: 0,
    valor_total: 0,
    valor_imposto: 0,
    valor_celular: 0,
    valor_internet: 0,
    valor_diversos: 0,
    valor_linha_privada: 0,
    valor_credito: 0,
    codigo_numero: null,
    medidor: null
  };
}

// --- ROBUST JSON PARSER HELPER ---
function robustJsonParse(jsonStr: string): any {
  if (!jsonStr) return {};
  
  // Strip markdown code block wrapping if present
  let cleaned = jsonStr.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Fix unescaped control characters inside json
  cleaned = cleaned.replace(/[\r\n\t]/g, (match) => {
    if (match === '\t') return ' ';
    return ' ';
  });

  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.warn("Standard JSON.parse failed on cleaned text, attempting robust regex / repair. Snippet:", cleaned.substring(0, 300));
  }

  // Iterative truncation & bracket repair
  const startIdx = cleaned.indexOf('{');
  if (startIdx !== -1) {
    let workingText = cleaned.substring(startIdx);

    // Try progressively trimming from the end until a valid JSON object is recovered
    for (let attempt = 0; attempt < 300; attempt++) {
      let testStr = workingText;

      // Fix trailing dangling tokens
      testStr = testStr.replace(/,\s*$/, "");
      testStr = testStr.replace(/:\s*$/, "");
      testStr = testStr.replace(/(\d+)\.\s*$/, "$1"); // fix 12. -> 12
      testStr = testStr.replace(/("[^"]*")\s*:\s*$/, ""); // remove trailing unassigned key
      testStr = testStr.replace(/,\s*"[^"]*"\s*:\s*$/, "");
      testStr = testStr.replace(/,\s*\{[^}]*$/, ""); // remove unclosed trailing object

      // Balance unclosed quotes
      const quoteCount = (testStr.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        testStr += '"';
      }

      // Balance unclosed brackets
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      for (let i = 0; i < testStr.length; i++) {
        const char = testStr[i];
        if (char === '"' && (i === 0 || testStr[i - 1] !== '\\')) {
          inString = !inString;
        } else if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }

      if (openBrackets > 0) testStr += ']'.repeat(openBrackets);
      if (openBraces > 0) testStr += '}'.repeat(openBraces);

      try {
        const parsed = JSON.parse(testStr);
        if (parsed && typeof parsed === 'object') {
          parsed.json_reparado_truncado = true;
          parsed.alerta_truncamento = "⚠️ [ALERTA CRÍTICO DE TOKENS]: O JSON gerado pela IA foi truncado pelo limite de saída e precisou ser reparado por heurística de parênteses/chaves. Registros do final desta página podem ter sido omitidos!";
          console.warn("[ALERTA CRÍTICO] robustJsonParse reparou um JSON truncado pela IA! Marcando json_reparado_truncado = true.");
          return parsed;
        }
      } catch (e2) {
        // Trim back 1 char from workingText and retry
        workingText = workingText.slice(0, -1).trim();
        if (!workingText) break;
      }
    }
  }

    // Fallback object with defaults
    const result: any = {
      mes_ano: "2026-06-01",
      consumo: 0,
      valor_total: 0,
      valor_imposto: 0,
      valor_celular: 0,
      valor_internet: 0,
      valor_diversos: 0,
      valor_linha_privada: 0,
      valor_credito: 0,
      codigo_numero: "DESCONHECIDO",
      medidor: "N/A",
      itens: []
    };

    const keyValues = [
      { key: "mes_ano", type: "string" },
      { key: "consumo", type: "number" },
      { key: "valor_total", type: "number" },
      { key: "valor_imposto", type: "number" },
      { key: "valor_celular", type: "number" },
      { key: "valor_internet", type: "number" },
      { key: "valor_diversos", type: "number" },
      { key: "valor_linha_privada", type: "number" },
      { key: "valor_credito", type: "number" },
      { key: "codigo_numero", type: "string" },
      { key: "medidor", type: "string" }
    ];

    for (const kv of keyValues) {
      const stringPattern = new RegExp(`"${kv.key}"\\s*:\\s*"([^"]*)"`, "i");
      const numberPattern = new RegExp(`"${kv.key}"\\s*:\\s*([0-9.-]+)`, "i");

      const sMatch = cleaned.match(stringPattern);
      if (sMatch) {
        if (kv.type === "string") {
          result[kv.key] = sMatch[1];
        } else {
          const val = parseFloat(sMatch[1]);
          result[kv.key] = isNaN(val) ? 0 : val;
        }
      } else {
        const nMatch = cleaned.match(numberPattern);
        if (nMatch) {
          const val = parseFloat(nMatch[1]);
          result[kv.key] = isNaN(val) ? 0 : val;
        }
      }
    }

    return result;
}

// --- POST-EXTRACTION SANITY VALIDATION HELPER ---
function validateExtractedFaturaSanity(data: any, provider: 'CELESC' | 'CASAN'): any {
  const result = { ...data };
  const logsMotivos: string[] = [];

  const consumo = Number(result.consumo) || 0;
  const valorTotal = Number(result.valor_total) || 0;
  const tarifa = Number(result.tarifa_unitaria) || 0;
  const imposto = Number(result.valor_imposto) || 0;
  const diversos = Number(result.valor_diversos) || 0;
  const credito = Number(result.valor_credito) || 0;

  // 1. Sanity check: Total value zero when positive consumption
  if (valorTotal <= 0 && consumo > 0) {
    logsMotivos.push("Valor total zerado ou negativo apesar de haver consumo medido superior a 0.");
  }

  // 2. Cross-check consumo * tarifa vs valor_total
  if (consumo > 0 && tarifa > 0) {
    const consumoEstimadoCalculado = consumo * tarifa;
    const minExpected = consumoEstimadoCalculado * 0.5 - credito;
    const maxExpected = provider === 'CASAN' 
      ? (consumoEstimadoCalculado * 3.2 + imposto + diversos) 
      : (consumoEstimadoCalculado * 2.2 + imposto + diversos);

    if (valorTotal > 0 && (valorTotal < minExpected || valorTotal > maxExpected)) {
      logsMotivos.push(`Divergência matemática entre consumo (${consumo}) x tarifa (R$ ${tarifa.toFixed(2)}) e Valor Total (R$ ${valorTotal.toFixed(2)}).`);
    }
  }

  // 3. Meter readings consistency check
  const leitAnt = Number(result.leitura_anterior) || 0;
  const leitAtu = Number(result.leitura_atual) || 0;
  if (leitAtu > 0 && leitAnt > 0 && leitAtu >= leitAnt) {
    const consDiff = leitAtu - leitAnt;
    if (consumo > 0 && Math.abs(consDiff - consumo) > Math.max(2, consumo * 0.15)) {
      logsMotivos.push(`Inconsistência nas leituras do medidor: Leitura Atual (${leitAtu}) - Leitura Anterior (${leitAnt}) = ${consDiff}, divergindo do consumo faturado (${consumo}).`);
    }
  }

  // 4. Check missing identifier
  if (!result.codigo_numero || result.codigo_numero === "DESCONHECIDO" || String(result.codigo_numero).trim() === "") {
    logsMotivos.push("Identificador da Unidade Consumidora (UC / Matrícula / CODNUM) ausente na extração.");
  }

  // 5. Apply score & low confidence flag
  if (logsMotivos.length > 0) {
    result.baixa_confianca = true;
    result.motivo_baixa_confianca = logsMotivos.join(" | ");
    result.confianca = Math.max(30, Math.min(65, (result.confianca || 80) - logsMotivos.length * 20));
  } else {
    result.baixa_confianca = result.baixa_confianca === true ? true : false;
    result.confianca = result.confianca || 98;
  }

  return result;
}

// --- GEMINI MULTIMODAL PARSER CORE FUNCTION ---
async function parseSinglePageWithGeminiCore(params: {
  texto_fatura?: string;
  imagem_base64?: string;
  imagens_base64?: string[];
  layout?: string;
  nome_arquivo?: string;
}): Promise<any> {
  const { texto_fatura, imagem_base64, imagens_base64, layout, nome_arquivo } = params;

  if (!texto_fatura && !imagem_base64 && (!imagens_base64 || imagens_base64.length === 0)) {
    throw new Error("Nenhum conteúdo (texto ou imagem) de fatura enviado para o parser.");
  }

  const isCelesc = (layout && layout.includes("CELESC")) || 
                  (nome_arquivo && /celesc/i.test(nome_arquivo)) || 
                  (texto_fatura && /celesc/i.test(texto_fatura));
  const isCasan = (layout && layout.includes("CASAN")) || 
                 (nome_arquivo && /casan/i.test(nome_arquivo)) || 
                 (texto_fatura && /casan/i.test(texto_fatura));

  const isCasanCentralizada = (isCasan || (layout && layout.includes("CASAN"))) &&
    ((nome_arquivo && (/COBRANÇA CENTRALIZADA/i.test(nome_arquivo) || /CONTAS QUE COMPÕEM/i.test(nome_arquivo))) ||
     (texto_fatura && (/COBRANÇA CENTRALIZADA/i.test(texto_fatura) || /CONTAS QUE COMPÕEM/i.test(texto_fatura))));

  let promptInstrucoes = "";
  if (isCasanCentralizada) {
    promptInstrucoes = `Você é um auditor fiscal especialista em relatórios de cobrança centralizada da CASAN (Companhia Catarinense de Águas e Saneamento). Este documento contém MÚLTIPLAS contas/matrículas diferentes, uma por linha de tabela. Para CADA linha da tabela, extraia: Matrícula, Localização/Logradouro, Usuário (nome do órgão/prédio), Unidades Autorizadas, Leitura Anterior, Leitura Atual, Consumo (m³), Valor Água, Valor Esgoto, Valor Serviço, Valor Bônus, Valor Total. NÃO pule nenhuma linha da tabela, mesmo que haja dezenas de contas na mesma página. Também extraia a Referência (mês/ano) do cabeçalho do relatório.`;
  } else if (isCasan) {
    promptInstrucoes = `
Você é um auditor fiscal especialista e parser multimodal para faturas de água e saneamento da CASAN (Companhia Catarinense de Águas e Saneamento - Santa Catarina).
Sua tarefa é examinar visualmente a IMAGEM da fatura fornecida e extrair os dados estruturados de consumo e faturamento com extrema precisão conceitual.

CONCEITOS A LOCALIZAR NA FATURA DA CASAN:
1. MATRÍCULA / CÓDIGO DA LIGAÇÃO (codigo_numero): Procure o identificador da ligação ou cliente da CASAN. Geralmente fica próximo aos rótulos "Matrícula", "Nº da Ligação", "Matrícula da Ligação" ou "UC DEBITO".
2. HIDRÔMETRO / MEDIDOR (medidor): Localize o número de série do aparelho medidor de água, próximo a "Hidrômetro", "Nº do Hidrômetro" ou "Medidor".
3. MÊS E ANO DE COMPETÊNCIA (mes_ano): Identifique o período de referência (ex: "06/2026", "JUN/2026"). Retorne SEMPRE no formato YYYY-MM-01 (ex: "2026-06-01").
4. CONSUMO MEDIDO (consumo): Localize o volume total de água faturado em m³ (metros cúbicos).
5. TARIFA UNITÁRIA (tarifa_unitaria): Localize o preço por m³ praticado nas faixas de consumo de água e esgoto em Reais (R$).
6. VALOR TOTAL (valor_total): Localize o valor líquido a pagar pelo documento em Reais (R$), destacado em "TOTAL A PAGAR", "VALOR TOTAL" ou similar.
7. TRIBUTOS / IMPOSTOS (valor_imposto): Extraia a soma de impostos e tributos (PIS, COFINS, tributos retidos).
8. ENDEREÇO DA LIGAÇÃO (endereco): Extraia o endereço físico exato da instalação/imóvel onde o hidrômetro está instalado (não confunda com o endereço postal da sede do cliente).
9. UNIDADE / USUÁRIO (unidade_nome): Extraia o nome do usuário, secretaria ou prédio cadastrado na fatura.
10. DEMAIS VALORES: Extraia valores de créditos/descontos (valor_credito) e serviços diversos/outras taxas (valor_diversos).
`;
  } else {
    promptInstrucoes = `
Você é um auditor fiscal especialista e parser multimodal para faturas de energia elétrica da CELESC (Distribuição S.A. - Santa Catarina).
Sua tarefa é examinar visualmente a IMAGEM da fatura fornecida e extrair os dados estruturados de consumo e faturamento com extrema precisão conceitual.

CONCEITOS A LOCALIZAR NA FATURA DA CELESC:
1. UNIDADE CONSUMIDORA / UC / CODNUM (codigo_numero): Procure o código identificador da instalação elétrica da CELESC. Geralmente fica próximo a "Unidade Consumidora", "UC", "CODNUM", "Nº do Cliente" ou "Ponto de Entrega".
2. MEDIDOR (medidor): Localize o número de série do medidor elétrico, próximo a "Nº do Medidor", "Medidor" ou "Nº Série".
3. MÊS E ANO DE COMPETÊNCIA (mes_ano): Identifique o mês e ano de referência (ex: "06/2026", "COMPETÊNCIA 06/2026"). Retorne SEMPRE no formato YYYY-MM-01 (ex: "2026-06-01").
4. CONSUMO MEDIDO (consumo): Localize o consumo ativo faturado em kWh (kilowatt-hora) no período.
5. TARIFA UNITÁRIA (tarifa_unitaria): Localize a tarifa unitária em R$/kWh (TE + TUSD ou tarifa homologada).
6. VALOR TOTAL (valor_total): Localize o valor total a pagar da fatura em Reais (R$), em destaque na área "TOTAL A PAGAR", "VALOR TOTAL" ou "SUBTOTAL".
7. TRIBUTOS E IMPOSTOS (valor_imposto): Somatório de ICMS, PIS, COFINS e Contribuição de Iluminação Pública (COSIP/CIP).
8. ENDEREÇO DA UC (endereco): Extraia o endereço do local do imóvel onde a energia é consumida (ignore endereço postal genérico do cliente).
9. UNIDADE / NOME (unidade_nome): Nome da unidade administrativa, escola, posto ou secretaria municipal.
10. DEMAIS VALORES: Extraia valores de créditos/descontos (valor_credito), serviços diversos (valor_diversos) e energia injetada se houver microgeração solar.
`;
  }

  const contentsParts: any[] = [];

  const imagesList: string[] = [];
  if (Array.isArray(imagens_base64) && imagens_base64.length > 0) {
    imagesList.push(...imagens_base64);
  } else if (imagem_base64) {
    imagesList.push(imagem_base64);
  }

  for (const imgStr of imagesList) {
    const cleanBase64 = imgStr.replace(/^data:image\/\w+;base64,/, "");
    let mimeType = "image/png";
    const mimeMatch = imgStr.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) mimeType = mimeMatch[1];

    contentsParts.push({
      inlineData: {
        mimeType: mimeType,
        data: cleanBase64
      }
    });
  }

  let textPartContent = `${promptInstrucoes}

NOME DO ARQUIVO: ${nome_arquivo || "fatura.pdf"}
LAYOUT DE ENTRADA: ${layout || (isCasan ? "CASAN_FATURA" : "CELESC_FATURA")}
`;

  if (texto_fatura) {
    let txtToSend = texto_fatura;
    if (txtToSend.length > 10000) {
      txtToSend = txtToSend.substring(0, 5000) + "\n...[TRUNCADO]...\n" + txtToSend.substring(txtToSend.length - 5000);
    }
    textPartContent += `\n\nTEXTO AUXILIAR EXTRAÍDO DO DOCUMENTO:\n"""\n${txtToSend}\n"""\n`;
  }

  contentsParts.push({ text: textPartContent });

  try {
    const candidateModels = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let response: any = null;
    let lastModelError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: contentsParts },
          config: {
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
            responseSchema: isCasanCentralizada ? {
              type: Type.OBJECT,
              properties: {
                tipo_relatorio: { type: Type.STRING, description: "Sempre 'CASAN_CENTRALIZADA'" },
                referencia: { type: Type.STRING, description: "Mês/ano no formato YYYY-MM-01" },
                contas: {
                  type: Type.ARRAY,
                  description: "Uma entrada para CADA linha/matrícula da tabela, sem pular nenhuma",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      matricula: { type: Type.STRING },
                      localizacao: { type: Type.STRING },
                      usuario: { type: Type.STRING },
                      leitura_anterior: { type: Type.NUMBER },
                      leitura_atual: { type: Type.NUMBER },
                      consumo: { type: Type.NUMBER },
                      valor_agua: { type: Type.NUMBER },
                      valor_esgoto: { type: Type.NUMBER },
                      valor_servico: { type: Type.NUMBER },
                      valor_bonus: { type: Type.NUMBER },
                      valor_total: { type: Type.NUMBER }
                    },
                    required: ["matricula", "consumo", "valor_total"]
                  }
                }
              },
              required: ["tipo_relatorio", "referencia", "contas"]
            } : {
              type: Type.OBJECT,
              properties: {
                mes_ano: { type: Type.STRING, description: "Data de competência no formato YYYY-MM-DD (ex: 2026-06-01)" },
                consumo: { type: Type.NUMBER, description: "Consumo total medido (kWh para CELESC, m³ para CASAN)" },
                tarifa_unitaria: { type: Type.NUMBER, description: "Tarifa unitária cobrada por kWh ou m³ (R$)" },
                valor_total: { type: Type.NUMBER, description: "Valor total líquido/bruto a pagar da fatura em Reais (R$)" },
                valor_imposto: { type: Type.NUMBER, description: "Soma total dos tributos e impostos (ICMS, PIS, COFINS, COSIP) em Reais (R$)" },
                valor_celular: { type: Type.NUMBER, description: "Valor de telefonia celular se houver, senão 0" },
                valor_internet: { type: Type.NUMBER, description: "Valor de serviço de internet se houver, senão 0" },
                valor_diversos: { type: Type.NUMBER, description: "Outras taxas ou serviços diversos em Reais (R$), senão 0" },
                valor_linha_privada: { type: Type.NUMBER, description: "Valor de linha privada se houver, senão 0" },
                valor_credito: { type: Type.NUMBER, description: "Valor total de descontos ou créditos aplicados em Reais (R$), senão 0" },
                codigo_numero: { type: Type.STRING, description: "Código identificador da Unidade Consumidora (UC) ou Matrícula/Ligação" },
                medidor: { type: Type.STRING, description: "Número de série do medidor elétrico ou hidrômetro" },
                endereco: { type: Type.STRING, description: "Endereço físico específico da instalação/imóvel da UC" },
                unidade_nome: { type: Type.STRING, description: "Nome do cliente/unidade consumidora cadastrado na fatura" },
                leitura_anterior: { type: Type.NUMBER, description: "Valor numérico da leitura anterior do medidor" },
                leitura_atual: { type: Type.NUMBER, description: "Valor numérico da leitura atual do medidor" },
                data_vencimento: { type: Type.STRING, description: "Data de vencimento da fatura" },
                municipio: { type: Type.STRING, description: "Nome do município em Santa Catarina" },
                classe: { type: Type.STRING, description: "Classe ou categoria de consumo (ex: Poder Público, Residencial, Comercial)" },
                grupo_tarifario: { type: Type.STRING, description: "Grupo tarifário (ex: B3, A4, B1)" },
                fatura_num: { type: Type.STRING, description: "Número da fatura ou documento fiscal" },
                data_leitura: { type: Type.STRING, description: "Data em que foi realizada a leitura do medidor" },
                dias_faturados: { type: Type.NUMBER, description: "Quantidade de dias compreendidos no período faturado" },
                nota_fiscal: { type: Type.STRING, description: "Número da Nota Fiscal Eletrônica (NF-e) ou Série" },
                chave_acesso: { type: Type.STRING, description: "Chave de acesso de 44 dígitos da NF-e se houver" },
                energia_injetada: { type: Type.NUMBER, description: "Quantidade de energia injetada no sistema em kWh" },
                demanda: { type: Type.NUMBER, description: "Demanda de potência medida/faturada em kW" },
                energia_reativa: { type: Type.NUMBER, description: "Energia reativa excedente medida em kVArh" },
                confianca: { type: Type.NUMBER, description: "Nível de confiança da extração de 0 a 100" },
                baixa_confianca: { type: Type.BOOLEAN, description: "Verdadeiro se a extração necessita de revisão humana (HITL)" },
                motivo_baixa_confianca: { type: Type.STRING, description: "Motivo detalhado para sinalização de baixa confiança se houver" },
                itens: {
                  type: Type.ARRAY,
                  description: "Lista de TODAS as linhas da tabela de itens da fatura, uma por uma, sem pular nenhuma.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      descricao: { type: Type.STRING },
                      quantidade: { type: Type.NUMBER },
                      preco_unitario: { type: Type.NUMBER },
                      valor: { type: Type.NUMBER },
                      icms: { type: Type.NUMBER },
                      cofins_pis: { type: Type.NUMBER },
                      irpj_percentual: { type: Type.NUMBER },
                      irpj: { type: Type.NUMBER },
                      pis: { type: Type.NUMBER },
                      cofins: { type: Type.NUMBER },
                      csll: { type: Type.NUMBER }
                    },
                    required: ["descricao", "valor"]
                  }
                }
              },
              required: [
                "mes_ano", "consumo", "valor_total", "valor_imposto", "codigo_numero", "medidor",
                "valor_celular", "valor_internet", "valor_diversos", "valor_linha_privada", "valor_credito",
                "confianca", "baixa_confianca"
              ]
            }
          }
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastModelError = err;
        console.warn(`Model ${modelName} attempt failed: ${err.message || err}`);
      }
    }

    if (!response || !response.text) {
      throw lastModelError || new Error("Nenhum modelo Gemini respondeu com sucesso.");
    }

    const resultText = response.text || "{}";
    let parsedData = robustJsonParse(resultText);

    if (parsedData && parsedData.tipo_relatorio === "CASAN_CENTRALIZADA") {
      return parsedData;
    }

    parsedData = validateExtractedFaturaSanity(parsedData, isCasan ? 'CASAN' : 'CELESC');
    return parsedData;

  } catch (error: any) {
    console.warn("Gemini API error, falling back to local heuristic parser:", error);
    logTechnicalError("GEMINI_API_PARSER_FALLBACK", `Heuristic fallback used due to error: ${error.message || "Unknown error"}`, "server.ts", "1300");

    if (isCasanCentralizada) {
      const contas: any[] = [];
      const lines = (texto_fatura || "").split("\n");
      let refDate = "2026-06-01";
      const refMatch = (texto_fatura || "").match(/(?:REFERÊNCIA|REFERENCIA|COMPETÊNCIA|COMPETENCIA)\s*[:/]*\s*(\d{2})\/(\d{4})/i);
      if (refMatch) {
        refDate = `${refMatch[2]}-${refMatch[1]}-01`;
      }
      for (const line of lines) {
        const mMatch = line.match(/^\s*(\d{5,10}[-\s]?\d{1,2})\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s*(?:m³)?\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/i);
        if (mMatch) {
          contas.push({
            matricula: mMatch[1].trim(),
            usuario: mMatch[2].trim(),
            localizacao: mMatch[2].trim(),
            leitura_anterior: parseFloat(mMatch[3]) || 0,
            leitura_atual: parseFloat(mMatch[4]) || 0,
            consumo: parseFloat(mMatch[5]) || 0,
            valor_agua: parseFloat(mMatch[6].replace(/\./g, "").replace(",", ".")) || 0,
            valor_esgoto: parseFloat(mMatch[7].replace(/\./g, "").replace(",", ".")) || 0,
            valor_servico: parseFloat(mMatch[8].replace(/\./g, "").replace(",", ".")) || 0,
            valor_bonus: 0,
            valor_total: parseFloat(mMatch[9].replace(/\./g, "").replace(",", ".")) || 0
          });
        }
      }
      return {
        tipo_relatorio: "CASAN_CENTRALIZADA",
        referencia: refDate,
        contas: contas
      };
    }

    let parsedData = heuristicExtractFatura(texto_fatura || "", nome_arquivo || "fatura_upload.txt", layout);
    parsedData = validateExtractedFaturaSanity(parsedData, isCasan ? 'CASAN' : 'CELESC');
    parsedData.baixa_confianca = true;
    parsedData.confianca = Math.min(parsedData.confianca || 50, 50);
    const motivoFallback = `Extração realizada via parser heurístico local de contingência (Gemini indisponível: ${error.message || "Erro na API"}). Revisão humana obrigatória.`;
    parsedData.motivo_baixa_confianca = parsedData.motivo_baixa_confianca ? `${motivoFallback} | ${parsedData.motivo_baixa_confianca}` : motivoFallback;
    return parsedData;
  }
}

// --- GEMINI MULTIMODAL PARSER ENDPOINT (SYNCHRONOUS SINGLE PAGE) ---
app.post("/api/documentos/parse", async (req, res) => {
  try {
    const result = await parseSinglePageWithGeminiCore(req.body);
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/documentos/parse:", error);
    res.status(500).json({ error: error.message || "Erro no processamento da fatura." });
  }
});

// --- ASYNCHRONOUS EXTRACTION JOBS INFRASTRUCTURE ---
interface DocumentJob {
  id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  created_em: string;
  updated_em: string;
  nome_arquivo: string;
  totalPages: number;
  processedPages: number;
  extractedContasCount: number;
  progressMessage: string;
  pageStats: Array<{ page: number; count: number; truncated: boolean }>;
  createdDocs: any[];
  error?: string;
}

const activeJobs: Record<string, DocumentJob> = {};

// Clean old jobs after 2 hours
setInterval(() => {
  const now = Date.now();
  for (const id of Object.keys(activeJobs)) {
    const job = activeJobs[id];
    if (now - new Date(job.created_em).getTime() > 2 * 3600 * 1000) {
      delete activeJobs[id];
    }
  }
}, 10 * 60 * 1000);

async function runAsyncExtractionJob(jobId: string, payload: {
  nome_arquivo: string;
  layout?: string;
  pages: Array<{ pageNum: number; texto_fatura?: string; imagem_base64?: string }>;
}) {
  const job = activeJobs[jobId];
  if (!job) return;

  try {
    const totalPages = payload.pages.length;
    const createdDocs: any[] = [];
    const pageStats: { page: number; count: number; truncated: boolean }[] = [];

    // Parallel controlled concurrency of 2 pages at a time
    const CONCURRENCY = 2;
    for (let i = 0; i < totalPages; i += CONCURRENCY) {
      const chunk = payload.pages.slice(i, i + CONCURRENCY);
      job.progressMessage = `Processando páginas ${i + 1} a ${Math.min(i + CONCURRENCY, totalPages)} de ${totalPages} via Gemini Multimodal...`;
      job.updated_em = new Date().toISOString();

      const results = await Promise.all(
        chunk.map(async (p) => {
          try {
            const pageName = `${payload.nome_arquivo} - Pág ${p.pageNum}`;
            const parsed = await parseSinglePageWithGeminiCore({
              texto_fatura: p.texto_fatura,
              imagem_base64: p.imagem_base64,
              layout: payload.layout || "CASAN_FATURA",
              nome_arquivo: pageName
            });
            return { pageNum: p.pageNum, text: p.texto_fatura || "", parsed, success: true };
          } catch (err: any) {
            console.error(`Job ${jobId} error on page ${p.pageNum}:`, err);
            return { pageNum: p.pageNum, text: p.texto_fatura || "", parsed: null, success: false, error: err.message };
          }
        })
      );

      for (const res of results) {
        job.processedPages++;
        if (res.success && res.parsed) {
          const parsed = res.parsed;
          let pageContas: any[] = [];
          if (parsed.tipo_relatorio === "CASAN_CENTRALIZADA" && Array.isArray(parsed.contas)) {
            pageContas = parsed.contas;
          } else if (Array.isArray(parsed.contas)) {
            pageContas = parsed.contas;
          } else if (parsed.codigo_numero && parsed.valor_total) {
            pageContas = [{
              matricula: parsed.codigo_numero,
              localizacao: parsed.endereco || "N/A",
              usuario: parsed.unidade_nome || "N/A",
              consumo: parsed.consumo || 0,
              valor_total: parsed.valor_total || 0,
              leitura_anterior: parsed.leitura_anterior || 0,
              leitura_atual: parsed.leitura_atual || 0
            }];
          }

          const isTrunc = !!(parsed.json_reparado_truncado || parsed.alerta_truncamento);
          pageStats.push({
            page: res.pageNum,
            count: pageContas.length,
            truncated: isTrunc
          });

          pageContas.forEach((conta: any, cIdx: number) => {
            const logsVal: string[] = [];
            if (isTrunc) {
              logsVal.push("⚠️ ALERTA DE IMPORTAÇÃO: Resposta do Gemini para esta página sofreu truncamento de tokens e foi reparada.");
            }

            createdDocs.push({
              id: `DOC-JOB-${jobId}-P${res.pageNum}-${cIdx + 1}`,
              nome_arquivo: `${payload.nome_arquivo} (Pág ${res.pageNum} | Matrícula: ${conta.matricula || 'N/A'})`,
              layout: payload.layout || "CASAN_FATURA",
              tamanho: res.text.length,
              status: logsVal.length > 0 ? 'NORMALIZADO' : 'VALIDADO',
              origem_conteudo: res.text,
              dados_extraidos: {
                mes_ano: parsed.referencia || "2026-06-01",
                consumo: conta.consumo || 0,
                valor_total: conta.valor_total || 0,
                valor_imposto: 0,
                valor_celular: 0,
                valor_internet: 0,
                valor_diversos: conta.valor_servico || 0,
                valor_linha_privada: 0,
                valor_credito: conta.valor_bonus || 0,
                codigo_numero: conta.matricula || "DESCONHECIDO",
                medidor: "N/A",
                unidade_nome: conta.usuario || conta.localizacao || "N/A",
                endereco: conta.localizacao || "N/A",
                leitura_anterior: conta.leitura_anterior || 0,
                leitura_atual: conta.leitura_atual || 0,
                itens_fatura: []
              },
              logs_validacao: logsVal,
              historico_alteracoes: [],
              criado_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString(),
              numero_pagina: res.pageNum,
              posicao_na_pagina: cIdx + 1,
              total_na_pagina: pageContas.length,
              posicao_no_lote: createdDocs.length + 1,
              total_no_lote: totalPages,
              score: 100
            });
          });
        }
      }

      job.extractedContasCount = createdDocs.length;
      job.pageStats = pageStats;
      job.createdDocs = createdDocs;
      job.updated_em = new Date().toISOString();
    }

    job.status = 'COMPLETED';
    job.progressMessage = `Extração concluída com sucesso! Total: ${createdDocs.length} contas extraídas em ${totalPages} páginas.`;
    job.updated_em = new Date().toISOString();
  } catch (err: any) {
    console.error(`Job ${jobId} execution error:`, err);
    job.status = 'FAILED';
    job.error = err.message || "Erro no processamento do job.";
    job.progressMessage = `Falha no processamento: ${err.message}`;
    job.updated_em = new Date().toISOString();
  }
}

app.post("/api/documentos/jobs", (req, res) => {
  const { nome_arquivo, layout, pages } = req.body;
  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: "Nenhuma página enviada para processamento em lote." });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newJob: DocumentJob = {
    id: jobId,
    status: 'PROCESSING',
    created_em: new Date().toISOString(),
    updated_em: new Date().toISOString(),
    nome_arquivo: nome_arquivo || "relatorio_lote.pdf",
    totalPages: pages.length,
    processedPages: 0,
    extractedContasCount: 0,
    progressMessage: `Job de extração iniciado para ${pages.length} página(s)...`,
    pageStats: [],
    createdDocs: []
  };

  activeJobs[jobId] = newJob;

  // Launch background execution
  runAsyncExtractionJob(jobId, { nome_arquivo, layout, pages });

  // Immediate response
  res.json({
    jobId,
    status: 'PROCESSING',
    totalPages: pages.length
  });
});

app.get("/api/documentos/jobs/:id", (req, res) => {
  const job = activeJobs[req.params.id];
  if (!job) {
    return res.status(404).json({ error: "Job de extração não encontrado ou expirado." });
  }
  res.json(job);
});



// --- INTEGRATE VITE FOR HOT CLIENT-SIDE SERVING ---

async function startServer() {
  try {
    await initDatabasePersistence();
  } catch (err) {
    console.error("[DB] Falha no startup de persistência:", err);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`SisPu.JP 2.0 running on http://localhost:${PORT} [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
  });

  // Configure high HTTP server timeouts for long running workloads
  server.timeout = 1200000; // 20 minutes
  server.keepAliveTimeout = 120000; // 2 minutes
  server.headersTimeout = 125000;
}

startServer();
