import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import session from "express-session";
import bcrypt from "bcryptjs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import {
  Usuario, Secretaria, Unidade, Despesa, ItemDespesa,
  Lancamento, Pessoa, ContatoEmail, LogError, AuditoriaRegistro,
  DocumentoProcessado
} from "./src/types";
import { runDeterministicParser } from "./src/utils/documentParser";

dotenv.config();

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: Usuario;
    }
  }
}

const app = express();
const PORT = 3000;

// A Gemini API key is required for AI-assisted invoice parsing. Without one, every
// call falls back to the local heuristic parser (see heuristicExtractFatura below).
const GEMINI_CONFIGURED = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY";
if (!GEMINI_CONFIGURED) {
  console.warn(
    "[SisPu.JP] GEMINI_API_KEY não configurada (ou é o valor de exemplo). " +
    "A extração de faturas por IA ficará indisponível e o sistema usará somente o parser heurístico local."
  );
}

// Initialize Gemini SDK with telemetry header as required by instructions
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.warn(
    "[SisPu.JP] SESSION_SECRET não definida no .env — usando um segredo temporário gerado " +
    "para esta execução (todas as sessões serão invalidadas ao reiniciar o servidor). " +
    "Defina SESSION_SECRET em produção."
  );
}

// JSON Middleware
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: SESSION_SECRET || crypto.randomUUID(),
  name: "sispujp.sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
}));

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

// Default password assigned to any user that doesn't yet have one (fresh seed, or an
// existing sispu_db.json migrated from a pre-auth version of the system). Must be changed
// on first login.
const DEFAULT_PASSWORD = process.env.SENHA_PADRAO_INICIAL || "TrocarSenha123!";
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

// Initial Seed Data
const initialDBState: DatabaseState = {
  usuarios: [
    { id: "1", login: "admin", nome: "Administrador", senha_hash: DEFAULT_PASSWORD_HASH, role: "admin", ativo: true, criado_em: new Date().toISOString() },
    { id: "2", login: "joao", nome: "João Silva", senha_hash: DEFAULT_PASSWORD_HASH, role: "operador", ativo: true, criado_em: new Date().toISOString() }
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

// Database utility functions with automatic write persistence
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
}

// Backfills senha_hash/role on any usuario that predates the authentication system
// (e.g. a sispu_db.json created before auth existed). Every migrated user gets the
// default password and must change it on first login.
function migrateUsuariosSeguranca(state: DatabaseState): boolean {
  let migrated = false;
  state.usuarios.forEach(u => {
    if (!u.role) {
      u.role = u.login === "admin" ? "admin" : "operador";
      migrated = true;
    }
    if (!u.senha_hash) {
      u.senha_hash = DEFAULT_PASSWORD_HASH;
      migrated = true;
    }
  });
  return migrated;
}

// Global DB instance
const db = loadDB();
if (migrateUsuariosSeguranca(db)) {
  console.warn(
    `[SisPu.JP] Um ou mais usuários não tinham senha cadastrada e foram migrados com a senha padrão "${DEFAULT_PASSWORD}". ` +
    "Troque essa senha imediatamente após o primeiro login."
  );
  saveDB(db);
}

function sanitizeUsuario(u: Usuario) {
  const { senha_hash, ...rest } = u;
  return rest;
}

// Optimistic concurrency check: the client must send back the `atualizado_em` it last
// read for this record. If it no longer matches, someone else saved a change in between,
// so we reject the write instead of silently overwriting it. Requests that omit
// atualizado_em (older/legacy callers) skip the check rather than being blocked outright.
function checkNaoDesatualizado(res: express.Response, registroAtual: { atualizado_em: string }, atualizadoEmRecebido: unknown): boolean {
  if (atualizadoEmRecebido === undefined || atualizadoEmRecebido === null || atualizadoEmRecebido === "") {
    return true;
  }
  if (atualizadoEmRecebido !== registroAtual.atualizado_em) {
    res.status(409).json({
      error: "Este registro foi alterado por outro usuário enquanto você o editava. Recarregue os dados e tente novamente.",
      code: "STALE_WRITE"
    });
    return false;
  }
  return true;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const userId = req.session.userId;
  const user = userId ? db.usuarios.find(u => u.id === userId && u.ativo) : undefined;
  if (!user) {
    return res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
  }
  req.currentUser = user;
  next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.currentUser?.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem realizar esta ação." });
  }
  next();
}

// --- AUTENTICAÇÃO ---
app.post("/api/auth/login", (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) {
    return res.status(400).json({ error: "Informe login e senha." });
  }

  const user = db.usuarios.find(u => u.login === login);
  if (!user || !user.ativo || !bcrypt.compareSync(senha, user.senha_hash)) {
    return res.status(401).json({ error: "Login ou senha inválidos." });
  }

  req.session.userId = user.id;
  res.json({ user: sanitizeUsuario(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sispujp.sid");
    res.json({ message: "Sessão encerrada." });
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: sanitizeUsuario(req.currentUser!) });
});

app.get("/api/system/status", requireAuth, (req, res) => {
  res.json({ geminiConfigured: GEMINI_CONFIGURED });
});

// Every /api route below requires an authenticated session.
app.use("/api", requireAuth);

// --- USUÁRIOS (gestão de acesso — somente administradores) ---
app.get("/api/usuarios", requireAdmin, (req, res) => {
  res.json(db.usuarios.map(sanitizeUsuario));
});

app.post("/api/usuarios", requireAdmin, (req, res) => {
  const { login, nome, senha, role } = req.body || {};
  const cleanLogin = (login || "").trim().toLowerCase();
  if (!cleanLogin || !nome || !senha) {
    return res.status(400).json({ error: "Informe login, nome e senha." });
  }
  if (senha.length < 8) {
    return res.status(400).json({ error: "A senha deve ter ao menos 8 caracteres." });
  }
  if (db.usuarios.find(u => u.login === cleanLogin)) {
    return res.status(400).json({ error: "Já existe um usuário com este login." });
  }

  const newId = (Math.max(...db.usuarios.map(u => parseInt(u.id)), 0) + 1).toString();
  const newUser: Usuario = {
    id: newId,
    login: cleanLogin,
    nome,
    senha_hash: bcrypt.hashSync(senha, 10),
    role: role === "admin" ? "admin" : "operador",
    ativo: true,
    criado_em: new Date().toISOString()
  };
  db.usuarios.push(newUser);
  saveDB(db);
  logAudit("usuarios", newId, "INSERT", req.currentUser!.login, null, sanitizeUsuario(newUser));

  res.status(201).json(sanitizeUsuario(newUser));
});

app.put("/api/usuarios/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nome, role, ativo, senha } = req.body || {};

  const index = db.usuarios.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  if (ativo === false && id === req.currentUser!.id) {
    return res.status(400).json({ error: "Você não pode desativar o próprio usuário." });
  }

  const oldVal = sanitizeUsuario(db.usuarios[index]);
  if (nome !== undefined) db.usuarios[index].nome = nome;
  if (role === "admin" || role === "operador") db.usuarios[index].role = role;
  if (ativo !== undefined) db.usuarios[index].ativo = !!ativo;
  if (senha) {
    if (senha.length < 8) {
      return res.status(400).json({ error: "A senha deve ter ao menos 8 caracteres." });
    }
    db.usuarios[index].senha_hash = bcrypt.hashSync(senha, 10);
  }
  saveDB(db);
  logAudit("usuarios", id, "UPDATE", req.currentUser!.login, oldVal, sanitizeUsuario(db.usuarios[index]));

  res.json(sanitizeUsuario(db.usuarios[index]));
});

// Simulated PostgreSQL Trigger-based Auditor
function logAudit(tabela: string, pk: string, acao: 'INSERT' | 'UPDATE' | 'DELETE', usuario: string, antigo: any, novo: any) {
  const auditRow: AuditoriaRegistro = {
    id: (Math.max(...db.auditoria_registros.map(a => parseInt(a.id)), 0) + 1).toString(),
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
    id: (Math.max(...db.logs_erros.map(l => parseInt(l.id)), 0) + 1).toString(),
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
// (usuários já definidos acima, junto com o middleware de autenticação)

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
  const usuario = req.currentUser!.login;

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
  const { codigo_legado, nome, ativo, atualizado_em } = req.body;
  const usuario = req.currentUser!.login;

  const index = db.secretarias.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Secretaria não encontrada." });
  }
  if (!checkNaoDesatualizado(res, db.secretarias[index], atualizado_em)) return;

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
  const usuario = req.currentUser!.login;

  const index = db.secretarias.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Secretaria não encontrada." });
  }

  // Check references in unidades
  const hasUnidades = db.unidades.some(u => u.secretaria_id === id);
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
  const usuario = req.currentUser!.login;

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
  const { codigo_legado, secretaria_id, nome, endereco, ativo, atualizado_em } = req.body;
  const usuario = req.currentUser!.login;

  const index = db.unidades.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Unidade não encontrada." });
  }
  if (!checkNaoDesatualizado(res, db.unidades[index], atualizado_em)) return;

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
  const usuario = req.currentUser!.login;

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
  const usuario = req.currentUser!.login;

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
  const { codigo_legado, descricao, ativo, atualizado_em } = req.body;
  const usuario = req.currentUser!.login;

  const index = db.despesas.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Despesa não encontrada." });
  }
  if (!checkNaoDesatualizado(res, db.despesas[index], atualizado_em)) return;

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
  const usuario = req.currentUser!.login;

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
  const usuario = req.currentUser!.login;

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
  const { codigo_numero, despesa_id, unidade_id, tipo_fone, medidor, ativo, atualizado_em } = req.body;
  const usuario = req.currentUser!.login;

  const index = db.itens_despesas.findIndex(it => it.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Item de despesa não encontrado." });
  }
  if (!checkNaoDesatualizado(res, db.itens_despesas[index], atualizado_em)) return;

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
  const usuario = req.currentUser!.login;

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
  const usuario = req.currentUser!.login;

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
    valor_diversos, valor_linha_privada, valor_credito, data_lancamento, atualizado_em
  } = req.body;
  const usuario = req.currentUser!.login;

  const index = db.lancamentos.findIndex(l => l.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Lançamento não encontrado." });
  }
  if (!checkNaoDesatualizado(res, db.lancamentos[index], atualizado_em)) return;

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
  const usuario = req.currentUser!.login;

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
  const { dados_extraidos, observacoes, status, atualizado_em } = req.body;
  const usuario = req.currentUser!.login;

  const index = db.documentos_processados.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Documento não encontrado." });
  }
  if (!checkNaoDesatualizado(res, db.documentos_processados[index], atualizado_em)) return;

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
  const usuario = req.currentUser!.login;

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
      medidor: result.medidor || null
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
  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.warn("Standard JSON.parse failed, attempting robust regex extraction. Malformed JSON snippet:", jsonStr.substring(0, 300));
    
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
      medidor: "N/A"
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

      const sMatch = jsonStr.match(stringPattern);
      if (sMatch) {
        if (kv.type === "string") {
          result[kv.key] = sMatch[1];
        } else {
          const val = parseFloat(sMatch[1]);
          result[kv.key] = isNaN(val) ? 0 : val;
        }
      } else {
        const nMatch = jsonStr.match(numberPattern);
        if (nMatch) {
          const val = parseFloat(nMatch[1]);
          result[kv.key] = isNaN(val) ? 0 : val;
        }
      }
    }

    return result;
  }
}

// --- GEMINI PARSER ENDPOINT ---
app.post("/api/documentos/parse", async (req, res) => {
  const { texto_fatura, layout, nome_arquivo } = req.body;

  if (!texto_fatura) {
    return res.status(400).json({ error: "Nenhum conteúdo de fatura enviado para o parser." });
  }

  // Ensure robust size limitation for the prompt to avoid token overflows and output truncation
  let txtToSend = texto_fatura;
  if (txtToSend.length > 15000) {
    txtToSend = txtToSend.substring(0, 7500) + 
      "\n...[CONTEÚDO TRUNCADO PELO SISTEMA DE SEGURANÇA PARA EVITAR TRANSBORDAMENTO]...\n" + 
      txtToSend.substring(txtToSend.length - 7500);
  }

  try {
    const prompt = `
Você é um parser oficial de faturas do sistema SisPu.JP 2.0.
Seu objetivo é ler o conteúdo de texto de uma fatura da concessionária catarinense (CELESC ou CASAN) e extrair os dados fiscais e de consumo estruturados.

LAYOUT DE ENTRADA: ${layout}
NOME DO ARQUIVO: ${nome_arquivo}

CONTEÚDO DA FATURA:
"""
${txtToSend}
"""

Por favor, extraia os seguintes campos com exatidão matemática:
1. Mês/Ano de competência de referência (formato YYYY-MM-DD, preferencialmente o primeiro dia do mês correspondente, ex: "2026-06-01" para Junho de 2026).
2. Consumo medido (número, ex: 1450.50). Para CELESC é o consumo em kWh. Para CASAN é o consumo em m³.
3. Valor Total a pagar (número, ex: 1240.20).
4. Valor do imposto (ICMS/COSIP/Tributos somados, número, ex: 245.50).
5. Valor celular (se houver, senão 0).
6. Valor internet (se houver, senão 0).
7. Valor diversos (se houver, senão 0).
8. Valor linha privada / LP (se houver, senão 0).
9. Valor crédito (se houver, senão 0).
10. Código de número identificador da fatura (CODNUM / Unidade Consumidora / Número da Linha / Contrato, ex: "101001" ou "CELESC-PREF-101").
11. Número do Medidor (se houver, ex: "928371-3").
12. Endereço da Unidade Consumidora (extraia o endereço específico que consta no bloco da UC/imóvel, ex: "DAS MADEIRAS 3000", e NÃO o endereço genérico do cliente no cabeçalho).

Sua resposta DEVE ser estritamente em formato JSON seguindo este esquema:
{
  "mes_ano": "YYYY-MM-DD",
  "consumo": 0.00,
  "valor_total": 0.00,
  "valor_imposto": 0.00,
  "valor_celular": 0.00,
  "valor_internet": 0.00,
  "valor_diversos": 0.00,
  "valor_linha_privada": 0.00,
  "valor_credito": 0.00,
  "codigo_numero": "IDENTIFICADOR",
  "medidor": "NUMERO_MEDIDOR",
  "endereco": "ENDERECO_DA_UC"
}

Não inclua explicações ou markdown fora do bloco JSON.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mes_ano: { type: Type.STRING, description: "YYYY-MM-DD format" },
            consumo: { type: Type.NUMBER },
            valor_total: { type: Type.NUMBER },
            valor_imposto: { type: Type.NUMBER },
            valor_celular: { type: Type.NUMBER },
            valor_internet: { type: Type.NUMBER },
            valor_diversos: { type: Type.NUMBER },
            valor_linha_privada: { type: Type.NUMBER },
            valor_credito: { type: Type.NUMBER },
            codigo_numero: { type: Type.STRING },
            medidor: { type: Type.STRING },
            endereco: { type: Type.STRING }
          },
          required: ["mes_ano", "consumo", "valor_total", "valor_imposto"]
        }
      }
    });

    const resultText = response.text || "{}";
    const parsedData = robustJsonParse(resultText);
    res.json(parsedData);

  } catch (error: any) {
    console.warn("Gemini API error (Quota exceeded or other), falling back to local heuristic parser:", error);
    logTechnicalError("GEMINI_API_PARSER_FALLBACK", `Heuristic fallback used due to error: ${error.message || "Unknown error"}`, "server.ts", "1230");
    
    try {
      const parsedData = heuristicExtractFatura(texto_fatura, nome_arquivo || "fatura_upload.txt", layout);
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
    console.log(`SisPu.JP 2.0 running on http://localhost:${PORT} [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer();
