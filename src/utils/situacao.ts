// Situação dos contratos (UC/matrícula) e das unidades pela chegada de faturas.
//
// Regra combinada com a Prefeitura: um contrato com 3 meses seguidos sem fatura nova fica
// desativado — continua no cadastro, com histórico e relatórios, e volta a ativo sozinho quando
// chega fatura nova ou quando alguém o reativa. Os "3 meses" contam a partir do último mês já
// importado DA PRÓPRIA CONCESSIONÁRIA, não do calendário: um atraso na importação não desativa nada.
// A reativação manual vale como se fosse uma fatura daquele mês: só desativa de novo depois de
// mais 3 meses sem fatura. Desativação feita à mão não é desfeita pela regra.

export const MESES_SEM_FATURA = 3;
export const PREFIXO_AUTOMATICO = "Sem fatura desde";

export type ContratoSituacao = {
  id: string; despesa_id: string; unidade_id: string; ativo: boolean;
  situacao_motivo?: string | null; reativado_mes?: string | null;
};
export type UnidadeSituacao = { id: string; ativo: boolean; situacao_motivo?: string | null };
export type LancamentoSituacao = { item_despesa_id: string; mes_ano: string };

export type MudancaContrato = { id: string; ativo: boolean; situacao_motivo: string | null; ultimo_mes: string | null };
export type MudancaUnidade = { id: string; ativo: boolean; situacao_motivo: string | null };

const mes = (s?: string | null) => (s || "").substring(0, 7);
export const mesesEntre = (de: string, ate: string) => {
  const [a1, m1] = de.split("-").map(Number), [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};
const rotulo = (m: string) => `${m.substring(5, 7)}/${m.substring(0, 4)}`;
export const ehAutomatico = (motivo?: string | null) => !!motivo && motivo.startsWith(PREFIXO_AUTOMATICO);

// Último mês importado de cada concessionária (despesa_id) e última fatura de cada contrato.
export function ultimosMeses(contratos: ContratoSituacao[], lancamentos: LancamentoSituacao[]) {
  const despesaDe = new Map(contratos.map(c => [c.id, c.despesa_id]));
  const porContrato = new Map<string, string>(), porDespesa = new Map<string, string>();
  for (const l of lancamentos) {
    const m = mes(l.mes_ano), d = despesaDe.get(l.item_despesa_id);
    if (!m || d === undefined) continue;
    if (m > (porContrato.get(l.item_despesa_id) || "")) porContrato.set(l.item_despesa_id, m);
    if (m > (porDespesa.get(d) || "")) porDespesa.set(d, m);
  }
  return { porContrato, porDespesa };
}

export function calcularSituacao(contratos: ContratoSituacao[], unidades: UnidadeSituacao[], lancamentos: LancamentoSituacao[]) {
  const { porContrato, porDespesa } = ultimosMeses(contratos, lancamentos);
  const contratosMudados: MudancaContrato[] = [];
  const ativoFinal = new Map<string, boolean>();

  for (const c of contratos) {
    const ultimoDaConc = porDespesa.get(c.despesa_id);
    const ultima = porContrato.get(c.id) || null;
    const base = [ultima, mes(c.reativado_mes) || null].filter(Boolean).sort().pop() || null;
    let ativo = c.ativo, motivo = c.situacao_motivo || null;
    const manual = !c.ativo && !ehAutomatico(c.situacao_motivo);
    // Sem nenhuma fatura (cadastro novo) ou desativado à mão: a regra não mexe.
    if (base && ultimoDaConc && !manual) {
      if (mesesEntre(base, ultimoDaConc) >= MESES_SEM_FATURA) {
        ativo = false;
        motivo = ultima ? `${PREFIXO_AUTOMATICO} ${rotulo(ultima)} (${MESES_SEM_FATURA} meses ou mais)` : `${PREFIXO_AUTOMATICO} a reativação (${MESES_SEM_FATURA} meses ou mais)`;
      } else if (!c.ativo || ehAutomatico(motivo)) {
        ativo = true;
        motivo = null;
      }
    }
    ativoFinal.set(c.id, ativo);
    if (ativo !== c.ativo || (motivo || null) !== (c.situacao_motivo || null)) {
      contratosMudados.push({ id: c.id, ativo, situacao_motivo: motivo, ultimo_mes: ultima });
    }
  }

  // Unidade: inativa quando todos os contratos dela estão inativos pela regra; volta quando um volta.
  const unidadesMudadas: MudancaUnidade[] = [];
  const contratosDa = new Map<string, ContratoSituacao[]>();
  contratos.forEach(c => contratosDa.set(c.unidade_id, [...(contratosDa.get(c.unidade_id) || []), c]));
  for (const u of unidades) {
    const cs = contratosDa.get(u.id) || [];
    if (!cs.length) continue;
    const manual = !u.ativo && !ehAutomatico(u.situacao_motivo);
    if (manual) continue;
    const algumAtivo = cs.some(c => ativoFinal.get(c.id));
    const motivos = cs.map(c => contratosMudados.find(m => m.id === c.id)?.situacao_motivo ?? c.situacao_motivo).filter(ehAutomatico) as string[];
    // Todos inativos, mas nenhum pela regra (desativados à mão): a unidade fica como está.
    if (!algumAtivo && !motivos.length) continue;
    const ativo = algumAtivo;
    const motivo = ativo ? null : (cs.length === 1 ? motivos[0] : `${PREFIXO_AUTOMATICO} — todos os ${cs.length} contratos (${MESES_SEM_FATURA} meses ou mais)`) || null;
    if (ativo !== u.ativo || (motivo || null) !== (u.situacao_motivo || null)) unidadesMudadas.push({ id: u.id, ativo, situacao_motivo: motivo });
  }
  return { contratos: contratosMudados, unidades: unidadesMudadas, ultimoPorDespesa: porDespesa };
}
