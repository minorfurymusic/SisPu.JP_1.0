// Alerta de variação de uma fatura em relação ao histórico do mesmo contrato. Para não confundir
// sazonalidade (férias, verão) com problema, compara com o MESMO MÊS do ano anterior quando existe;
// senão, com a média dos 3 meses anteriores. Consumo e valor são levados a 30 dias, porque o número
// de dias faturados varia de 27 a 33. Só alerta acima de 20% E de uma diferença mínima, para não
// encher a tela de UCs pequenas.

export interface PontoHistorico { mes: string; consumo: number; valor: number; dias: number }

export type TipoAlerta = "alta" | "queda" | "zerado" | "valor";

export interface ResultadoVariacao {
  referencia: string;              // "mesmo mês de 2025" | "média de 3 meses" | ""
  ref_consumo_30d: number | null;
  consumo_30d: number;
  var_consumo: number | null;      // fração (0,25 = +25%)
  ref_valor_30d: number | null;
  var_valor: number | null;
  alerta: TipoAlerta | null;
  impacto_valor: number;           // R$ a mais (ou a menos) no mês em relação à referência
}

export const LIMITE_VARIACAO = 0.2;
export const MINIMO_CONSUMO = { CELESC: 100, CASAN: 5 } as const; // kWh / m³ por mês
export const MINIMO_VALOR = 100; // R$

const mesAnterior = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const por30 = (p: PontoHistorico, k: "consumo" | "valor") => (Number(p[k]) || 0) * 30 / (p.dias > 0 ? p.dias : 30);

export function compararComHistorico(atual: PontoHistorico, historico: PontoHistorico[], concessionaria: "CELESC" | "CASAN"): ResultadoVariacao {
  const mes = atual.mes.substring(0, 7);
  const anteriores = historico.filter(h => h.mes.substring(0, 7) < mes);
  const mesmoMesAnoAnterior = anteriores.find(h => h.mes.substring(0, 7) === mesAnterior(mes, 12));
  let ref: PontoHistorico[] = [];
  let referencia = "";
  if (mesmoMesAnoAnterior) {
    ref = [mesmoMesAnoAnterior];
    referencia = `mesmo mês de ${mesAnterior(mes, 12).substring(0, 4)}`;
  } else {
    const ultimos = [1, 2, 3].map(n => anteriores.find(h => h.mes.substring(0, 7) === mesAnterior(mes, n))).filter(Boolean) as PontoHistorico[];
    if (ultimos.length >= 2) { ref = ultimos; referencia = `média de ${ultimos.length} meses anteriores`; }
  }
  const consumo_30d = por30(atual, "consumo");
  if (!ref.length) return { referencia: "", ref_consumo_30d: null, consumo_30d, var_consumo: null, ref_valor_30d: null, var_valor: null, alerta: null, impacto_valor: 0 };

  const media = (k: "consumo" | "valor") => ref.reduce((a, p) => a + por30(p, k), 0) / ref.length;
  const refC = media("consumo"), refV = media("valor");
  const valor_30d = por30(atual, "valor");
  const var_consumo = refC > 0 ? consumo_30d / refC - 1 : null;
  const var_valor = refV > 0 ? valor_30d / refV - 1 : null;
  const minimo = MINIMO_CONSUMO[concessionaria];

  let alerta: TipoAlerta | null = null;
  if ((Number(atual.consumo) || 0) === 0 && refC >= minimo) alerta = "zerado";
  else if (var_consumo !== null && Math.abs(var_consumo) > LIMITE_VARIACAO && Math.abs(consumo_30d - refC) >= minimo) alerta = var_consumo > 0 ? "alta" : "queda";
  else if (var_valor !== null && var_valor > LIMITE_VARIACAO && valor_30d - refV >= MINIMO_VALOR) alerta = "valor";

  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    referencia, ref_consumo_30d: r(refC), consumo_30d: r(consumo_30d), var_consumo, ref_valor_30d: r(refV), var_valor, alerta,
    impacto_valor: r((Number(atual.valor) || 0) - refV * ((atual.dias > 0 ? atual.dias : 30) / 30)),
  };
}

export const TEXTO_ALERTA: Record<TipoAlerta, string> = {
  alta: "Consumo subiu",
  queda: "Consumo caiu",
  zerado: "Consumo zerado",
  valor: "Valor subiu (mesmo consumo)",
};
