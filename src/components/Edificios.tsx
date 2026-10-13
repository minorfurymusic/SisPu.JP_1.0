import React, { useEffect, useMemo, useState } from "react";
import { Building2, Droplet, Zap, Search, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import GraficoComparativo from "./GraficoComparativo";
import type { EdificioResumo, Ligacao, TipoLigacao } from "../utils/edificios";

// Edifícios: prédios/locais com as ligações de água (CASAN) e luz (CELESC) que estão neles.
// Responde "quantas águas e luzes há aqui, quanto pagam e consomem" e aponta os prédios com
// mais de uma ligação do mesmo tipo, candidatos a ficar com uma só.

type Dados = { meses: string[]; ultimo: Record<TipoLigacao, string>; edificios: EdificioResumo[]; sem_edificio: Ligacao[] };
type Filtro = "todos" | "agua2" | "luz2" | "ambos" | "sem";

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const mesBR = (m: string) => (m ? `${m.substring(5, 7)}/${m.substring(0, 4)}` : "—");
const norm = (s: string) => (s || "").toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const digitos = (s: string) => (s || "").replace(/\D/g, "");
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Busca por nome, endereço, observação, matrícula/UC (atual ou antiga, com ou sem pontuação),
// unidade gestora e secretaria. Várias palavras: todas precisam aparecer.
function bate(texto: string, busca: string) {
  const termos = norm(busca).split(/\s+/).filter(Boolean);
  const alvo = norm(texto), alvoDig = digitos(texto);
  return termos.every(t => alvo.includes(t) || (digitos(t).length >= 4 && digitos(t) === t.replace(/[^\d]/g, "") && alvoDig.includes(digitos(t))));
}
const textoLigacao = (l: Ligacao) => [l.codigo, ...l.codigos_antigos, l.unidade, l.secretaria, l.endereco].join(" ");
const textoEdificio = (e: EdificioResumo) => [e.nome, e.endereco, e.observacao, ...e.ligacoes.map(textoLigacao)].join(" ");

function Tipo({ tipo }: { tipo: TipoLigacao }) {
  return tipo === "AGUA"
    ? <span className="inline-flex items-center gap-1 text-sky-300"><Droplet className="h-3.5 w-3.5" />Água</span>
    : <span className="inline-flex items-center gap-1 text-amber-300"><Zap className="h-3.5 w-3.5" />Luz</span>;
}

export default function Edificios({ versao }: { versao?: number }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<EdificioResumo | "novo" | null>(null);
  const [ligacoesNovo, setLigacoesNovo] = useState<string[]>([]);

  const carregar = async () => {
    try {
      const r = await fetch("/api/edificios");
      if (!r.ok) throw new Error();
      setDados(await r.json()); setErro("");
    } catch { setErro("Não foi possível carregar os edifícios."); }
  };
  useEffect(() => { carregar(); }, [versao]);

  const lista = useMemo(() => {
    if (!dados) return [];
    return dados.edificios.filter(e => {
      if (filtro === "agua2" && e.agua.n < 2) return false;
      if (filtro === "luz2" && e.luz.n < 2) return false;
      if (filtro === "ambos" && !(e.agua.n && e.luz.n)) return false;
      return !busca.trim() || bate(textoEdificio(e), busca);
    });
  }, [dados, filtro, busca]);
  const semEdificio = useMemo(() => (dados?.sem_edificio || []).filter(l => !busca.trim() || bate(textoLigacao(l), busca)), [dados, busca]);

  if (erro) return <div className="p-6 text-rose-300">{erro}</div>;
  if (!dados) return <div className="p-6 text-gray-400">Carregando edifícios…</div>;

  const todos = dados.edificios;
  const kpi = {
    edificios: todos.length,
    agua: todos.reduce((a, e) => a + e.agua.n, 0), luz: todos.reduce((a, e) => a + e.luz.n, 0),
    valor: todos.reduce((a, e) => a + e.agua.valor_12m + e.luz.valor_12m, 0),
    multiplos: todos.filter(e => e.agua.n >= 2 || e.luz.n >= 2).length,
    economia: todos.reduce((a, e) => a + e.economia_estimada, 0),
  };
  const contagem: Record<Filtro, number> = {
    todos: todos.length, agua2: todos.filter(e => e.agua.n >= 2).length, luz2: todos.filter(e => e.luz.n >= 2).length,
    ambos: todos.filter(e => e.agua.n && e.luz.n).length, sem: dados.sem_edificio.length,
  };
  const FILTROS: [Filtro, string][] = [["todos", "Todos"], ["agua2", "2+ águas"], ["luz2", "2+ luzes"], ["ambos", "Água e luz"], ["sem", "Ligações sem edifício"]];

  return (
    <div className="space-y-5 text-gray-200">
      <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Building2 className="h-5 w-5 text-indigo-300" />Edifícios</h2>
            <p className="text-xs text-gray-400">Prédios e locais com as ligações de água e luz de cada um. Últimos 12 meses até {mesBR(dados.ultimo.AGUA)} (água) e {mesBR(dados.ultimo.LUZ)} (luz).</p>
          </div>
          <button onClick={() => { setLigacoesNovo([]); setEditando("novo"); }} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-2">
            <Plus className="h-4 w-4" />Novo edifício
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi titulo="Edifícios" valor={num(kpi.edificios)} />
          <Kpi titulo="Ligações ligadas" valor={`${kpi.agua} água · ${kpi.luz} luz`} />
          <Kpi titulo="Gasto 12 meses" valor={brl(kpi.valor)} />
          <Kpi titulo="Com 2+ do mesmo tipo" valor={num(kpi.multiplos)} />
          <Kpi titulo="Custo fixo das ligações extras" valor={`${brl(kpi.economia)}/ano`} dica="Estimativa: para cada ligação além da mais cara, a menor fatura do ano × 12." />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por prédio, endereço, matrícula/UC, unidade ou secretaria"
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-400" />
          </div>
          {FILTROS.map(([f, rotulo]) => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border ${filtro === f ? "bg-indigo-600 border-indigo-500 text-white" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
              {rotulo} <span className="opacity-70">({contagem[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {filtro === "sem" ? (
        <SemEdificio ligacoes={semEdificio} edificios={todos} onCriar={ids => { setLigacoesNovo(ids); setEditando("novo"); }} onMudou={carregar} />
      ) : (
        <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))] gap-2 px-4 py-2 text-[10px] uppercase font-bold text-gray-400 border-b border-white/10">
            <div className="pl-6">Edifício</div><div>Água (12 meses)</div><div>Luz (12 meses)</div><div>Total</div><div>Custo fixo das ligações extras</div>
          </div>
          {lista.length === 0 && <div className="p-6 text-sm text-gray-400">Nenhum edifício encontrado.</div>}
          {lista.map(e => (
            <div key={e.id} className="border-b border-white/5 last:border-0">
              <button onClick={() => setAberto(aberto === e.id ? null : e.id)} className="w-full text-left px-4 py-3 hover:bg-white/[0.03] grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))] gap-2 items-center">
                <div className="flex items-start gap-2 min-w-0">
                  {aberto === e.id ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{e.nome}</div>
                    <div className="text-xs text-gray-400 truncate">{e.endereco || "Endereço não informado"}</div>
                  </div>
                </div>
                <Celula titulo="Água" destaque={e.agua.n >= 2}>{e.agua.n ? <>{e.agua.n} lig. · {brl(e.agua.valor_12m)}<div className="text-gray-500">{num(e.agua.consumo_12m)} m³/12m</div></> : "—"}</Celula>
                <Celula titulo="Luz" destaque={e.luz.n >= 2}>{e.luz.n ? <>{e.luz.n} lig. · {brl(e.luz.valor_12m)}<div className="text-gray-500">{num(e.luz.consumo_12m)} kWh/12m</div></> : "—"}</Celula>
                <Celula titulo="Total 12 meses">{brl(e.agua.valor_12m + e.luz.valor_12m)}<div className="text-gray-500">último mês {brl(e.agua.valor_ultimo + e.luz.valor_ultimo)}</div></Celula>
                <Celula titulo="Ligações extras">{e.economia_estimada > 0
                  ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />{brl(e.economia_estimada)}/ano</span>
                  : <span className="text-gray-500">—</span>}</Celula>
              </button>
              {aberto === e.id && <Detalhe e={e} meses={dados.meses} onEditar={() => setEditando(e)} />}
            </div>
          ))}
        </div>
      )}

      {editando && (
        <Editor edificio={editando === "novo" ? null : editando} inicial={editando === "novo" ? ligacoesNovo : undefined} dados={dados}
          onFechar={() => setEditando(null)} onSalvo={async () => { setEditando(null); await carregar(); }} />
      )}
    </div>
  );
}

function Kpi({ titulo, valor, dica }: { titulo: string; valor: string; dica?: string }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3" title={dica}>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{titulo}</div>
      <div className="text-sm font-bold mt-1">{valor}</div>
    </div>
  );
}

function Celula({ titulo, destaque, children }: { titulo: string; destaque?: boolean; children: React.ReactNode }) {
  return (
    <div className={`text-xs ${destaque ? "text-amber-200 font-semibold" : ""}`}>
      <div className="md:hidden text-[10px] uppercase text-gray-500">{titulo}</div>
      {children}
    </div>
  );
}

function TabelaLigacoes({ ligacoes, extra }: { ligacoes: Ligacao[]; extra?: (l: Ligacao) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase text-gray-400 border-b border-white/10">
          <tr>
            <th className="text-left py-2 pr-3">Tipo</th><th className="text-left py-2 pr-3">Matrícula / UC</th><th className="text-left py-2 pr-3">Unidade gestora</th>
            <th className="text-left py-2 pr-3">Endereço na fatura</th><th className="text-right py-2 pr-3">Último mês</th><th className="text-right py-2 pr-3">12 meses</th>
            {extra && <th className="py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {ligacoes.map(l => (
            <tr key={l.id} className={l.ativo ? "" : "opacity-50"}>
              <td className="py-2 pr-3 whitespace-nowrap"><Tipo tipo={l.tipo} /></td>
              <td className="py-2 pr-3 font-mono whitespace-nowrap">{l.codigo}{!l.ativo && <span className="ml-1 text-[10px] text-gray-400">(inativa)</span>}</td>
              <td className="py-2 pr-3">{l.unidade}<div className="text-gray-500">{l.secretaria}</div></td>
              <td className="py-2 pr-3 text-gray-300">{l.endereco}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">{brl(l.valor_ultimo)}<div className="text-gray-500">{num(l.consumo_ultimo)} {l.tipo === "AGUA" ? "m³" : "kWh"}</div></td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">{brl(l.valor_12m)}<div className="text-gray-500">{num(l.consumo_12m)} {l.tipo === "AGUA" ? "m³" : "kWh"}</div></td>
              {extra && <td className="py-2 text-right whitespace-nowrap">{extra(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detalhe({ e, meses, onEditar }: { e: EdificioResumo; meses: string[]; onEditar: () => void }) {
  const ultimos = meses.slice(-12), anteriores = meses.slice(0, 12);
  const valor = (m: string) => (e.serie[m] ? e.serie[m].agua_valor + e.serie[m].luz_valor : null);
  return (
    <div className="px-4 pb-5 pt-1 space-y-4 bg-black/20">
      {(e.agua.n >= 2 || e.luz.n >= 2) && (
        <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          Este prédio tem {e.agua.n >= 2 ? `${e.agua.n} ligações de água` : ""}{e.agua.n >= 2 && e.luz.n >= 2 ? " e " : ""}{e.luz.n >= 2 ? `${e.luz.n} ligações de luz` : ""}.
          {" "}Ficar com uma de cada evitaria cerca de <b>{brl(e.economia_estimada)} por ano</b> de custo fixo (estimativa pela menor fatura de cada ligação extra).
        </div>
      )}
      {e.observacao && <div className="text-xs text-gray-300"><b>Observação:</b> {e.observacao}</div>}
      <TabelaLigacoes ligacoes={e.ligacoes} />
      {meses.length > 0 && (
        <GraficoComparativo rotulos={ultimos.map(m => MESES_CURTOS[Number(m.substring(5, 7)) - 1])}
          atual={ultimos.map(valor)} anterior={anteriores.map(valor)}
          nomeAtual={`Água + luz até ${mesBR(meses[meses.length - 1])}`} nomeAnterior="Mesmo mês do ano anterior" cor="#7f77dd" formato={brl} altura={200} />
      )}
      <div className="flex justify-end">
        <button onClick={onEditar} className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" />Editar edifício</button>
      </div>
    </div>
  );
}

function SemEdificio({ ligacoes, edificios, onCriar, onMudou }: { ligacoes: Ligacao[]; edificios: EdificioResumo[]; onCriar: (ids: string[]) => void; onMudou: () => void }) {
  const [salvando, setSalvando] = useState("");
  const adicionar = async (l: Ligacao, edificioId: string) => {
    const e = edificios.find(x => x.id === edificioId);
    if (!e) return;
    setSalvando(l.id);
    const r = await fetch(`/api/edificios/${e.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-user": "gestor_web" }, body: JSON.stringify({ contratos: [...e.contratos, l.id] }) });
    setSalvando("");
    if (!r.ok) alert((await r.json().catch(() => ({}))).error || "Não foi possível gravar.");
    onMudou();
  };
  return (
    <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-4 space-y-3">
      <p className="text-xs text-gray-400">Ligações ativas que ainda não estão em nenhum edifício, das que mais pagam para as que menos pagam. Ligue a um edifício existente ou crie um novo.</p>
      <TabelaLigacoes ligacoes={ligacoes} extra={l => (
        <div className="flex items-center gap-2 justify-end">
          <select disabled={salvando === l.id} defaultValue="" onChange={ev => ev.target.value && adicionar(l, ev.target.value)}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs max-w-[220px]">
            <option value="">Ligar ao edifício…</option>
            {edificios.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <button onClick={() => onCriar([l.id])} className="text-xs px-2 py-1 rounded border border-white/15 hover:bg-white/5">Novo</button>
        </div>
      )} />
    </div>
  );
}

function Editor({ edificio, inicial, dados, onFechar, onSalvo }: {
  edificio: EdificioResumo | null; inicial?: string[]; dados: Dados; onFechar: () => void; onSalvo: () => void;
}) {
  const [nome, setNome] = useState(edificio?.nome || "");
  const [endereco, setEndereco] = useState(edificio?.endereco || "");
  const [observacao, setObservacao] = useState(edificio?.observacao || "");
  const [ids, setIds] = useState<string[]>(edificio?.contratos || inicial || []);
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);

  const todas = useMemo(() => {
    const m = new Map<string, { l: Ligacao; edificio?: string }>();
    dados.sem_edificio.forEach(l => m.set(l.id, { l }));
    dados.edificios.forEach(e => e.ligacoes.forEach(l => m.set(l.id, { l, edificio: e.id === edificio?.id ? undefined : e.nome })));
    return m;
  }, [dados, edificio]);
  const escolhidas = ids.map(id => todas.get(id)?.l).filter((l): l is Ligacao => !!l);
  const sugestoes = busca.trim().length >= 2
    ? [...todas.values()].filter(x => !ids.includes(x.l.id) && bate(textoLigacao(x.l), busca)).slice(0, 12) : [];

  const salvar = async () => {
    if (!nome.trim()) { setMsg("Informe o nome do edifício."); return; }
    setSalvando(true); setMsg("");
    const r = await fetch(edificio ? `/api/edificios/${edificio.id}` : "/api/edificios", {
      method: edificio ? "PUT" : "POST", headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
      body: JSON.stringify({ nome, endereco, observacao, contratos: ids }),
    });
    setSalvando(false);
    if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || "Não foi possível gravar."); return; }
    onSalvo();
  };
  const excluir = async () => {
    if (!edificio || !confirm(`Excluir o edifício "${edificio.nome}"? As ligações continuam no sistema, só ficam sem edifício.`)) return;
    const r = await fetch(`/api/edificios/${edificio.id}`, { method: "DELETE", headers: { "x-user": "gestor_web" } });
    if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || "Não foi possível excluir."); return; }
    onSalvo();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onFechar}>
      <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-4xl my-8 p-5 space-y-4" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{edificio ? "Editar edifício" : "Novo edifício"}</h3>
          <button onClick={onFechar} className="p-1 hover:bg-white/10 rounded"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs space-y-1">Nome<input value={nome} onChange={e => setNome(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" /></label>
          <label className="text-xs space-y-1">Endereço<input value={endereco} onChange={e => setEndereco(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" /></label>
        </div>
        <label className="text-xs space-y-1 block">Observação (ex.: resultado da vistoria, plano de unificação)
          <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />
        </label>

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase text-gray-400">Ligações neste edifício ({escolhidas.length})</div>
          {escolhidas.length ? <TabelaLigacoes ligacoes={escolhidas} extra={l => (
            <button onClick={() => setIds(ids.filter(x => x !== l.id))} className="text-xs px-2 py-1 rounded border border-white/15 hover:bg-rose-500/20">Tirar</button>
          )} /> : <div className="text-xs text-gray-500">Nenhuma ligação ainda.</div>}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase text-gray-400">Adicionar ligação</div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite matrícula/UC, unidade ou endereço"
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />
          {sugestoes.map(({ l, edificio: outro }) => (
            <button key={l.id} onClick={() => { setIds([...ids, l.id]); setBusca(""); }}
              className="w-full text-left text-xs px-3 py-2 rounded border border-white/10 hover:bg-white/5 flex flex-wrap gap-x-3 gap-y-1 items-center">
              <Tipo tipo={l.tipo} /><span className="font-mono">{l.codigo}</span><span>{l.unidade}</span><span className="text-gray-500">{l.endereco}</span>
              {outro && <span className="text-amber-300">sai de: {outro}</span>}
            </button>
          ))}
        </div>

        {msg && <div className="text-xs text-rose-300">{msg}</div>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {edificio ? <button onClick={excluir} className="text-xs px-3 py-2 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5"><Trash2 className="h-3.5 w-3.5" />Excluir edifício</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onFechar} className="text-xs px-4 py-2 rounded-lg border border-white/15">Cancelar</button>
            <button disabled={salvando} onClick={salvar} className="text-xs font-bold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">{salvando ? "Gravando…" : "Salvar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
