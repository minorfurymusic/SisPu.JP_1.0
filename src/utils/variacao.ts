// Alerta de variação de uma fatura em relação ao histórico do mesmo contrato, em DUAS comparações:
// - com o MÊS ANTERIOR: um salto de um mês para o outro costuma ser vazamento (água) ou equipamento
//   ligado direto / defeito (energia);
// - com o MESMO MÊS DO ANO ANTERIOR: tira a sazonalidade (férias, verão) e mostra mudança de uso,
//   cobrança nova ou tarifa (ex.: outubro com R$ 200 num ano e R$ 1.200 no seguinte).
// Consumo e valor são levados a 30 dias, porque o número de dias faturados varia de 27 a 33. Só
// alerta acima de 20% E de uma diferença mínima, para não encher a tela de UCs pequenas.

export interface PontoHistorico { mes: string; consumo: number; valor: number; dias: number }

export type TipoAlerta = "alta" | "queda" | "zerado" | "valor";

export interface Comparacao {
  referencia: string;              // "mês anterior (08/2026)" | "mesmo mês de 2025"
  ref_consumo_30d: number;
  var_consumo: number | null;      // fração (0,25 = +25%); null quando a referência é zero
  ref_valor_30d: number;
  var_valor: number | null;
  alerta: TipoAlerta | null;
  impacto_valor: number;           // R$ a mais (ou a menos) no mês em relação à referência
}

export interface ResultadoVariacao {
  mensal: Comparacao | null;       // contra o mês anterior (o mais próximo nos 3 meses anteriores)
  anual: Comparacao | null;        // contra o mesmo mês do ano anterior
  consumo_30d: number;
  motivo: string;                  // explicação curta de cada alerta (mês e ano), separadas por " · "
  // Resumo (o alerta mais importante das duas comparações), para quem só quer um número:
  referencia: string;
  ref_consumo_30d: number | null;
  var_consumo: number | null;
  ref_valor_30d: number | null;
  var_valor: number | null;
  alerta: TipoAlerta | null;
  impacto_valor: number;
}

export const LIMITE_VARIACAO = 0.2;
export const MINIMO_CONSUMO = { CELESC: 100, CASAN: 5 } as const; // kWh / m³ por mês
export const MINIMO_VALOR = 100; // R$

const mesAnterior = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const rotulo = (mes: string) => `${mes.substring(5, 7)}/${mes.substring(0, 4)}`;
const por30 = (p: PontoHistorico, k: "consumo" | "valor") => (Number(p[k]) || 0) * 30 / (p.dias > 0 ? p.dias : 30);
const r2 = (v: number) => Math.round(v * 100) / 100;

function comparar(atual: PontoHistorico, ref: PontoHistorico, referencia: string, minimo: number): Comparacao {
  const c = por30(atual, "consumo"), v = por30(atual, "valor");
  const refC = por30(ref, "consumo"), refV = por30(ref, "valor");
  const var_consumo = refC > 0 ? c / refC - 1 : null;
  const var_valor = refV > 0 ? v / refV - 1 : null;
  let alerta: TipoAlerta | null = null;
  if ((Number(atual.consumo) || 0) === 0 && refC >= minimo) alerta = "zerado";
  // Saiu do zero (ou quase): não há percentual, mas é aumento de consumo, não "valor subiu".
  else if (refC < minimo && c - refC >= minimo) alerta = "alta";
  else if (var_consumo !== null && Math.abs(var_consumo) > LIMITE_VARIACAO && Math.abs(c - refC) >= minimo) alerta = var_consumo > 0 ? "alta" : "queda";
  else if (var_valor !== null && var_valor > LIMITE_VARIACAO && v - refV >= MINIMO_VALOR) alerta = "valor";
  return {
    referencia, ref_consumo_30d: r2(refC), var_consumo, ref_valor_30d: r2(refV), var_valor, alerta,
    impacto_valor: r2((Number(atual.valor) || 0) - refV * ((atual.dias > 0 ? atual.dias : 30) / 30)),
  };
}

export function motivoDoAlerta(tipo: "mensal" | "anual", alerta: TipoAlerta, concessionaria: "CELESC" | "CASAN"): string {
  if (alerta === "alta" && tipo === "mensal") return concessionaria === "CASAN"
    ? "Salto no mês: possível vazamento"
    : "Salto no mês: equipamento ligado direto ou defeito";
  if (alerta === "alta") return "Acima do ano passado: mudança de uso, cobrança nova ou ligação a mais";
  if (alerta === "valor") return "Valor subiu sem o consumo: tarifa, multa ou serviço";
  if (alerta === "zerado") return "Zerou: medidor parado, unidade fechada ou sem leitura";
  return "Caiu: menos uso, leitura estimada ou medidor com defeito";
}

export function compararComHistorico(atual: PontoHistorico, historico: PontoHistorico[], concessionaria: "CELESC" | "CASAN"): ResultadoVariacao {
  const mes = atual.mes.substring(0, 7);
  const minimo = MINIMO_CONSUMO[concessionaria];
  const doMes = (m: string) => historico.find(h => h.mes.substring(0, 7) === m);
  const anoPassado = doMes(mesAnterior(mes, 12));
  // Mês anterior; se ele faltar (fatura não importada), o mais próximo até 3 meses antes.
  const nAnterior = [1, 2, 3].find(n => doMes(mesAnterior(mes, n)));
  const anterior = nAnterior ? doMes(mesAnterior(mes, nAnterior)) : undefined;

  const mensal = anterior ? comparar(atual, anterior, nAnterior === 1 ? `mês anterior (${rotulo(anterior.mes)})` : `último mês com fatura (${rotulo(anterior.mes)})`, minimo) : null;
  const anual = anoPassado ? comparar(atual, anoPassado, `mesmo mês de ${mesAnterior(mes, 12).substring(0, 4)}`, minimo) : null;

  // O mais importante: aumento/zerado/valor antes de queda; entre dois aumentos, o de maior impacto.
  const peso = (c: Comparacao | null) => (!c?.alerta ? 0 : c.alerta === "queda" ? 1 : 2);
  const principal = ([mensal, anual].filter(Boolean) as Comparacao[])
    .sort((a, b) => peso(b) - peso(a) || Math.abs(b.impacto_valor) - Math.abs(a.impacto_valor))[0] || null;
  // As duas explicações quando as duas comparações alertam (ex.: vazamento E alta no ano).
  const motivos = [...new Set([mensal?.alerta ? motivoDoAlerta("mensal", mensal.alerta, concessionaria) : "", anual?.alerta ? motivoDoAlerta("anual", anual.alerta, concessionaria) : ""].filter(Boolean))];
  return {
    mensal, anual, consumo_30d: r2(por30(atual, "consumo")),
    motivo: motivos.join(" · "),
    referencia: principal?.referencia || "",
    ref_consumo_30d: principal ? principal.ref_consumo_30d : null,
    var_consumo: principal ? principal.var_consumo : null,
    ref_valor_30d: principal ? principal.ref_valor_30d : null,
    var_valor: principal ? principal.var_valor : null,
    alerta: principal?.alerta || null,
    impacto_valor: principal ? principal.impacto_valor : 0,
  };
}

export const TEXTO_ALERTA: Record<TipoAlerta, string> = {
  alta: "Consumo subiu",
  queda: "Consumo caiu",
  zerado: "Consumo zerado",
  valor: "Valor subiu (mesmo consumo)",
};
