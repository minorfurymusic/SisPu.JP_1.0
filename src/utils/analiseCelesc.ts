// Análise das faturas CELESC para os relatórios: separa cada item da fatura num grupo de custo,
// cada tributo à parte, a demanda do mês (contratada x usada) e o custo de disponibilidade.
// Funções puras, usadas pelo servidor e pelos testes.

export interface ItemFatura {
  descricao: string;
  quantidade?: number;
  valor_unitario?: number;
  valor: number;
  pis?: number;
  icms?: number;
  irpj_val?: number;
  pis_ret?: number;
  cofins_ret?: number;
  csll_ret?: number;
}

// Grupos de custo. Somados dão o valor da fatura (os tributos "embutidos" — ICMS e PIS/COFINS —
// já estão dentro do preço de cada item e por isso ficam fora desta soma).
export const GRUPOS = [
  "energia", "rede", "demanda", "bandeira", "ultrapassagem", "demanda_sem_uso", "reativo",
  "multas_juros", "infraestrutura", "cosip", "irpj_retido", "solar", "ajustes", "outros",
] as const;
export type Grupo = typeof GRUPOS[number];
export type ValoresPorGrupo = Record<Grupo, number>;

export const NOME_GRUPO: Record<Grupo, string> = {
  energia: "Energia (TE)",
  rede: "Uso da rede / fio (TUSD)",
  demanda: "Demanda contratada",
  bandeira: "Bandeira tarifária",
  ultrapassagem: "Ultrapassagem de demanda",
  demanda_sem_uso: "Demanda paga sem uso",
  reativo: "Energia reativa excedente",
  multas_juros: "Multas e juros",
  infraestrutura: "Infraestrutura e serviços",
  cosip: "COSIP (iluminação pública)",
  irpj_retido: "IRPJ retido",
  solar: "Crédito solar (energia injetada)",
  ajustes: "Ajustes e créditos da CELESC",
  outros: "Outros (item não classificado)",
};

// Perdas/desperdícios: dinheiro que dá para evitar mudando contrato, equipamento ou pagamento.
export const GRUPOS_PERDA: Grupo[] = ["ultrapassagem", "demanda_sem_uso", "reativo", "multas_juros"];

const sem = (s: string) => (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();

// A ordem importa: "Bandeira Amarela da Energia Injetada" é solar, não bandeira; "Diferença da
// Demanda" vem antes de "Demanda"; "Crédito Juros" fica junto de juros.
export function grupoDoItem(descricao: string): Grupo {
  const d = sem(descricao);
  if (/DIFERENCA DA DEMANDA/.test(d)) return "demanda_sem_uso";
  if (/ULTRAPASSAGEM/.test(d)) return "ultrapassagem";
  if (/REATIV/.test(d)) return "reativo";
  if (/INJETAD|BENEFICIO TARIF/.test(d)) return "solar";
  if (/^DEMANDA|DMCR/.test(d)) return "demanda";
  if (/MULTA|JUROS/.test(d)) return "multas_juros";
  if (/COSIP|ILUMINACAO PUBLICA/.test(d)) return "cosip";
  if (/TRIBUTO.* RETIDO|IRPJ/.test(d)) return "irpj_retido";
  if (/FIO ?B|PARTICIPACAO FINANCEIRA|VISTORIA|RELIGA|DESLIGA|LIGACAO|AFERICAO|SERVICO|OBRA|EXTENSAO DE REDE|TAXA|DISJUNTOR/.test(d)) return "infraestrutura";
  if (/BANDEIRA/.test(d)) return "bandeira";
  // Layout antigo (até abr/2024): "DEVOL.PAGA DUPLICIDADE", "DEV SDO CTA ANT", "DIF.NDEVOLV/SALDO
  // NEGATIVO", "CRED VIOL PRAZO", "COMP VIOL META CONTINUIDADE".
  // "Pag. Duplicidade - Migrado" e "Item Migrado": saldo de pagamento em duplicidade trazido do
  // sistema antigo da CELESC e devolvido aos poucos como crédito.
  if (/CREDITO|^DIC|^DMIC|^FIC|DEVOLUCAO|^DEV|^DIF\.|^CRED |^COMP |DESCONTO|BONUS|ANULACAO|COMPENSACAO|ESTORNO|AJUSTE|DUPLICIDADE|MIGRADO/.test(d)) return "ajustes";
  if (/TUSD/.test(d)) return "rede";
  if (/CONSUMO|\bTE\b/.test(d)) return "energia";
  return "outros";
}

export interface TributosFatura {
  icms: number;          // embutido no preço dos itens
  pis_cofins: number;    // embutido no preço dos itens
  cosip: number;
  irpj_retido: number;   // negativo: a prefeitura retém e não paga à CELESC
  pis_retido: number;
  cofins_retido: number;
  csll_retido: number;
}

export function categorizarItens(itens: ItemFatura[]) {
  const grupos = Object.fromEntries(GRUPOS.map(g => [g, 0])) as ValoresPorGrupo;
  const naoClassificados: string[] = [];
  const tributos: TributosFatura = { icms: 0, pis_cofins: 0, cosip: 0, irpj_retido: 0, pis_retido: 0, cofins_retido: 0, csll_retido: 0 };
  for (const it of itens || []) {
    const v = Number(it?.valor) || 0;
    const g = grupoDoItem(it?.descricao || "");
    grupos[g] += v;
    if (g === "outros" && it?.descricao) naoClassificados.push(it.descricao);
    tributos.icms += Number(it?.icms) || 0;
    tributos.pis_cofins += Number(it?.pis) || 0;
    tributos.pis_retido += Number(it?.pis_ret) || 0;
    tributos.cofins_retido += Number(it?.cofins_ret) || 0;
    tributos.csll_retido += Number(it?.csll_ret) || 0;
  }
  tributos.cosip = grupos.cosip;
  tributos.irpj_retido = grupos.irpj_retido;
  for (const g of GRUPOS) grupos[g] = Math.round(grupos[g] * 100) / 100;
  for (const k of Object.keys(tributos) as (keyof TributosFatura)[]) tributos[k] = Math.round(tributos[k] * 100) / 100;
  return { grupos, tributos, naoClassificados };
}

export interface DemandaDoMes {
  faturada: number;          // kW cobrados na linha "Demanda" (maior posto, se houver Ponta/Fora Ponta)
  ultrapassagem: number;     // kW acima da contratada
  sem_uso: number;           // kW contratados e não usados ("Diferença da Demanda Contratada")
  contratada: number | null; // calculada: faturada − ultrapassagem, ou faturada + sem uso
  preco_kw: number;          // R$/kW da demanda (com tributos)
  preco_ultrapassagem_kw: number;
}

// Só existe para o grupo A (alta tensão). A fatura não imprime a demanda contratada; ela sai das
// linhas de ultrapassagem ou de diferença. Num mês sem nenhuma das duas fica null e o relatório usa
// a contratada dos meses vizinhos do mesmo contrato.
export function demandaDoMes(itens: ItemFatura[]): DemandaDoMes | null {
  const de = (re: RegExp) => (itens || []).filter(i => re.test(sem(i.descricao)));
  const dem = de(/^DEMANDA( PONTA| FORA PONTA)?$/);
  if (!dem.length) return null;
  const qtd = (xs: ItemFatura[]) => xs.reduce((a, i) => a + (Number(i.quantidade) || 0), 0);
  const faturada = Math.max(...dem.map(i => Number(i.quantidade) || 0));
  const ult = de(/ULTRAPASSAGEM/), dif = de(/DIFERENCA DA DEMANDA CONTRATAD/);
  // No layout antigo vem uma linha de ultrapassagem por ocorrência; vale a maior.
  const ultrapassagem = ult.length ? Math.max(...ult.map(i => Number(i.quantidade) || 0)) : 0, sem_uso = qtd(dif);
  const contratada = ultrapassagem > 0 ? faturada - ultrapassagem : sem_uso > 0 ? faturada + sem_uso : null;
  const preco_kw = Number(dem[0].valor_unitario) || 0;
  const preco_ultrapassagem_kw = Number(ult[0]?.valor_unitario) || preco_kw * 2;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { faturada: r(faturada), ultrapassagem: r(ultrapassagem), sem_uso: r(sem_uso), contratada: contratada === null ? null : r(contratada), preco_kw, preco_ultrapassagem_kw };
}

// Faixas combinadas com o usuário (uso ÷ contratada). A CELESC só cobra ultrapassagem acima de 105%.
export type FaixaDemanda = "vermelho" | "laranja" | "verde" | "amarelo" | "cinza";
export function faixaDemanda(uso: number, contratada: number): FaixaDemanda | null {
  if (!(contratada > 0)) return null;
  const r = uso / contratada;
  if (r > 1.05) return "vermelho";
  if (r > 1.0) return "laranja";
  if (r >= 0.9) return "verde";
  if (r >= 0.7) return "amarelo";
  return "cinza";
}

// Consumo medido no relógio (kWh) a partir da tabela "Valores Medidos" do texto da fatura:
// linhas "<medidor> Energia <posto> ... <apurado>". Exclui energia reativa e injetada.
export function consumoMedidoDoTexto(texto: string): number | null {
  let total = 0, achou = false;
  for (const l of (texto || "").split("\n")) {
    const m = l.match(/^\s*\d{6,12}\s+Energia\s+(?:Único|Unico|Ponta|Fora ponta)\s+.*\s(-?[\d.]+,\d{1,3})\s*$/i);
    if (m) { total += Number(m[1].replace(/\./g, "").replace(",", ".")); achou = true; }
  }
  return achou ? Math.round(total * 1000) / 1000 : null;
}

// "Grupo / Subgrupo Tensão: A - A4" → "A4"
// Layout antigo: "... MUNICIPAL A-4 TR-TRIFASICO ..." → "A4"
export const grupoTensaoDoTexto = (texto: string) => (texto || "").match(/Tens[ãa]o:\s+[AB]\s*-\s*([AB]\w*)/)?.[1] ||
  ((m => (m ? m[1] + m[2] : ""))((texto || "").match(/\s([AB])-(\d\w*)\s+[A-Z]{2}-[A-Z]+\s+\d{2}\/\d{2}\/\d{4}/)));
export const diasFaturadosDoTexto = (texto: string) => Number((texto || "").match(/Dias Faturados:\s+(\d+)/)?.[1]) || 0;

// Custo de disponibilidade (grupo B): quem consome menos que o mínimo (30, 50 ou 100 kWh) paga o
// mínimo. A diferença entre o faturado e o medido é energia paga e não usada.
export function custoDisponibilidade(itens: ItemFatura[], medido: number | null, grupoTensao: string) {
  if (!/^B/.test(grupoTensao) || medido === null) return null;
  const te = (itens || []).filter(i => sem(i.descricao) === "CONSUMO TE");
  const tusd = (itens || []).filter(i => sem(i.descricao) === "CONSUMO TUSD");
  const faturado = te.reduce((a, i) => a + (Number(i.quantidade) || 0), 0);
  if (![30, 50, 100].includes(Math.round(faturado)) || faturado <= medido + 0.5) return null;
  const preco = (Number(te[0]?.valor_unitario) || 0) + (Number(tusd[0]?.valor_unitario) || 0);
  const kwh = faturado - medido;
  return { minimo: Math.round(faturado), medido, kwh: Math.round(kwh * 1000) / 1000, valor: Math.round(kwh * preco * 100) / 100 };
}

// Simula a demanda contratada que teria custado menos nos meses disponíveis: abaixo dela paga-se a
// contratada inteira; acima de 105% paga-se o usado + a ultrapassagem (≈ 2×). Mínimo de 30 kW
// (grupo A4). É uma estimativa com os meses que temos — mudar a demanda segue regras e prazos da
// CELESC.
export function simularDemandaIdeal(meses: { usada: number; preco_kw: number; preco_ultrapassagem_kw: number }[], contratadaAtual: number) {
  const validos = meses.filter(m => m.usada >= 0 && m.preco_kw > 0);
  if (!validos.length || !(contratadaAtual > 0)) return null;
  const custo = (c: number) => validos.reduce((a, m) => {
    if (m.usada > c * 1.05) return a + m.usada * m.preco_kw + (m.usada - c) * m.preco_ultrapassagem_kw;
    return a + Math.max(c, m.usada) * m.preco_kw;
  }, 0);
  const maxUsada = Math.max(...validos.map(m => m.usada));
  let melhor = contratadaAtual, melhorCusto = custo(contratadaAtual);
  for (let c = 30; c <= Math.max(30, Math.ceil(maxUsada * 1.1)); c++) {
    const k = custo(c);
    if (k < melhorCusto - 0.01) { melhor = c; melhorCusto = k; }
  }
  const custoAtual = custo(contratadaAtual);
  return {
    meses: validos.length, contratada_atual: contratadaAtual, maior_uso: Math.round(maxUsada * 10) / 10,
    sugerida: melhor, custo_atual: Math.round(custoAtual * 100) / 100, custo_sugerido: Math.round(melhorCusto * 100) / 100,
    economia: Math.round((custoAtual - melhorCusto) * 100) / 100,
  };
}
