// Totais por edifício: quantas ligações de água (CASAN) e luz (CELESC), quanto pagaram e
// consumiram no último mês e nos últimos 12 meses, mês a mês. Os 12 meses de cada tipo terminam
// no último mês importado daquela concessionária, para um atraso de importação não zerar o total.

export type TipoLigacao = "AGUA" | "LUZ";

type ContratoBase = { id: string; codigo_numero: string; despesa_id: string; unidade_id: string; ativo: boolean; nome_fatura?: string; codigos_numero_anteriores?: string[] };
type UnidadeBase = { id: string; nome: string; endereco?: string; secretaria_id?: string };
type EdificioBase = { id: string; nome: string; endereco?: string; secretaria_id?: string; observacao?: string; contratos: string[]; criado_em?: string; atualizado_em?: string };

export type Ligacao = {
  id: string; codigo: string; codigos_antigos: string[]; tipo: TipoLigacao; ativo: boolean;
  unidade: string; secretaria: string; endereco: string;
  valor_12m: number; consumo_12m: number; valor_ultimo: number; consumo_ultimo: number; menor_fatura_12m: number;
  serie: Record<string, { valor: number; consumo: number }>;
};
export type TotalTipo = { n: number; valor_12m: number; consumo_12m: number; valor_ultimo: number; consumo_ultimo: number };
export type EdificioResumo = EdificioBase & {
  ligacoes: Ligacao[];
  agua: TotalTipo; luz: TotalTipo;
  // Custo fixo estimado de manter mais de uma ligação do mesmo tipo: para cada ligação além da
  // mais cara, a menor fatura do ano × 12 (a parte que não depende do consumo).
  economia_estimada: number;
  serie: Record<string, { agua_valor: number; agua_consumo: number; luz_valor: number; luz_consumo: number }>;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const mesesAntes = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function tipoDaDespesa(descricao?: string): TipoLigacao | null {
  const d = (descricao || "").toUpperCase();
  if (/CASAN|ÁGUA|AGUA/.test(d)) return "AGUA";
  if (/CELESC|ENERGIA|LUZ/.test(d)) return "LUZ";
  return null;
}

export function resumirEdificios(dados: {
  edificios: EdificioBase[]; contratos: ContratoBase[]; unidades: UnidadeBase[];
  secretarias: { id: string; nome: string }[]; despesas: { id: string; descricao: string }[];
  lancamentos: { item_despesa_id: string; mes_ano: string; valor_total: number; consumo: number }[];
}) {
  const tipoDespesa = new Map(dados.despesas.map(d => [String(d.id), tipoDaDespesa(d.descricao)]));
  const contratos = dados.contratos.filter(c => tipoDespesa.get(String(c.despesa_id)));
  const tipoDe = new Map(contratos.map(c => [c.id, tipoDespesa.get(String(c.despesa_id))!]));
  const unidade = new Map(dados.unidades.map(u => [String(u.id), u]));
  const secretaria = new Map(dados.secretarias.map(s => [String(s.id), s.nome]));

  const porContrato = new Map<string, Record<string, { valor: number; consumo: number }>>();
  const ultimo: Record<TipoLigacao, string> = { AGUA: "", LUZ: "" };
  for (const l of dados.lancamentos) {
    const tipo = tipoDe.get(l.item_despesa_id);
    if (!tipo) continue;
    const mes = String(l.mes_ano).substring(0, 7);
    const serie = porContrato.get(l.item_despesa_id) || {};
    const m = serie[mes] || { valor: 0, consumo: 0 };
    m.valor += Number(l.valor_total) || 0;
    m.consumo += Number(l.consumo) || 0;
    serie[mes] = m;
    porContrato.set(l.item_despesa_id, serie);
    if (mes > ultimo[tipo]) ultimo[tipo] = mes;
  }
  const geral = [ultimo.AGUA, ultimo.LUZ].sort().pop() || "";
  const meses = geral ? Array.from({ length: 24 }, (_, i) => mesesAntes(geral, 23 - i)) : [];

  const ligacao = (c: ContratoBase): Ligacao => {
    const tipo = tipoDe.get(c.id)!;
    const serie = porContrato.get(c.id) || {};
    const fim = ultimo[tipo], inicio = fim ? mesesAntes(fim, 11) : "";
    let valor = 0, consumo = 0, menor = 0;
    for (const [mes, v] of Object.entries(serie)) {
      if (!fim || mes < inicio || mes > fim) continue;
      valor += v.valor; consumo += v.consumo;
      if (v.valor > 0 && (menor === 0 || v.valor < menor)) menor = v.valor;
    }
    const u = unidade.get(String(c.unidade_id));
    const serieRecente: Ligacao["serie"] = {};
    meses.forEach(m => { if (serie[m]) serieRecente[m] = { valor: r2(serie[m].valor), consumo: r2(serie[m].consumo) }; });
    return {
      id: c.id, codigo: c.codigo_numero, codigos_antigos: c.codigos_numero_anteriores || [], tipo, ativo: c.ativo !== false,
      unidade: u?.nome || "", secretaria: secretaria.get(String(u?.secretaria_id)) || "",
      endereco: (tipo === "LUZ" ? c.nome_fatura : "") || u?.endereco || "",
      valor_12m: r2(valor), consumo_12m: r2(consumo),
      valor_ultimo: r2(serie[fim]?.valor || 0), consumo_ultimo: r2(serie[fim]?.consumo || 0),
      menor_fatura_12m: r2(menor), serie: serieRecente,
    };
  };
  const total = (ls: Ligacao[]): TotalTipo => ({
    n: ls.length,
    valor_12m: r2(ls.reduce((a, l) => a + l.valor_12m, 0)), consumo_12m: r2(ls.reduce((a, l) => a + l.consumo_12m, 0)),
    valor_ultimo: r2(ls.reduce((a, l) => a + l.valor_ultimo, 0)), consumo_ultimo: r2(ls.reduce((a, l) => a + l.consumo_ultimo, 0)),
  });
  const economia = (ls: Ligacao[]) => {
    const ativas = ls.filter(l => l.ativo).sort((a, b) => b.valor_12m - a.valor_12m);
    return ativas.slice(1).reduce((a, l) => a + Math.min(l.valor_12m, l.menor_fatura_12m * 12), 0);
  };

  const contratoPorId = new Map(contratos.map(c => [c.id, c]));
  const noEdificio = new Set<string>();
  const edificios: EdificioResumo[] = dados.edificios.map(e => {
    const ligacoes = (e.contratos || []).map(id => contratoPorId.get(id)).filter((c): c is ContratoBase => !!c).map(ligacao);
    ligacoes.forEach(l => noEdificio.add(l.id));
    const agua = ligacoes.filter(l => l.tipo === "AGUA"), luz = ligacoes.filter(l => l.tipo === "LUZ");
    const serie: EdificioResumo["serie"] = {};
    meses.forEach(m => {
      const s = { agua_valor: 0, agua_consumo: 0, luz_valor: 0, luz_consumo: 0 };
      agua.forEach(l => { s.agua_valor += l.serie[m]?.valor || 0; s.agua_consumo += l.serie[m]?.consumo || 0; });
      luz.forEach(l => { s.luz_valor += l.serie[m]?.valor || 0; s.luz_consumo += l.serie[m]?.consumo || 0; });
      serie[m] = { agua_valor: r2(s.agua_valor), agua_consumo: r2(s.agua_consumo), luz_valor: r2(s.luz_valor), luz_consumo: r2(s.luz_consumo) };
    });
    return {
      ...e, contratos: ligacoes.map(l => l.id), ligacoes,
      agua: total(agua.filter(l => l.ativo)), luz: total(luz.filter(l => l.ativo)),
      economia_estimada: r2(economia(agua) + economia(luz)), serie,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  const sem_edificio = contratos.filter(c => c.ativo !== false && !noEdificio.has(c.id)).map(ligacao)
    .sort((a, b) => b.valor_12m - a.valor_12m);
  return { meses, ultimo, edificios, sem_edificio };
}
