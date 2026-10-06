// Oportunidades de economia por contrato (energia), sempre sobre os últimos 12 meses de faturas:
// energia solar onde ainda não há, capacitores onde se paga energia reativa, faturamento como
// grupo B ("B optante") e mercado livre para o grupo A. As premissas ficam todas aqui e aparecem
// no relatório; os preços de energia de cada UC saem das próprias faturas.
import { Grupo } from "./analiseCelesc";

export const PREMISSAS = {
  // R$/kWp instalado em prédio público. Média nacional no 1º tri/2026: R$ 2,45/Wp (sistemas
  // residenciais, Greener/Canal Solar); +20% para projeto, estrutura, homologação e licitação.
  solar_custo_kwp: 3000,
  solar_geracao_kwh_kwp_ano: 1200,      // Alto Vale do Itajaí
  // Parte da conta que a geração evita: fio B (60% em 2026) não é compensado na energia injetada.
  solar_aproveitamento: 0.85,
  solar_area_m2_kwp: 6.5,               // telhado necessário
  solar_kwp_max: 75,                    // microgeração (Lei 14.300/2022): acima disso é outra regra
  solar_economia_minima: 5000,          // R$/ano para valer um projeto
  minimo_b_kwh_ano: 1200,               // 100 kWh/mês (trifásico) continuam cobrados no grupo B
  capacitor_temporizador: [300, 800] as const,  // desligar à noite um banco que já existe
  capacitor_banco_fixo: [1500, 4000] as const,  // banco pequeno, instalado
  capacitor_payback_anos: 2,
  b_optante_economia_minima: 1000,
  // Transformador de 112,5 kVA atende com folga até ~90 kW; acima disso a UC não se enquadra.
  b_optante_demanda_max_kw: 90,
  mercado_livre_desconto: [0.15, 0.25] as const, // sobre energia (TE) + bandeiras
};

export type LinhaOport = {
  contrato_id: string; unidade_id: string; unidade_nome: string; unidade_endereco: string; codigo: string;
  concessionaria: "CASAN" | "CELESC"; mes: string; consumo: number; energia_injetada: number; grupo_tensao: string;
  grupos: Record<Grupo, number> | null; demanda?: { faturada: number; contratada?: number | null } | null;
};

export type Contrato12 = {
  contrato_id: string; unidade_id: string; unidade: string; endereco: string; codigo: string; grupo: string; meses: number;
  kwh: number; energia: number; rede: number; bandeira: number; demanda: number; ultrapassagem: number; sem_uso: number;
  reativo: number; solar: number; injetada: number; demanda_max: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

// Soma por contrato, já levada a 12 meses (mínimo de 6 meses de faturas com itens).
export function agregarContratos(linhas: LinhaOport[]): Contrato12[] {
  const por = new Map<string, LinhaOport[]>();
  linhas.filter(l => l.concessionaria === "CELESC" && l.grupos).forEach(l => por.set(l.contrato_id, [...(por.get(l.contrato_id) || []), l]));
  const out: Contrato12[] = [];
  for (const [id, xs] of por) {
    const meses = new Set(xs.map(l => l.mes)).size;
    if (meses < 6) continue;
    const f = 12 / meses;
    const g = (k: Grupo) => xs.reduce((a, l) => a + (l.grupos?.[k] || 0), 0) * f;
    const ult = [...xs].sort((a, b) => b.mes.localeCompare(a.mes))[0];
    out.push({
      contrato_id: id, unidade_id: ult.unidade_id, unidade: ult.unidade_nome, endereco: ult.unidade_endereco, codigo: ult.codigo,
      grupo: xs.map(l => l.grupo_tensao).find(Boolean) || "", meses,
      kwh: xs.reduce((a, l) => a + (l.consumo || 0), 0) * f,
      energia: g("energia"), rede: g("rede"), bandeira: g("bandeira"), demanda: g("demanda"), ultrapassagem: g("ultrapassagem"),
      sem_uso: g("demanda_sem_uso"), reativo: g("reativo"), solar: g("solar"),
      injetada: xs.reduce((a, l) => a + (l.energia_injetada || 0), 0) * f,
      // Maior entre a usada e a contratada: a contratada mostra o tamanho da instalação.
      demanda_max: Math.max(0, ...xs.map(l => Math.max(Number(l.demanda?.faturada) || 0, Number(l.demanda?.contratada) || 0))),
    });
  }
  return out;
}

// Preço médio da energia no grupo B (energia + rede + bandeira por kWh), das UCs sem geração.
export function precoMedioB(cs: Contrato12[]): number {
  const b = cs.filter(c => c.grupo.startsWith("B") && !c.solar && !c.injetada && c.kwh > 500);
  const kwh = b.reduce((a, c) => a + c.kwh, 0);
  return kwh ? b.reduce((a, c) => a + c.energia + c.rede + c.bandeira, 0) / kwh : 0;
}

export type CandidatoSolar = Contrato12 & { gerar_kwh: number; preco_kwh: number; kwp: number; investimento: number; economia: number; payback: number; area_m2: number; limitada: boolean };

export function candidatosSolar(cs: Contrato12[]): CandidatoSolar[] {
  const P = PREMISSAS;
  return cs.filter(c => !c.solar && !c.injetada && c.kwh > 0).map(c => {
    const grupoA = c.grupo.startsWith("A");
    const gerar = Math.min(grupoA ? c.kwh : Math.max(0, c.kwh - P.minimo_b_kwh_ano), P.solar_kwp_max * P.solar_geracao_kwh_kwp_ano);
    const preco = (c.energia + c.rede + c.bandeira) / c.kwh;
    const economia = gerar * preco * P.solar_aproveitamento;
    const kwp = gerar / P.solar_geracao_kwh_kwp_ano;
    const investimento = kwp * P.solar_custo_kwp;
    return { ...c, gerar_kwh: Math.round(gerar), preco_kwh: Math.round(preco * 10000) / 10000, kwp: Math.round(kwp * 10) / 10,
      investimento: r2(investimento), economia: r2(economia), payback: economia > 0 ? Math.round((investimento / economia) * 10) / 10 : Infinity,
      area_m2: Math.round(kwp * P.solar_area_m2_kwp), limitada: gerar < (grupoA ? c.kwh : c.kwh - P.minimo_b_kwh_ano) };
  }).filter(c => c.economia >= P.solar_economia_minima).sort((a, b) => b.economia - a.economia);
}

export type CandidatoCapacitor = Contrato12 & {
  limite_investimento: number; solucao: "banco" | "temporizador" | "nao_compensa"; custo: readonly [number, number]; payback: number; vale: boolean;
};

// Capacitores: só vale o que se paga em até 2 anos. Primeiro se confere se o excesso não é de
// um banco que já existe e fica ligado à noite (reativo capacitivo, das 23h30 às 6h30): aí a
// solução é um temporizador, bem mais barato que um banco novo.
export function candidatosCapacitor(cs: Contrato12[]): CandidatoCapacitor[] {
  const P = PREMISSAS;
  return cs.filter(c => c.reativo > 0.5).map(c => {
    const limite = c.reativo * P.capacitor_payback_anos;
    const medio = (x: readonly [number, number]) => (x[0] + x[1]) / 2;
    const [solucao, custo] = limite >= P.capacitor_banco_fixo[0] ? ["banco", P.capacitor_banco_fixo] as const
      : limite >= P.capacitor_temporizador[0] ? ["temporizador", P.capacitor_temporizador] as const
      : ["nao_compensa", [0, 0] as const] as const;
    const payback = solucao === "nao_compensa" ? Infinity : Math.round((medio(custo) / c.reativo) * 10) / 10;
    return { ...c, limite_investimento: r2(limite), solucao, custo, payback, vale: solucao !== "nao_compensa" && payback <= P.capacitor_payback_anos };
  }).sort((a, b) => b.reativo - a.reativo);
}

export type CandidatoBOptante = Contrato12 & { custo_a: number; custo_b: number; economia: number };

// Grupo A pago como grupo B: sem demanda contratada. Exige transformador de até 112,5 kVA
// (REN 1.000/2021, art. 292) — isso não está na fatura e precisa de vistoria; UC que já usou
// ou contratou mais de 90 kW não cabe nesse transformador e fica de fora.
export function candidatosBOptante(cs: Contrato12[], precoB: number): CandidatoBOptante[] {
  if (!precoB) return [];
  return cs.filter(c => c.grupo.startsWith("A") && c.demanda_max <= PREMISSAS.b_optante_demanda_max_kw).map(c => {
    const custo_a = c.energia + c.rede + c.bandeira + c.demanda + c.ultrapassagem + c.sem_uso + c.reativo;
    const custo_b = c.kwh * precoB;
    return { ...c, custo_a: r2(custo_a), custo_b: r2(custo_b), economia: r2(custo_a - custo_b) };
  }).filter(c => c.economia >= PREMISSAS.b_optante_economia_minima).sort((a, b) => b.economia - a.economia);
}

export type MercadoLivre = { ucs: number; kwh: number; base: number; economia: readonly [number, number]; contratos: Contrato12[] };

// Mercado livre (Portaria MME 50/2022): troca a energia (TE) da CELESC pela de um comercializador
// varejista; rede e demanda continuam na CELESC, e bandeiras deixam de existir.
export function mercadoLivre(cs: Contrato12[]): MercadoLivre | null {
  const a = cs.filter(c => c.grupo.startsWith("A"));
  if (!a.length) return null;
  const base = a.reduce((s, c) => s + c.energia + c.bandeira, 0);
  const [d1, d2] = PREMISSAS.mercado_livre_desconto;
  return { ucs: a.length, kwh: Math.round(a.reduce((s, c) => s + c.kwh, 0)), base: r2(base), economia: [r2(base * d1), r2(base * d2)], contratos: a.sort((x, y) => y.kwh - x.kwh) };
}
