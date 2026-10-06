import React, { useState } from "react";

// Uma métrica por vez, mês a mês, com o mesmo mês do ano anterior ao lado (barra cinza). Assim o
// gráfico responde uma pergunta só — "subiu ou caiu em relação ao ano passado?" — e nunca mistura
// unidades (kWh com R$) nem escalas diferentes no mesmo eixo.
export type SerieComparativa = { rotulos: string[]; atual: (number | null)[]; anterior: (number | null)[] };

const COR_ANTERIOR = "#5f5e5a";

export default function GraficoComparativo({ rotulos, atual, anterior, nomeAtual, nomeAnterior, cor, formato, altura = 260 }: SerieComparativa & {
  nomeAtual: string; nomeAnterior: string; cor: string; formato: (v: number) => string; altura?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = altura, M = { t: 12, r: 8, b: 24, l: 88 };
  const valores = [...atual, ...anterior].filter((v): v is number => v !== null && isFinite(v));
  const max = Math.max(1, ...valores);
  const passo = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const intervalo = [1, 2, 2.5, 5, 10].map(f => f * passo).find(v => v * 4 >= max) ?? max / 4;
  const topo = intervalo * 4;
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / topo);
  const slot = (W - M.l - M.r) / Math.max(1, rotulos.length);
  const larg = Math.min(22, (slot - 10) / 2);
  const variacao = (i: number) => {
    const a = atual[i], b = anterior[i];
    return a !== null && b !== null && b > 0 ? a / b - 1 : null;
  };
  const pct = (v: number | null) => (v === null ? "" : `${v > 0 ? "▲ +" : "▼ "}${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  const barra = (x: number, v: number, fill: string) => {
    const top = y(v), base = y(0), alto = Math.max(0, base - top);
    if (alto < 0.5) return null;
    const rr = Math.min(3, alto / 2, larg / 2);
    return <path d={`M${x},${base} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + larg - rr} Q${x + larg},${top} ${x + larg},${top + rr} V${base} Z`} fill={fill} />;
  };
  if (!rotulos.length) return <div className="text-xs text-gray-500">Sem dados.</div>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-300">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />{nomeAtual}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_ANTERIOR }} />{nomeAnterior}</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
          {[0, 1, 2, 3, 4].map(i => (topo / 4) * i).map(t => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#2c2c2a" strokeWidth={1} />
              <text x={M.l - 6} y={y(t) + 3} textAnchor="end" fontSize={11} fill="#898781">{formato(t)}</text>
            </g>
          ))}
          {rotulos.map((r, i) => {
            const x0 = M.l + slot * i + (slot - (larg * 2 + 3)) / 2;
            const v = variacao(i);
            return (
              <g key={r + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={M.l + slot * i} y={M.t} width={slot} height={H - M.t - M.b} fill={hover === i ? "rgba(255,255,255,0.04)" : "transparent"} />
                {anterior[i] !== null && barra(x0, anterior[i]!, COR_ANTERIOR)}
                {atual[i] !== null && barra(x0 + larg + 3, atual[i]!, cor)}
                {v !== null && Math.abs(v) >= 0.2 && atual[i] !== null && (
                  <text x={x0 + larg + 3 + larg / 2} y={y(atual[i]!) - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={v > 0 ? "#f0a3a3" : "#7fd18b"}>{v > 0 ? "▲" : "▼"}</text>
                )}
                <text x={M.l + slot * i + slot / 2} y={H - 7} textAnchor="middle" fontSize={11} fill="#898781">{r}</text>
              </g>
            );
          })}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="#383835" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <div className="absolute top-1 pointer-events-none bg-[#18181b] border border-white/15 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-200 shadow-xl z-10"
            style={{ left: `${Math.min(72, (hover / rotulos.length) * 100 + 4)}%` }}>
            <div className="font-bold mb-0.5">{rotulos[hover]}</div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: cor }} />{nomeAtual}: <b>{atual[hover] === null ? "sem fatura" : formato(atual[hover]!)}</b></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COR_ANTERIOR }} />{nomeAnterior}: <b>{anterior[hover] === null ? "sem fatura" : formato(anterior[hover]!)}</b></div>
            {variacao(hover) !== null && <div className={`mt-0.5 font-bold ${variacao(hover)! > 0 ? "text-rose-300" : "text-emerald-300"}`}>{pct(variacao(hover))}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
