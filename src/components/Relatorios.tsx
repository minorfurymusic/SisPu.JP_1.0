import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Download, Printer, Sparkles, X, SlidersHorizontal } from "lucide-react";
import { Grupo, GRUPOS_PERDA, NOME_GRUPO, TributosFatura, DemandaDoMes, FaixaDemanda, faixaDemanda, simularDemandaIdeal } from "../utils/analiseCelesc";
import { compararComHistorico, TEXTO_ALERTA, ResultadoVariacao, Comparacao } from "../utils/variacao";
import GraficoComparativo from "./GraficoComparativo";
import { PREMISSAS, Contrato12, agregarContratos, precoMedioB, candidatosSolar, candidatosCapacitor, candidatosBOptante, mercadoLivre, CandidatoSolar, CandidatoCapacitor, CandidatoBOptante } from "../utils/oportunidades";

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
// Nome genérico ("MUNICIPIO DE RIO DO SUL") não diz qual é o lugar: aí o endereço vira o título.
const NOME_GENERICO = /^(MUNIC[IÍ]PIO|PREFEITURA MUNICIPAL) DE RIO DO SUL$|^PMRS$/i;
const nomeDaUnidade = (nome: string, endereco: string) => (NOME_GENERICO.test((nome || "").trim()) && endereco ? endereco : nome);
const NomeUnidade = ({ nome, endereco }: { nome: string; endereco: string }) => {
  const generico = NOME_GENERICO.test((nome || "").trim()) && !!endereco;
  return (
    <div className="min-w-[11rem]">
      <div className="text-white">{generico ? endereco : nome}</div>
      {generico ? <div className="text-[10px] text-amber-500/80">nome da unidade a cadastrar</div> : endereco && <div className="text-[10px] text-gray-500">{endereco}</div>}
    </div>
  );
};
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

// Uma das duas comparações do alerta (mês anterior / mesmo mês do ano anterior).
function textoComparacao(c: Comparacao | null, un: string): string {
  if (!c) return "sem fatura para comparar";
  const vc = c.var_consumo === null ? (c.ref_consumo_30d === 0 ? "saiu do zero" : "—") : fmtPct(c.var_consumo);
  return `${vc} no consumo (era ${fmtN(c.ref_consumo_30d)} ${un}), ${fmtPct(c.var_valor)} no valor (era ${fmtR(c.ref_valor_30d)})`;
}
function CelulaComparacao({ c, un }: { c: Comparacao | null; un: string; key?: string }) {
  if (!c) return <span className="text-gray-600 text-[11px]">sem fatura</span>;
  const cor = c.alerta === "queda" || c.alerta === "zerado" ? "text-sky-300" : c.alerta ? "text-rose-300" : "text-gray-400";
  const vc = c.var_consumo === null ? (c.ref_consumo_30d === 0 ? "saiu do zero" : "—") : fmtPct(c.var_consumo);
  return (
    <div className="text-right whitespace-nowrap">
      <div className={`font-mono ${cor}`}>{vc} <span className="text-[10px] text-gray-500">consumo</span></div>
      <div className={`font-mono text-[11px] ${c.alerta === "valor" ? "text-rose-300" : "text-gray-400"}`}>{fmtPct(c.var_valor)} <span className="text-[10px] text-gray-500">valor</span></div>
      <div className="text-[10px] text-gray-600">era {fmtN(c.ref_consumo_30d)} {un} · {fmtR(c.ref_valor_30d)}</div>
      {/^último/.test(c.referencia) && <div className="text-[10px] text-amber-500/80">{c.referencia}</div>}
    </div>
  );
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
          detalhe: (() => {
            const usos = comDemanda.map(l => l.demanda!.faturada);
            const acima = usos.filter(u => u > sim.sugerida * 1.05).length;
            const tipico = [...usos].sort((x, y) => x - y)[Math.floor(usos.length / 2)];
            return `Uso típico ${fmtN(tipico, 1)} kW, maior uso ${fmtN(sim.maior_uso, 1)} kW (${sim.meses} meses). ` +
              `Com ${fmtN(sim.sugerida)} kW, ${acima ? `em ${acima} mês(es) haveria ultrapassagem (já incluída na conta) e ` : ""}` +
              `esses meses teriam custado ${fmtR(sim.custo_sugerido)} em demanda, em vez de ${fmtR(sim.custo_atual)}. A mudança segue regras e prazos da CELESC.`;
          })() });
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
      {/* Celular: cada linha vira um cartão (1ª coluna como título, o resto em pares rótulo/valor). */}
      <div className="md:hidden space-y-2">
        {linhas.length === 0 && <div className="text-xs text-gray-500 border border-white/10 rounded-lg p-3">{vazio}</div>}
        {ordenadas.map((l, i) => (
          <div key={i} onClick={() => onLinha?.(l)} className={`bg-[#141414] border border-white/10 rounded-lg p-3 text-xs ${onLinha ? "cursor-pointer active:bg-white/5" : ""}`}>
            <div className="mb-2">{colunas[0].valor(l)}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {colunas.slice(1).map(c => (
                <div key={c.titulo} className="min-w-0">
                  <div className="text-[9px] uppercase tracking-wider text-gray-500">{c.titulo}</div>
                  <div className="text-gray-200 font-mono tabular-nums break-words">{c.valor(l)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:block overflow-x-auto border border-white/10 rounded-lg">
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
function Composicao({ itens }: { itens: { nome: string; cor?: string; valor: number; variacao?: number | null }[] }) {
  const pos = soma(itens.filter(i => i.valor > 0), i => i.valor);
  const max = Math.max(1, ...itens.map(i => Math.abs(i.valor)));
  return (
    <div className="space-y-1.5">
      {itens.filter(i => Math.abs(i.valor) >= 0.005).map(i => (
        <div key={i.nome} className="grid grid-cols-[minmax(0,14rem)_1fr_auto_auto] items-center gap-3 text-xs">
          <span className="text-gray-300 truncate flex items-center gap-1.5">{i.cor && <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: i.cor }} />}{i.nome}</span>
          <div className="h-3 bg-white/5 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${(Math.abs(i.valor) / max) * 100}%`, background: i.valor < 0 ? "#383835" : i.cor || COR_UNICA }} />
          </div>
          <span className="font-mono tabular-nums text-gray-200 text-right w-44">{fmtR(i.valor)} <span className="text-gray-500">{i.valor > 0 && pos ? `${fmtN((i.valor / pos) * 100, 1)}%` : ""}</span></span>
          <span className={`font-mono tabular-nums text-right w-24 font-bold ${i.variacao === undefined ? "hidden" : i.variacao === null ? "text-gray-600" : i.variacao > 0 ? "text-rose-300" : "text-emerald-300"}`}>
            {i.variacao === null || i.variacao === undefined ? "—" : i.variacao > 3 ? "▲ > 300%" : `${i.variacao > 0 ? "▲" : "▼"} ${fmtPct(i.variacao).replace("+", "")}`}
          </span>
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
// "O que fazer": cada ação vira um cartão com andamento (status, responsável, anotação) gravado
// no banco. O id da ação é estável (tipo + contrato, e o mês nos alertas), então o andamento
// continua com a ação nos meses seguintes.
type StatusAcao = "novo" | "em_andamento" | "resolvido" | "descartado";
type Acompanhamento = { id: string; status: StatusAcao; responsavel?: string; prazo?: string; observacao?: string; atualizado_em?: string; usuario?: string };
const STATUS_ACAO: [StatusAcao, string, string][] = [
  ["novo", "Novo", "#fab219"], ["em_andamento", "Em andamento", "#3987e5"], ["resolvido", "Resolvido", "#0ca30c"], ["descartado", "Descartado", "#898781"],
];
const fechada = (s?: StatusAcao) => s === "resolvido" || s === "descartado";

type Acao = {
  id: string; quando: "agora" | "economia"; tipo: string; unidade_id?: string; contrato_id?: string; mes?: string;
  unidade: string; endereco: string; codigo: string; titulo: string; detalhe: string; valor: number; rotulo_valor: string;
  investimento?: number; // obra que precisa de verba (usina solar); o resto é pedido, ajuste ou serviço pequeno
};

function SeletorStatus({ status, onChange }: { status: StatusAcao; onChange: (s: StatusAcao) => void }) {
  const cor = STATUS_ACAO.find(x => x[0] === status)![2];
  return (
    <span className="inline-flex items-center gap-1.5" onClick={ev => ev.stopPropagation()}>
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cor }} />
      <select value={status} onChange={ev => onChange(ev.target.value as StatusAcao)} className="rounded-md px-2 py-1 text-[11px] font-bold">
        {STATUS_ACAO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
    </span>
  );
}

function CartaoAcao({ a, acomp, onSalvar, onAbrir }: {
  a: Acao; acomp?: Acompanhamento; onSalvar: (a: Acao, patch: Partial<Acompanhamento>) => void; onAbrir: () => void; key?: string;
}) {
  const [resp, setResp] = useState(acomp?.responsavel || "");
  const [obs, setObs] = useState(acomp?.observacao || "");
  useEffect(() => { setResp(acomp?.responsavel || ""); setObs(acomp?.observacao || ""); }, [acomp?.responsavel, acomp?.observacao]);
  const status = acomp?.status || "novo";
  const campo = "bg-[#141414] border border-white/10 rounded-md px-2 py-1 text-[11px] text-white placeholder:text-gray-600";
  return (
    <div className={`bg-[#141414] border rounded-xl p-4 flex flex-col gap-2 ${fechada(status) ? "border-white/5 opacity-60" : "border-white/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-gray-400">
            <span className="px-1.5 py-0.5 rounded border border-white/15">{a.tipo}</span>{a.mes && <span>{rotuloMes(a.mes)}</span>}
          </div>
          <div className="text-white font-bold text-sm mt-1.5 leading-snug">{a.titulo}</div>
          {a.unidade && (
            <button type="button" onClick={onAbrir} className="text-left mt-1 text-xs hover:underline">
              <NomeUnidade nome={a.unidade} endereco={a.endereco} />
              {a.codigo && <div className="text-[10px] font-mono text-gray-500">{a.codigo}</div>}
            </button>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-bold font-mono tabular-nums ${a.quando === "agora" ? "text-rose-300" : "text-emerald-300"}`}>{fmtR(a.valor)}</div>
          <div className="text-[10px] text-gray-500">{a.rotulo_valor}</div>
          {a.investimento ? <div className="text-[10px] text-amber-400/90">investimento {fmtR(a.investimento)}</div> : null}
        </div>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{a.detalhe}</p>
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 print:hidden">
        <SeletorStatus status={status} onChange={s => onSalvar(a, { status: s })} />
        <input value={resp} onChange={ev => setResp(ev.target.value)} onBlur={() => resp !== (acomp?.responsavel || "") && onSalvar(a, { responsavel: resp })}
          placeholder="Responsável" className={`${campo} w-36`} />
        <input value={obs} onChange={ev => setObs(ev.target.value)} onBlur={() => obs !== (acomp?.observacao || "") && onSalvar(a, { observacao: obs })}
          placeholder="Anotação (ex.: vistoria marcada para 10/10)" className={`${campo} flex-1 min-w-[12rem]`} />
      </div>
      {acomp?.atualizado_em && <div className="text-[10px] text-gray-600">Atualizado em {new Date(acomp.atualizado_em).toLocaleDateString("pt-BR")}{acomp.usuario ? ` por ${acomp.usuario}` : ""}</div>}
    </div>
  );
}

// Indicador grande com a variação contra os mesmos meses do ano anterior.
function Kpi({ titulo, valor, detalhe, variacao, comparado }: { titulo: string; valor: string; detalhe?: React.ReactNode; variacao?: number | null; comparado?: string; key?: string }) {
  const sobe = (variacao ?? 0) > 0;
  return (
    <div className="bg-[#141414] border border-white/10 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">{titulo}</div>
      <div className="text-xl sm:text-2xl font-bold text-white mt-1 tabular-nums break-words">{valor}</div>
      {variacao !== undefined && variacao !== null && isFinite(variacao) && (
        <div className={`text-xs font-bold mt-1 ${sobe ? "text-rose-300" : "text-emerald-300"}`}>
          {sobe ? "▲" : "▼"} {fmtPct(variacao)} <span className="text-gray-500 font-normal">{comparado}</span>
        </div>
      )}
      {detalhe && <div className="text-[11px] text-gray-400 mt-1">{detalhe}</div>}
    </div>
  );
}

// Compara o período com os mesmos meses do ano anterior, por concessionária e só nos meses que
// existem nos dois anos (assim um mês sem fatura não vira "queda").
function comparaAnoAnterior(linhas: Linha[], periodo: string[], f: (l: Linha) => number) {
  const menos12 = (m: string) => `${Number(m.substring(0, 4)) - 1}${m.substring(4)}`;
  let atual = 0, anterior = 0, meses = 0;
  for (const conc of ["CELESC", "CASAN"] as const) {
    const xs = linhas.filter(l => l.concessionaria === conc);
    const tem = new Set(xs.map(l => l.mes));
    for (const m of periodo) {
      if (!tem.has(m) || !tem.has(menos12(m))) continue;
      atual += soma(xs.filter(l => l.mes === m), f);
      anterior += soma(xs.filter(l => l.mes === menos12(m)), f);
      meses++;
    }
  }
  return { variacao: anterior > 0 ? atual / anterior - 1 : null, meses };
}

const ABAS = [
  ["acoes", "O que fazer"], ["resumo", "Resumo"], ["unidades", "Unidades"], ["alertas", "Alertas"], ["economia", "Economia"],
] as const;
type Aba = typeof ABAS[number][0];
const SECOES = [
  ["perdas", "Perdas e penalidades"], ["demanda", "Demanda"], ["solar", "Energia solar"], ["capacitores", "Capacitores"],
  ["contrato", "B optante e mercado livre"], ["tributos", "Tributos"],
] as const;
type Secao = typeof SECOES[number][0];

export default function Relatorios({ versao }: { versao: number }) {
  const [base, setBase] = useState<Base | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("acoes");
  const [secao, setSecao] = useState<Secao>("perdas");
  const [porSecretaria, setPorSecretaria] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [conc, setConc] = useState<"" | "CELESC" | "CASAN">("");
  const [secretariaId, setSecretariaId] = useState("");
  const [tensao, setTensao] = useState<"" | "A" | "B">("");
  const [busca, setBusca] = useState("");
  const [unidadeAberta, setUnidadeAberta] = useState<string | null>(null);
  const [acomps, setAcomps] = useState<Record<string, Acompanhamento>>({});
  const [erroAcomp, setErroAcomp] = useState("");

  useEffect(() => {
    fetch("/api/relatorios/base").then(r => r.json()).then((b: Base) => { setBase(b); setErro(""); })
      .catch(() => setErro("Não foi possível carregar os dados dos relatórios."));
    fetch("/api/acompanhamentos").then(r => (r.ok ? r.json() : [])).then((xs: Acompanhamento[]) => setAcomps(Object.fromEntries(xs.map(x => [x.id, x])))).catch(() => {});
  }, [versao]);

  const salvarAcomp = async (a: Acao, patch: Partial<Acompanhamento>) => {
    const antes = acomps[a.id];
    setAcomps(m => ({ ...m, [a.id]: { ...(m[a.id] || { id: a.id, status: "novo" }), ...patch } }));
    setErroAcomp("");
    try {
      const r = await fetch(`/api/acompanhamentos/${encodeURIComponent(a.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, tipo: a.tipo, contrato_id: a.contrato_id, unidade_id: a.unidade_id, mes: a.mes, titulo: a.titulo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não foi possível gravar.");
      setAcomps(m => ({ ...m, [a.id]: d }));
    } catch (e: any) {
      setAcomps(m => { const n = { ...m }; if (antes) n[a.id] = antes; else delete n[a.id]; return n; });
      setErroAcomp(e.message);
    }
  };

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
  const historicoDe: Map<string, Linha[]> = useMemo(() => {
    const m = new Map<string, Linha[]>();
    todas.forEach(l => m.set(l.contrato_id, [...(m.get(l.contrato_id) || []), l]));
    return m;
  }, [todas]);

  // Oportunidades recorrentes: sempre nos últimos 12 meses com fatura (independe do período).
  const ult12: Linha[] = useMemo(() => {
    const ini = mesesDisp[Math.max(0, mesesDisp.length - 12)] || "";
    return filtradasTodas.filter(l => l.mes >= ini);
  }, [filtradasTodas, mesesDisp]);
  const cs12: Contrato12[] = useMemo(() => agregarContratos(ult12), [ult12]);
  const precoB: number = useMemo(() => precoMedioB(agregarContratos(todas.filter(l => l.mes >= (mesesDisp[Math.max(0, mesesDisp.length - 12)] || "")))), [todas, mesesDisp]);
  const solar: CandidatoSolar[] = useMemo(() => candidatosSolar(cs12), [cs12]);
  const caps: CandidatoCapacitor[] = useMemo(() => candidatosCapacitor(cs12), [cs12]);
  const bopt: CandidatoBOptante[] = useMemo(() => candidatosBOptante(cs12, precoB), [cs12, precoB]);
  const ml = useMemo(() => mercadoLivre(cs12), [cs12]);
  const recs12: Recomendacao[] = useMemo(() => recomendacoes(ult12, todas), [ult12, todas]);

  // Alertas do mês analisado (o último do período).
  type Avaliado = { l: Linha; faixa: FaixaConsumo; r: ResultadoVariacao };
  const avaliados: Avaliado[] = useMemo(() => ls.filter(l => l.mes === ateSel)
    .map(l => ({ l, ...faixaConsumoDoMes(l, historicoDe.get(l.contrato_id) || []) })).filter(x => x.r.alerta)
    .sort((x, y) => (x.r.alerta === "queda" ? 1 : 0) - (y.r.alerta === "queda" ? 1 : 0) || Math.abs(y.r.impacto_valor) - Math.abs(x.r.impacto_valor)), [ls, ateSel, historicoDe]);

  const acoes: Acao[] = useMemo(() => {
    const out: Acao[] = [];
    const un = (l: Linha) => (l.concessionaria === "CASAN" ? "m³" : "kWh");
    for (const { l, r } of avaliados) {
      if (r.alerta === "queda") continue;
      const base = { quando: "agora" as const, unidade_id: l.unidade_id, contrato_id: l.contrato_id, mes: l.mes, unidade: l.unidade_nome, endereco: l.unidade_endereco,
        codigo: `${l.concessionaria === "CASAN" ? "💧" : "⚡"} ${l.codigo}`, id: `alerta:${l.contrato_id}:${l.mes}` };
      const comp = [r.mensal && `mês anterior ${fmtN(r.mensal.ref_consumo_30d)} ${un(l)}`, r.anual && `mesmo mês do ano passado ${fmtN(r.anual.ref_consumo_30d)} ${un(l)}`].filter(Boolean).join("; ");
      const consumo = `Consumo de ${fmtN(l.consumo)} ${un(l)} (${comp || "sem histórico"}).`;
      if (r.alerta === "zerado") {
        out.push({ ...base, tipo: "Consumo zerado", titulo: "Verificar o medidor ou se a unidade fechou", valor: Math.abs(r.ref_valor_30d || 0), rotulo_valor: "valor normal por mês",
          detalhe: `${consumo} Medidor parado gera cobrança retroativa depois; unidade fechada pode ter a ligação encerrada.` });
      } else if (r.alerta === "valor") {
        out.push({ ...base, tipo: "Cobrança", titulo: "Conferir a fatura: o valor subiu sem subir o consumo", valor: r.impacto_valor, rotulo_valor: "a mais neste mês",
          detalhe: `${consumo} Pode ser tarifa, multa, serviço ou obra cobrada na conta — abra os itens da fatura.` });
      } else if (l.concessionaria === "CASAN" && r.mensal?.alerta === "alta") {
        out.push({ ...base, tipo: "Possível vazamento", titulo: "Vistoriar: a água subiu de um mês para o outro", valor: r.impacto_valor, rotulo_valor: "a mais neste mês",
          detalhe: `${consumo} Com o conserto comprovado, dá para pedir à CASAN a revisão da conta pela média.` });
      } else if (r.mensal?.alerta === "alta") {
        out.push({ ...base, tipo: "Consumo", titulo: "Verificar o que passou a gastar mais energia neste mês", valor: r.impacto_valor, rotulo_valor: "a mais neste mês",
          detalhe: `${consumo} Equipamento ligado direto, ar-condicionado novo ou defeito.` });
      } else {
        out.push({ ...base, tipo: "Consumo", titulo: "Entender o aumento em relação ao ano passado", valor: r.impacto_valor, rotulo_valor: "a mais neste mês",
          detalhe: `${consumo} Mudança de uso, ampliação ou ligação nova.` });
      }
    }
    for (const r of recs12) {
      if (r.tipo === "Energia reativa") continue; // tratado em "capacitores", com o critério de 2 anos
      const contrato = ult12.find(l => l.codigo === r.codigo)?.contrato_id;
      out.push({ quando: "economia", id: `${r.tipo}:${contrato || r.codigo}`, tipo: r.tipo, unidade_id: r.unidade_id, contrato_id: contrato, unidade: r.unidade, endereco: r.endereco,
        codigo: `⚡ ${r.codigo}`, titulo: r.titulo, detalhe: r.detalhe, valor: r.economia, rotulo_valor: "por ano" });
    }
    for (const c of caps.filter(c => c.solucao !== "nao_compensa")) {
      out.push({ quando: "economia", id: `capacitor:${c.contrato_id}`, tipo: "Capacitores", unidade_id: c.unidade_id, contrato_id: c.contrato_id, unidade: c.unidade, endereco: c.endereco,
        codigo: `⚡ ${c.codigo}`, valor: c.reativo, rotulo_valor: "por ano",
        titulo: c.solucao === "banco" ? "Instalar banco de capacitores (fator de potência)" : "Conferir se há capacitor ligado à noite (temporizador)",
        detalhe: `Paga ${fmtR(c.reativo)}/ano de energia reativa. Para se pagar em ${PREMISSAS.capacitor_payback_anos} anos, o serviço pode custar até ${fmtR(c.limite_investimento)}. ` +
          (c.solucao === "banco" ? `Banco fixo pequeno: ${fmtR(c.custo[0])} a ${fmtR(c.custo[1])} instalado — peça orçamento.` : `Banco novo não se paga nesse prazo; primeiro peça à CELESC a memória de massa e veja se o excesso é à noite (capacitor sobrando): um temporizador (${fmtR(c.custo[0])} a ${fmtR(c.custo[1])}) resolve.`) });
    }
    for (const c of bopt) {
      out.push({ quando: "economia", id: `boptante:${c.contrato_id}`, tipo: "B optante", unidade_id: c.unidade_id, contrato_id: c.contrato_id, unidade: c.unidade, endereco: c.endereco,
        codigo: `⚡ ${c.codigo}`, valor: c.economia, rotulo_valor: "por ano", titulo: "Pedir faturamento como grupo B (sem demanda contratada)",
        detalhe: `Paga ${fmtR(c.custo_a)}/ano como alta tensão; pela tarifa média do grupo B (${fmtN(precoB, 4)} R$/kWh) pagaria ${fmtR(c.custo_b)}. Só vale se o transformador for de até 112,5 kVA — vistoriar antes.` });
    }
    for (const c of solar.slice(0, 5)) {
      out.push({ quando: "economia", id: `solar:${c.contrato_id}`, tipo: "Energia solar", unidade_id: c.unidade_id, contrato_id: c.contrato_id, unidade: c.unidade, endereco: c.endereco,
        codigo: `⚡ ${c.codigo}`, valor: c.economia, rotulo_valor: "por ano", investimento: c.investimento, titulo: `Avaliar usina solar de cerca de ${fmtN(c.kwp, 1)} kWp`,
        detalhe: `Consome ${fmtN(c.kwh)} kWh/ano${c.limitada ? ` (a usina fica no limite da microgeração, ${PREMISSAS.solar_kwp_max} kWp, e cobre só parte do consumo)` : ""}. Investimento estimado ${fmtR(c.investimento)}, retorno em ${fmtN(c.payback, 1)} anos, precisa de ~${fmtN(c.area_m2)} m² de telhado.` });
    }
    if (ml && ml.economia[0] >= 1000) {
      out.push({ quando: "economia", id: "mercado-livre", tipo: "Mercado livre", unidade: `${ml.ucs} UC(s) de alta tensão`, endereco: "", codigo: "",
        valor: ml.economia[0], rotulo_valor: `por ano (até ${fmtR(ml.economia[1])})`, titulo: "Comprar a energia do grupo A no mercado livre",
        detalhe: `${fmtN(ml.kwh)} kWh/ano. A energia (TE) e as bandeiras somam ${fmtR(ml.base)}/ano; com ${fmtN(PREMISSAS.mercado_livre_desconto[0] * 100)}% a ${fmtN(PREMISSAS.mercado_livre_desconto[1] * 100)}% de desconto do varejista, economia de ${fmtR(ml.economia[0])} a ${fmtR(ml.economia[1])}. Exige licitação.` });
    }
    return out;
  }, [avaliados, recs12, caps, bopt, solar, ml, ult12, precoB]);

  if (erro) return <div className="bg-[#0f0f0f] p-6 rounded-xl border border-rose-500/30 text-rose-300 text-sm">{erro}</div>;
  if (!base) return <div className="bg-[#0f0f0f] p-6 rounded-xl border border-white/10 text-gray-400 text-sm">Carregando relatórios…</div>;

  const e = ls.filter(l => l.concessionaria === "CELESC"), a = ls.filter(l => l.concessionaria === "CASAN");
  const g = (gs: readonly Grupo[], xs: Linha[] = e) => soma(xs, l => valorGrupos(l, gs));
  const sel = "bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white";
  const tituloPeriodo = deSel ? `${rotuloMes(deSel)} a ${rotuloMes(ateSel)}` : "";
  const abrir = (id: string) => setUnidadeAberta(id);
  const un = (l: Linha) => (l.concessionaria === "CASAN" ? "m³" : "kWh");
  const filtrosAtivos = [conc, secretariaId, tensao, busca].filter(Boolean).length;

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
        <button type="button" onClick={() => setFiltrosAbertos(v => !v)}
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${filtrosAtivos ? "border-indigo-500 text-white bg-indigo-600/30" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtrar{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
        </button>
      </div>
      {(filtrosAbertos || filtrosAtivos > 0) && (
        <div className="flex flex-wrap items-center gap-2 bg-black/30 border border-white/10 rounded-lg p-2">
          <select value={conc} onChange={ev => setConc(ev.target.value as any)} className={sel}><option value="">Água e energia</option><option value="CELESC">⚡ Só energia (CELESC)</option><option value="CASAN">💧 Só água (CASAN)</option></select>
          <select value={secretariaId} onChange={ev => setSecretariaId(ev.target.value)} className={`${sel} max-w-xs`}>
            <option value="">Todas as secretarias</option>
            {base.secretarias.filter(s => todas.some(l => l.secretaria_id === s.id)).sort((x, y) => x.nome.localeCompare(y.nome)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select value={tensao} onChange={ev => setTensao(ev.target.value as any)} className={sel}><option value="">Alta e baixa tensão</option><option value="A">Só alta tensão (grupo A)</option><option value="B">Só baixa tensão (grupo B)</option></select>
          <input value={busca} onChange={ev => setBusca(ev.target.value)} placeholder="Buscar unidade, endereço ou código…" className="bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white w-64" />
          {filtrosAtivos > 0 && <button type="button" onClick={() => { setConc(""); setSecretariaId(""); setTensao(""); setBusca(""); }} className="text-xs text-indigo-300 underline">limpar filtros</button>}
        </div>
      )}
    </div>
  );

  // Indicadores do topo (O que fazer e Resumo).
  const total = soma(ls, l => l.valor_total);
  const varTotal = comparaAnoAnterior(filtradasTodas, periodo, l => l.valor_total);
  const varPerdas = comparaAnoAnterior(filtradasTodas.filter(l => l.concessionaria === "CELESC"), periodo, perdasDe);
  const abertasAgora = acoes.filter(x => x.quando === "agora" && !fechada(acomps[x.id]?.status));
  // Ações da mesma unidade são alternativas (ex.: ajustar a demanda OU virar grupo B): na soma
  // entra só a maior de cada unidade.
  const economiaSemSobrepor = (xs: Acao[]) => {
    const porContrato = new Map<string, number>();
    let semContrato = 0;
    xs.forEach(x => { if (!x.contrato_id) semContrato += x.valor; else porContrato.set(x.contrato_id, Math.max(porContrato.get(x.contrato_id) || 0, x.valor)); });
    return semContrato + [...porContrato.values()].reduce((s2, v) => s2 + v, 0);
  };
  const economiaAberta = acoes.filter(x => x.quando === "economia" && acomps[x.id]?.status !== "descartado");
  const comparado = (n: number) => `vs. os mesmos ${n === 1 ? "mês" : "meses"} do ano anterior`;
  const kpis = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <Kpi titulo="Gasto no período" valor={fmtR(total)} variacao={varTotal.variacao} comparado={comparado(varTotal.meses)}
        detalhe={<>⚡ {fmtR(soma(e, l => l.valor_total))} · 💧 {fmtR(soma(a, l => l.valor_total))}</>} />
      <Kpi titulo="Perdas e penalidades" valor={fmtR(soma(e, perdasDe))} variacao={varPerdas.variacao} comparado={comparado(varPerdas.meses)}
        detalhe="ultrapassagem, demanda sem uso, reativo, mínimo sem consumo, multas" />
      <Kpi titulo="Alertas abertos" valor={String(abertasAgora.length)} detalhe={`de ${rotuloMes(ateSel)} · ${acoes.filter(x => x.quando === "agora" && acomps[x.id]?.status === "em_andamento").length} em andamento`} />
      <Kpi titulo="Economia possível por ano" valor={fmtR(economiaSemSobrepor(economiaAberta.filter(x => !fechada(acomps[x.id]?.status) && !x.investimento)))}
        detalhe={<>sem obra: pedidos à CELESC, ajustes e serviços pequenos. Com usinas solares, mais {fmtR(soma(economiaAberta.filter(x => !fechada(acomps[x.id]?.status) && x.investimento), x => x.valor))}/ano (investimento de {fmtR(soma(economiaAberta.filter(x => !fechada(acomps[x.id]?.status) && x.investimento), x => x.investimento || 0))}).</>} />
    </div>
  );

  let conteudo: React.ReactNode = null;

  if (aba === "acoes") {
    const lista = (q: "agora" | "economia") => acoes.filter(x => x.quando === q && (mostrarConcluidas || !fechada(acomps[x.id]?.status)))
      .sort((x, y) => Math.abs(y.valor) - Math.abs(x.valor));
    const concluidas = acoes.filter(x => fechada(acomps[x.id]?.status)).length;
    const grade = (xs: Acao[], vazio: string) => xs.length
      ? <div className="grid md:grid-cols-2 gap-3">{xs.map(x => <CartaoAcao key={x.id} a={x} acomp={acomps[x.id]} onSalvar={salvarAcomp} onAbrir={() => x.unidade_id && abrir(x.unidade_id)} />)}</div>
      : <div className="text-xs text-gray-500 bg-[#141414] border border-white/10 rounded-lg p-4">{vazio}</div>;
    conteudo = (
      <div className="space-y-6">
        {kpis}
        {erroAcomp && <div className="text-xs text-rose-300">{erroAcomp}</div>}
        <div className="flex items-center justify-end">
          <label className="flex items-center gap-2 text-xs text-gray-400 print:hidden">
            <input type="checkbox" checked={mostrarConcluidas} onChange={ev => setMostrarConcluidas(ev.target.checked)} /> Mostrar resolvidas e descartadas ({concluidas})
          </label>
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-base">Fazer agora <span className="text-gray-500 font-normal text-sm">— alertas da fatura de {rotuloMes(ateSel)}</span></div>
          {grade(lista("agora"), "Nenhum alerta aberto neste mês.")}
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-base">Para economizar <span className="text-gray-500 font-normal text-sm">— contas sobre os últimos 12 meses de faturas</span></div>
          {grade(lista("economia"), "Nenhuma oportunidade aberta.")}
          <p className="text-[11px] text-gray-500">O andamento de cada cartão (status, responsável, anotação) fica gravado para todos. Os valores são estimativas com os preços das próprias faturas; as premissas de solar, capacitores e mercado livre estão na aba Economia.</p>
        </div>
      </div>
    );
  }

  if (aba === "resumo") {
    conteudo = (
      <div className="space-y-5">
        {kpis}
        {(() => {
          const menos12 = (m: string) => `${Number(m.substring(0, 4)) - 1}${m.substring(4)}`;
          const porMes = (xs: Linha[], m: string, f: (l: Linha) => number) => { const ys = xs.filter(l => l.mes === m); return ys.length ? soma(ys, f) : null; };
          const fE = filtradasTodas.filter(l => l.concessionaria === "CELESC"), fA = filtradasTodas.filter(l => l.concessionaria === "CASAN");
          const reais = (v: number) => (v >= 1000 ? `R$ ${fmtN(v / 1000, 0)} mil` : fmtR(v));
          const rotulos = periodo.map(rotuloMes);
          return (
            <div className="space-y-5">
              {(!conc || conc === "CELESC") && (
                <div className="space-y-2">
                  <div className="text-white font-bold text-sm">⚡ Energia por mês — comparada com o mesmo mês do ano anterior</div>
                  <GraficoComparativo rotulos={rotulos} atual={periodo.map(m => porMes(fE, m, l => l.valor_total))} anterior={periodo.map(m => porMes(fE, menos12(m), l => l.valor_total))}
                    nomeAtual="Mês do período" nomeAnterior="Mesmo mês, ano anterior" cor="#c98500" formato={reais} altura={240} />
                </div>
              )}
              {(!conc || conc === "CASAN") && (
                <div className="space-y-2">
                  <div className="text-white font-bold text-sm">💧 Água por mês — comparada com o mesmo mês do ano anterior</div>
                  <GraficoComparativo rotulos={rotulos} atual={periodo.map(m => porMes(fA, m, l => l.valor_total))} anterior={periodo.map(m => porMes(fA, menos12(m), l => l.valor_total))}
                    nomeAtual="Mês do período" nomeAnterior="Mesmo mês, ano anterior" cor="#3987e5" formato={reais} altura={240} />
                </div>
              )}
            </div>
          );
        })()}
        <div className="space-y-2">
          <div className="text-white font-bold text-sm">Para onde vai o dinheiro da energia <span className="text-gray-500 font-normal">— e quanto cada parte mudou contra os mesmos meses do ano anterior</span></div>
          {(() => {
            const menos12 = (m: string) => `${Number(m.substring(0, 4)) - 1}${m.substring(4)}`;
            const fE = filtradasTodas.filter(l => l.concessionaria === "CELESC");
            const temAnt = new Set(fE.map(l => l.mes));
            const meses = periodo.filter(m => temAnt.has(m) && temAnt.has(menos12(m)));
            const atu = fE.filter(l => meses.includes(l.mes)), ant = fE.filter(l => meses.some(m => menos12(m) === l.mes));
            const itens = [
              ...MACRO.map(m => ({ nome: m.nome, cor: m.cor, valor: g(m.grupos), a: soma(atu, l => valorGrupos(l, m.grupos)), b: soma(ant, l => valorGrupos(l, m.grupos)) })).sort((x, y) => y.valor - x.valor),
              ...DEDUCOES.map(d => ({ nome: NOME_GRUPO[d], cor: undefined as string | undefined, valor: g([d]), a: soma(atu, l => valorGrupos(l, [d])), b: soma(ant, l => valorGrupos(l, [d])) })),
            ];
            return <Composicao itens={itens.map(i => ({ nome: i.nome, cor: i.cor, valor: i.valor, variacao: meses.length && Math.abs(i.b) > 1 && i.valor > 0 ? i.a / i.b - 1 : null }))} />;
          })()}
          <p className="text-[11px] text-gray-500">"Perdas e penalidades" = ultrapassagem de demanda, demanda paga sem uso, energia reativa excedente, multas e juros. Valores negativos reduzem a conta.</p>
        </div>
        <BotaoIA titulo={`Gastos da prefeitura com água e energia (${tituloPeriodo})`} resumo={() => ({
          periodo: tituloPeriodo, filtros: { concessionaria: conc || "todas", secretaria: base.secretarias.find(s => s.id === secretariaId)?.nome || "todas", tensao: tensao || "todas", busca },
          totais: { total, celesc: soma(e, l => l.valor_total), casan: soma(a, l => l.valor_total), kwh: soma(e, l => l.consumo), m3: soma(a, l => l.consumo) },
          energia_por_grupo: { ...Object.fromEntries(MACRO.map(m => [m.nome, g(m.grupos)])), ...Object.fromEntries(DEDUCOES.map(d => [NOME_GRUPO[d], g([d])])) },
          perdas_detalhadas: Object.fromEntries([...GRUPOS_PERDA.map(x => [NOME_GRUPO[x], g([x])]), ["Mínimo pago sem consumo (disponibilidade)", soma(e, l => l.disponibilidade?.valor || 0)]]),
          por_mes: resumo.map(r => ({ mes: r.rotulo, total: r.total, energia_rs: r.energiaTotal, agua_rs: r.agua, kwh: r.kwh, m3: r.m3 })),
          acoes_do_sistema: acoes.slice(0, 25).map(x => ({ tipo: x.tipo, unidade: nomeDaUnidade(x.unidade, x.endereco), titulo: x.titulo, detalhe: x.detalhe, valor: x.valor, quando: x.quando })),
        })} />
        <Tabela<Resumo> nome={`resumo-mensal-${tituloPeriodo}`} linhas={resumo} colunas={colunasResumo("meses")} rodape={rodapeResumo(resumo)} />
      </div>
    );
  }

  if (aba === "unidades") {
    const alternar = (
      <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/10 w-fit print:hidden">
        {([[false, "Por unidade"], [true, "Por secretaria"]] as const).map(([v, t]) => (
          <button key={t} type="button" onClick={() => setPorSecretaria(v)} className={`px-3 py-1 rounded-md text-xs font-semibold ${porSecretaria === v ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>{t}</button>
        ))}
      </div>
    );
    if (!porSecretaria) {
      const porUnidade = [...new Set(ls.map(l => l.unidade_id))].map(id => {
        const xs = ls.filter(l => l.unidade_id === id);
        const ex = xs.filter(l => l.concessionaria === "CELESC"), ax = xs.filter(l => l.concessionaria === "CASAN");
        return { id, nome: xs[0].unidade_nome, secretaria: xs[0].secretaria_nome, endereco: xs[0].unidade_endereco,
          kwh: soma(ex, l => l.consumo), m3: soma(ax, l => l.consumo), energia: soma(ex, l => l.valor_total), agua: soma(ax, l => l.valor_total),
          total: soma(xs, l => l.valor_total), perdas: soma(ex, perdasDe), infra: soma(ex, l => l.grupos?.infraestrutura || 0) };
      });
      type U = typeof porUnidade[number];
      conteudo = (
        <div className="space-y-2">
          {alternar}
          <p className="text-[11px] text-gray-500">Clique numa unidade para abrir os dados dela. Clique no título da coluna para ordenar.</p>
          <Tabela<U> nome={`unidades-${tituloPeriodo}`} linhas={porUnidade} onLinha={u => abrir(u.id)} ordemInicial={{ coluna: "Total", desc: true }} colunas={[
            { titulo: "Unidade", valor: u => <NomeUnidade nome={u.nome} endereco={u.endereco} />, csv: u => `${nomeDaUnidade(u.nome, u.endereco)} — ${u.endereco}`, ordem: u => nomeDaUnidade(u.nome, u.endereco) },
            { titulo: "Secretaria", valor: u => u.secretaria, ordem: u => u.secretaria },
            { titulo: "kWh", valor: u => fmtN(u.kwh), direita: true, csv: u => u.kwh, ordem: u => u.kwh },
            { titulo: "Energia R$", valor: u => fmtR(u.energia), direita: true, csv: u => u.energia.toFixed(2), ordem: u => u.energia },
            { titulo: "m³", valor: u => fmtN(u.m3), direita: true, csv: u => u.m3, ordem: u => u.m3 },
            { titulo: "Água R$", valor: u => fmtR(u.agua), direita: true, csv: u => u.agua.toFixed(2), ordem: u => u.agua },
            { titulo: "Perdas R$", valor: u => (u.perdas > 0 ? <span className="text-rose-300">{fmtR(u.perdas)}</span> : "—"), direita: true, csv: u => u.perdas.toFixed(2), ordem: u => u.perdas },
            { titulo: "Total", valor: u => <b className="text-white">{fmtR(u.total)}</b>, direita: true, csv: u => u.total.toFixed(2), ordem: u => u.total },
          ]} rodape={[`${porUnidade.length} unidades`, "", fmtN(soma(porUnidade, u => u.kwh)), fmtR(soma(porUnidade, u => u.energia)), fmtN(soma(porUnidade, u => u.m3)), fmtR(soma(porUnidade, u => u.agua)), fmtR(soma(porUnidade, u => u.perdas)), fmtR(soma(porUnidade, u => u.total))]} />
        </div>
      );
    } else {
      const porSec = [...new Set(ls.map(l => l.secretaria_id))].map(id => {
        const xs = ls.filter(l => l.secretaria_id === id), ex = xs.filter(l => l.concessionaria === "CELESC"), ax = xs.filter(l => l.concessionaria === "CASAN");
        return { id, nome: xs[0].secretaria_nome, unidades: new Set(xs.map(l => l.unidade_id)).size, kwh: soma(ex, l => l.consumo), energia: soma(ex, l => l.valor_total), m3: soma(ax, l => l.consumo), agua: soma(ax, l => l.valor_total), perdas: soma(ex, perdasDe), total: soma(xs, l => l.valor_total) };
      });
      type S = typeof porSec[number];
      conteudo = (
        <div className="space-y-3">
          {alternar}
          <Composicao itens={[...porSec].sort((x, y) => y.total - x.total).map(s => ({ nome: s.nome, valor: s.total }))} />
          <Tabela<S> nome={`secretarias-${tituloPeriodo}`} linhas={porSec} ordemInicial={{ coluna: "Total", desc: true }} onLinha={s => { setSecretariaId(s.id); setPorSecretaria(false); }} colunas={[
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
          <p className="text-[11px] text-gray-500">Clique numa secretaria para ver as unidades dela.</p>
        </div>
      );
    }
  }

  if (aba === "alertas") {
    const mes = ateSel;
    type A = Avaliado;
    const anterior = intervaloMeses(mesesDisp[0] || mes, mes).slice(-2)[0];
    const contratosNoMes = new Set(ls.filter(l => l.mes === mes).map(l => l.contrato_id));
    const faltando = filtradasTodas.filter(l => l.mes === anterior && anterior !== mes && !contratosNoMes.has(l.contrato_id));
    const acaoDo = (x: A): Acao => acoes.find(y => y.id === `alerta:${x.l.contrato_id}:${x.l.mes}`) || {
      id: `alerta:${x.l.contrato_id}:${x.l.mes}`, quando: "agora", tipo: TEXTO_ALERTA[x.r.alerta!], unidade_id: x.l.unidade_id, contrato_id: x.l.contrato_id, mes: x.l.mes,
      unidade: x.l.unidade_nome, endereco: x.l.unidade_endereco, codigo: x.l.codigo, titulo: TEXTO_ALERTA[x.r.alerta!], detalhe: x.r.motivo, valor: x.r.impacto_valor, rotulo_valor: "",
    };
    conteudo = (
      <div className="space-y-5">
        <div className="text-xs text-gray-400">Mês analisado: <b className="text-white">{rotuloMes(mes)}</b> (o último mês do período escolhido).</div>
        {erroAcomp && <div className="text-xs text-rose-300">{erroAcomp}</div>}
        <div className="space-y-2">
          <div className="text-white font-bold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Variação acima de 20% ({avaliados.length})</div>
          <p className="text-[11px] text-gray-500">Duas comparações: com o <b className="text-gray-300">mês anterior</b> (salto de um mês para o outro — na água, costuma ser vazamento) e com o <b className="text-gray-300">mesmo mês do ano anterior</b> (tira a sazonalidade e mostra mudança de uso, cobrança nova ou tarifa). Consumo levado a 30 dias; só entra com mais de 20% e diferença de pelo menos 100 kWh / 5 m³ (ou R$ 100 no valor).</p>
          <Tabela<A> nome={`alertas-variacao-${mes}`} linhas={avaliados} onLinha={x => abrir(x.l.unidade_id)} vazio="Nenhuma variação fora do normal neste mês." colunas={[
            { titulo: "Unidade", valor: x => <NomeUnidade nome={x.l.unidade_nome} endereco={x.l.unidade_endereco} />, csv: x => `${nomeDaUnidade(x.l.unidade_nome, x.l.unidade_endereco)} — ${x.l.unidade_endereco}` },
            { titulo: "Código", valor: x => <span className="whitespace-nowrap">{x.l.concessionaria === "CASAN" ? "💧" : "⚡"} {x.l.codigo}</span>, csv: x => x.l.codigo },
            { titulo: "Alerta", valor: x => <div className="min-w-[190px]"><span className={x.r.alerta === "queda" ? "text-sky-300" : "text-rose-300"}>{TEXTO_ALERTA[x.r.alerta!]}</span><div className="text-[10px] text-gray-500 max-w-[260px] leading-tight">{x.r.motivo.split(" · ").map(m => <div key={m}>{m}</div>)}</div></div>, csv: x => `${TEXTO_ALERTA[x.r.alerta!]} — ${x.r.motivo}` },
            { titulo: "Consumo", valor: x => `${fmtN(x.l.consumo)} ${un(x.l)}`, direita: true, csv: x => x.l.consumo },
            { titulo: "vs mês anterior", valor: x => <CelulaComparacao c={x.r.mensal} un={un(x.l)} />, csv: x => textoComparacao(x.r.mensal, un(x.l)), ordem: x => x.r.mensal?.var_consumo ?? -Infinity },
            { titulo: "vs mesmo mês ano anterior", valor: x => <CelulaComparacao c={x.r.anual} un={un(x.l)} />, csv: x => textoComparacao(x.r.anual, un(x.l)), ordem: x => x.r.anual?.var_consumo ?? -Infinity },
            { titulo: "Impacto R$", valor: x => fmtR(x.r.impacto_valor), direita: true, csv: x => x.r.impacto_valor.toFixed(2), ordem: x => x.r.impacto_valor },
            { titulo: "Andamento", valor: x => { const ac = acaoDo(x); return <SeletorStatus status={acomps[ac.id]?.status || "novo"} onChange={s => salvarAcomp(ac, { status: s })} />; },
              csv: x => STATUS_ACAO.find(s => s[0] === (acomps[acaoDo(x).id]?.status || "novo"))![1] },
          ]} />
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Faturado em {rotuloMes(anterior)} e sem fatura em {rotuloMes(mes)} ({faltando.length})</div>
          <p className="text-[11px] text-gray-500">Fatura não importada, contrato encerrado ou cobrança em outra conta.</p>
          <Tabela<Linha> nome={`alertas-faltando-${mes}`} linhas={faltando} onLinha={l => abrir(l.unidade_id)} vazio="Nenhuma fatura faltando." colunas={[
            { titulo: "Unidade", valor: l => <NomeUnidade nome={l.unidade_nome} endereco={l.unidade_endereco} />, csv: l => `${nomeDaUnidade(l.unidade_nome, l.unidade_endereco)} — ${l.unidade_endereco}` },
            { titulo: "Código", valor: l => `${l.concessionaria === "CASAN" ? "💧" : "⚡"} ${l.codigo}` },
            { titulo: "Valor no mês anterior", valor: l => fmtR(l.valor_total), direita: true, csv: l => l.valor_total.toFixed(2) },
          ]} />
        </div>
      </div>
    );
  }

  if (aba === "economia") {
    const subnav = (
      <div className="flex flex-wrap gap-1.5 print:hidden">
        {SECOES.map(([k, t]) => (
          <button key={k} type="button" onClick={() => setSecao(k)}
            className={`px-3 py-1 rounded-full border text-xs font-semibold ${secao === k ? "border-indigo-500 bg-indigo-600/30 text-white" : "border-white/10 text-gray-400 hover:text-white"}`}>{t}</button>
        ))}
      </div>
    );
    let corpo: React.ReactNode = null;
    const nota = (t: React.ReactNode) => <p className="text-[11px] text-gray-500 leading-relaxed">{t}</p>;

    if (secao === "perdas") {
      const tipos: { k: string; nome: string; acao: string; valor: (l: Linha) => number }[] = [
        { k: "ultrapassagem", nome: "Ultrapassagem de demanda", acao: "Usou mais que a demanda contratada (paga em dobro nessa parte): aumentar a contratada.", valor: l => l.grupos?.ultrapassagem || 0 },
        { k: "demanda_sem_uso", nome: "Demanda paga sem uso", acao: "Demanda contratada maior que a usada: reduzir a contratada.", valor: l => l.grupos?.demanda_sem_uso || 0 },
        { k: "reativo", nome: "Energia reativa excedente", acao: "Fator de potência abaixo de 0,92: veja a seção Capacitores.", valor: l => l.grupos?.reativo || 0 },
        { k: "disponibilidade", nome: "Mínimo pago sem consumo", acao: "Consumo abaixo do mínimo de 30/50/100 kWh: avaliar desligar ligações sem uso.", valor: l => l.disponibilidade?.valor || 0 },
        { k: "multas_juros", nome: "Multas e juros", acao: "Atraso no pagamento.", valor: l => l.grupos?.multas_juros || 0 },
      ];
      corpo = (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {tipos.map(t => <Indicador key={t.k} titulo={t.nome} valor={fmtR(soma(e, t.valor))} detalhe={`${new Set(e.filter(l => t.valor(l) > 0.004).map(l => l.contrato_id)).size} UC(s)`} />)}
          </div>
          {tipos.map(t => {
            const porContrato = [...new Set(e.filter(l => t.valor(l) > 0.004).map(l => l.contrato_id))].map(id => {
              const xs = e.filter(l => l.contrato_id === id);
              return { id: xs[0].unidade_id, unidade: xs[0].unidade_nome, endereco: xs[0].unidade_endereco, secretaria: xs[0].secretaria_nome, codigo: xs[0].codigo, valor: soma(xs, t.valor), meses: xs.filter(l => t.valor(l) > 0.004).length };
            });
            type P = typeof porContrato[number];
            if (!porContrato.length) return null;
            return (
              <div key={t.k} className="space-y-1">
                <div className="text-white font-bold text-sm">{t.nome} — {fmtR(soma(porContrato, p => p.valor))}</div>
                {nota(t.acao)}
                <Tabela<P> nome={`perdas-${t.k}-${tituloPeriodo}`} linhas={porContrato} onLinha={p => abrir(p.id)} ordemInicial={{ coluna: "R$", desc: true }} colunas={[
                  { titulo: "Unidade", valor: p => <NomeUnidade nome={p.unidade} endereco={p.endereco} />, csv: p => `${nomeDaUnidade(p.unidade, p.endereco)} — ${p.endereco}`, ordem: p => nomeDaUnidade(p.unidade, p.endereco) },
                  { titulo: "Código", valor: p => p.codigo }, { titulo: "Meses", valor: p => p.meses, direita: true, ordem: p => p.meses },
                  { titulo: "R$", valor: p => fmtR(p.valor), direita: true, csv: p => p.valor.toFixed(2), ordem: p => p.valor },
                ]} rodape={["Total", "", "", fmtR(soma(porContrato, p => p.valor))]} />
              </div>
            );
          })}
        </div>
      );
    }

    if (secao === "demanda") {
      const contratos = [...new Set(e.filter(l => l.demanda).map(l => l.contrato_id))].map(id => {
        const doContrato = historicoDe.get(id) || [];
        const noPer = doContrato.filter(l => l.mes >= deSel && l.mes <= ateSel && l.demanda);
        const contr = contratadaPorMes(doContrato);
        const atual = contr.get(noPer[noPer.length - 1]?.mes || "") || null;
        const sim = atual ? simularDemandaIdeal(noPer.map(l => ({ usada: l.demanda!.faturada, preco_kw: l.demanda!.preco_kw, preco_ultrapassagem_kw: l.demanda!.preco_ultrapassagem_kw })), atual) : null;
        return { id: doContrato[0].unidade_id, unidade: doContrato[0].unidade_nome, endereco: doContrato[0].unidade_endereco, codigo: doContrato[0].codigo, doContrato, contr, atual, sim,
          perdas: soma(noPer, l => (l.grupos?.ultrapassagem || 0) + (l.grupos?.demanda_sem_uso || 0)) };
      }).sort((x, y) => y.perdas - x.perdas);
      corpo = (
        <div className="space-y-4">
          {nota("Só UCs de alta tensão (grupo A) têm demanda contratada. Cada quadrado mostra o uso do mês ÷ contratada.")}
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
          {nota("Sugerida: a demanda que teria custado menos nos meses do período (mínimo 30 kW), considerando que acima de 105% paga-se a ultrapassagem em dobro. Aumento vale na hora; redução segue o aviso do contrato com a CELESC (em geral 180 dias).")}
        </div>
      );
    }

    if (secao === "solar") {
      const comInjecao = e.filter(l => l.energia_injetada > 0 || (l.grupos?.solar || 0) !== 0);
      const geradoras = [...new Set(comInjecao.map(l => l.unidade_id))].map(id => {
        const xs = comInjecao.filter(l => l.unidade_id === id);
        return { id, nome: xs[0].unidade_nome, endereco: xs[0].unidade_endereco, kwh: soma(xs, l => l.energia_injetada), credito: -soma(xs, l => l.grupos?.solar || 0), meses: new Set(xs.map(l => l.mes)).size };
      });
      type So = typeof geradoras[number];
      corpo = (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Indicador titulo="Unidades com geração" valor={String(geradoras.length)} />
            <Indicador titulo="Crédito na fatura (período)" valor={fmtR(soma(geradoras, u => u.credito))} detalhe={`${fmtN(soma(geradoras, u => u.kwh))} kWh injetados`} />
            <Indicador titulo="Candidatas a nova usina" valor={String(solar.length)} detalhe={`economia de ${fmtR(soma(solar, c => c.economia))}/ano`} />
            <Indicador titulo="Investimento estimado" valor={fmtR(soma(solar, c => c.investimento))} detalhe={`${fmtN(soma(solar, c => c.kwp), 1)} kWp no total`} />
          </div>
          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Onde uma usina solar se paga (últimos 12 meses)</div>
            <Tabela<CandidatoSolar> nome="candidatas-solar" linhas={solar} onLinha={c => abrir(c.unidade_id)} ordemInicial={{ coluna: "Economia/ano", desc: true }} vazio="Nenhuma UC sem geração com economia acima do mínimo." colunas={[
              { titulo: "Unidade", valor: c => <NomeUnidade nome={c.unidade} endereco={c.endereco} />, csv: c => `${nomeDaUnidade(c.unidade, c.endereco)} — ${c.endereco}` },
              { titulo: "Grupo", valor: c => c.grupo },
              { titulo: "kWh/ano", valor: c => fmtN(c.kwh), direita: true, csv: c => Math.round(c.kwh), ordem: c => c.kwh },
              { titulo: "R$/kWh hoje", valor: c => fmtN(c.preco_kwh, 3), direita: true, csv: c => c.preco_kwh, ordem: c => c.preco_kwh },
              { titulo: "Usina", valor: c => `${fmtN(c.kwp, 1)} kWp${c.limitada ? "*" : ""}`, direita: true, csv: c => c.kwp, ordem: c => c.kwp },
              { titulo: "Telhado", valor: c => `${fmtN(c.area_m2)} m²`, direita: true, csv: c => c.area_m2, ordem: c => c.area_m2 },
              { titulo: "Investimento", valor: c => fmtR(c.investimento), direita: true, csv: c => c.investimento.toFixed(2), ordem: c => c.investimento },
              { titulo: "Economia/ano", valor: c => <span className="text-emerald-300">{fmtR(c.economia)}</span>, direita: true, csv: c => c.economia.toFixed(2), ordem: c => c.economia },
              { titulo: "Retorno", valor: c => `${fmtN(c.payback, 1)} anos`, direita: true, csv: c => c.payback, ordem: c => c.payback },
            ]} rodape={["Total", "", "", "", `${fmtN(soma(solar, c => c.kwp), 1)} kWp`, `${fmtN(soma(solar, c => c.area_m2))} m²`, fmtR(soma(solar, c => c.investimento)), fmtR(soma(solar, c => c.economia)), ""]} />
            {nota(<>Premissas: usina instalada a {fmtR(PREMISSAS.solar_custo_kwp)}/kWp (média nacional de R$ 2,45/Wp no 1º tri/2026, +20% para projeto, estrutura e licitação); {fmtN(PREMISSAS.solar_geracao_kwh_kwp_ano)} kWh por kWp ao ano no Alto Vale; a usina evita {fmtN(PREMISSAS.solar_aproveitamento * 100)}% do preço que a UC paga hoje por kWh (o fio B — 60% em 2026, 75% em 2027 e 90% em 2028 — não é compensado na energia injetada); no grupo B continua o mínimo de 100 kWh/mês; usina limitada a {PREMISSAS.solar_kwp_max} kWp (microgeração — * = cobre só parte do consumo). No grupo A a usina abate a energia, não a demanda. Precisa de telhado em bom estado e voltado para o norte; o retorno real sai do orçamento.</>)}
          </div>
          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Unidades que já geram (período escolhido)</div>
            <Tabela<So> nome={`solar-${tituloPeriodo}`} linhas={geradoras} onLinha={u => abrir(u.id)} ordemInicial={{ coluna: "Crédito R$", desc: true }} vazio="Nenhuma energia injetada no período." colunas={[
              { titulo: "Unidade", valor: u => <NomeUnidade nome={u.nome} endereco={u.endereco} />, csv: u => `${nomeDaUnidade(u.nome, u.endereco)} — ${u.endereco}`, ordem: u => nomeDaUnidade(u.nome, u.endereco) },
              { titulo: "Injetada kWh", valor: u => fmtN(u.kwh), direita: true, csv: u => u.kwh, ordem: u => u.kwh },
              { titulo: "Crédito R$", valor: u => fmtR(u.credito), direita: true, csv: u => u.credito.toFixed(2), ordem: u => u.credito },
              { titulo: "Meses com injeção", valor: u => u.meses, direita: true, ordem: u => u.meses },
            ]} rodape={["Total", fmtN(soma(geradoras, u => u.kwh)), fmtR(soma(geradoras, u => u.credito)), ""]} />
          </div>
        </div>
      );
    }

    if (secao === "capacitores") {
      const nome = { banco: "Banco de capacitores fixo", temporizador: "Temporizador no capacitor existente", nao_compensa: "Não compensa investir" } as const;
      corpo = (
        <div className="space-y-4">
          {nota(<>A CELESC cobra energia reativa quando o fator de potência fica abaixo de 0,92 (REN ANEEL 1.000/2021). Critério daqui: só vale o que <b className="text-gray-300">se paga em até {PREMISSAS.capacitor_payback_anos} anos</b>. Antes de comprar, peça à CELESC a <b className="text-gray-300">memória de massa</b> (medição hora a hora): se o excesso for à noite (reativo capacitivo, entre 23h30 e 6h30), há capacitor sobrando ligado e a solução é um temporizador, muito mais barato que um banco novo.</>)}
          <Tabela<CandidatoCapacitor> nome="capacitores" linhas={caps} onLinha={c => abrir(c.unidade_id)} vazio="Nenhuma UC pagou energia reativa nos últimos 12 meses." colunas={[
            { titulo: "Unidade", valor: c => <NomeUnidade nome={c.unidade} endereco={c.endereco} />, csv: c => `${nomeDaUnidade(c.unidade, c.endereco)} — ${c.endereco}` },
            { titulo: "Reativo/ano", valor: c => fmtR(c.reativo), direita: true, csv: c => c.reativo.toFixed(2), ordem: c => c.reativo },
            { titulo: `Pode custar até (${PREMISSAS.capacitor_payback_anos} anos)`, valor: c => fmtR(c.limite_investimento), direita: true, csv: c => c.limite_investimento.toFixed(2), ordem: c => c.limite_investimento },
            { titulo: "Solução indicada", valor: c => <span className={c.solucao === "nao_compensa" ? "text-gray-500" : "text-white"}>{nome[c.solucao]}</span>, csv: c => nome[c.solucao] },
            { titulo: "Custo estimado", valor: c => (c.solucao === "nao_compensa" ? "—" : `${fmtR(c.custo[0])} a ${fmtR(c.custo[1])}`), direita: true, csv: c => (c.solucao === "nao_compensa" ? "" : `${c.custo[0]}-${c.custo[1]}`) },
            { titulo: "Retorno", valor: c => (isFinite(c.payback) ? `${fmtN(c.payback, 1)} anos` : "—"), direita: true, csv: c => (isFinite(c.payback) ? c.payback : ""), ordem: c => (isFinite(c.payback) ? c.payback : 99) },
          ]} />
          {nota(<>Custos de referência (instalado): temporizador/contator {fmtR(PREMISSAS.capacitor_temporizador[0])} a {fmtR(PREMISSAS.capacitor_temporizador[1])}; banco fixo pequeno (5 a 15 kvar) {fmtR(PREMISSAS.capacitor_banco_fixo[0])} a {fmtR(PREMISSAS.capacitor_banco_fixo[1])}; banco automático (acima de 20 kvar) custa bem mais e só compensa onde o reativo passa de R$ 5 mil por ano. O retorno usa o meio da faixa; o número certo sai do orçamento do eletricista.</>)}
        </div>
      );
    }

    if (secao === "contrato") {
      corpo = (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Mercado livre de energia (grupo A)</div>
            {ml ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Indicador titulo="UCs de alta tensão" valor={String(ml.ucs)} detalhe={`${fmtN(ml.kwh)} kWh/ano`} />
                  <Indicador titulo="Energia (TE) + bandeiras" valor={fmtR(ml.base)} detalhe="o que muda de fornecedor, por ano" />
                  <Indicador titulo="Economia estimada" valor={`${fmtR(ml.economia[0])} a ${fmtR(ml.economia[1])}`} detalhe={`${fmtN(PREMISSAS.mercado_livre_desconto[0] * 100)}% a ${fmtN(PREMISSAS.mercado_livre_desconto[1] * 100)}% de desconto, por ano`} />
                </div>
                {nota("Desde 2024 todo o grupo A pode comprar energia no mercado livre (Portaria MME 50/2022); abaixo de 500 kW, por um comercializador varejista. A rede (TUSD) e a demanda continuam pagas à CELESC; bandeiras deixam de existir para essa energia. Exige licitação, contrato de 3 a 5 anos e aviso à CELESC.")}
              </>
            ) : nota("Nenhuma UC de alta tensão no filtro.")}
          </div>
          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Faturar como grupo B ("B optante")</div>
            <Tabela<CandidatoBOptante> nome="b-optante" linhas={bopt} onLinha={c => abrir(c.unidade_id)} vazio="Nenhuma UC de alta tensão pagaria menos como grupo B." colunas={[
              { titulo: "Unidade", valor: c => <NomeUnidade nome={c.unidade} endereco={c.endereco} />, csv: c => `${nomeDaUnidade(c.unidade, c.endereco)} — ${c.endereco}` },
              { titulo: "kWh/ano", valor: c => fmtN(c.kwh), direita: true, csv: c => Math.round(c.kwh) },
              { titulo: "Hoje (grupo A)", valor: c => fmtR(c.custo_a), direita: true, csv: c => c.custo_a.toFixed(2) },
              { titulo: "Como grupo B", valor: c => fmtR(c.custo_b), direita: true, csv: c => c.custo_b.toFixed(2) },
              { titulo: "Economia/ano", valor: c => <span className="text-emerald-300">{fmtR(c.economia)}</span>, direita: true, csv: c => c.economia.toFixed(2), ordem: c => c.economia },
            ]} />
            {nota(<>Compara energia + rede + bandeira + demanda + sobra + ultrapassagem + reativo de hoje com o consumo × tarifa média do grupo B da própria Prefeitura ({fmtN(precoB, 4)} R$/kWh). Só é permitido com transformador de até 112,5 kVA (REN ANEEL 1.000/2021, art. 292) — confirmar em vistoria antes de pedir.</>)}
          </div>
        </div>
      );
    }

    if (secao === "tributos") {
      const t = (k: keyof TributosFatura, xs: Linha[]) => soma(xs, l => l.tributos?.[k] || 0);
      corpo = (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-[#141414] border border-emerald-500/30 rounded-xl p-4 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold">IR retido na energia — fica com o Município</div>
              <div className="text-2xl font-bold text-white">{fmtR(-t("irpj_retido", e))}</div>
              <p className="text-[11px] text-gray-400">A Prefeitura desconta o IR da CELESC (1,2% na energia, 4,8% na demanda) e o valor é receita do Município (STF, Tema 1.130). Na água, a CASAN já desconta 4,8% na própria conta ("Valor Serviço"). Confira se toda fatura tem a retenção.</p>
            </div>
            <div className="bg-[#141414] border border-white/10 rounded-xl p-4 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">COSIP — o Município paga a si mesmo</div>
              <div className="text-2xl font-bold text-white">{fmtR(t("cosip", e))}</div>
              <p className="text-[11px] text-gray-400">Contribuição de iluminação pública cobrada em prédios da própria Prefeitura. Vale ver se a lei municipal isenta os imóveis do Município.</p>
            </div>
            <div className="bg-[#141414] border border-white/10 rounded-xl p-4 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">ICMS e PIS/COFINS — só para conhecimento</div>
              <div className="text-2xl font-bold text-white">{fmtR(t("icms", e) + t("pis_cofins", e))}</div>
              <p className="text-[11px] text-gray-400">Vêm dentro do preço. Não dá para recuperar: o Município é só quem paga no fim, não o contribuinte (STF, Tema 342). O ICMS da demanda não usada já sai da conta (Súmula 391 do STJ).</p>
            </div>
          </div>
        </div>
      );
    }

    conteudo = <div className="space-y-4">{subnav}{corpo}</div>;
  }

  const naoClassificados = [...new Set(ls.flatMap(l => l.nao_classificados))];
  const tituloAba = aba === "economia" ? `Economia — ${SECOES.find(([k]) => k === secao)?.[1]}` : ABAS.find(([k]) => k === aba)?.[1];
  return (
    <div className="bg-[#0f0f0f] p-4 sm:p-6 rounded-xl border border-white/10 shadow-lg space-y-4 w-full" id="relatorios">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-3">
        <h4 className="font-bold text-white text-xl">Relatórios</h4>
        <span className="text-[11px] text-gray-500">{ls.length} faturas no filtro · {tituloPeriodo}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex flex-wrap gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
          {ABAS.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setAba(k)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-semibold transition ${aba === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
              {t}{k === "acoes" && abertasAgora.length > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-rose-500/80 text-white text-[10px]">{abertasAgora.length}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => imprimir(`SisPu.JP — ${tituloAba} ${tituloPeriodo}`, "relatorios-conteudo")} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-xs">
          <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
        </button>
      </div>
      {filtros}
      {naoClassificados.length > 0 && (
        <div className="text-[11px] text-amber-300 bg-amber-500/5 border border-amber-500/30 rounded-lg p-2">⚠️ Itens de fatura que o sistema ainda não sabe classificar (entram em "Outros"): {naoClassificados.join(", ")}</div>
      )}
      <div id="relatorios-conteudo" className="space-y-4">
        <div className="hidden print-titulo text-sm font-bold">{tituloAba} — {tituloPeriodo}</div>
        {conteudo}
      </div>
      {unidadeAberta && <PainelUnidade unidadeId={unidadeAberta} todas={todas} deInicial={deSel} ateInicial={ateSel} onClose={() => setUnidadeAberta(null)} />}
    </div>
  );
}
