import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Download, Printer, Sparkles, X } from "lucide-react";
import { Grupo, GRUPOS_PERDA, NOME_GRUPO, TributosFatura, DemandaDoMes, FaixaDemanda, faixaDemanda, simularDemandaIdeal } from "../utils/analiseCelesc";
import { compararComHistorico, TEXTO_ALERTA, ResultadoVariacao } from "../utils/variacao";

type Linha = {
  id: string; mes: string; contrato_id: string; codigo: string; concessionaria: "CASAN" | "CELESC";
  unidade_id: string; unidade_nome: string; unidade_endereco: string; secretaria_id: string; secretaria_nome: string;
  consumo: number; valor_total: number; energia_injetada: number; dias: number; grupo_tensao: string;
  tem_itens: boolean; grupos: Record<Grupo, number> | null; tributos: TributosFatura | null; nao_classificados: string[];
  demanda: DemandaDoMes | null; disponibilidade: { minimo: number; medido: number; kwh: number; valor: number } | null;
};
type Base = { linhas: Linha[]; unidades: { id: string; nome: string; endereco: string; secretaria_id: string }[]; secretarias: { id: string; nome: string }[] };

// ---------------------------------------------------------------------------------------------
// Grupos de custo exibidos. Cores: paleta categórica validada (dataviz/validate_palette, modo
// escuro, superfície #141414) — ordem fixa, a cor segue o grupo em todos os gráficos.
const MACRO = [
  { k: "energia", nome: "Energia (TE)", cor: "#3987e5", grupos: ["energia"] as Grupo[] },
  { k: "rede", nome: "Rede / fio (TUSD)", cor: "#d95926", grupos: ["rede"] as Grupo[] },
  { k: "demanda", nome: "Demanda contratada", cor: "#199e70", grupos: ["demanda"] as Grupo[] },
  { k: "bandeira", nome: "Bandeira tarifária", cor: "#c98500", grupos: ["bandeira"] as Grupo[] },
  { k: "perdas", nome: "Perdas e penalidades", cor: "#d55181", grupos: GRUPOS_PERDA },
  { k: "infra", nome: "Infraestrutura e serviços", cor: "#008300", grupos: ["infraestrutura"] as Grupo[] },
  { k: "cosip", nome: "COSIP", cor: "#9085e9", grupos: ["cosip"] as Grupo[] },
] as const;
const DEDUCOES: Grupo[] = ["solar", "irpj_retido", "ajustes", "outros"];
const COR_UNICA = "#3987e5";

// Status (fixos, sempre com rótulo): faixas de demanda combinadas com o usuário.
const COR_FAIXA: Record<FaixaDemanda, string> = { vermelho: "#d03b3b", laranja: "#ec835a", verde: "#0ca30c", amarelo: "#fab219", cinza: "#898781" };
const LEGENDA_FAIXA: [FaixaDemanda, string][] = [
  ["vermelho", "acima de 105% — ultrapassagem"], ["laranja", "100% a 105% — no limite"], ["verde", "90% a 100% — ideal"],
  ["amarelo", "70% a 90% — sobrando"], ["cinza", "abaixo de 70% — pagando bem mais do que usa"],
];
type FaixaConsumo = "alta" | "normal" | "queda" | "semref";
const COR_CONSUMO: Record<FaixaConsumo, string> = { alta: "#d03b3b", normal: "#0ca30c", queda: "#6da7ec", semref: "#898781" };
const LEGENDA_CONSUMO: [FaixaConsumo, string][] = [
  ["alta", "mais de 20% acima do normal"], ["normal", "dentro de ±20%"], ["queda", "mais de 20% abaixo"], ["semref", "sem histórico para comparar"],
];

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const rotuloMes = (m: string) => `${MESES[Number(m.substring(5, 7)) - 1]}/${m.substring(2, 4)}`;
const fmtR = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = (v: number, d = 0) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtPct = (v: number | null) => (v === null || !isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${fmtN(v * 100, 1)}%`);
const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const valorGrupos = (l: Linha, gs: readonly Grupo[]) => (l.grupos ? gs.reduce((a, g) => a + (l.grupos![g] || 0), 0) : 0);
const perdasDe = (l: Linha) => valorGrupos(l, GRUPOS_PERDA) + (l.disponibilidade?.valor || 0);
// As UCs da CELESC vêm todas como "MUNICIPIO DE RIO DO SUL" até serem classificadas: o endereço
// vai junto em toda lista para dar para reconhecer o local.
const NomeUnidade = ({ nome, endereco }: { nome: string; endereco: string }) => (
  <div><div className="text-white">{nome}</div>{endereco && <div className="text-[10px] text-gray-500">{endereco}</div>}</div>
);
const RotulosMeses = ({ meses }: { meses: string[] }) => (
  <div className="flex flex-wrap gap-1">{meses.map(m => <span key={m} className="w-11 text-center text-[9px] text-gray-500 normal-case">{rotuloMes(m)}</span>)}</div>
);
const intervaloMeses = (de: string, ate: string) => {
  const out: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  while (a < a2 || (a === a2 && m <= m2)) { out.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
  return out;
};

// ---------------------------------------------------------------------------------------------
// Demanda contratada por mês de um contrato: calculada nos meses com ultrapassagem/sobra; nos
// demais, a do mês conhecido mais próximo (de preferência anterior).
function contratadaPorMes(ls: Linha[]) {
  const conhecidos = ls.filter(l => l.demanda?.contratada).map(l => ({ mes: l.mes, c: l.demanda!.contratada! })).sort((a, b) => a.mes.localeCompare(b.mes));
  const m = new Map<string, number | null>();
  for (const l of ls) {
    if (l.demanda?.contratada) { m.set(l.mes, l.demanda.contratada); continue; }
    const antes = [...conhecidos].reverse().find(k => k.mes < l.mes), depois = conhecidos.find(k => k.mes > l.mes);
    m.set(l.mes, (antes || depois)?.c ?? null);
  }
  return m;
}

function faixaConsumoDoMes(l: Linha, historico: Linha[]): { faixa: FaixaConsumo; r: ResultadoVariacao } {
  const r = compararComHistorico({ mes: l.mes, consumo: l.consumo, valor: l.valor_total, dias: l.dias },
    historico.map(h => ({ mes: h.mes, consumo: h.consumo, valor: h.valor_total, dias: h.dias })), l.concessionaria);
  if (r.ref_consumo_30d === null) return { faixa: "semref", r };
  if (r.alerta === "alta" || r.alerta === "zerado") return { faixa: r.alerta === "zerado" ? "queda" : "alta", r };
  if (r.alerta === "queda") return { faixa: "queda", r };
  return { faixa: "normal", r };
}

// ---------------------------------------------------------------------------------------------
// Recomendações por regra (números exatos, sem IA).
type Recomendacao = { tipo: string; unidade_id: string; unidade: string; endereco: string; codigo: string; titulo: string; detalhe: string; economia: number };

function recomendacoes(ls: Linha[], todas: Linha[]): Recomendacao[] {
  const out: Recomendacao[] = [];
  const porContrato = new Map<string, Linha[]>();
  ls.filter(l => l.concessionaria === "CELESC").forEach(l => porContrato.set(l.contrato_id, [...(porContrato.get(l.contrato_id) || []), l]));
  for (const [id, xs] of porContrato) {
    const l0 = xs[0];
    const base = { unidade_id: l0.unidade_id, unidade: l0.unidade_nome, endereco: l0.unidade_endereco, codigo: l0.codigo };
    const comDemanda = xs.filter(l => l.demanda);
    if (comDemanda.length) {
      const contr = contratadaPorMes(todas.filter(l => l.contrato_id === id));
      const atual = contr.get(comDemanda[comDemanda.length - 1].mes) || null;
      const sim = atual ? simularDemandaIdeal(comDemanda.map(l => ({ usada: l.demanda!.faturada, preco_kw: l.demanda!.preco_kw, preco_ultrapassagem_kw: l.demanda!.preco_ultrapassagem_kw })), atual) : null;
      if (sim && sim.economia >= 50 && sim.sugerida !== sim.contratada_atual) {
        out.push({ ...base, tipo: "Demanda", economia: sim.economia,
          titulo: `${sim.sugerida > sim.contratada_atual ? "Aumentar" : "Reduzir"} a demanda contratada de ${fmtN(sim.contratada_atual)} para ${fmtN(sim.sugerida)} kW`,
          detalhe: `Maior uso nos ${sim.meses} meses: ${fmtN(sim.maior_uso, 1)} kW. Com ${fmtN(sim.sugerida)} kW esses meses teriam custado ${fmtR(sim.custo_sugerido)} em demanda, em vez de ${fmtR(sim.custo_atual)}. A mudança segue regras e prazos da CELESC.` });
      }
    }
    const reat = soma(xs, l => l.grupos?.reativo || 0);
    if (reat > 20) {
      const meses = xs.filter(l => (l.grupos?.reativo || 0) > 0).length;
      out.push({ ...base, tipo: "Energia reativa", economia: reat, titulo: "Corrigir o fator de potência (banco de capacitores)",
        detalhe: `Pagou ${fmtR(reat)} de energia reativa excedente em ${meses} mês(es) — energia "defasada" devolvida à rede. Um banco de capacitores bem dimensionado elimina essa cobrança.` });
    }
    const disp = xs.filter(l => l.disponibilidade);
    if (disp.length >= 3) {
      const v = soma(disp, l => l.disponibilidade!.valor), zero = disp.filter(l => l.disponibilidade!.medido === 0).length;
      out.push({ ...base, tipo: "Ligação ociosa", economia: v, titulo: zero >= 3 ? "Avaliar o desligamento: consumo zero e pagando o mínimo" : "Consumo abaixo do mínimo cobrado",
        detalhe: `Em ${disp.length} mês(es) o relógio marcou menos que o mínimo de ${disp[0].disponibilidade!.minimo} kWh${zero ? ` (${zero} com consumo zero)` : ""}: ${fmtR(v)} pagos por energia não usada.` });
    }
    const mj = soma(xs, l => l.grupos?.multas_juros || 0);
    if (mj > 5) out.push({ ...base, tipo: "Multas e juros", economia: mj, titulo: "Pagar em dia", detalhe: `${fmtR(mj)} de multa e juros por atraso.` });
  }
  return out.sort((a, b) => b.economia - a.economia);
}

// ---------------------------------------------------------------------------------------------
type Coluna<T> = { titulo: string; valor: (l: T) => React.ReactNode; direita?: boolean; csv?: (l: T) => string | number; ordem?: (l: T) => number | string };

function exportarCSV<T>(nome: string, colunas: Coluna<T>[], linhas: T[]) {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const texto = (c: Coluna<T>, l: T) => { const v = c.csv ? c.csv(l) : c.valor(l); return typeof v === "object" ? "" : v; };
  const corpo = [colunas.map(c => esc(c.titulo)).join(";"), ...linhas.map(l => colunas.map(c => esc(texto(c, l))).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${nome}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function Tabela<T>({ nome, colunas, linhas, rodape, vazio = "Sem dados para o período.", onLinha, ordemInicial }: {
  nome: string; colunas: Coluna<NoInfer<T>>[]; linhas: T[]; rodape?: React.ReactNode[]; vazio?: string; onLinha?: (l: T) => void;
  ordemInicial?: { coluna: string; desc: boolean };
}) {
  const [ordem, setOrdem] = useState(ordemInicial || null);
  const ordenadas: T[] = useMemo(() => {
    const c = ordem && colunas.find(x => x.titulo === ordem.coluna);
    if (!c?.ordem) return linhas;
    return [...linhas].sort((a, b) => {
      const va = c.ordem!(a), vb = c.ordem!(b);
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return ordem!.desc ? -r : r;
    });
  }, [linhas, ordem, colunas]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={() => exportarCSV(nome, colunas, ordenadas)} disabled={!linhas.length}
          className="print:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-[11px] disabled:opacity-40">
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto border border-white/10 rounded-lg">
        <table className="w-full text-xs text-gray-300">
          <thead className="bg-black/40 text-gray-400 text-[10px] uppercase font-mono">
            <tr>{colunas.map(c => (
              <th key={c.titulo} className={`px-3 py-2 whitespace-nowrap ${c.direita ? "text-right" : "text-left"} ${c.ordem ? "cursor-pointer hover:text-white select-none" : ""}`}
                onClick={() => c.ordem && setOrdem(o => ({ coluna: c.titulo, desc: o?.coluna === c.titulo ? !o.desc : true }))}>
                {c.titulo}{ordem?.coluna === c.titulo && (ordem.desc ? <ArrowDown className="inline h-3 w-3 ml-0.5" /> : <ArrowUp className="inline h-3 w-3 ml-0.5" />)}
              </th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {linhas.length === 0 && <tr><td colSpan={colunas.length} className="px-3 py-4 text-gray-500">{vazio}</td></tr>}
            {ordenadas.map((l, i) => (
              <tr key={i} className={`hover:bg-white/5 ${onLinha ? "cursor-pointer" : ""}`} onClick={() => onLinha?.(l)}>
                {colunas.map(c => <td key={c.titulo} className={`px-3 py-1.5 ${c.direita ? "text-right font-mono tabular-nums whitespace-nowrap" : ""}`}>{c.valor(l)}</td>)}
              </tr>
            ))}
          </tbody>
          {rodape && linhas.length > 0 && (
            <tfoot className="bg-black/30 font-bold text-white">
              <tr>{rodape.map((v, i) => <td key={i} className={`px-3 py-2 whitespace-nowrap ${i > 0 ? "text-right font-mono tabular-nums" : ""}`}>{v}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Colunas por período, empilhadas por série (uma série = coluna simples). Barra ≤ 28px, 2px de
// folga entre segmentos, topo arredondado só no último segmento, grade fina, tooltip por coluna.
function Colunas({ rotulos, series, formato = fmtR, altura = 240 }: {
  rotulos: string[]; series: { nome: string; cor: string; valores: number[] }[]; formato?: (v: number) => string; altura?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = altura, M = { t: 10, r: 8, b: 22, l: 84 };
  const totais = rotulos.map((_, i) => soma(series, s => Math.max(0, s.valores[i] || 0)));
  const max = Math.max(1, ...totais);
  const passo = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const intervalo = [1, 2, 2.5, 5, 10].map(f => f * passo).find(v => v * 4 >= max) ?? max / 4;
  const topo = intervalo * 4;
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / topo);
  const slot = (W - M.l - M.r) / Math.max(1, rotulos.length);
  const larg = Math.min(28, slot * 0.7);
  const cada = Math.max(1, Math.ceil(rotulos.length / 14));
  if (!rotulos.length) return <div className="text-xs text-gray-500">Sem dados para o período.</div>;
  return (
    <div className="space-y-2">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-300">
          {series.map(s => <span key={s.nome} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />{s.nome}</span>)}
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
          {[0, 1, 2, 3, 4].map(i => (topo / 4) * i).map(t => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#2c2c2a" strokeWidth={1} />
              <text x={M.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#898781">{formato(t).replace(",00", "")}</text>
            </g>
          ))}
          {rotulos.map((r, i) => {
            const x = M.l + slot * i + (slot - larg) / 2;
            let acum = 0;
            const vis = series.map(s => Math.max(0, s.valores[i] || 0));
            const ultimo = vis.map((v, k) => (v > 0 ? k : -1)).reduce((a, b) => Math.max(a, b), -1);
            return (
              <g key={r} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={M.l + slot * i} y={M.t} width={slot} height={H - M.t - M.b} fill={hover === i ? "rgba(255,255,255,0.04)" : "transparent"} />
                {series.map((s, k) => {
                  const v = vis[k];
                  if (v <= 0) return null;
                  const y0 = y(acum), y1 = y(acum + v);
                  acum += v;
                  const alto = Math.max(0, y0 - y1 - (k === ultimo ? 0 : 2));
                  if (alto < 0.5) return null;
                  const rr = k === ultimo ? Math.min(4, alto / 2, larg / 2) : 0;
                  const top = y0 - alto;
                  const d = `M${x},${y0} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + larg - rr} Q${x + larg},${top} ${x + larg},${top + rr} V${y0} Z`;
                  return <path key={s.nome} d={d} fill={s.cor} />;
                })}
                {i % cada === 0 && <text x={M.l + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#898781">{r}</text>}
              </g>
            );
          })}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="#383835" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <div className="absolute top-1 pointer-events-none bg-[#18181b] border border-white/15 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-200 shadow-xl z-10"
            style={{ left: `${Math.min(70, (hover / rotulos.length) * 100 + 4)}%` }}>
            <div className="font-bold mb-0.5">{rotulos[hover]}</div>
            {series.filter(s => (s.valores[hover] || 0) !== 0).map(s => (
              <div key={s.nome} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: s.cor }} />{s.nome}: <b>{formato(s.valores[hover] || 0)}</b></div>
            ))}
            {series.length > 1 && <div className="border-t border-white/10 mt-1 pt-1">Total: <b>{formato(totais[hover])}</b></div>}
          </div>
        )}
      </div>
    </div>
  );
}

// "Para onde vai o dinheiro": barras horizontais com valor e % do total.
function Composicao({ itens }: { itens: { nome: string; cor?: string; valor: number }[] }) {
  const pos = soma(itens.filter(i => i.valor > 0), i => i.valor);
  const max = Math.max(1, ...itens.map(i => Math.abs(i.valor)));
  return (
    <div className="space-y-1.5">
      {itens.filter(i => Math.abs(i.valor) >= 0.005).map(i => (
        <div key={i.nome} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-xs">
          <span className="text-gray-300 truncate flex items-center gap-1.5">{i.cor && <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: i.cor }} />}{i.nome}</span>
          <div className="h-3 bg-white/5 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${(Math.abs(i.valor) / max) * 100}%`, background: i.valor < 0 ? "#383835" : i.cor || COR_UNICA }} />
          </div>
          <span className="font-mono tabular-nums text-gray-200 text-right w-44">{fmtR(i.valor)} <span className="text-gray-500">{i.valor > 0 && pos ? `${fmtN((i.valor / pos) * 100, 1)}%` : ""}</span></span>
        </div>
      ))}
    </div>
  );
}

function Indicador({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe?: React.ReactNode; cor?: string; key?: string }) {
  return (
    <div className="bg-[#141414] border border-white/10 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1.5">{cor && <span className="h-2 w-2 rounded-sm" style={{ background: cor }} />}{titulo}</div>
      <div className="text-lg font-bold text-white">{valor}</div>
      {detalhe && <div className="text-[11px] text-gray-400">{detalhe}</div>}
    </div>
  );
}

function Celula({ cor, texto, titulo }: { cor: string; texto: string; titulo: string; key?: string }) {
  return <span title={titulo} className="inline-flex items-center justify-center w-11 h-6 rounded text-[10px] font-bold text-black tabular-nums" style={{ background: cor }}>{texto}</span>;
}

function Legenda<K extends string>({ itens, cores }: { itens: [K, string][]; cores: Record<K, string> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-300">
      {itens.map(([k, t]) => <span key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: cores[k] }} />{t}</span>)}
    </div>
  );
}

// Texto da IA em markdown simples (títulos, listas, negrito).
function TextoIA({ texto }: { texto: string }) {
  const negrito = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i} className="text-white">{p.slice(2, -2)}</b> : p));
  return (
    <div className="space-y-1.5 text-sm text-gray-200 leading-relaxed">
      {texto.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return null;
        if (/^#{1,4}\s/.test(t)) return <div key={i} className="font-bold text-white pt-2">{negrito(t.replace(/^#+\s*/, ""))}</div>;
        if (/^([-*•]|\d+\.)\s/.test(t)) return <div key={i} className="pl-4 -indent-3">• {negrito(t.replace(/^([-*•]|\d+\.)\s*/, ""))}</div>;
        return <p key={i}>{negrito(t)}</p>;
      })}
    </div>
  );
}

function BotaoIA({ titulo, resumo }: { titulo: string; resumo: () => any }) {
  const [estado, setEstado] = useState<{ carregando: boolean; texto?: string; erro?: string; modelo?: string }>({ carregando: false });
  const gerar = async () => {
    setEstado({ carregando: true });
    try {
      const r = await fetch("/api/relatorios/analise-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo, resumo: resumo() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha ao gerar a análise.");
      setEstado({ carregando: false, texto: d.texto, modelo: d.modelo });
    } catch (e: any) {
      setEstado({ carregando: false, erro: e.message });
    }
  };
  return (
    <div className="space-y-2">
      <button type="button" onClick={gerar} disabled={estado.carregando}
        className="print:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50">
        <Sparkles className="h-3.5 w-3.5" /> {estado.carregando ? "Analisando…" : estado.texto ? "Gerar de novo" : "Analisar com IA (Gemini)"}
      </button>
      {estado.erro && <div className="text-xs text-rose-300">{estado.erro}</div>}
      {estado.texto && (
        <div className="bg-[#141414] border border-indigo-500/30 rounded-lg p-4 space-y-2">
          <TextoIA texto={estado.texto} />
          <div className="text-[10px] text-gray-500">Texto gerado por IA ({estado.modelo}) a partir dos números do sistema. Os valores das tabelas são os oficiais.</div>
        </div>
      )}
    </div>
  );
}

function imprimir(titulo: string, elementoId: string) {
  const el = document.getElementById(elementoId);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) { window.print(); return; }
  const estilos = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(n => n.outerHTML).join("");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>${estilos}
    <style>
      body { background: #fff !important; padding: 16px; }
      body *:not(svg *):not([data-cor]) { color: #111 !important; background-color: transparent !important; border-color: #ccc !important; box-shadow: none !important; }
      .print\\:hidden { display: none !important; } .print-titulo { display: block !important; margin-bottom: 8px; }
      table { page-break-inside: auto; } tr { page-break-inside: avoid; }
    </style></head><body>${el.outerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

// Resumo por período (mês ou ano) de um conjunto de linhas.
function resumoPorPeriodo(ls: Linha[], periodos: string[], escala: "meses" | "anos") {
  const chave = (l: Linha) => (escala === "anos" ? l.mes.substring(0, 4) : l.mes);
  return periodos.map(p => {
    const xs = ls.filter(l => chave(l) === p);
    const e = xs.filter(l => l.concessionaria === "CELESC"), a = xs.filter(l => l.concessionaria === "CASAN");
    const g = (gs: readonly Grupo[]) => soma(e, l => valorGrupos(l, gs));
    return {
      periodo: p, rotulo: escala === "anos" ? p : rotuloMes(p), total: soma(xs, l => l.valor_total),
      kwh: soma(e, l => l.consumo), m3: soma(a, l => l.consumo), agua: soma(a, l => l.valor_total), energiaTotal: soma(e, l => l.valor_total),
      macro: Object.fromEntries(MACRO.map(m => [m.k, g(m.grupos)])) as Record<string, number>,
      solar: g(["solar"]), irpj: g(["irpj_retido"]), ajustes: g(["ajustes"]), outros: g(["outros"]),
      disponibilidade: soma(e, l => l.disponibilidade?.valor || 0), injetada: soma(e, l => l.energia_injetada),
    };
  });
}
type Resumo = ReturnType<typeof resumoPorPeriodo>[number];

const colunasResumo = (escala: "meses" | "anos"): Coluna<Resumo>[] => [
  { titulo: escala === "anos" ? "Ano" : "Mês", valor: r => r.rotulo },
  { titulo: "kWh", valor: r => fmtN(r.kwh), direita: true, csv: r => r.kwh },
  { titulo: "m³", valor: r => fmtN(r.m3), direita: true, csv: r => r.m3 },
  { titulo: "Água R$", valor: r => fmtR(r.agua), direita: true, csv: r => r.agua.toFixed(2) },
  ...MACRO.map(m => ({ titulo: m.nome, valor: (r: Resumo) => fmtR(r.macro[m.k]), direita: true, csv: (r: Resumo) => r.macro[m.k].toFixed(2) })),
  { titulo: "Crédito solar", valor: r => fmtR(r.solar), direita: true, csv: r => r.solar.toFixed(2) },
  { titulo: "IRPJ retido", valor: r => fmtR(r.irpj), direita: true, csv: r => r.irpj.toFixed(2) },
  { titulo: "Ajustes", valor: r => fmtR(r.ajustes + r.outros), direita: true, csv: r => (r.ajustes + r.outros).toFixed(2) },
  { titulo: "Total", valor: r => <b className="text-white">{fmtR(r.total)}</b>, direita: true, csv: r => r.total.toFixed(2) },
];
const rodapeResumo = (rs: Resumo[]) => [
  "Total", fmtN(soma(rs, r => r.kwh)), fmtN(soma(rs, r => r.m3)), fmtR(soma(rs, r => r.agua)),
  ...MACRO.map(m => fmtR(soma(rs, r => r.macro[m.k]))), fmtR(soma(rs, r => r.solar)), fmtR(soma(rs, r => r.irpj)),
  fmtR(soma(rs, r => r.ajustes + r.outros)), fmtR(soma(rs, r => r.total)),
];

// ---------------------------------------------------------------------------------------------
// Painel de uma unidade: abre por cima da lista, com período próprio (meses ou anos).
function PainelUnidade({ unidadeId, todas, deInicial, ateInicial, onClose }: {
  unidadeId: string; todas: Linha[]; deInicial: string; ateInicial: string; onClose: () => void;
}) {
  const daUnidade: Linha[] = useMemo(() => todas.filter(l => l.unidade_id === unidadeId), [todas, unidadeId]);
  const mesesDisp: string[] = useMemo(() => [...new Set(daUnidade.map(l => l.mes))].sort(), [daUnidade]);
  const [escala, setEscala] = useState<"meses" | "anos">("meses");
  const [de, setDe] = useState(mesesDisp.includes(deInicial) ? deInicial : mesesDisp.find(m => m >= deInicial) || mesesDisp[0] || deInicial);
  const [ate, setAte] = useState(mesesDisp.filter(m => m <= ateInicial).pop() || mesesDisp[mesesDisp.length - 1] || ateInicial);
  const [faturaAberta, setFaturaAberta] = useState<string | null>(null);
  const [itensFatura, setItensFatura] = useState<any[] | null>(null);
  const noPeriodo = daUnidade.filter(l => l.mes >= de && l.mes <= ate);
  const l0 = daUnidade[0];
  const periodos = escala === "anos" ? [...new Set(noPeriodo.map(l => l.mes.substring(0, 4)))].sort() : intervaloMeses(de, ate);
  const resumo = resumoPorPeriodo(noPeriodo, periodos, escala);
  const contratos = [...new Map(daUnidade.map(l => [l.contrato_id, l] as [string, Linha])).values()];
  const recs = recomendacoes(noPeriodo, todas);
  const mesesDoPeriodo = intervaloMeses(de, ate);
  const temAgua = noPeriodo.some(l => l.concessionaria === "CASAN");

  useEffect(() => {
    if (!faturaAberta) { setItensFatura(null); return; }
    const doMes = noPeriodo.filter(l => l.mes === faturaAberta && l.concessionaria === "CELESC");
    Promise.all(doMes.map(l => fetch(`/api/relatorios/fatura?contrato_id=${encodeURIComponent(l.contrato_id)}&mes=${l.mes}`).then(r => r.json())))
      .then(fs => setItensFatura(fs.filter(f => !f.error)))
      .catch(() => setItensFatura([]));
  }, [faturaAberta]);

  if (!l0) return null;
  const sel = "bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white";
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-6 max-w-6xl w-full shadow-2xl space-y-5 my-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="text-white font-bold text-lg">{l0.unidade_nome}</div>
            <div className="text-xs text-gray-400">{l0.secretaria_nome} · {l0.unidade_endereco || "sem endereço"}</div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">{contratos.map(c => `${c.concessionaria === "CASAN" ? "💧" : "⚡"} ${c.codigo}${c.grupo_tensao ? ` (${c.grupo_tensao})` : ""}`).join("   ")}</div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button type="button" onClick={() => imprimir(`SisPu.JP — ${l0.unidade_nome}`, "painel-unidade")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-xs"><Printer className="h-3.5 w-3.5" /> Imprimir / PDF</button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
            {(["meses", "anos"] as const).map(e => (
              <button key={e} type="button" onClick={() => setEscala(e)} className={`px-3 py-1 rounded-md text-xs font-semibold ${escala === e ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>{e === "meses" ? "Meses" : "Anos"}</button>
            ))}
          </div>
          <span className="text-xs text-gray-400">De</span>
          <select value={de} onChange={e => setDe(e.target.value)} className={sel}>{mesesDisp.map(m => <option key={m} value={m}>{rotuloMes(m)}</option>)}</select>
          <span className="text-xs text-gray-400">até</span>
          <select value={ate} onChange={e => setAte(e.target.value)} className={sel}>{mesesDisp.filter(m => m >= de).map(m => <option key={m} value={m}>{rotuloMes(m)}</option>)}</select>
          {[...new Set(mesesDisp.map(m => m.substring(0, 4)))].map(a => (
            <button key={a} type="button" onClick={() => { const ms = mesesDisp.filter(m => m.startsWith(a)); setDe(ms[0]); setAte(ms[ms.length - 1]); }}
              className="px-2.5 py-1 rounded-md border border-white/10 text-xs text-gray-300 hover:bg-white/5">{a}</button>
          ))}
        </div>

        <div id="painel-unidade" className="space-y-5">
          <div className="hidden print-titulo text-sm font-bold">{l0.unidade_nome} — {rotuloMes(de)} a {rotuloMes(ate)}</div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Indicador titulo="Total no período" valor={fmtR(soma(noPeriodo, l => l.valor_total))} detalhe={`${new Set(noPeriodo.map(l => l.mes)).size} mês(es)`} />
            <Indicador titulo="⚡ Energia" valor={`${fmtN(soma(noPeriodo.filter(l => l.concessionaria === "CELESC"), l => l.consumo))} kWh`} detalhe={fmtR(soma(noPeriodo.filter(l => l.concessionaria === "CELESC"), l => l.valor_total))} />
            <Indicador titulo="💧 Água" valor={`${fmtN(soma(noPeriodo.filter(l => l.concessionaria === "CASAN"), l => l.consumo))} m³`} detalhe={fmtR(soma(noPeriodo.filter(l => l.concessionaria === "CASAN"), l => l.valor_total))} />
            <Indicador titulo="Perdas e penalidades" cor={MACRO[4].cor} valor={fmtR(soma(noPeriodo, perdasDe))} detalhe="inclui mínimo pago sem consumo" />
            <Indicador titulo="Economia possível" valor={fmtR(soma(recs, r => r.economia))} detalhe={`${recs.length} recomendação(ões)`} />
          </div>

          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Conta de energia por {escala === "anos" ? "ano" : "mês"} (R$)</div>
            <Colunas rotulos={resumo.map(r => r.rotulo)} series={MACRO.map(m => ({ nome: m.nome, cor: m.cor, valores: resumo.map(r => r.macro[m.k]) }))} />
          </div>
          <div className={`grid gap-4 ${temAgua ? "lg:grid-cols-2" : ""}`}>
            <div className="space-y-1">
              <div className="text-white font-bold text-sm">Consumo de energia (kWh)</div>
              <Colunas rotulos={resumo.map(r => r.rotulo)} series={[{ nome: "kWh", cor: COR_UNICA, valores: resumo.map(r => r.kwh) }]} formato={v => fmtN(v)} altura={180} />
            </div>
            {temAgua && (
              <div className="space-y-1">
                <div className="text-white font-bold text-sm">Consumo de água (m³)</div>
                <Colunas rotulos={resumo.map(r => r.rotulo)} series={[{ nome: "m³", cor: COR_UNICA, valores: resumo.map(r => r.m3) }]} formato={v => fmtN(v)} altura={180} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Mês a mês por contrato</div>
            <div className="flex flex-wrap items-center gap-2"><span className="w-44 shrink-0" /><RotulosMeses meses={mesesDoPeriodo} /></div>
            {contratos.map(c => {
              const doContrato = todas.filter(l => l.contrato_id === c.contrato_id);
              const comDemanda = doContrato.some(l => l.demanda);
              const contr = comDemanda ? contratadaPorMes(doContrato) : null;
              return (
                <div key={c.contrato_id} className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono text-gray-300 w-44 shrink-0">{c.concessionaria === "CASAN" ? "💧" : "⚡"} {c.codigo}<span className="text-gray-500"> {comDemanda ? "demanda" : "consumo"}</span></span>
                  <div className="flex flex-wrap gap-1">
                    {mesesDoPeriodo.map(m => {
                      const l = doContrato.find(x => x.mes === m);
                      if (!l) return <Celula key={m} cor="#2c2c2a" texto="—" titulo={`${rotuloMes(m)}: sem fatura`} />;
                      if (comDemanda && l.demanda) {
                        const ct = contr!.get(m) || null, f = ct ? faixaDemanda(l.demanda.faturada, ct) : null;
                        return <Celula key={m} cor={f ? COR_FAIXA[f] : "#898781"} texto={ct ? `${Math.round((l.demanda.faturada / ct) * 100)}%` : "?"}
                          titulo={`${rotuloMes(m)}: usou ${fmtN(l.demanda.faturada, 1)} kW de ${ct ? fmtN(ct) : "?"} kW contratados`} />;
                      }
                      const { faixa, r } = faixaConsumoDoMes(l, doContrato);
                      return <Celula key={m} cor={COR_CONSUMO[faixa]} texto={r.var_consumo === null ? rotuloMes(m).substring(0, 3) : `${r.var_consumo > 0 ? "+" : ""}${Math.round(r.var_consumo * 100)}%`}
                        titulo={`${rotuloMes(m)}: ${fmtN(l.consumo)} ${c.concessionaria === "CASAN" ? "m³" : "kWh"}${r.referencia ? ` · comparado com ${r.referencia}` : ""}`} />;
                    })}
                  </div>
                </div>
              );
            })}
            <div className="text-[11px] text-gray-400 space-y-1">
              <div>Demanda (uso ÷ contratada):</div><Legenda itens={LEGENDA_FAIXA} cores={COR_FAIXA} />
              <div className="pt-1">Consumo (comparado com o mesmo mês do ano anterior; sem ele, com a média dos meses anteriores):</div><Legenda itens={LEGENDA_CONSUMO} cores={COR_CONSUMO} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Recomendações</div>
            {recs.length === 0 && <div className="text-xs text-gray-500">Nenhuma perda evitável encontrada no período.</div>}
            {recs.map((r, i) => (
              <div key={i} className="bg-[#141414] border border-white/10 rounded-lg p-3 text-xs">
                <div className="flex justify-between gap-3"><b className="text-white">{r.titulo}</b><span className="font-mono text-emerald-300 whitespace-nowrap">{fmtR(r.economia)}</span></div>
                <div className="text-gray-400">{r.tipo} · ⚡ {r.codigo} — {r.detalhe}</div>
              </div>
            ))}
            <BotaoIA titulo={`Unidade ${l0.unidade_nome} (${rotuloMes(de)} a ${rotuloMes(ate)})`} resumo={() => ({
              unidade: l0.unidade_nome, secretaria: l0.secretaria_nome, endereco: l0.unidade_endereco,
              contratos: contratos.map(c => ({ codigo: c.codigo, concessionaria: c.concessionaria, grupo_tensao: c.grupo_tensao })),
              periodo: { de, ate }, por_periodo: resumo.map(r => ({ periodo: r.rotulo, total: r.total, kwh: r.kwh, m3: r.m3, ...Object.fromEntries(MACRO.map(m => [m.nome, r.macro[m.k]])), credito_solar: r.solar, irpj_retido: r.irpj })),
              demanda_por_mes: noPeriodo.filter(l => l.demanda).map(l => ({ mes: l.mes, codigo: l.codigo, usada_kw: l.demanda!.faturada, ultrapassagem_kw: l.demanda!.ultrapassagem, sem_uso_kw: l.demanda!.sem_uso })),
              perdas_detalhadas: Object.fromEntries([...GRUPOS_PERDA.map(g => [NOME_GRUPO[g], soma(noPeriodo, l => l.grupos?.[g] || 0)]), ["Mínimo pago sem consumo (disponibilidade)", soma(noPeriodo, l => l.disponibilidade?.valor || 0)]]),
              recomendacoes_do_sistema: recs.map(r => ({ titulo: r.titulo, detalhe: r.detalhe, economia_estimada: r.economia })),
            })} />
          </div>

          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Por {escala === "anos" ? "ano" : "mês"} {escala === "meses" && <span className="text-gray-500 font-normal text-xs">— clique num mês para ver os itens da fatura</span>}</div>
            <Tabela<Resumo> nome={`unidade-${l0.unidade_nome}`} linhas={resumo.filter(r => r.total !== 0)} colunas={colunasResumo(escala)} rodape={rodapeResumo(resumo)}
              onLinha={escala === "meses" ? r => setFaturaAberta(f => (f === r.periodo ? null : r.periodo)) : undefined} />
          </div>

          {faturaAberta && (
            <div className="space-y-2">
              <div className="text-white font-bold text-sm">Itens da fatura de energia — {rotuloMes(faturaAberta)}</div>
              {itensFatura === null && <div className="text-xs text-gray-500">Carregando…</div>}
              {itensFatura?.length === 0 && <div className="text-xs text-gray-500">Sem fatura de energia com itens neste mês.</div>}
              {itensFatura?.map(f => (
                <div key={f.codigo} className="space-y-1">
                  <div className="text-[11px] text-gray-400 font-mono">⚡ {f.codigo} · {fmtR(f.valor_total)} · {fmtN(f.consumo)} kWh · {f.dias} dias</div>
                  <Tabela<any> nome={`fatura-${f.codigo}-${faturaAberta}`} linhas={f.itens} colunas={[
                    { titulo: "Item", valor: i => i.descricao },
                    { titulo: "Grupo", valor: i => NOME_GRUPO[i.grupo as Grupo] || i.grupo },
                    { titulo: "Quantidade", valor: i => fmtN(i.quantidade, 3), direita: true, csv: i => i.quantidade },
                    { titulo: "Preço unit.", valor: i => fmtN(i.valor_unitario, 5), direita: true, csv: i => i.valor_unitario },
                    { titulo: "Valor", valor: i => fmtR(i.valor), direita: true, csv: i => i.valor },
                    { titulo: "ICMS", valor: i => fmtR(i.icms || 0), direita: true, csv: i => i.icms || 0 },
                    { titulo: "PIS/COFINS", valor: i => fmtR(i.pis || 0), direita: true, csv: i => i.pis || 0 },
                  ]} rodape={["Total", "", "", "", fmtR(soma(f.itens, (i: any) => i.valor)), fmtR(soma(f.itens, (i: any) => i.icms || 0)), fmtR(soma(f.itens, (i: any) => i.pis || 0))]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
const ABAS = [
  ["geral", "Visão geral"], ["unidades", "Unidades"], ["perdas", "Perdas e penalidades"], ["demanda", "Demanda (alta tensão)"],
  ["tributos", "Tributos"], ["secretarias", "Secretarias"], ["alertas", "Alertas"], ["solar", "Energia solar"],
] as const;
type Aba = typeof ABAS[number][0];

export default function Relatorios({ versao }: { versao: number }) {
  const [base, setBase] = useState<Base | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("geral");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [conc, setConc] = useState<"" | "CELESC" | "CASAN">("");
  const [secretariaId, setSecretariaId] = useState("");
  const [tensao, setTensao] = useState<"" | "A" | "B">("");
  const [busca, setBusca] = useState("");
  const [unidadeAberta, setUnidadeAberta] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/relatorios/base").then(r => r.json()).then((b: Base) => { setBase(b); setErro(""); })
      .catch(() => setErro("Não foi possível carregar os dados dos relatórios."));
  }, [versao]);

  const todas: Linha[] = base?.linhas || [];
  const mesesDisp: string[] = useMemo(() => [...new Set(todas.map(l => l.mes).filter(Boolean))].sort(), [todas]);
  const anos: string[] = useMemo(() => [...new Set(mesesDisp.map(m => m.substring(0, 4)))], [mesesDisp]);
  const ultimo = mesesDisp[mesesDisp.length - 1] || "";
  const deSel = de || mesesDisp.find(m => m.startsWith(ultimo.substring(0, 4))) || "";
  const ateSel = ate || ultimo;
  const periodo: string[] = useMemo(() => (deSel && ateSel ? intervaloMeses(deSel, ateSel) : []), [deSel, ateSel]);

  const filtro = (l: Linha) => (!conc || l.concessionaria === conc) && (!secretariaId || l.secretaria_id === secretariaId) &&
    (!tensao || l.grupo_tensao.startsWith(tensao)) &&
    (!busca || `${l.unidade_nome} ${l.unidade_endereco} ${l.codigo}`.toUpperCase().includes(busca.toUpperCase()));
  const filtradasTodas: Linha[] = useMemo(() => todas.filter(filtro), [todas, conc, secretariaId, tensao, busca]);
  const ls: Linha[] = useMemo(() => filtradasTodas.filter(l => l.mes >= deSel && l.mes <= ateSel), [filtradasTodas, deSel, ateSel]);
  const resumo: Resumo[] = useMemo(() => resumoPorPeriodo(ls, periodo, "meses"), [ls, periodo]);
  const recs: Recomendacao[] = useMemo(() => recomendacoes(ls, todas), [ls, todas]);

  if (erro) return <div className="bg-[#0f0f0f] p-6 rounded-xl border border-rose-500/30 text-rose-300 text-sm">{erro}</div>;
  if (!base) return <div className="bg-[#0f0f0f] p-6 rounded-xl border border-white/10 text-gray-400 text-sm">Carregando relatórios…</div>;

  const e = ls.filter(l => l.concessionaria === "CELESC"), a = ls.filter(l => l.concessionaria === "CASAN");
  const g = (gs: readonly Grupo[], xs: Linha[] = e) => soma(xs, l => valorGrupos(l, gs));
  const sel = "bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white";
  const tituloPeriodo = deSel ? `${rotuloMes(deSel)} a ${rotuloMes(ateSel)}` : "";
  const abrir = (id: string) => setUnidadeAberta(id);

  const filtros = (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">Período</span>
        <select value={deSel} onChange={ev => { setDe(ev.target.value); if (ateSel < ev.target.value) setAte(ev.target.value); }} className={sel}>{mesesDisp.map(m => <option key={m} value={m}>{rotuloMes(m)}</option>)}</select>
        <span className="text-xs text-gray-400">até</span>
        <select value={ateSel} onChange={ev => setAte(ev.target.value)} className={sel}>{mesesDisp.filter(m => m >= deSel).map(m => <option key={m} value={m}>{rotuloMes(m)}</option>)}</select>
        {anos.map(an => (
          <button key={an} type="button" onClick={() => { const ms = mesesDisp.filter(m => m.startsWith(an)); setDe(ms[0]); setAte(ms[ms.length - 1]); }}
            className={`px-2.5 py-1 rounded-md border text-xs ${deSel.startsWith(an) && ateSel.startsWith(an) ? "border-indigo-500 text-white bg-indigo-600/30" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>{an}</button>
        ))}
        <button type="button" onClick={() => { setDe(mesesDisp[Math.max(0, mesesDisp.length - 12)]); setAte(ultimo); }} className="px-2.5 py-1 rounded-md border border-white/10 text-xs text-gray-300 hover:bg-white/5">Últimos 12 meses</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={conc} onChange={ev => setConc(ev.target.value as any)} className={sel}><option value="">Água e energia</option><option value="CELESC">⚡ Só CELESC</option><option value="CASAN">💧 Só CASAN</option></select>
        <select value={secretariaId} onChange={ev => setSecretariaId(ev.target.value)} className={`${sel} max-w-xs`}>
          <option value="">Todas as secretarias</option>
          {base.secretarias.filter(s => todas.some(l => l.secretaria_id === s.id)).sort((x, y) => x.nome.localeCompare(y.nome)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <select value={tensao} onChange={ev => setTensao(ev.target.value as any)} className={sel}><option value="">Alta e baixa tensão</option><option value="A">Só alta tensão (grupo A)</option><option value="B">Só baixa tensão (grupo B)</option></select>
        <input value={busca} onChange={ev => setBusca(ev.target.value)} placeholder="Buscar unidade, endereço ou código…" className="bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white w-64" />
        {(conc || secretariaId || tensao || busca) && <button type="button" onClick={() => { setConc(""); setSecretariaId(""); setTensao(""); setBusca(""); }} className="text-xs text-indigo-300 underline">limpar filtros</button>}
      </div>
    </div>
  );

  let conteudo: React.ReactNode = null;

  if (aba === "geral") {
    const totalPerdas = soma(e, perdasDe);
    conteudo = (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Indicador titulo="Total pago" valor={fmtR(soma(ls, l => l.valor_total))} detalhe={`${ls.length} faturas · ${new Set(ls.map(l => l.unidade_id)).size} unidades`} />
          <Indicador titulo="⚡ CELESC" valor={fmtR(soma(e, l => l.valor_total))} detalhe={`${fmtN(soma(e, l => l.consumo))} kWh`} />
          <Indicador titulo="💧 CASAN" valor={fmtR(soma(a, l => l.valor_total))} detalhe={`${fmtN(soma(a, l => l.consumo))} m³`} />
          <Indicador titulo="Perdas e penalidades" cor={MACRO[4].cor} valor={fmtR(totalPerdas)} detalhe={`inclui ${fmtR(soma(e, l => l.disponibilidade?.valor || 0))} de mínimo pago sem consumo`} />
          {MACRO.filter(m => m.k !== "perdas").map(m => <Indicador key={m.k} titulo={m.nome} cor={m.cor} valor={fmtR(g(m.grupos))} />)}
          <Indicador titulo="Crédito solar" valor={fmtR(g(["solar"]))} detalhe={`${fmtN(soma(e, l => l.energia_injetada))} kWh injetados`} />
          <Indicador titulo="Economia possível" valor={fmtR(soma(recs, r => r.economia))} detalhe={`${recs.length} recomendação(ões) no período`} />
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm">Conta de energia por mês, por grupo de custo (R$)</div>
          <Colunas rotulos={resumo.map(r => r.rotulo)} series={MACRO.map(m => ({ nome: m.nome, cor: m.cor, valores: resumo.map(r => r.macro[m.k]) }))} />
        </div>
        {a.length > 0 && (
          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Conta de água por mês (R$)</div>
            <Colunas rotulos={resumo.map(r => r.rotulo)} series={[{ nome: "Água", cor: COR_UNICA, valores: resumo.map(r => r.agua) }]} altura={180} />
          </div>
        )}
        <div className="space-y-2">
          <div className="text-white font-bold text-sm">Para onde vai o dinheiro da energia</div>
          <Composicao itens={[
            ...MACRO.map(m => ({ nome: m.nome, cor: m.cor, valor: g(m.grupos) })),
            ...DEDUCOES.map(d => ({ nome: NOME_GRUPO[d], valor: g([d]) })),
          ]} />
          <p className="text-[11px] text-gray-500">"Perdas e penalidades" = ultrapassagem de demanda, demanda paga sem uso, energia reativa excedente, multas e juros. Valores negativos reduzem a conta. ICMS e PIS/COFINS estão dentro dos preços — veja a aba Tributos.</p>
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm">Maiores economias possíveis</div>
          <Tabela<Recomendacao> nome={`recomendacoes-${tituloPeriodo}`} linhas={recs.slice(0, 15)} vazio="Nenhuma perda evitável encontrada." onLinha={r => abrir(r.unidade_id)} colunas={[
            { titulo: "Unidade", valor: r => <NomeUnidade nome={r.unidade} endereco={r.endereco} />, csv: r => `${r.unidade} — ${r.endereco}` }, { titulo: "Código", valor: r => r.codigo }, { titulo: "Tipo", valor: r => r.tipo },
            { titulo: "O que fazer", valor: r => r.titulo }, { titulo: "Economia (período)", valor: r => fmtR(r.economia), direita: true, csv: r => r.economia.toFixed(2) },
          ]} />
          <BotaoIA titulo={`Gastos da prefeitura com água e energia (${tituloPeriodo})`} resumo={() => ({
            periodo: tituloPeriodo, filtros: { concessionaria: conc || "todas", secretaria: base.secretarias.find(s => s.id === secretariaId)?.nome || "todas", tensao: tensao || "todas", busca },
            totais: { total: soma(ls, l => l.valor_total), celesc: soma(e, l => l.valor_total), casan: soma(a, l => l.valor_total), kwh: soma(e, l => l.consumo), m3: soma(a, l => l.consumo) },
            energia_por_grupo: { ...Object.fromEntries(MACRO.map(m => [m.nome, g(m.grupos)])), ...Object.fromEntries(DEDUCOES.map(d => [NOME_GRUPO[d], g([d])])) },
            perdas_detalhadas: Object.fromEntries([...GRUPOS_PERDA.map(x => [NOME_GRUPO[x], g([x])]), ["Mínimo pago sem consumo (disponibilidade)", soma(e, l => l.disponibilidade?.valor || 0)]]),
            por_mes: resumo.map(r => ({ mes: r.rotulo, total: r.total, energia_rs: r.energiaTotal, agua_rs: r.agua, kwh: r.kwh, m3: r.m3 })),
            recomendacoes_do_sistema: recs.slice(0, 20).map(r => ({ unidade: r.unidade, codigo: r.codigo, titulo: r.titulo, detalhe: r.detalhe, economia_estimada: r.economia })),
          })} />
        </div>
        <Tabela<Resumo> nome={`resumo-mensal-${tituloPeriodo}`} linhas={resumo} colunas={colunasResumo("meses")} rodape={rodapeResumo(resumo)} />
      </div>
    );
  }

  if (aba === "unidades") {
    const porUnidade = [...new Set(ls.map(l => l.unidade_id))].map(id => {
      const xs = ls.filter(l => l.unidade_id === id);
      const ex = xs.filter(l => l.concessionaria === "CELESC"), ax = xs.filter(l => l.concessionaria === "CASAN");
      return { id, nome: xs[0].unidade_nome, secretaria: xs[0].secretaria_nome, endereco: xs[0].unidade_endereco,
        kwh: soma(ex, l => l.consumo), m3: soma(ax, l => l.consumo), energia: soma(ex, l => l.valor_total), agua: soma(ax, l => l.valor_total),
        total: soma(xs, l => l.valor_total), perdas: soma(ex, perdasDe), infra: soma(ex, l => l.grupos?.infraestrutura || 0), meses: new Set(xs.map(l => l.mes)).size };
    });
    type U = typeof porUnidade[number];
    conteudo = (
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500">Clique numa unidade para abrir os dados dela (mês a mês ou por ano, gráfico, cores de demanda/consumo, recomendações e itens da fatura). Clique no título da coluna para ordenar.</p>
        <Tabela<U> nome={`unidades-${tituloPeriodo}`} linhas={porUnidade} onLinha={u => abrir(u.id)} ordemInicial={{ coluna: "Total", desc: true }} colunas={[
          { titulo: "Unidade Gestora", valor: u => <NomeUnidade nome={u.nome} endereco={u.endereco} />, csv: u => `${u.nome} — ${u.endereco}`, ordem: u => `${u.nome} ${u.endereco}` },
          { titulo: "Secretaria", valor: u => u.secretaria, ordem: u => u.secretaria },
          { titulo: "kWh", valor: u => fmtN(u.kwh), direita: true, csv: u => u.kwh, ordem: u => u.kwh },
          { titulo: "Energia R$", valor: u => fmtR(u.energia), direita: true, csv: u => u.energia.toFixed(2), ordem: u => u.energia },
          { titulo: "m³", valor: u => fmtN(u.m3), direita: true, csv: u => u.m3, ordem: u => u.m3 },
          { titulo: "Água R$", valor: u => fmtR(u.agua), direita: true, csv: u => u.agua.toFixed(2), ordem: u => u.agua },
          { titulo: "Perdas R$", valor: u => (u.perdas > 0 ? <span className="text-rose-300">{fmtR(u.perdas)}</span> : "—"), direita: true, csv: u => u.perdas.toFixed(2), ordem: u => u.perdas },
          { titulo: "Infraestrutura R$", valor: u => (u.infra ? fmtR(u.infra) : "—"), direita: true, csv: u => u.infra.toFixed(2), ordem: u => u.infra },
          { titulo: "Total", valor: u => <b className="text-white">{fmtR(u.total)}</b>, direita: true, csv: u => u.total.toFixed(2), ordem: u => u.total },
        ]} rodape={[`${porUnidade.length} unidades`, "", fmtN(soma(porUnidade, u => u.kwh)), fmtR(soma(porUnidade, u => u.energia)), fmtN(soma(porUnidade, u => u.m3)), fmtR(soma(porUnidade, u => u.agua)), fmtR(soma(porUnidade, u => u.perdas)), fmtR(soma(porUnidade, u => u.infra)), fmtR(soma(porUnidade, u => u.total))]} />
      </div>
    );
  }

  if (aba === "perdas") {
    const tipos: { k: string; nome: string; acao: string; valor: (l: Linha) => number }[] = [
      { k: "ultrapassagem", nome: "Ultrapassagem de demanda", acao: "Usou mais que a demanda contratada (paga cerca de 2× nessa parte): aumentar a contratada.", valor: l => l.grupos?.ultrapassagem || 0 },
      { k: "demanda_sem_uso", nome: "Demanda paga sem uso", acao: "Demanda contratada maior que a usada: reduzir a contratada.", valor: l => l.grupos?.demanda_sem_uso || 0 },
      { k: "reativo", nome: "Energia reativa excedente", acao: "Fator de potência abaixo de 0,92 (energia defasada devolvida à rede): banco de capacitores.", valor: l => l.grupos?.reativo || 0 },
      { k: "disponibilidade", nome: "Mínimo pago sem consumo", acao: "Consumo abaixo do mínimo de 30/50/100 kWh: avaliar desligar ligações ociosas. (Estimativa: kWh pagos e não usados × preço.)", valor: l => l.disponibilidade?.valor || 0 },
      { k: "multas_juros", nome: "Multas e juros", acao: "Atraso no pagamento.", valor: l => l.grupos?.multas_juros || 0 },
    ];
    conteudo = (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {tipos.map(t => <Indicador key={t.k} titulo={t.nome} valor={fmtR(soma(e, t.valor))} detalhe={`${new Set(e.filter(l => t.valor(l) > 0.004).map(l => l.contrato_id)).size} UC(s)`} />)}
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm">Perdas e penalidades por mês (R$)</div>
          <Colunas rotulos={resumo.map(r => r.rotulo)} series={tipos.map((t, i) => ({ nome: t.nome, cor: MACRO[i].cor, valores: periodo.map(m => soma(e.filter(l => l.mes === m), t.valor)) }))} />
        </div>
        {tipos.map(t => {
          const porContrato = [...new Set(e.filter(l => t.valor(l) > 0.004).map(l => l.contrato_id))].map(id => {
            const xs = e.filter(l => l.contrato_id === id);
            return { id: xs[0].unidade_id, unidade: xs[0].unidade_nome, endereco: xs[0].unidade_endereco, secretaria: xs[0].secretaria_nome, codigo: xs[0].codigo, valor: soma(xs, t.valor), meses: xs.filter(l => t.valor(l) > 0.004).length };
          });
          type P = typeof porContrato[number];
          return (
            <div key={t.k} className="space-y-1">
              <div className="text-white font-bold text-sm">{t.nome} — {fmtR(soma(porContrato, p => p.valor))}</div>
              <p className="text-[11px] text-gray-500">{t.acao}</p>
              <Tabela<P> nome={`perdas-${t.k}-${tituloPeriodo}`} linhas={porContrato} onLinha={p => abrir(p.id)} ordemInicial={{ coluna: "R$", desc: true }} vazio="Nenhuma no período." colunas={[
                { titulo: "Unidade", valor: p => <NomeUnidade nome={p.unidade} endereco={p.endereco} />, csv: p => `${p.unidade} — ${p.endereco}`, ordem: p => `${p.unidade} ${p.endereco}` }, { titulo: "Secretaria", valor: p => p.secretaria, ordem: p => p.secretaria },
                { titulo: "Código", valor: p => p.codigo }, { titulo: "Meses", valor: p => p.meses, direita: true, ordem: p => p.meses },
                { titulo: "R$", valor: p => fmtR(p.valor), direita: true, csv: p => p.valor.toFixed(2), ordem: p => p.valor },
              ]} rodape={["Total", "", "", "", fmtR(soma(porContrato, p => p.valor))]} />
            </div>
          );
        })}
      </div>
    );
  }

  if (aba === "demanda") {
    const contratos = [...new Set(e.filter(l => l.demanda).map(l => l.contrato_id))].map(id => {
      const doContrato = todas.filter(l => l.contrato_id === id);
      const noPer = doContrato.filter(l => l.mes >= deSel && l.mes <= ateSel && l.demanda);
      const contr = contratadaPorMes(doContrato);
      const atual = contr.get(noPer[noPer.length - 1]?.mes || "") || null;
      const sim = atual ? simularDemandaIdeal(noPer.map(l => ({ usada: l.demanda!.faturada, preco_kw: l.demanda!.preco_kw, preco_ultrapassagem_kw: l.demanda!.preco_ultrapassagem_kw })), atual) : null;
      return { id: doContrato[0].unidade_id, unidade: doContrato[0].unidade_nome, endereco: doContrato[0].unidade_endereco, codigo: doContrato[0].codigo, doContrato, contr, atual, sim,
        perdas: soma(noPer, l => (l.grupos?.ultrapassagem || 0) + (l.grupos?.demanda_sem_uso || 0)) };
    }).sort((x, y) => y.perdas - x.perdas);
    conteudo = (
      <div className="space-y-4">
        <p className="text-[11px] text-gray-500">Só UCs de alta tensão (grupo A) têm demanda contratada. A fatura não imprime a contratada: ela é calculada das linhas de ultrapassagem ou de "Diferença da Demanda Contratada". Cada quadrado mostra o uso do mês ÷ contratada.</p>
        <Legenda itens={LEGENDA_FAIXA} cores={COR_FAIXA} />
        <div className="overflow-x-auto border border-white/10 rounded-lg">
          <table className="w-full text-xs text-gray-300">
            <thead className="bg-black/40 text-gray-400 text-[10px] uppercase font-mono">
              <tr><th className="px-3 py-2 text-left">Unidade</th><th className="px-3 py-2 text-right">Contratada</th><th className="px-3 py-2 text-left"><div>Uso ÷ contratada, mês a mês</div><RotulosMeses meses={periodo} /></th><th className="px-3 py-2 text-right">Maior uso</th><th className="px-3 py-2 text-right">Sugerida</th><th className="px-3 py-2 text-right">Perdas no período</th><th className="px-3 py-2 text-right">Economia estimada</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {contratos.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-gray-500">Nenhuma UC de alta tensão no filtro.</td></tr>}
              {contratos.map(c => (
                <tr key={c.codigo} className="hover:bg-white/5 cursor-pointer" onClick={() => abrir(c.id)}>
                  <td className="px-3 py-1.5"><NomeUnidade nome={c.unidade} endereco={c.endereco} /><div className="text-[10px] font-mono text-gray-500">⚡ {c.codigo}</div></td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.atual ? `${fmtN(c.atual)} kW` : "?"}</td>
                  <td className="px-3 py-1.5"><div className="flex flex-wrap gap-1">
                    {periodo.map(m => {
                      const l = c.doContrato.find(x => x.mes === m);
                      if (!l?.demanda) return <Celula key={m} cor="#2c2c2a" texto="—" titulo={`${rotuloMes(m)}: sem fatura`} />;
                      const ct = c.contr.get(m) || null, f = ct ? faixaDemanda(l.demanda.faturada, ct) : null;
                      return <Celula key={m} cor={f ? COR_FAIXA[f] : "#898781"} texto={ct ? `${Math.round((l.demanda.faturada / ct) * 100)}%` : "?"} titulo={`${rotuloMes(m)}: usou ${fmtN(l.demanda.faturada, 1)} kW de ${ct ? fmtN(ct) : "?"} kW`} />;
                    })}
                  </div></td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.sim ? `${fmtN(c.sim.maior_uso, 1)} kW` : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.sim && c.sim.sugerida !== c.sim.contratada_atual ? `${fmtN(c.sim.sugerida)} kW` : "manter"}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-rose-300">{fmtR(c.perdas)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-emerald-300">{c.sim && c.sim.economia > 0 ? fmtR(c.sim.economia) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500">Sugerida: a demanda que teria custado menos nos meses do período (mínimo 30 kW), considerando que acima de 105% paga-se a ultrapassagem. É uma estimativa; a alteração segue regras e prazos da CELESC.</p>
      </div>
    );
  }

  if (aba === "tributos") {
    const t = (k: keyof TributosFatura, xs: Linha[]) => soma(xs, l => l.tributos?.[k] || 0);
    const linhasT = periodo.map(m => { const xs = e.filter(l => l.mes === m); return { mes: m, icms: t("icms", xs), pc: t("pis_cofins", xs), cosip: t("cosip", xs), irpj: t("irpj_retido", xs), pis: t("pis_retido", xs), cofins: t("cofins_retido", xs), csll: t("csll_retido", xs), conta: soma(xs, l => l.valor_total) }; });
    type T = typeof linhasT[number];
    conteudo = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Indicador titulo="ICMS" valor={fmtR(t("icms", e))} detalhe="embutido no preço da energia" />
          <Indicador titulo="PIS/COFINS" valor={fmtR(t("pis_cofins", e))} detalhe="embutido no preço da energia" />
          <Indicador titulo="COSIP (iluminação pública)" valor={fmtR(t("cosip", e))} detalhe="cobrada como item da fatura" />
          <Indicador titulo="IRPJ retido" valor={fmtR(t("irpj_retido", e))} detalhe="retido pela prefeitura; abate do pagamento" />
        </div>
        <Tabela<T> nome={`tributos-${tituloPeriodo}`} linhas={linhasT} colunas={[
          { titulo: "Mês", valor: r => rotuloMes(r.mes) },
          { titulo: "ICMS (embutido)", valor: r => fmtR(r.icms), direita: true, csv: r => r.icms.toFixed(2) },
          { titulo: "PIS/COFINS (embutido)", valor: r => fmtR(r.pc), direita: true, csv: r => r.pc.toFixed(2) },
          { titulo: "COSIP", valor: r => fmtR(r.cosip), direita: true, csv: r => r.cosip.toFixed(2) },
          { titulo: "IRPJ retido", valor: r => fmtR(r.irpj), direita: true, csv: r => r.irpj.toFixed(2) },
          { titulo: "PIS retido", valor: r => fmtR(r.pis), direita: true, csv: r => r.pis.toFixed(2) },
          { titulo: "COFINS retido", valor: r => fmtR(r.cofins), direita: true, csv: r => r.cofins.toFixed(2) },
          { titulo: "CSLL retido", valor: r => fmtR(r.csll), direita: true, csv: r => r.csll.toFixed(2) },
          { titulo: "Conta de energia", valor: r => fmtR(r.conta), direita: true, csv: r => r.conta.toFixed(2) },
        ]} rodape={["Total", fmtR(soma(linhasT, r => r.icms)), fmtR(soma(linhasT, r => r.pc)), fmtR(soma(linhasT, r => r.cosip)), fmtR(soma(linhasT, r => r.irpj)), fmtR(soma(linhasT, r => r.pis)), fmtR(soma(linhasT, r => r.cofins)), fmtR(soma(linhasT, r => r.csll)), fmtR(soma(linhasT, r => r.conta))]} />
        <p className="text-[11px] text-gray-500">ICMS e PIS/COFINS vêm dentro do "preço unitário com tributos" de cada item — já estão somados nos grupos de custo, aqui aparecem só para conhecimento. COSIP e IRPJ retido são linhas próprias da fatura. Só faturas CELESC lidas com itens.</p>
      </div>
    );
  }

  if (aba === "secretarias") {
    const total = soma(ls, l => l.valor_total);
    const porSec = [...new Set(ls.map(l => l.secretaria_id))].map(id => {
      const xs = ls.filter(l => l.secretaria_id === id), ex = xs.filter(l => l.concessionaria === "CELESC"), ax = xs.filter(l => l.concessionaria === "CASAN");
      return { id, nome: xs[0].secretaria_nome, unidades: new Set(xs.map(l => l.unidade_id)).size, kwh: soma(ex, l => l.consumo), energia: soma(ex, l => l.valor_total), m3: soma(ax, l => l.consumo), agua: soma(ax, l => l.valor_total), perdas: soma(ex, perdasDe), total: soma(xs, l => l.valor_total) };
    });
    type S = typeof porSec[number];
    conteudo = (
      <div className="space-y-4">
        <Composicao itens={[...porSec].sort((x, y) => y.total - x.total).map(s => ({ nome: s.nome, valor: s.total }))} />
        <Tabela<S> nome={`secretarias-${tituloPeriodo}`} linhas={porSec} ordemInicial={{ coluna: "Total", desc: true }} onLinha={s => { setSecretariaId(s.id); setAba("unidades"); }} colunas={[
          { titulo: "Secretaria", valor: s => <span className="text-white">{s.nome}</span>, csv: s => s.nome, ordem: s => s.nome },
          { titulo: "Unidades", valor: s => s.unidades, direita: true, ordem: s => s.unidades },
          { titulo: "kWh", valor: s => fmtN(s.kwh), direita: true, csv: s => s.kwh, ordem: s => s.kwh },
          { titulo: "Energia R$", valor: s => fmtR(s.energia), direita: true, csv: s => s.energia.toFixed(2), ordem: s => s.energia },
          { titulo: "m³", valor: s => fmtN(s.m3), direita: true, csv: s => s.m3, ordem: s => s.m3 },
          { titulo: "Água R$", valor: s => fmtR(s.agua), direita: true, csv: s => s.agua.toFixed(2), ordem: s => s.agua },
          { titulo: "Perdas R$", valor: s => fmtR(s.perdas), direita: true, csv: s => s.perdas.toFixed(2), ordem: s => s.perdas },
          { titulo: "Total", valor: s => <b className="text-white">{fmtR(s.total)}</b>, direita: true, csv: s => s.total.toFixed(2), ordem: s => s.total },
          { titulo: "% do total", valor: s => `${fmtN(total ? (s.total / total) * 100 : 0, 1)}%`, direita: true, ordem: s => s.total },
        ]} rodape={["Total", soma(porSec, s => s.unidades), fmtN(soma(porSec, s => s.kwh)), fmtR(soma(porSec, s => s.energia)), fmtN(soma(porSec, s => s.m3)), fmtR(soma(porSec, s => s.agua)), fmtR(soma(porSec, s => s.perdas)), fmtR(total), "100%"]} />
        <p className="text-[11px] text-gray-500">Clique numa secretaria para ver a lista das unidades dela.</p>
      </div>
    );
  }

  if (aba === "alertas") {
    const mes = ateSel;
    const doMes = ls.filter(l => l.mes === mes);
    const avaliados = doMes.map(l => ({ l, ...faixaConsumoDoMes(l, todas.filter(h => h.contrato_id === l.contrato_id)) })).filter(x => x.r.alerta)
      .sort((x, y) => (x.r.alerta === "queda" ? 1 : 0) - (y.r.alerta === "queda" ? 1 : 0) || Math.abs(y.r.impacto_valor) - Math.abs(x.r.impacto_valor));
    type A = typeof avaliados[number];
    const anterior = intervaloMeses(mesesDisp[0] || mes, mes).slice(-2)[0];
    const contratosNoMes = new Set(doMes.map(l => l.contrato_id));
    const faltando = filtradasTodas.filter(l => l.mes === anterior && anterior !== mes && !contratosNoMes.has(l.contrato_id));
    const un = (l: Linha) => (l.concessionaria === "CASAN" ? "m³" : "kWh");
    conteudo = (
      <div className="space-y-5">
        <div className="text-xs text-gray-400">Mês analisado: <b className="text-white">{rotuloMes(mes)}</b> (o último mês do período escolhido).</div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Variação acima de 20% ({avaliados.length})</div>
          <p className="text-[11px] text-gray-500">Comparado com o mesmo mês do ano anterior; sem ele, com a média dos meses anteriores. Consumo levado a 30 dias; só entra com diferença de pelo menos 100 kWh / 5 m³ (ou R$ 100 no valor). Na água, um salto pode ser vazamento.</p>
          <Tabela<A> nome={`alertas-variacao-${mes}`} linhas={avaliados} onLinha={x => abrir(x.l.unidade_id)} vazio="Nenhuma variação fora do normal neste mês." colunas={[
            { titulo: "Unidade", valor: x => <NomeUnidade nome={x.l.unidade_nome} endereco={x.l.unidade_endereco} />, csv: x => `${x.l.unidade_nome} — ${x.l.unidade_endereco}` }, { titulo: "Código", valor: x => `${x.l.concessionaria === "CASAN" ? "💧" : "⚡"} ${x.l.codigo}` },
            { titulo: "Alerta", valor: x => <span className={x.r.alerta === "queda" ? "text-sky-300" : "text-rose-300"}>{TEXTO_ALERTA[x.r.alerta!]}</span>, csv: x => TEXTO_ALERTA[x.r.alerta!] },
            { titulo: "Consumo", valor: x => `${fmtN(x.l.consumo)} ${un(x.l)}`, direita: true, csv: x => x.l.consumo },
            { titulo: "Normal (30 dias)", valor: x => `${fmtN(x.r.ref_consumo_30d || 0)} ${un(x.l)}`, direita: true, csv: x => x.r.ref_consumo_30d || 0 },
            { titulo: "Var. consumo", valor: x => fmtPct(x.r.var_consumo), direita: true },
            { titulo: "Var. valor", valor: x => fmtPct(x.r.var_valor), direita: true },
            { titulo: "Impacto R$", valor: x => fmtR(x.r.impacto_valor), direita: true, csv: x => x.r.impacto_valor.toFixed(2) },
            { titulo: "Comparado com", valor: x => x.r.referencia },
          ]} />
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Faturado em {rotuloMes(anterior)} e sem fatura em {rotuloMes(mes)} ({faltando.length})</div>
          <p className="text-[11px] text-gray-500">Fatura não importada, contrato encerrado ou cobrança em outra conta.</p>
          <Tabela<Linha> nome={`alertas-faltando-${mes}`} linhas={faltando} onLinha={l => abrir(l.unidade_id)} vazio="Nenhuma fatura faltando." colunas={[
            { titulo: "Unidade", valor: l => <NomeUnidade nome={l.unidade_nome} endereco={l.unidade_endereco} />, csv: l => `${l.unidade_nome} — ${l.unidade_endereco}` }, { titulo: "Código", valor: l => `${l.concessionaria === "CASAN" ? "💧" : "⚡"} ${l.codigo}` },
            { titulo: "Valor no mês anterior", valor: l => fmtR(l.valor_total), direita: true, csv: l => l.valor_total.toFixed(2) },
          ]} />
        </div>
      </div>
    );
  }

  if (aba === "solar") {
    const comInjecao = e.filter(l => l.energia_injetada > 0 || (l.grupos?.solar || 0) !== 0);
    const porUnidade = [...new Set(comInjecao.map(l => l.unidade_id))].map(id => {
      const xs = comInjecao.filter(l => l.unidade_id === id);
      return { id, nome: xs[0].unidade_nome, endereco: xs[0].unidade_endereco, kwh: soma(xs, l => l.energia_injetada), credito: -soma(xs, l => l.grupos?.solar || 0), fiob: soma(xs, l => (l.grupos?.infraestrutura || 0)), meses: new Set(xs.map(l => l.mes)).size };
    });
    type So = typeof porUnidade[number];
    conteudo = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Indicador titulo="Energia injetada" valor={`${fmtN(soma(porUnidade, u => u.kwh))} kWh`} />
          <Indicador titulo="Crédito na fatura" valor={fmtR(soma(porUnidade, u => u.credito))} detalhe="itens de energia injetada" />
          <Indicador titulo="Unidades com geração" valor={String(porUnidade.length)} />
        </div>
        <div className="text-white font-bold text-sm">Crédito solar por mês (R$)</div>
        <Colunas rotulos={resumo.map(r => r.rotulo)} series={[{ nome: "Crédito solar", cor: COR_UNICA, valores: resumo.map(r => -r.solar) }]} altura={180} />
        <Tabela<So> nome={`solar-${tituloPeriodo}`} linhas={porUnidade} onLinha={u => abrir(u.id)} ordemInicial={{ coluna: "Crédito R$", desc: true }} vazio="Nenhuma energia injetada no período." colunas={[
          { titulo: "Unidade", valor: u => <NomeUnidade nome={u.nome} endereco={u.endereco} />, csv: u => `${u.nome} — ${u.endereco}`, ordem: u => `${u.nome} ${u.endereco}` },
          { titulo: "Injetada kWh", valor: u => fmtN(u.kwh), direita: true, csv: u => u.kwh, ordem: u => u.kwh },
          { titulo: "Crédito R$", valor: u => fmtR(u.credito), direita: true, csv: u => u.credito.toFixed(2), ordem: u => u.credito },
          { titulo: "Meses com injeção", valor: u => u.meses, direita: true, ordem: u => u.meses },
        ]} rodape={["Total", fmtN(soma(porUnidade, u => u.kwh)), fmtR(soma(porUnidade, u => u.credito)), ""]} />
      </div>
    );
  }

  const naoClassificados = [...new Set(ls.flatMap(l => l.nao_classificados))];
  return (
    <div className="bg-[#0f0f0f] p-6 rounded-xl border border-white/10 shadow-lg space-y-4 w-full" id="relatorios">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-3">
        <h4 className="font-bold text-white text-xl">Relatórios</h4>
        <span className="text-[11px] text-gray-500">{ls.length} faturas no filtro · {tituloPeriodo}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex flex-wrap gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
          {ABAS.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setAba(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${aba === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{t}</button>
          ))}
        </div>
        <button type="button" onClick={() => imprimir(`SisPu.JP — ${ABAS.find(([k]) => k === aba)?.[1]} ${tituloPeriodo}`, "relatorios-conteudo")} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-xs">
          <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
        </button>
      </div>
      {filtros}
      {naoClassificados.length > 0 && (
        <div className="text-[11px] text-amber-300 bg-amber-500/5 border border-amber-500/30 rounded-lg p-2">⚠️ Itens de fatura que o sistema ainda não sabe classificar (entram em "Outros"): {naoClassificados.join(", ")}</div>
      )}
      <div id="relatorios-conteudo" className="space-y-4">
        <div className="hidden print-titulo text-sm font-bold">{ABAS.find(([k]) => k === aba)?.[1]} — {tituloPeriodo}</div>
        {conteudo}
      </div>
      {unidadeAberta && <PainelUnidade unidadeId={unidadeAberta} todas={todas} deInicial={deSel} ateInicial={ateSel} onClose={() => setUnidadeAberta(null)} />}
    </div>
  );
}
