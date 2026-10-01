import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// firebase-applet-config.json é gerado pelo próprio AI Studio na raiz do projeto e é commitado
// no Git (diferente do .env) — sobrevive a reinícios de container e a resoluções de conflito que
// já apagaram FIRESTORE_PROJECT_ID/FIRESTORE_DATABASE_ID do .env mais de uma vez. Usado só como
// fallback: variável de ambiente configurada explicitamente sempre tem prioridade. Lido uma única
// vez e cacheado — não muda em tempo de execução.
let appletConfigCache: { projectId?: string; firestoreDatabaseId?: string } | null | undefined;
function readAppletConfig(): { projectId?: string; firestoreDatabaseId?: string } | null {
  if (appletConfigCache !== undefined) return appletConfigCache;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      appletConfigCache = null;
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    appletConfigCache = { projectId: parsed?.projectId, firestoreDatabaseId: parsed?.firestoreDatabaseId };
    return appletConfigCache;
  } catch (err) {
    console.warn("[DB] Não foi possível ler firebase-applet-config.json:", err);
    appletConfigCache = null;
    return null;
  }
}

// O Cloud Run (onde o AI Studio publica este app) define GOOGLE_CLOUD_PROJECT automaticamente
// no ambiente de todo serviço — não precisa configurar nada manualmente lá. Em desenvolvimento
// local, ou pra apontar pra um projeto do Firebase diferente do padrão, dá pra definir
// FIRESTORE_PROJECT_ID no .env. Como último recurso, cai pro projectId de
// firebase-applet-config.json (ver acima). Sem nenhuma dessas, tratamos como "sem banco
// configurado" — modo de memória local intencional, o mesmo comportamento que existia sem
// DATABASE_URL no Postgres.
export function getFirestoreProjectId(): string | undefined {
  return process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || readAppletConfig()?.projectId;
}

// O AI Studio provisiona, por padrão, um banco Firestore NOMEADO por app (ex.:
// "ai-studio-sispujp20-b86d99a9-..."), não o banco "(default)" que o SDK busca quando nenhum ID
// é informado — conectar sem isso falha com "5 NOT_FOUND" mesmo com o projeto certo e a
// permissão certa, porque o banco que o SDK está procurando (o default) simplesmente não existe
// nesse projeto. Sem FIRESTORE_DATABASE_ID definida (nem o campo equivalente em
// firebase-applet-config.json), cai no comportamento padrão do SDK (banco "(default)"), que é o
// caso comum fora do AI Studio.
export function getFirestoreDatabaseId(): string | undefined {
  return process.env.FIRESTORE_DATABASE_ID || readAppletConfig()?.firestoreDatabaseId;
}

let firestoreDb: admin.firestore.Firestore | null = null;

export async function resetFirestoreConnection(): Promise<void> {
  if (admin.apps.length) {
    try {
      await Promise.all(admin.apps.map(a => a?.delete()));
    } catch (e) {
      // ignore
    }
  }
  firestoreDb = null;
}

// Nenhuma connection string aqui — o SDK do Firebase Admin usa as credenciais padrão do
// ambiente. Rodando no Cloud Run do mesmo projeto do Firestore, isso é automático (a identidade
// de serviço do próprio Cloud Run); não existe segredo pra digitar nem pra perder num restart,
// que era a causa raiz por trás da DATABASE_URL do Postgres sumindo quando o container reiniciava.
export function getFirestoreDb(): admin.firestore.Firestore | null {
  const projectId = getFirestoreProjectId();
  if (!projectId) return null;

  if (!firestoreDb) {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId });
    }
    const app = admin.app();
    const databaseId = getFirestoreDatabaseId();
    // getFirestore(app, databaseId) (API modular) é o único jeito de apontar pra um banco
    // nomeado — admin.firestore() sempre busca o banco "(default)".
    firestoreDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
    // O Firestore rejeita campos com valor undefined por padrão — os objetos em memória deste
    // app têm vários campos opcionais (tipo_fone, medidor, etc.) que ficam undefined quando não
    // preenchidos. Sem isso, gravar essas linhas direto lançaria erro.
    firestoreDb.settings({ ignoreUndefinedProperties: true });
  }
  return firestoreDb;
}

const COLLECTIONS = [
  'usuarios', 'secretarias', 'unidades', 'despesas', 'itens_despesas',
  'lancamentos', 'pessoas', 'contatos_email', 'logs_erros',
  'auditoria_registros', 'documentos_processados', 'cadastro_mestre_ucs'
] as const;

// Coleções ordenadas por criado_em decrescente na leitura — só as que têm sentido de "mais
// recente primeiro" na tela (logs, auditoria, documentos). As demais não têm uma ordem
// significativa (id é um UUID), então ficam na ordem que o Firestore devolver.
const RECENT_FIRST_COLLECTIONS = new Set(['logs_erros', 'auditoria_registros', 'documentos_processados']);

// Firestore não tem schema pra criar (é um banco de documentos, não de tabelas) — isso só
// confirma que dá pra falar com o banco de verdade antes de reportar sucesso, uma leitura real
// em vez de só abrir uma conexão.
export async function initFirestoreSchema(): Promise<boolean> {
  const dbRef = getFirestoreDb();
  if (!dbRef) {
    console.log("[DB] Projeto do Firestore não configurado. Operando em modo de memória local.");
    return false;
  }
  try {
    await dbRef.collection('secretarias').limit(1).get();
    console.log("[DB] Conexão com o Firestore verificada com sucesso.");
    return true;
  } catch (err: any) {
    console.error("[DB] Falha ao conectar/verificar o Firestore:", err.message || err);
    return false;
  }
}

export async function loadStateFromFirestore(): Promise<any | null> {
  const dbRef = getFirestoreDb();
  if (!dbRef) return null;

  try {
    const snapshots = await Promise.all(COLLECTIONS.map(name => {
      const ref = dbRef.collection(name);
      return RECENT_FIRST_COLLECTIONS.has(name) ? ref.orderBy('criado_em', 'desc').get() : ref.get();
    }));

    const state: any = {};
    COLLECTIONS.forEach((name, i) => {
      state[name] = snapshots[i].docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });

    // Defensivamente força Number() nos valores monetários/de consumo — o Firestore já guarda
    // number nativo (diferente do Postgres, que devolvia NUMERIC como string), mas isso protege
    // contra qualquer linha antiga migrada com valor em formato de texto.
    state.lancamentos = (state.lancamentos || []).map((r: any) => ({
      ...r,
      consumo: Number(r.consumo || 0),
      valor_total: Number(r.valor_total || 0),
      valor_imposto: Number(r.valor_imposto || 0),
      valor_celular: Number(r.valor_celular || 0),
      valor_internet: Number(r.valor_internet || 0),
      valor_diversos: Number(r.valor_diversos || 0),
      valor_linha_privada: Number(r.valor_linha_privada || 0),
      valor_credito: Number(r.valor_credito || 0),
    }));

    return state;
  } catch (err: any) {
    console.error("[DB] Erro ao carregar dados do Firestore:", err.message || err);
    return null;
  }
}

// Máximo de operações por WriteBatch — o Firestore recusa acima de 500; a margem é só uma
// trava de segurança, igual ao equivalente que existia pro limite de parâmetros do Postgres.
const MAX_BATCH_OPS = 450;

async function commitInChunks(
  dbRef: admin.firestore.Firestore,
  ops: Array<(batch: admin.firestore.WriteBatch) => void>
): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
    const batch = dbRef.batch();
    ops.slice(i, i + MAX_BATCH_OPS).forEach(op => op(batch));
    await batch.commit();
  }
}

export async function saveAllStateToFirestore(state: any): Promise<void> {
  const dbRef = getFirestoreDb();
  if (!dbRef) return;

  try {
    const ops: Array<(batch: admin.firestore.WriteBatch) => void> = [];
    for (const name of COLLECTIONS) {
      for (const row of state[name] || []) {
        if (!row?.id) continue;
        const docRef = dbRef.collection(name).doc(String(row.id));
        ops.push(batch => batch.set(docRef, row, { merge: true }));
      }
    }
    await commitInChunks(dbRef, ops);
  } catch (err: any) {
    console.error("[DB] Erro ao sincronizar estado com o Firestore:", err.message || err);
    // Repassa o erro: quem chama precisa saber que a gravação não foi confirmada no banco —
    // silenciar aqui era o que fazia o servidor responder "sucesso" para o cliente mesmo quando
    // a escrita real no Firestore tinha falhado.
    throw err;
  }
}

// Upsert pontual de um pequeno conjunto de linhas (1 fatura = doc + unidade + item + lançamento,
// ou um lote inteiro de faturas de uma vez), sem percorrer as demais linhas das coleções. Usado
// pelos endpoints que só criam/alteram algumas linhas por chamada — evita reconstruir TODAS as
// linhas de TODAS as coleções a cada gravação.
export async function upsertRowsToFirestore(rows: { table: string; row: any }[]): Promise<void> {
  const dbRef = getFirestoreDb();
  if (!dbRef || rows.length === 0) return;

  const ops = rows
    .filter(({ row }) => row?.id)
    .map(({ table, row }) => {
      const docRef = dbRef.collection(table).doc(String(row.id));
      return (batch: admin.firestore.WriteBatch) => batch.set(docRef, row, { merge: true });
    });

  await commitInChunks(dbRef, ops);
}

// Tabelas de onde uma linha pode ser explicitamente excluída. Exclusão aqui é deliberada — os
// salvamentos só fazem INSERT/UPDATE (upsert); uma linha só sai do Firestore quando um destes é
// chamado para o próprio id dela, nunca como efeito colateral de outra gravação produzir um
// array em memória menor. É isso que protege dados reais de um `db` em memória parcial/desatualizado.
const DELETABLE_TABLES = new Set([
  'lancamentos',
  'documentos_processados',
  'itens_despesas',
  'unidades',
  'secretarias',
  'despesas',
  'cadastro_mestre_ucs',
]);

export async function deleteRowFromFirestore(tableName: string, id: string): Promise<void> {
  if (!DELETABLE_TABLES.has(tableName)) {
    throw new Error(`Tabela não permitida para exclusão: ${tableName}`);
  }
  const dbRef = getFirestoreDb();
  if (!dbRef || !id) return;
  await dbRef.collection(tableName).doc(String(id)).delete();
}

// Exclui um pedaço de lançamentos (e os documentos_processados vinculados/alternativos) num só
// WriteBatch, em vez de 1 chamada por item. Espelha a lógica do DELETE /api/lancamentos/:id de 1
// item: tenta achar cada id em `lancamentos` primeiro (e limpa o documento vinculado de mesmo
// id, se existir); os ids que não eram um lançamento são tentados como `documentos_processados`
// diretamente. Confirma com getAll() quais ids realmente existiam antes de apagar — o Firestore
// não avisa sozinho se um delete "pegou" algo de verdade, então isso faz o papel do antigo
// DELETE ... RETURNING id do Postgres, que o chamador usa pra saber o que sumir de cada tela.
export async function deleteLancamentosLote(ids: string[]): Promise<{
  deletedLancamentos: string[];
  deletedDocumentosVinculados: string[];
  deletedDocumentosFallback: string[];
}> {
  const dbRef = getFirestoreDb();
  if (!dbRef || ids.length === 0) {
    return { deletedLancamentos: [], deletedDocumentosVinculados: [], deletedDocumentosFallback: [] };
  }

  const lancRefs = ids.map(id => dbRef.collection('lancamentos').doc(id));
  const lancSnaps = await dbRef.getAll(...lancRefs);
  const deletedLancamentos = lancSnaps.filter(s => s.exists).map(s => s.id);

  let deletedDocumentosVinculados: string[] = [];
  if (deletedLancamentos.length > 0) {
    const docRefs = deletedLancamentos.map(id => dbRef.collection('documentos_processados').doc(id));
    const docSnaps = await dbRef.getAll(...docRefs);
    deletedDocumentosVinculados = docSnaps.filter(s => s.exists).map(s => s.id);
  }

  const remaining = ids.filter(id => !deletedLancamentos.includes(id));
  let deletedDocumentosFallback: string[] = [];
  if (remaining.length > 0) {
    const docRefs = remaining.map(id => dbRef.collection('documentos_processados').doc(id));
    const docSnaps = await dbRef.getAll(...docRefs);
    deletedDocumentosFallback = docSnaps.filter(s => s.exists).map(s => s.id);
  }

  const ops: Array<(batch: admin.firestore.WriteBatch) => void> = [];
  deletedLancamentos.forEach(id => {
    const ref = dbRef.collection('lancamentos').doc(id);
    ops.push(batch => batch.delete(ref));
  });
  deletedDocumentosVinculados.forEach(id => {
    const ref = dbRef.collection('documentos_processados').doc(id);
    ops.push(batch => batch.delete(ref));
  });
  deletedDocumentosFallback.forEach(id => {
    const ref = dbRef.collection('documentos_processados').doc(id);
    ops.push(batch => batch.delete(ref));
  });
  await commitInChunks(dbRef, ops);

  return { deletedLancamentos, deletedDocumentosVinculados, deletedDocumentosFallback };
}
