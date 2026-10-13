import { buscaBate } from "../utils/busca";
import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, Droplet, Zap, Search, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, AlertTriangle, Download, Upload } from "lucide-react";
import { COLUNAS_INVENTARIO, normEndereco, type CampoInventario, type ItemInventarioResumo } from "../utils/inventario";
import { Building2 } from "lucide-react";

// Inventário de unidades: dados complementares dos locais e setores (responsáveis, contato,
// classificação, situação, matrícula CASAN e UC CELESC). Edita aqui ou pela planilha (.xlsx):
// exportar, editar no Excel e importar de volta. A situação "no sistema" segue a regra de 3 meses
// sem fatura; a da planilha fica só como informação.

type Filtro = "todos" | "avisos" | "inativas" | "sem_ligacao" | "sem_edificio";
type Previa = {
  lidas: number; novas: number; atualizadas: number; iguais: number; colunas_desconhecidas: string[];
  correcoes: { linha: string; codigo: string; dono: string; motivo: string }[];
  indecisos: { codigo: string; linhas: string[] }[];
  mudancas: { nome: string; campos: { rotulo: string; de: string; para: string }[] }[];
};

const textoItem = (i: ItemInventarioResumo) => [
  ...COLUNAS_INVENTARIO.map(c => i[c.campo] || ""), i.edificio || "",
  ...i.ligacoes.flatMap(l => [l.codigo, l.codigo_sistema || "", l.unidade || ""]),
].join(" ");
const bate = buscaBate;

// Local = linhas no mesmo endereço. A planilha lista cada setor (gabinete, departamento, divisão)
// como uma linha, mas no mesmo prédio; aqui eles ficam dentro do local. Principal = linha com
// ligação própria (quem manda é a matrícula/UC); sem nenhuma, a classificada como "Prédio"/"Secretaria".
type Local = { chave: string; principais: ItemInventarioResumo[]; setores: ItemInventarioResumo[]; linhas: ItemInventarioResumo[] };
const temLigacao = (i: ItemInventarioResumo) => i.ligacoes.length > 0;
function agruparLocais(itens: ItemInventarioResumo[]): Local[] {
  const grupos = new Map<string, ItemInventarioResumo[]>();
  for (const i of itens) {
    const k = normEndereco(i.endereco) || `sem-endereco:${i.id}`;
    grupos.set(k, [...(grupos.get(k) || []), i]);
  }
  return [...grupos.entries()].map(([chave, linhas]) => {
    let principais = linhas.filter(temLigacao);
    if (!principais.length) principais = [linhas.find(i => /PREDIO|SECRETARIA/i.test(i.classificacao || "")) || linhas[0]];
    return { chave, principais, setores: linhas.filter(i => !principais.includes(i)), linhas };
  });
}
const nomeLocal = (l: Local) => l.principais.length > 2 ? `${l.principais.slice(0, 2).map(i => i.nome).join(" / ")} +${l.principais.length - 2}` : l.principais.map(i => i.nome).join(" / ");

async function enviar(url: string, metodo: string, body?: any) {
  const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json", "x-user": "gestor_web" }, body: body ? JSON.stringify(body) : undefined });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.error || "Não foi possível gravar.");
  return dados;
}

export default function Inventario({ versao }: { versao?: number }) {
  const [itens, setItens] = useState<ItemInventarioResumo[] | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [secretaria, setSecretaria] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<ItemInventarioResumo | "novo" | null>(null);
  const [importando, setImportando] = useState(false);

  const carregar = async () => {
    try {
      const r = await fetch("/api/inventario");
      if (!r.ok) throw new Error();
      setItens((await r.json()).itens); setErro("");
    } catch { setErro("Não foi possível carregar as informações."); }
  };
  useEffect(() => { carregar(); }, [versao]);

  const secretarias = useMemo(() => [...new Set((itens || []).map(i => i.secretaria || "").filter(Boolean))].sort(), [itens]);
  const passa = (i: ItemInventarioResumo, f: Filtro) =>
    f === "todos" || (f === "avisos" && i.avisos.length > 0) || (f === "inativas" && i.situacao_sistema === "Inativa") ||
    (f === "sem_ligacao" && !i.ligacoes.length) || (f === "sem_edificio" && i.ligacoes.some(l => l.contrato_id) && !i.edificio_id);
  const locais = useMemo(() => agruparLocais(itens || []), [itens]);
  // "Sem ligação própria": o local inteiro sem nenhuma ligação; os outros filtros olham as linhas.
  const localPassa = (l: Local, f: Filtro) => f === "sem_ligacao" ? !l.linhas.some(temLigacao) : l.linhas.some(i => passa(i, f));
  const lista = useMemo(() => locais.filter(l =>
    localPassa(l, filtro) && (!secretaria || l.linhas.some(i => i.secretaria === secretaria)) && (!busca.trim() || l.linhas.some(i => bate(textoItem(i), busca)))), [locais, filtro, secretaria, busca]);

  if (erro) return <div className="p-6 text-rose-300">{erro}</div>;
  if (!itens) return <div className="p-6 text-gray-400">Carregando informações…</div>;

  const FILTROS: [Filtro, string][] = [["todos", "Todas"], ["avisos", "Com aviso"], ["inativas", "Inativas no sistema"], ["sem_ligacao", "Sem ligação própria"], ["sem_edificio", "Ligação sem edifício"]];
  const comLigacao = itens.filter(i => i.ligacoes.some(l => l.contrato_id)).length;

  return (
    <div className="space-y-5 text-gray-200">
      <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-indigo-300" />Informações das unidades</h2>
            <p className="text-xs text-gray-400">Locais e setores com responsáveis, contato, classificação e as ligações de água e luz. A situação no sistema segue a regra de 3 meses sem fatura.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/inventario/exportar" className="text-xs font-semibold px-3 py-2.5 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-2"><Download className="h-4 w-4" />Exportar planilha</a>
            <button onClick={() => setImportando(true)} className="text-xs font-semibold px-3 py-2.5 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-2"><Upload className="h-4 w-4" />Importar planilha</button>
            <button onClick={() => setEditando("novo")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-2"><Plus className="h-4 w-4" />Nova unidade</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi titulo="Locais" valor={`${locais.length} (de ${itens.length} linhas)`} />
          <Kpi titulo="Com ligação no sistema" valor={String(comLigacao)} />
          <Kpi titulo="Inativas no sistema" valor={String(itens.filter(i => i.situacao_sistema === "Inativa").length)} />
          <Kpi titulo="Com aviso" valor={String(itens.filter(i => i.avisos.length).length)} />
          <Kpi titulo="Ligação sem edifício" valor={String(itens.filter(i => passa(i, "sem_edificio")).length)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por unidade, responsável, endereço, telefone, matrícula/UC ou edifício"
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-400" />
          </div>
          <select value={secretaria} onChange={e => setSecretaria(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs">
            <option value="">Todas as secretarias</option>
            {secretarias.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {FILTROS.map(([f, rotulo]) => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border ${filtro === f ? "bg-indigo-600 border-indigo-500 text-white" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
              {rotulo} <span className="opacity-70">({locais.filter(l => localPassa(l, f)).length})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-2 px-4 py-2 text-[10px] uppercase font-bold text-gray-400 border-b border-white/10">
          <div className="pl-6">Local</div><div>Secretaria</div><div>Ligações</div><div>Situação</div><div>Edifício</div>
        </div>
        {lista.length === 0 && <div className="p-6 text-sm text-gray-400">{itens.length ? "Nenhum local encontrado." : "Ainda não há informações. Use \"Importar planilha\" para carregar a planilha de unidades."}</div>}
        {lista.map(l => {
          const p = l.principais[0];
          const ligacoes = l.principais.flatMap(i => i.ligacoes);
          const avisos = l.linhas.some(i => i.avisos.length);
          const situacao = l.principais.map(i => i.situacao_sistema).find(Boolean) || "";
          const edificio = l.linhas.find(i => i.edificio);
          return (
            <div key={l.chave} className="border-b border-white/5 last:border-0">
              <button onClick={() => setAberto(aberto === l.chave ? null : l.chave)} className="w-full text-left px-4 py-3 hover:bg-white/[0.03] grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-2 items-center">
                <div className="flex items-start gap-2 min-w-0">
                  {aberto === l.chave ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-1.5">{avisos && <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0" />}<span className="truncate">{nomeLocal(l)}</span>
                      {l.setores.length > 0 && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-gray-300">+{l.setores.length} setor{l.setores.length > 1 ? "es" : ""}</span>}</div>
                    <div className="text-xs text-gray-400 truncate">{p.endereco || "Endereço não informado"}{p.classificacao ? ` · ${p.classificacao}` : ""}</div>
                  </div>
                </div>
                <Celula titulo="Secretaria">{[...new Set(l.principais.map(i => i.secretaria).filter(Boolean))].join(" / ") || "—"}</Celula>
                <Celula titulo="Ligações">{ligacoes.length ? <div className="flex flex-wrap gap-1">{ligacoes.map(x => <Chip key={x.codigo} l={x} />)}</div> : <span className="text-gray-500">—</span>}</Celula>
                <Celula titulo="Situação">
                  {situacao ? <span className={situacao === "Ativa" ? "text-emerald-300" : "text-gray-400"}>{situacao} no sistema</span> : <span className="text-gray-500">sem ligação no sistema</span>}
                  {p.situacao && <div className="text-gray-500">planilha: {p.situacao}</div>}
                </Celula>
                <Celula titulo="Edifício">{edificio ? <>{edificio.edificio}{edificio.edificio_por === "endereco" && <div className="text-gray-500">pelo endereço</div>}</> : <span className="text-gray-500">—</span>}</Celula>
              </button>
              {aberto === l.chave && <DetalheLocal local={l} onEditar={setEditando} onMudou={carregar} />}
            </div>
          );
        })}
      </div>

      {editando && <Editor item={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} onSalvo={async () => { setEditando(null); await carregar(); }} />}
      {importando && <Importar onFechar={() => setImportando(false)} onImportado={async () => { setImportando(false); await carregar(); }} />}
    </div>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{titulo}</div>
      <div className="text-sm font-bold mt-1">{valor}</div>
    </div>
  );
}

function Celula({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="text-xs min-w-0">
      <div className="md:hidden text-[10px] uppercase text-gray-500">{titulo}</div>
      {children}
    </div>
  );
}

function Chip({ l }: { l: ItemInventarioResumo["ligacoes"][number]; key?: string }) {
  const cor = !l.contrato_id ? "border-white/10 text-gray-500" : l.ativo ? (l.tipo === "AGUA" ? "border-sky-500/40 text-sky-200" : "border-amber-500/40 text-amber-200") : "border-white/15 text-gray-400";
  const dica = !l.contrato_id ? "Não está no sistema" : `${l.codigo_sistema} · ${l.unidade}${l.ativo ? "" : ` · inativa${l.motivo ? ` (${l.motivo})` : ""}`}`;
  return (
    <span title={dica} className={`inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded border ${cor}`}>
      {l.tipo === "AGUA" ? <Droplet className="h-3 w-3" /> : <Zap className="h-3 w-3" />}{l.codigo}{l.contrato_id && !l.ativo && <span className="font-sans">(inativa)</span>}
    </span>
  );
}

function DetalheLocal({ local, onEditar, onMudou }: { local: Local; onEditar: (i: ItemInventarioResumo) => void; onMudou: () => void }) {
  const [msg, setMsg] = useState("");
  const [criando, setCriando] = useState(false);
  // Ligações do sistema deste local que ainda não estão em nenhum edifício.
  const soltas = [...new Set(local.principais.flatMap(i => i.ligacoes).filter(x => x.contrato_id && !x.edificio_id).map(x => x.contrato_id!))];
  const criarEdificio = async () => {
    const p = local.principais[0];
    if (!confirm(`Criar o edifício "${p.nome.toUpperCase()}" com ${soltas.length} ligação(ões)?`)) return;
    setCriando(true); setMsg("");
    try { await enviar("/api/edificios", "POST", { nome: local.principais.map(i => i.nome).join(" / "), endereco: p.endereco || "", contratos: soltas }); onMudou(); }
    catch (e: any) { setMsg(e.message); } finally { setCriando(false); }
  };
  return (
    <div className="bg-black/20">
      {local.principais.map(i => <Detalhe key={i.id} i={i} titulo={local.principais.length > 1 ? i.nome : undefined} onEditar={() => onEditar(i)} />)}
      {soltas.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-gray-400">{soltas.length} ligação(ões) deste local ainda não estão em nenhum edifício.</span>
          <button disabled={criando} onClick={criarEdificio} className="font-semibold px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50"><Building2 className="h-3.5 w-3.5" />Criar edifício com elas</button>
          {msg && <span className="text-rose-300">{msg}</span>}
        </div>
      )}
      {local.setores.length > 0 && (
        <details className="px-4 pb-5 text-xs" open={local.setores.length <= 5}>
          <summary className="cursor-pointer font-semibold text-gray-300 py-1">Setores no mesmo endereço ({local.setores.length}) — sem ligação própria, usam a do local</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full">
              <thead className="text-[10px] uppercase text-gray-400 border-b border-white/10">
                <tr><th className="text-left py-1.5 pr-3">Setor</th><th className="text-left py-1.5 pr-3">Secretaria</th><th className="text-left py-1.5 pr-3">Responsável</th><th className="text-left py-1.5 pr-3">Telefone</th><th className="text-left py-1.5 pr-3">E-mail</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {local.setores.map(i => (
                  <tr key={i.id}>
                    <td className="py-1.5 pr-3">{i.nome}{i.classificacao ? <span className="text-gray-500"> · {i.classificacao}</span> : null}</td>
                    <td className="py-1.5 pr-3 text-gray-300">{i.secretaria || "—"}</td>
                    <td className="py-1.5 pr-3 text-gray-300">{[i.responsavel_1, i.responsavel_2].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="py-1.5 pr-3 text-gray-300 whitespace-nowrap">{i.telefone || "—"}</td>
                    <td className="py-1.5 pr-3 text-gray-300">{i.email || "—"}</td>
                    <td className="py-1.5 text-right"><button onClick={() => onEditar(i)} className="p-1 rounded hover:bg-white/10" title="Editar"><Pencil className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Detalhe({ i, titulo, onEditar }: { i: ItemInventarioResumo; titulo?: string; onEditar: () => void; key?: string }) {
  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {titulo && <div className="text-sm font-semibold text-gray-200 pt-2">{titulo}</div>}
      {i.avisos.length > 0 && (
        <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 space-y-0.5">
          {i.avisos.map(a => <div key={a}>{a}</div>)}
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
        {COLUNAS_INVENTARIO.filter(c => c.campo !== "nome").map(c => (
          <div key={c.campo} className={c.campo === "observacao" ? "sm:col-span-2 lg:col-span-3" : ""}>
            <span className="text-gray-500">{c.rotulo}: </span>{i[c.campo] || <span className="text-gray-600">—</span>}
          </div>
        ))}
      </div>
      {i.ligacoes.some(l => l.contrato_id) && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-gray-400 border-b border-white/10">
              <tr><th className="text-left py-2 pr-3">Na planilha</th><th className="text-left py-2 pr-3">No sistema</th><th className="text-left py-2 pr-3">Unidade gestora</th><th className="text-left py-2 pr-3">Situação</th><th className="text-left py-2">Edifício</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {i.ligacoes.filter(l => l.contrato_id).map(l => (
                <tr key={l.codigo}>
                  <td className="py-2 pr-3 font-mono">{l.codigo}</td><td className="py-2 pr-3 font-mono">{l.codigo_sistema}</td><td className="py-2 pr-3">{l.unidade}</td>
                  <td className="py-2 pr-3">{l.ativo ? "Ativa" : `Inativa${l.motivo ? ` — ${l.motivo}` : ""}`}</td><td className="py-2">{l.edificio || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={onEditar} className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" />Editar</button>
      </div>
    </div>
  );
}

function Editor({ item, onFechar, onSalvo }: { item: ItemInventarioResumo | null; onFechar: () => void; onSalvo: () => void }) {
  const [valores, setValores] = useState<Partial<Record<CampoInventario, string>>>(() =>
    Object.fromEntries(COLUNAS_INVENTARIO.map(c => [c.campo, item?.[c.campo] || ""])));
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!valores.nome?.trim()) { setMsg("Informe o nome da unidade."); return; }
    setSalvando(true); setMsg("");
    try { await enviar(item ? `/api/inventario/${item.id}` : "/api/inventario", item ? "PUT" : "POST", valores); onSalvo(); }
    catch (e: any) { setMsg(e.message); } finally { setSalvando(false); }
  };
  const excluir = async () => {
    if (!item || !confirm(`Excluir "${item.nome}" das Informações? As ligações e faturas não mudam.`)) return;
    try { await enviar(`/api/inventario/${item.id}`, "DELETE"); onSalvo(); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onFechar}>
      <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-4xl my-8 p-5 space-y-4" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{item ? "Editar informações da unidade" : "Nova unidade nas Informações"}</h3>
          <button onClick={onFechar} className="p-1 hover:bg-white/10 rounded"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COLUNAS_INVENTARIO.map(c => (
            <label key={c.campo} className={`text-xs space-y-1 ${c.campo === "observacao" || c.campo === "nome" ? "sm:col-span-2 lg:col-span-3" : ""}`}>
              {c.rotulo}{c.campo === "casan" || c.campo === "celesc" ? <span className="text-gray-500"> (vários: separe com /)</span> : null}
              {c.campo === "observacao"
                ? <textarea value={valores[c.campo] || ""} onChange={e => setValores({ ...valores, [c.campo]: e.target.value })} rows={2} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />
                : <input value={valores[c.campo] || ""} onChange={e => setValores({ ...valores, [c.campo]: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />}
            </label>
          ))}
        </div>
        {msg && <div className="text-xs text-rose-300">{msg}</div>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {item ? <button onClick={excluir} className="text-xs px-3 py-2 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5"><Trash2 className="h-3.5 w-3.5" />Excluir</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onFechar} className="text-xs px-4 py-2 rounded-lg border border-white/15">Cancelar</button>
            <button disabled={salvando} onClick={salvar} className="text-xs font-bold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">{salvando ? "Gravando…" : "Salvar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Importar({ onFechar, onImportado }: { onFechar: () => void; onImportado: () => void }) {
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const escolher = async (f?: File) => {
    if (!f) return;
    setMsg(""); setPrevia(null); setOcupado(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = ""; for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
      const base64 = btoa(bin);
      setArquivo({ nome: f.name, base64 });
      setPrevia(await enviar("/api/inventario/previa", "POST", { arquivo: base64 }));
    } catch (e: any) { setMsg(e.message); } finally { setOcupado(false); }
  };
  const importar = async () => {
    if (!arquivo) return;
    setOcupado(true); setMsg("");
    try { await enviar("/api/inventario/importar", "POST", { arquivo: arquivo.base64 }); onImportado(); }
    catch (e: any) { setMsg(e.message); setOcupado(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onFechar}>
      <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-3xl my-8 p-5 space-y-4 text-sm" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Importar planilha de unidades (.xlsx)</h3>
          <button onClick={onFechar} className="p-1 hover:bg-white/10 rounded"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-gray-400">
          Unidade nova entra; a que já existe é completada (célula preenchida substitui, célula vazia mantém o que havia). Nada é apagado.
          Um código que esteja em duas unidades fica só na certa, com uma nota na observação da outra.
        </p>
        <label className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 hover:bg-white/5 cursor-pointer">
          <Upload className="h-4 w-4" />{arquivo ? arquivo.nome : "Escolher arquivo"}
          <input type="file" accept=".xlsx" className="hidden" onChange={e => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {ocupado && <div className="text-xs text-gray-400">Lendo…</div>}
        {previa && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Kpi titulo="Linhas lidas" valor={String(previa.lidas)} /><Kpi titulo="Novas" valor={String(previa.novas)} />
              <Kpi titulo="Atualizadas" valor={String(previa.atualizadas)} /><Kpi titulo="Sem mudança" valor={String(previa.iguais)} />
            </div>
            {previa.correcoes.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 space-y-1">
                <div className="font-bold text-amber-200">Códigos repetidos corrigidos ({previa.correcoes.length})</div>
                {previa.correcoes.map(c => <div key={c.linha + c.codigo}><span className="font-mono">{c.codigo}</span> sai de "{c.linha}" e fica em "{c.dono}" — {c.motivo}</div>)}
              </div>
            )}
            {previa.indecisos.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 space-y-1">
                <div className="font-bold text-rose-200">Repetidos sem como decidir (ficam nas duas, com aviso)</div>
                {previa.indecisos.map(c => <div key={c.codigo}><span className="font-mono">{c.codigo}</span>: {c.linhas.join(" / ")}</div>)}
              </div>
            )}
            {previa.colunas_desconhecidas.length > 0 && <div className="text-gray-400">Colunas ignoradas: {previa.colunas_desconhecidas.join(", ")}</div>}
            {previa.mudancas.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                <div className="font-bold text-gray-300">O que muda nas que já existem</div>
                {previa.mudancas.map(m => (
                  <div key={m.nome} className="border-b border-white/5 pb-1"><b>{m.nome}</b>
                    {m.campos.map(c => <div key={c.rotulo} className="text-gray-400">{c.rotulo}: <s>{c.de || "vazio"}</s> → {c.para || "vazio"}</div>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {msg && <div className="text-xs text-rose-300">{msg}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onFechar} className="text-xs px-4 py-2 rounded-lg border border-white/15">Cancelar</button>
          <button disabled={!previa || ocupado || (previa.novas + previa.atualizadas === 0)} onClick={importar}
            className="text-xs font-bold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">Importar</button>
        </div>
      </div>
    </div>
  );
}
