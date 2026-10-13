import React, { useMemo, useState } from "react";
import type { EdificioResumo, Ligacao, TipoLigacao } from "../utils/edificios";

// Painel dos edifícios: quanto os prédios cadastrados gastam juntos, mês a mês (água e luz
// empilhadas), quais gastam mais em 12 meses e quais mais subiram contra o ano anterior.

const COR: Record<TipoLigacao, string> = { AGUA: "#0284c7", LUZ: "#d97706" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const mesBR = (m: string) => (m ? `${m.substring(5, 7)}/${m.substring(0, 4)}` : "—");
const rotulo = (m: string) => `${MESES[Number(m.substring(5, 7)) - 1]}/${m.substring(2, 4)}`;

type Props = { meses: string[]; ultimo: Record<TipoLigacao, string>; edificios: EdificioResumo[]; semEdificio: Ligacao[]; onAbrir: (id: string) => void };

export default function EdificiosPainel({ meses, ultimo, edificios, semEdificio, onAbrir }: Props) {
  const [foco, setFoco] = useState<string | null>(null);
  const ultimos = meses.slice(-12);

  const mensal = useMemo(() => ultimos.map((m, i) => {
    const soma = (mes: string) => edificios.reduce((a, e) => ({ agua: a.agua + (e.serie[mes]?.agua_valor || 0), luz: a.luz + (e.serie[mes]?.luz_valor || 0) }), { agua: 0, luz: 0 });
    return { mes: m, ...soma(m), anterior: soma(meses[i]) };
  }), [edificios, meses]);
  const maxMes = Math.max(1, ...mensal.map(m => m.agua + m.luz));

  const total = (e: EdificioResumo) => e.agua.valor_12m + e.luz.valor_12m;
  const ranking = [...edificios].sort((a, b) => total(b) - total(a)).slice(0, 15);
  const maxRank = Math.max(1, ...ranking.map(total));
  const gastoEdificios = edificios.reduce((a, e) => a + total(e), 0);
  const gastoFora = semEdificio.reduce((a, l) => a + l.valor_12m, 0);

  // Altas: últimos 3 meses contra os mesmos 3 meses do ano anterior.
  const altas = edificios.map(e => {
    const soma = (ms: string[]) => ms.reduce((a, m) => a + (e.serie[m] ? e.serie[m].agua_valor + e.serie[m].luz_valor : 0), 0);
    const agora = soma(meses.slice(-3)), antes = soma(meses.slice(9, 12));
    return { e, agora, antes, delta: agora - antes };
  }).filter(x => x.antes > 0 && x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 8);

  const Legenda = () => (
    <div className="flex gap-4 text-xs text-gray-300">
      {(["AGUA", "LUZ"] as TipoLigacao[]).map(t => (
        <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR[t] }} />{t === "AGUA" ? "Água" : "Luz"}</span>
      ))}
    </div>
  );
  const focoMes = mensal.find(m => m.mes === foco);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi titulo="Gasto dos edifícios em 12 meses" valor={brl(gastoEdificios)} />
        <Kpi titulo="Parte do gasto total" valor={`${Math.round((gastoEdificios / Math.max(1, gastoEdificios + gastoFora)) * 100)}%`} dica={`Ligações ativas sem edifício: ${brl(gastoFora)} em 12 meses`} />
        <Kpi titulo="Média por edifício" valor={brl(gastoEdificios / Math.max(1, edificios.length))} />
        <Kpi titulo="Maior gasto" valor={ranking[0] ? brl(total(ranking[0])) : "—"} sub={ranking[0]?.nome} />
      </div>

      <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Gasto mensal dos edifícios</h3>
            <p className="text-xs text-gray-400">Soma de todos os prédios. Água até {mesBR(ultimo.AGUA)}, luz até {mesBR(ultimo.LUZ)}; mês sem fatura importada aparece mais baixo.</p>
          </div>
          <Legenda />
        </div>
        <div className="relative">
          <div className="flex items-end gap-1.5 h-48 border-b border-white/15" onMouseLeave={() => setFoco(null)}>
            {mensal.map(m => (
              <div key={m.mes} className="flex-1 h-full flex flex-col justify-end cursor-default" onMouseEnter={() => setFoco(m.mes)}>
                <div className="w-full flex flex-col justify-end gap-[2px]" style={{ height: `${((m.agua + m.luz) / maxMes) * 100}%` }}>
                  <div className="w-full rounded-t" style={{ background: COR.LUZ, flexGrow: m.luz, opacity: foco && foco !== m.mes ? 0.45 : 1 }} />
                  <div className="w-full" style={{ background: COR.AGUA, flexGrow: m.agua, opacity: foco && foco !== m.mes ? 0.45 : 1 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1">{mensal.map(m => <div key={m.mes} className="flex-1 text-center text-[10px] text-gray-500">{rotulo(m.mes)}</div>)}</div>
          {focoMes && (
            <div className="absolute top-0 right-0 bg-[#1a1a1a] border border-white/15 rounded-lg px-3 py-2 text-xs space-y-0.5 pointer-events-none">
              <div className="font-bold">{mesBR(focoMes.mes)}</div>
              <div>Água: {brl(focoMes.agua)}{focoMes.mes > ultimo.AGUA ? " (sem fatura ainda)" : ""}</div>
              <div>Luz: {brl(focoMes.luz)}{focoMes.mes > ultimo.LUZ ? " (sem fatura ainda)" : ""}</div>
              <div className="font-semibold">Total: {brl(focoMes.agua + focoMes.luz)}</div>
              <div className="text-gray-400">Mesmo mês do ano anterior: {brl(focoMes.anterior.agua + focoMes.anterior.luz)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
        <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">Edifícios que mais gastam (12 meses)</h3>
              <p className="text-xs text-gray-400">Clique para abrir o edifício.</p>
            </div>
            <Legenda />
          </div>
          <div className="space-y-1.5">
            {ranking.map(e => (
              <button key={e.id} onClick={() => onAbrir(e.id)} title={`Água ${brl(e.agua.valor_12m)} · Luz ${brl(e.luz.valor_12m)}`}
                className="w-full grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-2 text-left text-xs hover:bg-white/[0.04] rounded px-1 py-1">
                <span className="truncate text-gray-200">{e.nome}</span>
                <span className="flex h-3.5 gap-[2px]" style={{ width: `${(total(e) / maxRank) * 100}%` }}>
                  {e.agua.valor_12m > 0 && <span className="h-full rounded-l" style={{ background: COR.AGUA, flexGrow: e.agua.valor_12m }} />}
                  {e.luz.valor_12m > 0 && <span className="h-full rounded-r" style={{ background: COR.LUZ, flexGrow: e.luz.valor_12m }} />}
                </span>
                <span className="text-gray-300 tabular-nums">{brl(total(e))}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 space-y-3">
          <div>
            <h3 className="text-sm font-bold">Maiores altas</h3>
            <p className="text-xs text-gray-400">Últimos 3 meses ({rotulo(meses[meses.length - 3] || "")} a {rotulo(meses[meses.length - 1] || "")}) contra os mesmos meses do ano anterior.</p>
          </div>
          {altas.length === 0 ? <div className="text-xs text-gray-500">Nenhum edifício subiu no período.</div> : (
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-gray-400 border-b border-white/10">
                <tr><th className="text-left py-1.5">Edifício</th><th className="text-right py-1.5">Antes</th><th className="text-right py-1.5">Agora</th><th className="text-right py-1.5">Alta</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {altas.map(({ e, agora, antes, delta }) => (
                  <tr key={e.id} className="hover:bg-white/[0.04] cursor-pointer" onClick={() => onAbrir(e.id)}>
                    <td className="py-1.5 pr-2 truncate max-w-[12rem]">{e.nome}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-400">{brl(antes)}</td>
                    <td className="py-1.5 text-right tabular-nums">{brl(agora)}</td>
                    <td className="py-1.5 text-right tabular-nums text-amber-200">+{brl(delta)} <span className="text-gray-500">({Math.round((delta / antes) * 100)}%)</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, sub, dica }: { titulo: string; valor: string; sub?: string; dica?: string }) {
  return (
    <div className="bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3" title={dica}>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{titulo}</div>
      <div className="text-sm font-bold mt-1">{valor}</div>
      {sub && <div className="text-[11px] text-gray-400 truncate">{sub}</div>}
    </div>
  );
}
