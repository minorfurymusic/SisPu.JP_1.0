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
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

// Initial Seed Data (strictly empty, respecting rule: no mock data)
const initialDBState: DatabaseState = {
  usuarios: [
    { id: "1", login: "admin", nome: "Administrador", ativo: true, criado_em: new Date().toISOString() }
  ],
  secretarias: [],
  unidades: [],
  despesas: [],
  itens_despesas: [],
  lancamentos: [],
  pessoas: [],
  contatos_email: [],
  logs_erros: [],
  auditoria_registros: [],
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
  const initialized = await initPostgresSchema();
  if (initialized) {
    const pgState = await loadStateFromPostgres();
    if (pgState && (pgState.secretarias?.length > 0 || pgState.documentos_processados?.length > 0)) {
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
  autoSyncOrphanRecords();
}


// Simulated PostgreSQL Trigger-based Auditor
function logAudit(tabela: string, pk: string, acao: 'INSERT' | 'UPDATE' | 'DELETE', usuario: string, antigo: any, novo: any) {
  const auditRow: AuditoriaRegistro = {
    id: (db.auditoria_registros.length + 1).toString(),
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

// Helper function to guarantee Unidade Gestora and Contrato CODNUM creation and linking
function ensureUnidadeAndContract(params: {
  codigo_numero: string;
  concessionaria?: 'CASAN' | 'CELESC';
  unidade_nome?: string;
  endereco?: string;
  medidor?: string;
  usuario?: string;
}) {
  const cleanCodnum = (params.codigo_numero || "").trim().toUpperCase();
  if (!cleanCodnum || cleanCodnum === "DESCONHECIDO" || cleanCodnum === "NÃO LOCALIZADO" || cleanCodnum.startsWith("AUTO-")) {
    return null;
  }

  const usuario = params.usuario || "sistema";

  // 1. Infer Concessionária ('CASAN' or 'CELESC')
  let concessionaria: 'CASAN' | 'CELESC' = params.concessionaria || 'CELESC';
  const nameOrAddrText = `${params.unidade_nome || ''} ${params.endereco || ''} ${cleanCodnum}`.toUpperCase();
  if (
    concessionaria === 'CASAN' ||
    nameOrAddrText.includes('CASAN') ||
    nameOrAddrText.includes('ÁGUA') ||
    nameOrAddrText.includes('AGUA') ||
    nameOrAddrText.includes('ESGOTO') ||
    nameOrAddrText.includes('CATARINENSE') ||
    nameOrAddrText.includes('SANEAMENTO')
  ) {
    concessionaria = 'CASAN';
  }

  // Ensure Tipos de Conta exist
  let despesaCelesc = db.despesas.find(d => d.id === "1" || d.descricao.includes("CELESC") || d.descricao.includes("ENERGIA"));
  if (!despesaCelesc) {
    despesaCelesc = { id: "1", descricao: "ENERGIA ELÉTRICA (CELESC)", ativo: true, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() };
    db.despesas.push(despesaCelesc);
  }
  let despesaCasan = db.despesas.find(d => d.id === "2" || d.descricao.includes("CASAN") || d.descricao.includes("ÁGUA") || d.descricao.includes("AGUA"));
  if (!despesaCasan) {
    despesaCasan = { id: "2", descricao: "ÁGUA E ESGOTO (CASAN)", ativo: true, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() };
    db.despesas.push(despesaCasan);
  }

  const targetDespesaId = concessionaria === 'CASAN' ? despesaCasan.id : despesaCelesc.id;

  // Ensure default Secretaria
  let defaultSec = db.secretarias.find(s => s.ativo);
  if (!defaultSec) {
    defaultSec = {
      id: "1",
      nome: "SECRETARIA GERAL / A CLASSIFICAR",
      sigla: "SEC-GERAL",
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    db.secretarias.push(defaultSec);
  }

  // 2. Find or Create Unidade Gestora
  let unidade = db.unidades.find(u => 
    (u.uc && u.uc.trim().toUpperCase() === cleanCodnum) || 
    (u.codnum && u.codnum.trim().toUpperCase() === cleanCodnum)
  );

  const cleanEndereco = (params.endereco || "").trim().toUpperCase();
  const cleanNomeUnidade = (params.unidade_nome || "").trim().toUpperCase();

  if (unidade) {
    let updated = false;
    if ((!unidade.endereco || unidade.endereco === "N/A" || unidade.endereco === "ENDEREÇO A CADASTRAR") && cleanEndereco && cleanEndereco !== "N/A") {
      unidade.endereco = cleanEndereco;
      updated = true;
    }
    if ((!unidade.nome || unidade.nome === "N/A" || unidade.nome.startsWith("UNIDADE UC") || unidade.nome.startsWith("UNIDADE ")) && cleanNomeUnidade && cleanNomeUnidade !== "N/A") {
      unidade.nome = cleanNomeUnidade;
      updated = true;
    }
    if (!unidade.concessionaria || unidade.concessionaria !== concessionaria) {
      unidade.concessionaria = concessionaria;
      updated = true;
    }
    if (updated) {
      unidade.atualizado_em = new Date().toISOString();
      logAudit("unidades", unidade.id, "UPDATE", usuario, null, unidade);
    }
  } else {
    const newUnidadeId = (Math.max(...db.unidades.map(u => (u?.id ? parseInt(u.id) : 0) || 0), 0) + 1).toString();
    const finalNome = (cleanNomeUnidade && cleanNomeUnidade !== "N/A") ? cleanNomeUnidade : `UNIDADE ${cleanCodnum}`;
    const finalEndereco = (cleanEndereco && cleanEndereco !== "N/A") ? cleanEndereco : "ENDEREÇO A CADASTRAR";
    
    unidade = {
      id: newUnidadeId,
      secretaria_id: defaultSec.id,
      nome: finalNome,
      uc: cleanCodnum,
      codnum: cleanCodnum,
      concessionaria: concessionaria,
      endereco: finalEndereco,
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    db.unidades.push(unidade);
    logAudit("unidades", newUnidadeId, "INSERT", usuario, null, unidade);
  }

  // 3. Find or Create ItemDespesa (Contrato CODNUM)
  let item = db.itens_despesas.find(it => it.codigo_numero && it.codigo_numero.trim().toUpperCase() === cleanCodnum);

  if (item) {
    let updated = false;
    if (!item.unidade_id || item.unidade_id !== unidade.id) {
      item.unidade_id = unidade.id;
      updated = true;
    }
    if (!item.despesa_id || item.despesa_id !== targetDespesaId) {
      item.despesa_id = targetDespesaId;
      updated = true;
    }
    if (params.medidor && params.medidor !== "N/A" && (!item.medidor || item.medidor === "N/A")) {
      item.medidor = params.medidor;
      updated = true;
    }
    if (updated) {
      item.atualizado_em = new Date().toISOString();
      logAudit("itens_despesas", item.id, "UPDATE", usuario, null, item);
    }
  } else {
    const newItemId = (Math.max(...db.itens_despesas.map(it => (it?.id ? parseInt(it.id) : 0) || 0), 0) + 1).toString();
    item = {
      id: newItemId,
      codigo_numero: cleanCodnum,
      despesa_id: targetDespesaId,
      unidade_id: unidade.id,
      medidor: params.medidor || "N/A",
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    db.itens_despesas.push(item);
    logAudit("itens_despesas", newItemId, "INSERT", usuario, null, item);
  }

  return { unidade, item };
}

// Function to automatically sync and create Unidades & Contratos for all existing documents and launches
function autoSyncOrphanRecords() {
  let hasChanges = false;

  // Sync from documentos_processados
  (db.documentos_processados || []).forEach(doc => {
    if (doc?.dados_extraidos?.codigo_numero) {
      const isCasan = Boolean(
        (doc.layout && doc.layout.includes("CASAN")) ||
        (doc.nome_arquivo && /casan|catarinense/i.test(doc.nome_arquivo)) ||
        (doc.dados_extraidos.unidade_nome && /casan/i.test(doc.dados_extraidos.unidade_nome))
      );
      const res = ensureUnidadeAndContract({
        codigo_numero: doc.dados_extraidos.codigo_numero,
        concessionaria: isCasan ? 'CASAN' : 'CELESC',
        unidade_nome: doc.dados_extraidos.unidade_nome,
        endereco: doc.dados_extraidos.endereco,
        medidor: doc.dados_extraidos.medidor
      });
      if (res) hasChanges = true;
    }
  });

  // Sync from lancamentos
  (db.lancamentos || []).forEach(lanc => {
    const matchingDoc = db.documentos_processados?.find(d => 
      d.dados_extraidos && d.dados_extraidos.codigo_numero && 
      d.dados_extraidos.mes_ano?.substring(0,7) === lanc.mes_ano?.substring(0,7)
    );
    const item = db.itens_despesas.find(it => it.id === lanc.item_despesa_id);
    const codnum = item?.codigo_numero || matchingDoc?.dados_extraidos?.codigo_numero;

    if (codnum) {
      const isCasan = Boolean(
        (matchingDoc?.layout && matchingDoc.layout.includes("CASAN")) ||
        (matchingDoc?.nome_arquivo && /casan|catarinense/i.test(matchingDoc.nome_arquivo)) ||
        (item?.despesa_id === "2")
      );
      const res = ensureUnidadeAndContract({
        codigo_numero: codnum,
        concessionaria: isCasan ? 'CASAN' : 'CELESC',
        unidade_nome: matchingDoc?.dados_extraidos?.unidade_nome,
        endereco: matchingDoc?.dados_extraidos?.endereco,
        medidor: matchingDoc?.dados_extraidos?.medidor || item?.medidor
      });
      if (res && res.item) {
        if (lanc.item_despesa_id !== res.item.id) {
          lanc.item_despesa_id = res.item.id;
          hasChanges = true;
        }
      }
    }
  });

  if (hasChanges) {
    saveDB(db);
  }
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

  const newId = (Math.max(...db.secretarias.map(s => (s?.id ? parseInt(s.id) : 0) || 0), 0) + 1).toString();
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

  const index = db.secretarias.findIndex(s => String(s.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: "Secretaria não encontrada." });
  }

  // Check references in unidades
  const hasUnidades = db.unidades.some(u => String(u.secretaria_id) === String(id));
  if (hasUnidades) {
    return res.status(400).json({ error: "Não é possível excluir esta secretaria pois ela possui unidades vinculadas." });
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

  const newId = (Math.max(...db.unidades.map(u => (u?.id ? parseInt(u.id) : 0) || 0), 0) + 1).toString();
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

  const index = db.unidades.findIndex(u => String(u.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: "Unidade não encontrada." });
  }

  // Check reference in itens_despesas
  const hasItens = db.itens_despesas.some(it => String(it.unidade_id) === String(id));
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

  const newId = (Math.max(...db.despesas.map(d => (d?.id ? parseInt(d.id) : 0) || 0), 0) + 1).toString();
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

  const index = db.despesas.findIndex(d => String(d.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: "Despesa não encontrada." });
  }

  const hasItens = db.itens_despesas.some(it => String(it.despesa_id) === String(id));
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

  const newId = (Math.max(...db.itens_despesas.map(it => (it?.id ? parseInt(it.id) : 0) || 0), 0) + 1).toString();
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

  const index = db.itens_despesas.findIndex(it => String(it.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: "Item de despesa não encontrado." });
  }

  const hasLancamentos = db.lancamentos.some(l => String(l.item_despesa_id) === String(id));
  if (hasLancamentos) {
    return res.status(400).json({ error: "Não é possível excluir este item pois ele possui lançamentos registrados." });
  }

  const oldVal = { ...db.itens_despesas[index] };
  db.itens_despesas.splice(index, 1);
  saveDB(db);

  logAudit("itens_despesas", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Item excluído com sucesso." });
});

// Endpoint para vincular Unidade Gestora a um CODNUM / Contrato existente ou novo
app.post("/api/vincular-unidade", (req, res) => {
  const { codigo_numero, item_despesa_id, unidade_id } = req.body;
  const usuario = req.headers["x-user"] as string || "admin";

  if (!unidade_id) {
    return res.status(400).json({ error: "Selecione uma unidade gestora válida." });
  }

  const cleanCodnum = (codigo_numero || "").trim().toUpperCase();
  let itemIndex = -1;

  if (item_despesa_id) {
    itemIndex = db.itens_despesas.findIndex(it => String(it.id) === String(item_despesa_id));
  }
  if (itemIndex === -1 && cleanCodnum) {
    itemIndex = db.itens_despesas.findIndex(it => it.codigo_numero.toUpperCase() === cleanCodnum);
  }

  let item = null;
  if (itemIndex !== -1) {
    const oldVal = { ...db.itens_despesas[itemIndex] };
    db.itens_despesas[itemIndex].unidade_id = unidade_id;
    db.itens_despesas[itemIndex].atualizado_em = new Date().toISOString();
    item = db.itens_despesas[itemIndex];
    logAudit("itens_despesas", item.id, "UPDATE", usuario, oldVal, item);
  } else if (cleanCodnum) {
    const newId = String(Date.now());
    item = {
      id: newId,
      codigo_numero: cleanCodnum,
      despesa_id: "1", // Padrão Celesc / Energia se não especificado
      unidade_id,
      tipo_fone: "",
      medidor: "",
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    db.itens_despesas.push(item);
    logAudit("itens_despesas", newId, "INSERT", usuario, null, item);
  }

  saveDB(db);

  const unidade = db.unidades.find(u => String(u.id) === String(unidade_id));
  const secretaria = unidade ? db.secretarias.find(s => String(s.id) === String(unidade.secretaria_id)) : null;

  res.json({
    success: true,
    item,
    unidade_id,
    unidade_nome: unidade ? unidade.nome : "NÃO LOCALIZADA",
    secretaria_nome: secretaria ? secretaria.nome : "NÃO LOCALIZADA"
  });
});


// --- LANÇAMENTOS ---
app.get("/api/lancamentos", (req, res) => {
  autoSyncOrphanRecords();

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

    const matchingDoc = db.documentos_processados?.find(d => 
      d.dados_extraidos && 
      d.dados_extraidos.codigo_numero === item?.codigo_numero &&
      d.dados_extraidos.mes_ano?.substring(0,7) === l.mes_ano?.substring(0,7)
    );
    const energia_injetada = (l as any).energia_injetada ?? matchingDoc?.dados_extraidos?.energia_injetada ?? 0;

    let concessionaria: 'CASAN' | 'CELESC' = (unidade?.concessionaria as 'CASAN' | 'CELESC') || (despesa?.id === "2" ? "CASAN" : "CELESC");
    if (!unidade?.concessionaria && matchingDoc) {
      if ((matchingDoc.layout && matchingDoc.layout.includes("CASAN")) || /casan|catarinense/i.test(matchingDoc.nome_arquivo || "")) {
        concessionaria = "CASAN";
      }
    }

    const finalDespesaDesc = despesa 
      ? despesa.descricao 
      : (concessionaria === "CASAN" ? "ÁGUA E ESGOTO (CASAN)" : "ENERGIA ELÉTRICA (CELESC)");

    const finalUnidadeNome = unidade 
      ? unidade.nome 
      : (matchingDoc?.dados_extraidos?.unidade_nome || (item?.codigo_numero ? `UNIDADE ${item.codigo_numero}` : "NÃO LOCALIZADA"));

    return {
      ...l,
      energia_injetada,
      concessionaria,
      codigo_numero: item ? item.codigo_numero : (matchingDoc?.dados_extraidos?.codigo_numero || "NÃO LOCALIZADO"),
      medidor: item ? item.medidor : (matchingDoc?.dados_extraidos?.medidor || ""),
      despesa_id: item ? item.despesa_id : (concessionaria === "CASAN" ? "2" : "1"),
      despesa_descricao: finalDespesaDesc,
      unidade_nome: finalUnidadeNome,
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

  const newId = (Math.max(...db.lancamentos.map(l => (l?.id ? parseInt(l.id) : 0) || 0), 0) + 1).toString();
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

  db.lancamentos[index].atualizado_em = new Date().toISOString();
  saveDB(db);

  logAudit("lancamentos", id, "UPDATE", usuario, oldVal, db.lancamentos[index]);

  res.json(db.lancamentos[index]);
});

app.delete("/api/lancamentos/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  let found = false;

  // 1. Check in lancamentos
  const index = db.lancamentos.findIndex(l => String(l.id) === String(id));
  if (index !== -1) {
    const oldVal = { ...db.lancamentos[index] };
    const deletedLanc = db.lancamentos.splice(index, 1)[0];
    found = true;

    // Clean up corresponding item in documentos_processados if linked
    if (db.documentos_processados) {
      db.documentos_processados = db.documentos_processados.filter(d => String(d.id) !== String(id));
    }

    logAudit("lancamentos", id, "DELETE", usuario, oldVal, null);
  }

  // 2. Check in documentos_processados as fallback
  if (db.documentos_processados) {
    const docIndex = db.documentos_processados.findIndex(d => String(d.id) === String(id));
    if (docIndex !== -1) {
      const oldDoc = db.documentos_processados[docIndex];
      db.documentos_processados.splice(docIndex, 1);
      found = true;
      logAudit("documentos_processados", id, "DELETE", usuario, oldDoc, null);
    }
  }

  if (!found) {
    return res.status(404).json({ error: "Lançamento não encontrado." });
  }

  saveDB(db);
  res.json({ message: "Lançamento excluído com sucesso." });
});

app.delete("/api/documentos/:id", (req, res) => {
  const { id } = req.params;
  const usuario = req.headers["x-user"] as string || "admin";

  if (!db.documentos_processados) db.documentos_processados = [];

  const index = db.documentos_processados.findIndex(d => String(d.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: "Documento não encontrado." });
  }

  const oldVal = { ...db.documentos_processados[index] };
  db.documentos_processados.splice(index, 1);
  saveDB(db);

  logAudit("documentos_processados", id, "DELETE", usuario, oldVal, null);

  res.json({ message: "Documento excluído com sucesso." });
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

  if (dados_extraidos?.codigo_numero) {
    const isCasan = Boolean(
      (layout && layout.includes("CASAN")) ||
      (nome_arquivo && /casan|catarinense/i.test(nome_arquivo)) ||
      (dados_extraidos.unidade_nome && /casan/i.test(dados_extraidos.unidade_nome))
    );
    ensureUnidadeAndContract({
      codigo_numero: dados_extraidos.codigo_numero,
      concessionaria: isCasan ? 'CASAN' : 'CELESC',
      unidade_nome: dados_extraidos.unidade_nome,
      endereco: dados_extraidos.endereco,
      medidor: dados_extraidos.medidor
    });
  }

  const newId = (Math.max(...db.documentos_processados.map(d => (d?.id ? parseInt(d.id) : 0) || 0), 0) + 1).toString();
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
  
  // Rule 1: check if item despesa already exists for this CODNUM
  const itemMatch = db.itens_despesas.find(it => it.codigo_numero === dados_extraidos.codigo_numero);
  if (!itemMatch) {
    logs.push(`⚠️ CODNUM "${dados_extraidos.codigo_numero}" não cadastrado no banco. Itens de despesa deverão ser vinculados durante a conferência.`);
  }

  // Rule 2: check if consumption matches normal ranges
  if (dados_extraidos.consumo <= 0) {
    logs.push(`⚠️ Consumo extraído de ${dados_extraidos.consumo} é inválido ou nulo. Verifique a fatura original.`);
  }

  // Rule 3: check if value matches normal ranges
  if (dados_extraidos.valor_total <= 0) {
    logs.push(`❌ Valor total extraído de R$ ${dados_extraidos.valor_total} é nulo ou negativo.`);
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
  const extr = doc?.dados_extraidos || ({} as any);

  const isCasan = Boolean(
    (doc?.layout && doc.layout.includes("CASAN")) ||
    (doc?.nome_arquivo && /casan|catarinense/i.test(doc.nome_arquivo)) ||
    (extr?.unidade_nome && /casan/i.test(extr.unidade_nome))
  );

  let result = null;
  if (extr?.codigo_numero) {
    result = ensureUnidadeAndContract({
      codigo_numero: extr.codigo_numero,
      concessionaria: isCasan ? 'CASAN' : 'CELESC',
      unidade_nome: extr.unidade_nome,
      endereco: extr.endereco,
      medidor: extr.medidor,
      usuario
    });
  }

  let item = result?.item || (extr?.codigo_numero ? db.itens_despesas.find(it => it?.codigo_numero === extr.codigo_numero) : undefined);
  
  if (!item) {
    let depId = isCasan ? "2" : "1";
    const defaultUnidade = (db.unidades && db.unidades.length > 0) ? db.unidades[0] : { id: "1" };

    const newItemId = (Math.max(...db.itens_despesas.map(it => (it?.id ? parseInt(it.id) : 0) || 0), 0) + 1).toString();
    item = {
      id: newItemId,
      codigo_numero: extr?.codigo_numero || `AUTO-${Date.now()}`,
      despesa_id: depId,
      unidade_id: defaultUnidade?.id || "1",
      medidor: extr?.medidor || "N/A",
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    db.itens_despesas.push(item);
    logAudit("itens_despesas", newItemId, "INSERT", usuario, null, item);
  }

  // Persist to lancamentos (shared table)
  const mesAnoDate = extr?.mes_ano || new Date().toISOString().split('T')[0];
  
  const newLancId = (Math.max(...db.lancamentos.map(l => (l?.id ? parseInt(l.id) : 0) || 0), 0) + 1).toString();
  const newLanc: Lancamento = {
    id: newLancId,
    item_despesa_id: item.id,
    mes_ano: mesAnoDate,
    consumo: parseFloat(extr?.consumo as any || 0),
    valor_total: parseFloat(extr?.valor_total as any || 0),
    valor_imposto: parseFloat(extr?.valor_imposto as any || 0),
    valor_celular: parseFloat(extr?.valor_celular as any || 0),
    valor_internet: parseFloat(extr?.valor_internet as any || 0),
    valor_diversos: parseFloat(extr?.valor_diversos as any || 0),
    valor_linha_privada: parseFloat(extr?.valor_linha_privada as any || 0),
    valor_credito: parseFloat(extr?.valor_credito as any || 0),
    data_lancamento: new Date().toISOString().split('T')[0],
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  db.lancamentos.push(newLanc);
  if (doc) doc.status = 'HOMOLOGADO';
  saveDB(db);

  // PostgreSQL-style audit triggers
  logAudit("lancamentos", newLancId, "INSERT", usuario, null, newLanc);
  if (doc) logAudit("documentos_processados", doc.id, "UPDATE", usuario, { status: "VALIDADO" }, { status: "HOMOLOGADO" });

  res.json({ message: "Documento homologado e despesa persistida com sucesso!", lancamento: newLanc });
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

// --- GEMINI MULTIMODAL PARSER ENDPOINT ---
app.post("/api/documentos/parse", async (req, res) => {
  const { texto_fatura, imagem_base64, imagens_base64, layout, nome_arquivo } = req.body;

  if (!texto_fatura && !imagem_base64 && (!imagens_base64 || imagens_base64.length === 0)) {
    return res.status(400).json({ error: "Nenhum conteúdo (texto ou imagem) de fatura enviado para o parser." });
  }

  const isCasanHeader = Boolean(
    (nome_arquivo && /casan|catarinense|centralizada/i.test(nome_arquivo)) || 
    (texto_fatura && (/casan/i.test(texto_fatura) || 
                      /catarinense/i.test(texto_fatura) || 
                      /SISTEMA COMERCIAL INTEGRADO/i.test(texto_fatura) || 
                      /SCI8095/i.test(texto_fatura) || 
                      /CONTAS QUE COMPÕEM/i.test(texto_fatura) || 
                      /CONTAS QUE COMPOEM/i.test(texto_fatura) || 
                      /COBRANÇA CENTRALIZADA/i.test(texto_fatura) || 
                      /COBRANCA CENTRALIZADA/i.test(texto_fatura)))
  );

  const isCasanCentralizada = isCasanHeader && Boolean(
    (nome_arquivo && (/COBRANÇA CENTRALIZADA|COBRANCA CENTRALIZADA|CENTRALIZADA|CONTAS QUE COMPÕEM|CONTAS QUE COMPOEM/i.test(nome_arquivo))) ||
    (texto_fatura && (/COBRANÇA CENTRALIZADA|COBRANCA CENTRALIZADA|CONTAS QUE COMPÕEM|CONTAS QUE COMPOEM|SISTEMA COMERCIAL INTEGRADO|SCI8095/i.test(texto_fatura))) ||
    (layout && layout.includes("CASAN"))
  );

  const isCasan = isCasanCentralizada || isCasanHeader || Boolean(layout && layout.includes("CASAN"));
  const isCelesc = !isCasan && Boolean(
    (layout && layout.includes("CELESC")) || 
    (nome_arquivo && /celesc/i.test(nome_arquivo)) || 
    (texto_fatura && /celesc/i.test(texto_fatura))
  );

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
    const candidateModels = [
      "gemini-3.6-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];
    let response: any = null;
    let lastModelError: any = null;

    for (const modelName of candidateModels) {
      let attempts = 0;
      const maxAttempts = 2;
      while (attempts < maxAttempts) {
        attempts++;
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
                        logradouro: { type: Type.STRING, description: "Endereço do imóvel/instalação impresso logo abaixo da linha da matrícula (ex: ROD. VER. CARLOS PROBST,S/N)" },
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
                    description: "Lista de TODAS as linhas da tabela de itens da fatura, uma por uma, sem pular nenhuma",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        descricao: { type: Type.STRING, description: "Nome literal da linha, exatamente como aparece na fatura" },
                        quantidade: { type: Type.NUMBER, description: "Quantidade/consumo dessa linha" },
                        preco_unitario: { type: Type.NUMBER, description: "Preço unitário com tributos, se houver" },
                        valor: { type: Type.NUMBER, description: "Valor total dessa linha em Reais" },
                        icms: { type: Type.NUMBER, description: "ICMS dessa linha, senão 0" },
                        cofins_pis: { type: Type.NUMBER, description: "COFINS/PIS dessa linha, senão 0" },
                        irpj_percentual: { type: Type.NUMBER, description: "Percentual de IRPJ retido dessa linha, senão 0" },
                        irpj: { type: Type.NUMBER, description: "Valor de IRPJ retido dessa linha, senão 0" },
                        pis: { type: Type.NUMBER, description: "PIS retido dessa linha, senão 0" },
                        cofins: { type: Type.NUMBER, description: "COFINS retido dessa linha, senão 0" },
                        csll: { type: Type.NUMBER, description: "CSLL retido dessa linha, senão 0" }
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
            const textLength = response.text.length;
            let rawParseStatus = "SUCESSO";
            let rawParseError = "";
            try {
              JSON.parse(response.text);
            } catch (e: any) {
              rawParseStatus = "ERRO_PARSE";
              rawParseError = e.message;
            }
            console.log(`[Gemini Raw Response Log] Modelo: ${modelName} | Tamanho: ${textLength} chars | JSON.parse Cru: ${rawParseStatus}${rawParseError ? ` (${rawParseError})` : ""}`);
            break;
          }
        } catch (err: any) {
          lastModelError = err;
          const isRateLimit = String(err?.message || err).includes("429") || String(err?.message || err).includes("RESOURCE_EXHAUSTED");
          console.warn(`Model ${modelName} attempt ${attempts} failed: ${err.message || err}`);
          if (isRateLimit && attempts < maxAttempts) {
            console.log(`Aguardando 1.5s antes de tentar novamente o modelo ${modelName}...`);
            await new Promise((resolve) => setTimeout(resolve, 1500));
          } else {
            break;
          }
        }
      }
      if (response && response.text) break;
    }

  if (!response || !response.text) {
    throw lastModelError || new Error("Nenhum modelo Gemini respondeu com sucesso.");
  }

    const resultText = response.text || "{}";
    let parsedData = robustJsonParse(resultText);

    if (parsedData && parsedData.tipo_relatorio === "CASAN_CENTRALIZADA") {
      console.log("[Gemini Multimodal Parser Output - CASAN Centralizada]:", JSON.stringify(parsedData, null, 2));
      return res.json(parsedData);
    }

    // Apply Post-Extraction Sanity Validation
    parsedData = validateExtractedFaturaSanity(parsedData, isCasan ? 'CASAN' : 'CELESC');

    console.log("[Gemini Multimodal Parser Output]:", JSON.stringify(parsedData, null, 2));

    res.json(parsedData);

  } catch (error: any) {
    console.warn("Gemini API error (Quota exceeded, network, or invalid image), falling back to local heuristic parser:", error);
    logTechnicalError("GEMINI_API_PARSER_FALLBACK", `Heuristic fallback used due to error: ${error.message || "Unknown error"}`, "server.ts", "1300");
    
    try {
      if (isCasanCentralizada) {
        const contas: any[] = [];
        const lines = (texto_fatura || "").split("\n");
        let refDate = "2026-06-01";
        const refMatch = (texto_fatura || "").match(/(?:REFERÊNCIA|REFERENCIA|COMPETÊNCIA|COMPETENCIA)\s*[:/]*\s*(\d{2})\/(\d{4})/i);
        if (refMatch) {
          refDate = `${refMatch[2]}-${refMatch[1]}-01`;
        }
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const mMatch = line.match(/^\s*(\d{5,10}[-\s]?\d{1,2})\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s*(?:m³)?\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/i);
          if (mMatch) {
            let logradouro = "";
            if (i + 1 < lines.length) {
              const nextL = lines[i + 1].trim();
              if (nextL && !/^\d{5,10}[-\s]?\d{1,2}/.test(nextL) && !/^(MATRÍCULA|MATRICULA|GRUPO|SUPERINTENDÊNCIA|ÓRGÃO|RELATÓRIO|SISTEMA)/i.test(nextL)) {
                logradouro = nextL;
              }
            }
            contas.push({
              matricula: mMatch[1].trim(),
              usuario: mMatch[2].trim(),
              localizacao: mMatch[2].trim(),
              logradouro: logradouro,
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
        return res.json({
          tipo_relatorio: "CASAN_CENTRALIZADA",
          referencia: refDate,
          contas: contas
        });
      }

      let parsedData = heuristicExtractFatura(texto_fatura || "", nome_arquivo || "fatura_upload.txt", layout);
      parsedData = validateExtractedFaturaSanity(parsedData, isCasan ? 'CASAN' : 'CELESC');
      parsedData.baixa_confianca = true;
      parsedData.confianca = Math.min(parsedData.confianca || 50, 50);
      const motivoFallback = `Extração realizada via parser heurístico local de contingência (Gemini indisponível: ${error.message || "Erro na API"}). Revisão humana obrigatória.`;
      parsedData.motivo_baixa_confianca = parsedData.motivo_baixa_confianca ? `${motivoFallback} | ${parsedData.motivo_baixa_confianca}` : motivoFallback;
      res.json(parsedData);
    } catch (fallbackError: any) {
      console.error("Critical: Fallback heuristic parser also failed:", fallbackError);
      res.status(500).json({ error: "Falha na comunicação com o Parser do Gemini e no extrator de contingência: " + fallbackError.message });
    }
  }
});



// --- INTEGRATE VITE FOR HOT CLIENT-SIDE SERVING ---

async function startServer() {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SisPu.JP 2.0 running on http://0.0.0.0:${PORT} [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
  });

  // Initialize DB asynchronously so server starts listening without delay
  initDatabasePersistence().catch(err => {
    console.error("[DB] Erro assíncrono na inicialização do PostgreSQL:", err);
  });
}

startServer();
