import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Printer, TrendingDown, TrendingUp } from "lucide-react";

type Linha = {
  id: string; mes: string; contrato_id: string; codigo: string; concessionaria: "CASAN" | "CELESC";
  unidade_id: string; unidade_nome: string; unidade_endereco: string; secretaria_id: string; secretaria_nome: string;
  consumo: number; valor_total: number; energia_injetada: number; grupo_tarifario: string;
  credito_solar: number; demanda_nao_utilizada: number; ultrapassagem: number; reativo_excedente: number;
};
type Base = { linhas: Linha[]; unidades: { id: string; nome: string; endereco: string }[]; secretarias: { id: string; nome: string }[] };

// Paleta validada (dataviz/validate_palette, superfície escura): CASAN azul, CELESC âmbar.
const COR = { CASAN: "#3b82f6", CELESC: "#d97706" } as const;
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = (v: number, d = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtPct = (v: number | null) => (v === null || !isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${fmtN(v * 100, 1)}%`);
const soma = (ls: Linha[], k: keyof Linha) => ls.reduce((a, l) => a + (Number(l[k]) || 0), 0);
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const desvio = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const mesesAnteriores = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(a, m - 2 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
};
// Desvio em relação aos 12 meses anteriores (z-score); null quando não há histórico suficiente.
const zScore = (valor: number, historico: number[]) => {
  if (historico.length < 3) return null;
  const s = desvio(historico);
  return s > 0 ? (valor - media(historico)) / s : null;
};
const fmtZ = (z: number | null) => (z === null ? "—" : `${z > 0 ? "+" : ""}${fmtN(z, 1)}σ`);

type Coluna<T> = { titulo: string; valor: (l: T) => string | number; direita?: boolean; csv?: (l: T) => string | number };

function exportarCSV<T>(nome: string, colunas: Coluna<T>[], linhas: T[]) {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const corpo = [colunas.map(c => esc(c.titulo)).join(";"), ...linhas.map(l => colunas.map(c => esc(c.csv ? c.csv(l) : c.valor(l))).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Tabela<T>({ nome, colunas, linhas, rodape, vazio = "Sem dados para o período.", linhasCSV }: {
  nome: string; colunas: Coluna<NoInfer<T>>[]; linhas: T[]; rodape?: (string | number)[]; vazio?: string; linhasCSV?: T[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={() => exportarCSV(nome, colunas, linhasCSV || linhas)} disabled={!linhas.length}
          className="print:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-[11px] disabled:opacity-40">
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto border border-white/10 rounded-lg">
        <table className="w-full text-xs text-gray-300">
          <thead className="bg-black/40 text-gray-400 text-[10px] uppercase font-mono">
            <tr>{colunas.map(c => <th key={c.titulo} className={`px-3 py-2 ${c.direita ? "text-right" : "text-left"}`}>{c.titulo}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {linhas.length === 0 && <tr><td colSpan={colunas.length} className="px-3 py-4 text-gray-500">{vazio}</td></tr>}
            {linhas.map((l, i) => (
              <tr key={i} className="hover:bg-white/5">
                {colunas.map(c => <td key={c.titulo} className={`px-3 py-1.5 ${c.direita ? "text-right font-mono" : ""}`}>{c.valor(l)}</td>)}
              </tr>
            ))}
          </tbody>
          {rodape && linhas.length > 0 && (
            <tfoot className="bg-black/30 font-bold text-white">
              <tr>{rodape.map((v, i) => <td key={i} className={`px-3 py-2 ${i > 0 ? "text-right font-mono" : ""}`}>{v}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Colunas mensais agrupadas por série, mesma escala (R$). Barra <= 24px, topo arredondado 4px,
// 2px de folga entre barras vizinhas, grade fina; tooltip por mês.
function BarrasMensais({ series, formato = fmtR }: {
  series: { nome: string; cor: string; valores: number[] }[]; formato?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 240, M = { t: 10, r: 8, b: 22, l: 78 };
  const max = Math.max(1, ...series.flatMap(s => s.valores));
  // 4 intervalos "redondos" (1, 2, 2,5 ou 5 × 10^n) que cobrem o maior valor.
  const passo = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const intervalo = [1, 2, 2.5, 5, 10].map(f => f * passo).find(v => v * 4 >= max) ?? max / 4;
  const topo = intervalo * 4;
  const ticks = [0, 1, 2, 3, 4].map(i => (topo / 4) * i);
  const slot = (W - M.l - M.r) / 12;
  const larg = Math.min(24, (slot * 0.8 - 2 * (series.length - 1)) / series.length);
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / topo);
  const barra = (x: number, v: number) => {
    const y0 = H - M.b, y1 = y(v), r = Math.min(4, (y0 - y1) / 2, larg / 2);
    if (y0 - y1 < 0.5) return "";
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + larg - r} Q${x + larg},${y1} ${x + larg},${y1 + r} V${y0} Z`;
  };
  return (
    <div className="space-y-2">
      {series.length > 1 && (
        <div className="flex gap-4 text-[11px] text-gray-300">
          {series.map(s => <span key={s.nome} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />{s.nome}</span>)}
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#2a2a2a" strokeWidth={1} />
              <text x={M.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#9ca3af">{formato(t).replace(",00", "")}</text>
            </g>
          ))}
          {MESES.map((m, i) => {
            const x0 = M.l + slot * i + (slot - (larg * series.length + 2 * (series.length - 1))) / 2;
            return (
              <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={M.l + slot * i} y={M.t} width={slot} height={H - M.t - M.b} fill={hover === i ? "rgba(255,255,255,0.04)" : "transparent"} />
                {series.map((s, k) => <path key={s.nome} d={barra(x0 + k * (larg + 2), s.valores[i] || 0)} fill={s.cor} />)}
                <text x={M.l + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#9ca3af">{m}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="absolute top-1 pointer-events-none bg-[#18181b] border border-white/15 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-200 shadow-xl"
            style={{ left: `${Math.min(80, (hover / 12) * 100 + 4)}%` }}>
            <div className="font-bold mb-0.5">{MESES[hover]}</div>
            {series.map(s => (
              <div key={s.nome} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.cor }} />{s.nome}: <b>{formato(s.valores[hover] || 0)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Abre só o relatório numa janela própria, em fundo branco, e manda imprimir (ou salvar em PDF).
function imprimirRelatorio(titulo: string) {
  const el = document.getElementById("relatorios-conteudo");
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) { window.print(); return; }
  const estilos = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(n => n.outerHTML).join("");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>${estilos}
    <style>
      body { background: #fff !important; padding: 16px; }
      body * { color: #111 !important; background: transparent !important; border-color: #ccc !important; box-shadow: none !important; }
      .print\\:hidden { display: none !important; } .print-titulo { display: block !important; margin-bottom: 8px; }
      table { page-break-inside: auto; } tr { page-break-inside: avoid; }
    </style></head><body>${el.outerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: React.ReactNode }) {
  return (
    <div className="bg-[#141414] border border-white/10 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{titulo}</div>
      <div className="text-lg font-bold text-white font-mono">{valor}</div>
      {detalhe && <div className="text-[11px] text-gray-400">{detalhe}</div>}
    </div>
  );
}

function Variacao({ v }: { v: number | null }) {
  if (v === null || !isFinite(v)) return <span className="text-gray-500">sem base de comparação</span>;
  const Icone = v >= 0 ? TrendingUp : TrendingDown;
  return <span className="inline-flex items-center gap-1"><Icone className="h-3.5 w-3.5" />{fmtPct(v)} vs os mesmos meses do ano anterior</span>;
}

const ABAS = [
  ["geral", "Visão geral"], ["unidade", "Por Unidade Gestora"], ["secretaria", "Por secretaria"], ["ranking", "Rankings"],
  ["alertas", "Alertas"], ["solar", "Energia solar"], ["demanda", "Demanda e multas"],
] as const;
type Aba = typeof ABAS[number][0];

export default function Relatorios({ versao }: { versao: number }) {
  const [base, setBase] = useState<Base | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("geral");
  const [ano, setAno] = useState<string>("");
  const [unidadeId, setUnidadeId] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [secretariaId, setSecretariaId] = useState("");
  const [mesAlerta, setMesAlerta] = useState("");
  const [todasUnidadesSec, setTodasUnidadesSec] = useState(false);

  useEffect(() => {
    fetch("/api/relatorios/base").then(r => r.json()).then((b: Base) => { setBase(b); setErro(""); })
      .catch(() => setErro("Não foi possível carregar os dados dos relatórios."));
  }, [versao]);

  const linhas = base?.linhas || [];
  const anos = useMemo(() => [...new Set(linhas.map(l => l.mes.substring(0, 4)).filter(Boolean))].sort().reverse(), [linhas]);
  const anoSel = ano || anos[0] || String(new Date().getFullYear());
  const doAno = useMemo(() => linhas.filter(l => l.mes.startsWith(anoSel)), [linhas, anoSel]);
  const anoAnt = String(Number(anoSel) - 1);
  const mesesDoAno = useMemo(() => [...new Set(doAno.map(l => l.mes))].sort(), [doAno]);
  const mesAlertaSel = mesAlerta && mesesDoAno.includes(mesAlerta) ? mesAlerta : mesesDoAno[mesesDoAno.length - 1] || "";
  const porMes = (ls: Linha[], conc?: string, k: keyof Linha = "valor_total") =>
    MESES.map((_, i) => soma(ls.filter(l => l.mes === `${anoSel}-${String(i + 1).padStart(2, "0")}` && (!conc || l.concessionaria === conc)), k));
  const totalPorMesGlobal = useMemo(() => {
    const m = new Map<string, number>();
    linhas.forEach(l => m.set(l.mes, (m.get(l.mes) || 0) + l.valor_total));
    return m;
  }, [linhas]);
  // Compara só os meses que têm faturas nos dois anos.
  const comparacaoAnoAnterior = (ls: Linha[], filtro: (l: Linha) => boolean = () => true) => {
    const atuais = ls.filter(filtro);
    const anteriores = linhas.filter(l => l.mes.startsWith(anoAnt) && filtro(l));
    const mesesAnt = new Set(anteriores.map(l => l.mes.substring(5)));
    const comuns = new Set(atuais.map(l => l.mes.substring(5)).filter(m => mesesAnt.has(m)));
    if (comuns.size === 0) return null;
    const atual = soma(atuais.filter(l => comuns.has(l.mes.substring(5))), "valor_total");
    const anterior = soma(anteriores.filter(l => comuns.has(l.mes.substring(5))), "valor_total");
    return anterior > 0 ? atual / anterior - 1 : null;
  };

  if (erro) return <div className="bg-[#0f0f0f] p-6 rounded-xl border border-rose-500/30 text-rose-300 text-sm">{erro}</div>;
  if (!base) return <div className="bg-[#0f0f0f] p-6 rounded-xl border border-white/10 text-gray-400 text-sm">Carregando relatórios…</div>;

  const cabecalho = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="flex flex-wrap gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
        {ABAS.map(([k, t]) => (
          <button key={k} type="button" onClick={() => setAba(k)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${aba === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{t}</button>
        ))}
      </div>
      <select value={anoSel} onChange={(e) => setAno(e.target.value)} className="bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white">
        {anos.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <button type="button" onClick={() => imprimirRelatorio(`SisPu.JP — ${ABAS.find(([k]) => k === aba)?.[1]} ${anoSel}`)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-xs">
        <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
      </button>
    </div>
  );

  let conteudo: React.ReactNode = null;

  if (aba === "geral") {
    const casan = doAno.filter(l => l.concessionaria === "CASAN"), celesc = doAno.filter(l => l.concessionaria === "CELESC");
    let acumulado = 0;
    const tabela = MESES.map((m, i) => {
      const mes = `${anoSel}-${String(i + 1).padStart(2, "0")}`;
      const doMes = doAno.filter(l => l.mes === mes);
      const total = soma(doMes, "valor_total");
      acumulado += total;
      const anterior = soma(linhas.filter(l => l.mes === `${anoAnt}-${mes.substring(5)}`), "valor_total");
      const hist = mesesAnteriores(mes, 12).map(x => totalPorMesGlobal.get(x)).filter((v): v is number => v !== undefined);
      return {
        mes: m, casanR: soma(doMes.filter(l => l.concessionaria === "CASAN"), "valor_total"), casanC: soma(doMes.filter(l => l.concessionaria === "CASAN"), "consumo"),
        celescR: soma(doMes.filter(l => l.concessionaria === "CELESC"), "valor_total"), celescC: soma(doMes.filter(l => l.concessionaria === "CELESC"), "consumo"),
        total, acumulado, anterior, var: anterior > 0 && total > 0 ? total / anterior - 1 : null, z: total > 0 ? zScore(total, hist) : null,
      };
    }).filter(r => r.total > 0 || r.anterior > 0);
    conteudo = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Indicador titulo={`Total ${anoSel}`} valor={fmtR(soma(doAno, "valor_total"))} detalhe={<Variacao v={comparacaoAnoAnterior(doAno)} />} />
          <Indicador titulo="💧 CASAN" valor={fmtR(soma(casan, "valor_total"))} detalhe={`${fmtN(soma(casan, "consumo"))} m³`} />
          <Indicador titulo="⚡ CELESC" valor={fmtR(soma(celesc, "valor_total"))} detalhe={`${fmtN(soma(celesc, "consumo"))} kWh`} />
          <Indicador titulo="☀️ Energia injetada" valor={`${fmtN(soma(celesc, "energia_injetada"))} kWh`} detalhe={`crédito ${fmtR(soma(celesc, "credito_solar"))}`} />
        </div>
        <BarrasMensais series={[{ nome: "CASAN (R$)", cor: COR.CASAN, valores: porMes(doAno, "CASAN") }, { nome: "CELESC (R$)", cor: COR.CELESC, valores: porMes(doAno, "CELESC") }]} />
        <Tabela nome={`visao-geral-${anoSel}`} linhas={tabela} colunas={[
          { titulo: "Mês", valor: r => r.mes },
          { titulo: "CASAN R$", valor: r => fmtR(r.casanR), direita: true, csv: r => r.casanR.toFixed(2) },
          { titulo: "CASAN m³", valor: r => fmtN(r.casanC), direita: true, csv: r => r.casanC },
          { titulo: "CELESC R$", valor: r => fmtR(r.celescR), direita: true, csv: r => r.celescR.toFixed(2) },
          { titulo: "CELESC kWh", valor: r => fmtN(r.celescC), direita: true, csv: r => r.celescC },
          { titulo: "Total", valor: r => fmtR(r.total), direita: true, csv: r => r.total.toFixed(2) },
          { titulo: "Acumulado", valor: r => fmtR(r.acumulado), direita: true, csv: r => r.acumulado.toFixed(2) },
          { titulo: `Mesmo mês ${anoAnt}`, valor: r => (r.anterior ? fmtR(r.anterior) : "—"), direita: true, csv: r => r.anterior.toFixed(2) },
          { titulo: "Variação", valor: r => fmtPct(r.var), direita: true },
          { titulo: "Desvio (12m)", valor: r => fmtZ(r.z), direita: true },
        ]} rodape={["Total", fmtR(soma(casan, "valor_total")), fmtN(soma(casan, "consumo")), fmtR(soma(celesc, "valor_total")), fmtN(soma(celesc, "consumo")), fmtR(soma(doAno, "valor_total")), "", "", "", ""]} />
        <p className="text-[11px] text-gray-500">Desvio (12m): quantos desvios padrão o total do mês está acima (+) ou abaixo (−) da média dos 12 meses anteriores. Acima de +2σ é um mês fora do comum.</p>
      </div>
    );
  }

  if (aba === "unidade") {
    const opcoes = base.unidades.filter(u => linhas.some(l => l.unidade_id === u.id))
      .filter(u => !filtroUnidade || `${u.nome} ${u.endereco}`.toUpperCase().includes(filtroUnidade.toUpperCase()))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    const uSel = base.unidades.find(u => u.id === unidadeId);
    const daUnidade = doAno.filter(l => l.unidade_id === unidadeId);
    const totalUnidadePorMes = new Map<string, number>();
    linhas.filter(l => l.unidade_id === unidadeId).forEach(l => totalUnidadePorMes.set(l.mes, (totalUnidadePorMes.get(l.mes) || 0) + l.valor_total));
    const tabela = MESES.map((m, i) => {
      const mes = `${anoSel}-${String(i + 1).padStart(2, "0")}`;
      const doMes = daUnidade.filter(l => l.mes === mes);
      const a = doMes.filter(l => l.concessionaria === "CASAN"), e = doMes.filter(l => l.concessionaria === "CELESC");
      const total = soma(doMes, "valor_total");
      const hist = mesesAnteriores(mes, 12).map(x => totalUnidadePorMes.get(x)).filter((v): v is number => v !== undefined);
      return {
        mes: m, aguaC: soma(a, "consumo"), aguaR: soma(a, "valor_total"), luzC: soma(e, "consumo"), luzR: soma(e, "valor_total"),
        inj: soma(e, "energia_injetada"), total, z: total > 0 ? zScore(total, hist) : null,
      };
    }).filter(r => r.total > 0);
    const contratos = [...new Map<string, Linha>(daUnidade.map(l => [l.contrato_id, l] as [string, Linha])).values()];
    conteudo = (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center print:hidden">
          <input value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)} placeholder="Filtrar por nome ou endereço…"
            className="bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white w-64" />
          <select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} className="bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white max-w-md">
            <option value="">Selecione a Unidade Gestora ({opcoes.length})</option>
            {opcoes.map(u => <option key={u.id} value={u.id}>{u.nome} — {u.endereco}</option>)}
          </select>
        </div>
        {!uSel && <p className="text-xs text-gray-500">Escolha uma Unidade Gestora para ver água e luz do local mês a mês.</p>}
        {uSel && (
          <>
            <div>
              <div className="text-white font-bold">{uSel.nome}</div>
              <div className="text-[11px] text-gray-400">{uSel.endereco} · contratos no ano: {contratos.map(c => `${c.concessionaria === "CASAN" ? "💧" : "⚡"} ${c.codigo}`).join("  ") || "nenhum"}</div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Indicador titulo={`Total ${anoSel}`} valor={fmtR(soma(daUnidade, "valor_total"))} detalhe={<Variacao v={comparacaoAnoAnterior(doAno, l => l.unidade_id === unidadeId)} />} />
              <Indicador titulo="💧 Água" valor={fmtR(soma(daUnidade.filter(l => l.concessionaria === "CASAN"), "valor_total"))} detalhe={`${fmtN(soma(daUnidade.filter(l => l.concessionaria === "CASAN"), "consumo"))} m³`} />
              <Indicador titulo="⚡ Energia" valor={fmtR(soma(daUnidade.filter(l => l.concessionaria === "CELESC"), "valor_total"))} detalhe={`${fmtN(soma(daUnidade.filter(l => l.concessionaria === "CELESC"), "consumo"))} kWh`} />
              <Indicador titulo="Média mensal" valor={fmtR(media(tabela.map(r => r.total)))} detalhe={`desvio padrão ${fmtR(desvio(tabela.map(r => r.total)))}`} />
            </div>
            <BarrasMensais series={[{ nome: "Água (R$)", cor: COR.CASAN, valores: porMes(daUnidade, "CASAN") }, { nome: "Energia (R$)", cor: COR.CELESC, valores: porMes(daUnidade, "CELESC") }]} />
            <Tabela nome={`unidade-${uSel.nome}-${anoSel}`} linhas={tabela} colunas={[
              { titulo: "Mês", valor: r => r.mes },
              { titulo: "Água m³", valor: r => fmtN(r.aguaC), direita: true, csv: r => r.aguaC },
              { titulo: "Água R$", valor: r => fmtR(r.aguaR), direita: true, csv: r => r.aguaR.toFixed(2) },
              { titulo: "R$/m³", valor: r => (r.aguaC ? fmtR(r.aguaR / r.aguaC) : "—"), direita: true },
              { titulo: "Energia kWh", valor: r => fmtN(r.luzC), direita: true, csv: r => r.luzC },
              { titulo: "Energia R$", valor: r => fmtR(r.luzR), direita: true, csv: r => r.luzR.toFixed(2) },
              { titulo: "R$/kWh", valor: r => (r.luzC ? fmtR(r.luzR / r.luzC) : "—"), direita: true },
              { titulo: "Injetada kWh", valor: r => fmtN(r.inj), direita: true, csv: r => r.inj },
              { titulo: "Total", valor: r => fmtR(r.total), direita: true, csv: r => r.total.toFixed(2) },
              { titulo: "Desvio (12m)", valor: r => fmtZ(r.z), direita: true },
            ]} rodape={["Total", fmtN(soma(daUnidade.filter(l => l.concessionaria === "CASAN"), "consumo")), fmtR(soma(daUnidade.filter(l => l.concessionaria === "CASAN"), "valor_total")), "", fmtN(soma(daUnidade.filter(l => l.concessionaria === "CELESC"), "consumo")), fmtR(soma(daUnidade.filter(l => l.concessionaria === "CELESC"), "valor_total")), "", fmtN(soma(daUnidade, "energia_injetada")), fmtR(soma(daUnidade, "valor_total")), ""]} />
          </>
        )}
      </div>
    );
  }

  if (aba === "secretaria") {
    const totalAno = soma(doAno, "valor_total");
    const porSec = [...new Set(doAno.map(l => l.secretaria_id))].map(id => {
      const ls = doAno.filter(l => l.secretaria_id === id);
      const mensal = mesesDoAno.map(m => soma(ls.filter(l => l.mes === m), "valor_total"));
      const m = media(mensal), s = desvio(mensal);
      return {
        id, nome: ls[0]?.secretaria_nome || "SEM SECRETARIA", casan: soma(ls.filter(l => l.concessionaria === "CASAN"), "valor_total"),
        celesc: soma(ls.filter(l => l.concessionaria === "CELESC"), "valor_total"), total: soma(ls, "valor_total"),
        unidades: new Set(ls.map(l => l.unidade_id)).size, media: m, desvio: s, cv: m > 0 ? s / m : null,
      };
    }).sort((a, b) => b.total - a.total);
    const sel = secretariaId || (porSec.length === 1 ? porSec[0].id : "");
    const daSec = doAno.filter(l => l.secretaria_id === sel);
    const totalSec = soma(daSec, "valor_total");
    const ranking = [...new Set(daSec.map(l => l.unidade_id))].map(id => {
      const ls = daSec.filter(l => l.unidade_id === id);
      return { nome: ls[0].unidade_nome, endereco: ls[0].unidade_endereco, casan: soma(ls.filter(l => l.concessionaria === "CASAN"), "valor_total"), celesc: soma(ls.filter(l => l.concessionaria === "CELESC"), "valor_total"), total: soma(ls, "valor_total") };
    }).sort((a, b) => b.total - a.total);
    conteudo = (
      <div className="space-y-4">
        <Tabela nome={`secretarias-${anoSel}`} linhas={porSec} colunas={[
          { titulo: "Secretaria", valor: r => <button type="button" className="underline decoration-dotted text-left" onClick={() => setSecretariaId(r.id)}>{r.nome}</button>, csv: r => r.nome },
          { titulo: "Unidades", valor: r => r.unidades, direita: true },
          { titulo: "CASAN R$", valor: r => fmtR(r.casan), direita: true, csv: r => r.casan.toFixed(2) },
          { titulo: "CELESC R$", valor: r => fmtR(r.celesc), direita: true, csv: r => r.celesc.toFixed(2) },
          { titulo: "Total", valor: r => fmtR(r.total), direita: true, csv: r => r.total.toFixed(2) },
          { titulo: "% do total", valor: r => fmtPct(totalAno ? r.total / totalAno : null).replace("+", ""), direita: true },
          { titulo: "Média mensal", valor: r => fmtR(r.media), direita: true, csv: r => r.media.toFixed(2) },
          { titulo: "Desvio padrão", valor: r => fmtR(r.desvio), direita: true, csv: r => r.desvio.toFixed(2) },
          { titulo: "Variação mensal", valor: r => (r.cv === null ? "—" : `${fmtN(r.cv * 100, 1)}%`), direita: true },
        ]} rodape={["Total", porSec.reduce((a, r) => a + r.unidades, 0), fmtR(porSec.reduce((a, r) => a + r.casan, 0)), fmtR(porSec.reduce((a, r) => a + r.celesc, 0)), fmtR(totalAno), "100%", "", "", ""]} />
        <p className="text-[11px] text-gray-500">Variação mensal = desvio padrão ÷ média: quanto o gasto da secretaria oscila de um mês para outro. Clique numa secretaria para ver o ranking das unidades dela.</p>
        {sel && (
          <div className="space-y-2">
            <div className="text-white font-bold text-sm">Unidades — {porSec.find(r => r.id === sel)?.nome}</div>
            <Tabela nome={`secretaria-unidades-${anoSel}`} linhas={todasUnidadesSec ? ranking : ranking.slice(0, 30)} linhasCSV={ranking} colunas={[
              { titulo: "#", valor: r => ranking.indexOf(r) + 1 },
              { titulo: "Unidade Gestora", valor: r => r.nome },
              { titulo: "Endereço", valor: r => r.endereco },
              { titulo: "CASAN R$", valor: r => fmtR(r.casan), direita: true, csv: r => r.casan.toFixed(2) },
              { titulo: "CELESC R$", valor: r => fmtR(r.celesc), direita: true, csv: r => r.celesc.toFixed(2) },
              { titulo: "Total", valor: r => fmtR(r.total), direita: true, csv: r => r.total.toFixed(2) },
              { titulo: "% da secretaria", valor: r => fmtPct(totalSec ? r.total / totalSec : null).replace("+", ""), direita: true },
            ]} />
            {ranking.length > 30 && (
              <button type="button" onClick={() => setTodasUnidadesSec(!todasUnidadesSec)} className="print:hidden text-xs text-indigo-300 underline">
                {todasUnidadesSec ? "Mostrar só as 30 primeiras" : `Mostrar todas as ${ranking.length} unidades`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (aba === "ranking") {
    const unidades = [...new Set(doAno.map(l => l.unidade_id))].map(id => {
      const ls = doAno.filter(l => l.unidade_id === id);
      const ant = linhas.filter(l => l.unidade_id === id && l.mes.startsWith(anoAnt));
      const mesesAnt = new Set(ant.map(l => l.mes.substring(5)));
      const comuns = new Set(ls.map(l => l.mes.substring(5)).filter(m => mesesAnt.has(m)));
      const anterior = soma(ant.filter(l => comuns.has(l.mes.substring(5))), "valor_total");
      const atualComum = soma(ls.filter(l => comuns.has(l.mes.substring(5))), "valor_total");
      const total = soma(ls, "valor_total");
      return { nome: ls[0].unidade_nome, endereco: ls[0].unidade_endereco, secretaria: ls[0].secretaria_nome, total, atualComum, anterior, aumento: anterior > 0 ? atualComum - anterior : null, pct: anterior > 0 ? atualComum / anterior - 1 : null };
    });
    const maiores = [...unidades].sort((a, b) => b.total - a.total).slice(0, 20);
    const aumentos = unidades.filter(u => u.aumento !== null && u.aumento > 0).sort((a, b) => (b.aumento || 0) - (a.aumento || 0)).slice(0, 20);
    conteudo = (
      <div className="space-y-5">
        <div className="text-white font-bold text-sm">20 Unidades Gestoras com maior custo em {anoSel}</div>
        <Tabela nome={`ranking-custo-${anoSel}`} linhas={maiores} colunas={[
          { titulo: "#", valor: r => maiores.indexOf(r) + 1 },
          { titulo: "Unidade Gestora", valor: r => r.nome }, { titulo: "Endereço", valor: r => r.endereco }, { titulo: "Secretaria", valor: r => r.secretaria },
          { titulo: "Total", valor: r => fmtR(r.total), direita: true, csv: r => r.total.toFixed(2) },
        ]} />
        <div className="text-white font-bold text-sm">20 maiores aumentos (mesmos meses de {anoAnt})</div>
        <Tabela nome={`ranking-aumentos-${anoSel}`} linhas={aumentos} vazio={`Sem dados de ${anoAnt} para comparar.`} colunas={[
          { titulo: "#", valor: r => aumentos.indexOf(r) + 1 },
          { titulo: "Unidade Gestora", valor: r => r.nome }, { titulo: "Endereço", valor: r => r.endereco },
          { titulo: anoAnt, valor: r => fmtR(r.anterior), direita: true, csv: r => r.anterior.toFixed(2) },
          { titulo: anoSel, valor: r => fmtR(r.atualComum), direita: true, csv: r => r.atualComum.toFixed(2) },
          { titulo: "Aumento R$", valor: r => fmtR(r.aumento || 0), direita: true, csv: r => (r.aumento || 0).toFixed(2) },
          { titulo: "Aumento %", valor: r => fmtPct(r.pct), direita: true },
        ]} />
      </div>
    );
  }

  if (aba === "alertas") {
    const mes = mesAlertaSel;
    const consumoPorContratoMes = new Map<string, Linha>();
    linhas.forEach(l => consumoPorContratoMes.set(`${l.contrato_id}|${l.mes}`, l));
    const doMes = linhas.filter(l => l.mes === mes);
    type Pico = { l: Linha; z: number | null; media: number; desvio: number; meses: number; var: number | null };
    const picos: Pico[] = doMes.map((l): Pico => {
      const hist = mesesAnteriores(mes, 12).map(m => consumoPorContratoMes.get(`${l.contrato_id}|${m}`)?.consumo).filter((v): v is number => v !== undefined);
      const z = zScore(l.consumo, hist), m = media(hist);
      return { l, z, media: m, desvio: desvio(hist), meses: hist.length, var: m > 0 ? l.consumo / m - 1 : null };
    }).filter(p => p.z !== null && p.z >= 2 && p.l.consumo >= p.media * 1.3).sort((a, b) => (b.z || 0) - (a.z || 0));
    const zerados: Linha[] = doMes.filter(l => l.consumo === 0 && l.valor_total > 0 &&
      mesesAnteriores(mes, 2).every(m => { const x = consumoPorContratoMes.get(`${l.contrato_id}|${m}`); return x && x.consumo === 0; }));
    const anterior = mesesAnteriores(mes, 1)[0];
    const contratosNoMes = new Set(doMes.map(l => l.contrato_id));
    const faltando: Linha[] = linhas.filter(l => l.mes === anterior && !contratosNoMes.has(l.contrato_id));
    const unid = (l: Linha) => (l.concessionaria === "CASAN" ? "m³" : "kWh");
    conteudo = (
      <div className="space-y-5">
        <div className="flex items-center gap-2 print:hidden">
          <span className="text-xs text-gray-400">Mês analisado:</span>
          <select value={mes} onChange={(e) => setMesAlerta(e.target.value)} className="bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white">
            {mesesDoAno.map(m => <option key={m} value={m}>{m.substring(5)}/{m.substring(0, 4)}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Pico de consumo ({picos.length})</div>
          <p className="text-[11px] text-gray-500">Consumo do mês 2 ou mais desvios padrão acima da média dos 12 meses anteriores do mesmo contrato (e pelo menos 30% acima da média). Na CASAN, pode indicar vazamento.</p>
          <Tabela<Pico> nome={`alertas-picos-${mes}`} linhas={picos} vazio="Nenhum pico fora do comum neste mês." colunas={[
            { titulo: "Unidade Gestora", valor: p => p.l.unidade_nome }, { titulo: "Endereço", valor: p => p.l.unidade_endereco }, { titulo: "Conc.", valor: p => p.l.concessionaria }, { titulo: "Medidor", valor: p => p.l.codigo },
            { titulo: "Consumo", valor: p => `${fmtN(p.l.consumo)} ${unid(p.l)}`, direita: true, csv: p => p.l.consumo },
            { titulo: "Média", valor: p => `${fmtN(p.media, 1)} ${unid(p.l)}`, direita: true, csv: p => p.media.toFixed(1) },
            { titulo: "Desvio padrão", valor: p => fmtN(p.desvio, 1), direita: true },
            { titulo: "Desvio", valor: p => fmtZ(p.z), direita: true },
            { titulo: "Acima da média", valor: p => fmtPct(p.var), direita: true },
            { titulo: "Valor", valor: p => fmtR(p.l.valor_total), direita: true, csv: p => p.l.valor_total.toFixed(2) },
          ]} />
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Consumo zero há 3 meses, pagando taxa mínima ({zerados.length})</div>
          <p className="text-[11px] text-gray-500">Imóveis possivelmente desocupados: avaliar o desligamento do contrato.</p>
          <Tabela<Linha> nome={`alertas-zerados-${mes}`} linhas={zerados} vazio="Nenhum contrato nessa situação." colunas={[
            { titulo: "Unidade Gestora", valor: l => l.unidade_nome }, { titulo: "Endereço", valor: l => l.unidade_endereco }, { titulo: "Conc.", valor: l => l.concessionaria },
            { titulo: "Medidor", valor: l => l.codigo }, { titulo: "Valor do mês", valor: l => fmtR(l.valor_total), direita: true, csv: l => l.valor_total.toFixed(2) },
          ]} />
        </div>
        <div className="space-y-2">
          <div className="text-white font-bold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Fatura do mês anterior sem fatura neste mês ({faltando.length})</div>
          <p className="text-[11px] text-gray-500">Contratos faturados em {anterior.substring(5)}/{anterior.substring(0, 4)} que não aparecem neste mês: fatura não importada, contrato encerrado ou cobrança em outra conta.</p>
          <Tabela<Linha> nome={`alertas-faltando-${mes}`} linhas={faltando} vazio="Nenhuma fatura faltando." colunas={[
            { titulo: "Unidade Gestora", valor: l => l.unidade_nome }, { titulo: "Endereço", valor: l => l.unidade_endereco }, { titulo: "Conc.", valor: l => l.concessionaria },
            { titulo: "Medidor", valor: l => l.codigo }, { titulo: "Valor no mês anterior", valor: l => fmtR(l.valor_total), direita: true, csv: l => l.valor_total.toFixed(2) },
          ]} />
        </div>
      </div>
    );
  }

  if (aba === "solar") {
    const comInjecao = doAno.filter(l => l.energia_injetada > 0 || l.credito_solar > 0);
    const porUnidade = [...new Set(comInjecao.map(l => l.unidade_id))].map(id => {
      const ls = comInjecao.filter(l => l.unidade_id === id);
      return { nome: ls[0].unidade_nome, endereco: ls[0].unidade_endereco, kwh: soma(ls, "energia_injetada"), credito: soma(ls, "credito_solar"), meses: new Set(ls.map(l => l.mes)).size };
    }).sort((a, b) => b.credito - a.credito);
    conteudo = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Indicador titulo="Energia injetada no ano" valor={`${fmtN(soma(comInjecao, "energia_injetada"))} kWh`} />
          <Indicador titulo="Crédito na fatura" valor={fmtR(soma(comInjecao, "credito_solar"))} detalhe="soma dos itens de energia injetada" />
          <Indicador titulo="Unidades com geração" valor={String(porUnidade.length)} />
        </div>
        <div className="text-[11px] text-gray-400">Crédito de energia injetada por mês (R$)</div>
        <BarrasMensais series={[{ nome: "Crédito solar (R$)", cor: COR.CELESC, valores: porMes(comInjecao, "CELESC", "credito_solar") }]} />
        <Tabela nome={`energia-solar-${anoSel}`} linhas={porUnidade} vazio="Nenhuma energia injetada no ano." colunas={[
          { titulo: "Unidade Gestora", valor: r => r.nome }, { titulo: "Endereço", valor: r => r.endereco },
          { titulo: "Injetada kWh", valor: r => fmtN(r.kwh), direita: true, csv: r => r.kwh },
          { titulo: "Crédito R$", valor: r => fmtR(r.credito), direita: true, csv: r => r.credito.toFixed(2) },
          { titulo: "Meses com injeção", valor: r => r.meses, direita: true },
        ]} rodape={["Total", "", fmtN(porUnidade.reduce((a, r) => a + r.kwh, 0)), fmtR(porUnidade.reduce((a, r) => a + r.credito, 0)), ""]} />
      </div>
    );
  }

  if (aba === "demanda") {
    const relevantes = doAno.filter(l => l.demanda_nao_utilizada > 0 || l.ultrapassagem > 0 || l.reativo_excedente > 0);
    const porContrato = [...new Set(relevantes.map(l => l.contrato_id))].map(id => {
      const ls = relevantes.filter(l => l.contrato_id === id);
      const d = soma(ls, "demanda_nao_utilizada"), u = soma(ls, "ultrapassagem"), r = soma(ls, "reativo_excedente");
      return { nome: ls[0].unidade_nome, endereco: ls[0].unidade_endereco, codigo: ls[0].codigo, d, u, r, total: d + u + r, meses: new Set(ls.map(l => l.mes)).size };
    }).sort((a, b) => b.total - a.total);
    const tot = (k: "d" | "u" | "r" | "total") => porContrato.reduce((a, x) => a + x[k], 0);
    conteudo = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Indicador titulo="Demanda paga sem uso" valor={fmtR(tot("d"))} detalhe="Diferença da Demanda Contratada" />
          <Indicador titulo="Ultrapassagem de demanda" valor={fmtR(tot("u"))} />
          <Indicador titulo="Energia reativa excedente" valor={fmtR(tot("r"))} />
          <Indicador titulo="Total evitável" valor={fmtR(tot("total"))} detalhe={`${porContrato.length} contrato(s)`} />
        </div>
        <p className="text-[11px] text-gray-500">
          Demanda paga sem uso: a demanda contratada com a CELESC é maior do que a usada — vale avaliar a redução do contrato.
          Ultrapassagem: o contrário (demanda contratada abaixo da usada). Energia reativa excedente: multa por baixo fator de potência, corrigível com banco de capacitores.
        </p>
        <Tabela nome={`demanda-multas-${anoSel}`} linhas={porContrato} vazio="Nenhuma cobrança de demanda não utilizada ou multa no ano." colunas={[
          { titulo: "Unidade Gestora", valor: r => r.nome }, { titulo: "Endereço", valor: r => r.endereco }, { titulo: "Medidor", valor: r => r.codigo },
          { titulo: "Demanda sem uso", valor: r => fmtR(r.d), direita: true, csv: r => r.d.toFixed(2) },
          { titulo: "Ultrapassagem", valor: r => fmtR(r.u), direita: true, csv: r => r.u.toFixed(2) },
          { titulo: "Reativo excedente", valor: r => fmtR(r.r), direita: true, csv: r => r.r.toFixed(2) },
          { titulo: "Total", valor: r => fmtR(r.total), direita: true, csv: r => r.total.toFixed(2) },
          { titulo: "Meses", valor: r => r.meses, direita: true },
        ]} rodape={["Total", "", "", fmtR(tot("d")), fmtR(tot("u")), fmtR(tot("r")), fmtR(tot("total")), ""]} />
      </div>
    );
  }

  return (
    <div className="bg-[#0f0f0f] p-6 rounded-xl border border-white/10 shadow-lg space-y-5 w-full" id="relatorios">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h4 className="font-bold text-white text-xl">Relatórios</h4>
        <span className="text-[11px] text-gray-500">{linhas.length} faturas no banco · {anoSel}</span>
      </div>
      {cabecalho}
      <div id="relatorios-conteudo" className="space-y-4">
        <div className="hidden print-titulo text-sm font-bold">{ABAS.find(([k]) => k === aba)?.[1]} — {anoSel}</div>
        {conteudo}
      </div>
    </div>
  );
}
