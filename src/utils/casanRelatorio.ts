// Linha de uma matrícula no relatório da CASAN (SCI8095, "Contas que compõem fatura de cobrança
// centralizada"): unidades, leituras, consumo e os valores de água, esgoto, serviço (IR retido,
// negativo), bônus e total. A leitura anterior às vezes falta; por isso 1 a 3 números antes dos valores.
export type LinhaCasan = { leitura_anterior?: number; leitura_atual?: number; consumo?: number; agua: number; esgoto: number; servico: number; bonus: number; total: number };

const valor = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function linhaCasanDoTexto(texto: string, matricula: string): LinhaCasan | null {
  const cod = String(matricula || "").trim().replace(/^0+/, "").replace(/-/g, "\\-");
  if (!cod) return null;
  const dinheiro = "(-?[\\d.]+,\\d{2})";
  const re = new RegExp(`^\\s*0*${cod}\\s.*?\\s\\d{3}((?:\\s+\\d+){1,3})\\s+${dinheiro}\\s+${dinheiro}\\s+${dinheiro}\\s+${dinheiro}\\s+${dinheiro}`, "m");
  const m = (texto || "").match(re);
  if (!m) return null;
  const inteiros = m[1].trim().split(/\s+/).map(Number);
  const [agua, esgoto, servico, bonus, total] = m.slice(2, 7).map(valor);
  if (Math.abs(agua + esgoto + servico + bonus - total) > 0.05) return null;
  const consumo = inteiros.length >= 2 ? inteiros[inteiros.length - 1] : undefined;
  return {
    leitura_anterior: inteiros.length === 3 ? inteiros[0] : undefined,
    leitura_atual: inteiros.length >= 2 ? inteiros[inteiros.length - 2] : undefined,
    consumo, agua, esgoto, servico, bonus, total,
  };
}
