import React, { useEffect, useState } from "react";
import { Droplet, Zap, ChevronDown, ChevronRight } from "lucide-react";

// Detalhe das faturas de um prédio: uma tabela por ligação, um mês por linha (12 meses). Só aparecem
// as colunas que têm valor em algum mês (ex.: demanda só no grupo A, injetada só com solar).

type Mes = Record<string, any> & { mes: string; valor: number; consumo: number };
type LigacaoFaturas = { id: string; tipo: "AGUA" | "LUZ"; codigo: string; unidade: string; ativo: boolean; meses: Mes[] };
type Coluna = { chave: string; titulo: string; dica?: string; tipo: "rs" | "num" | "texto"; soma?: boolean; perda?: boolean; valor?: (m: Mes) => any };

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number, d = 0) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });
const mesBR = (m: string) => `${m.substring(5, 7)}/${m.substring(0, 4)}`;

const AGUA: Coluna[] = [
  { chave: "consumo", titulo: "Consumo (m³)", tipo: "num", soma: true },
  { chave: "leituras", titulo: "Leituras", tipo: "texto", valor: m => m.leitura_atual != null ? `${m.leitura_anterior ?? "—"} → ${m.leitura_atual}` : "" },
  { chave: "agua", titulo: "Água", tipo: "rs", soma: true },
  { chave: "esgoto", titulo: "Esgoto", tipo: "rs", soma: true },
  { chave: "bonus", titulo: "Bônus", tipo: "rs", soma: true },
  { chave: "ir_retido", titulo: "IR retido", dica: "Retido pela Prefeitura; não é pago à CASAN", tipo: "rs", soma: true },
  { chave: "valor", titulo: "Total", tipo: "rs", soma: true },
  { chave: "preco", titulo: "R$/m³", tipo: "rs", valor: m => (m.consumo > 0 ? m.valor / m.consumo : 0) },
];
const LUZ: Coluna[] = [
  { chave: "consumo", titulo: "Consumo (kWh)", tipo: "num", soma: true },
  { chave: "injetada_medida", titulo: "Injetada (kWh)", dica: "Energia solar que este relógio mandou para a rede (medida)", tipo: "num", soma: true },
  { chave: "compensada", titulo: "Compensada (kWh)", dica: "Consumo abatido pelos créditos solares (gerados aqui ou em outra UC)", tipo: "num", soma: true },
  { chave: "energia", titulo: "Energia (TE)", tipo: "rs", soma: true },
  { chave: "rede", titulo: "Rede (TUSD)", tipo: "rs", soma: true },
  { chave: "bandeira", titulo: "Bandeira", tipo: "rs", soma: true },
  { chave: "demanda_contratada_kw", titulo: "Demanda contratada (kW)", tipo: "num" },
  { chave: "demanda_medida_kw", titulo: "Demanda medida (kW)", tipo: "num" },
  { chave: "demanda", titulo: "Demanda (R$)", tipo: "rs", soma: true },
  { chave: "ultrapassagem", titulo: "Ultrapassagem", dica: "Demanda acima de 105% da contratada, cobrada em dobro", tipo: "rs", soma: true, perda: true },
  { chave: "demanda_sem_uso", titulo: "Demanda sem uso", dica: "Demanda contratada e não usada", tipo: "rs", soma: true, perda: true },
  { chave: "reativo", titulo: "Reativo", dica: "Energia reativa excedente (desperdício; corrige com capacitor)", tipo: "rs", soma: true, perda: true },
  { chave: "minimo_sem_uso", titulo: "Mínimo sem uso", dica: "Custo de disponibilidade: kWh pagos sem consumir", tipo: "rs", soma: true, perda: true },
  { chave: "multas_juros", titulo: "Multas e juros", tipo: "rs", soma: true, perda: true },
  { chave: "solar", titulo: "Crédito solar", tipo: "rs", soma: true },
  { chave: "cosip", titulo: "COSIP", tipo: "rs", soma: true },
  { chave: "icms", titulo: "ICMS", tipo: "rs", soma: true },
  { chave: "pis_cofins", titulo: "PIS/COFINS", tipo: "rs", soma: true },
  { chave: "ir_retido", titulo: "IR retido", dica: "Retido pela Prefeitura; não é pago à CELESC", tipo: "rs", soma: true },
  { chave: "valor", titulo: "Total", tipo: "rs", soma: true },
  { chave: "preco", titulo: "R$/kWh", tipo: "rs", valor: m => (m.consumo > 0 ? m.valor / m.consumo : 0) },
  { chave: "grupo_tensao", titulo: "Grupo", tipo: "texto" },
  { chave: "medidor", titulo: "Medidor", tipo: "texto" },
];

const ler = (c: Coluna, m: Mes) => (c.valor ? c.valor(m) : m[c.chave]);
const mostrar = (c: Coluna, v: any) => (v == null || v === "" ? "—" : c.tipo === "rs" ? brl(v) : c.tipo === "num" ? num(v, c.chave.endsWith("_kw") ? 1 : 0) : String(v));

function Tabela({ l }: { l: LigacaoFaturas; key?: string }) {
  const colunas = (l.tipo === "AGUA" ? AGUA : LUZ).filter(c => ["consumo", "valor", "preco"].includes(c.chave) || l.meses.some(m => { const v = ler(c, m); return v != null && v !== "" && v !== 0; }));
  const semDetalhe = l.tipo === "LUZ" && l.meses.some(m => m.detalhado === false);
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold flex items-center gap-2">
        {l.tipo === "AGUA" ? <Droplet className="h-3.5 w-3.5 text-sky-300" /> : <Zap className="h-3.5 w-3.5 text-amber-300" />}
        <span className="font-mono">{l.codigo}</span><span className="text-gray-400 font-normal truncate">{l.unidade}</span>
        {!l.ativo && <span className="text-[10px] text-gray-500">(inativa)</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs min-w-full">
          <thead className="text-[10px] uppercase text-gray-400 border-b border-white/10">
            <tr>
              <th className="text-left py-1.5 pr-3 sticky left-0 bg-[#121212]">Mês</th>
              {colunas.map(c => <th key={c.chave} title={c.dica} className={`py-1.5 px-2 whitespace-nowrap ${c.tipo === "texto" ? "text-left" : "text-right"} ${c.perda ? "text-amber-300" : ""}`}>{c.titulo}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {l.meses.map(m => (
              <tr key={m.mes}>
                <td className="py-1.5 pr-3 sticky left-0 bg-[#121212] whitespace-nowrap">{mesBR(m.mes)}</td>
                {colunas.map(c => { const v = ler(c, m); return (
                  <td key={c.chave} className={`py-1.5 px-2 whitespace-nowrap tabular-nums ${c.tipo === "texto" ? "text-left text-gray-400" : "text-right"} ${c.perda && v ? "text-amber-200" : ""} ${c.chave === "valor" ? "font-semibold" : ""}`}>{mostrar(c, v)}</td>
                ); })}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-white/15 font-semibold">
            <tr>
              <td className="py-1.5 pr-3 sticky left-0 bg-[#121212]">{l.meses.length} meses</td>
              {colunas.map(c => <td key={c.chave} className={`py-1.5 px-2 whitespace-nowrap tabular-nums text-right ${c.perda ? "text-amber-200" : ""}`}>{c.soma ? mostrar(c, l.meses.reduce((a, m) => a + (Number(ler(c, m)) || 0), 0)) : ""}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      {semDetalhe && <div className="text-[10px] text-gray-500">Meses sem as partes da conta: a fatura veio só com o total (relatório coletivo).</div>}
    </div>
  );
}

export default function EdificioFaturas({ edificioId }: { edificioId: string }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<LigacaoFaturas[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (!aberto || dados) return;
    fetch(`/api/edificios/${edificioId}/faturas`).then(r => (r.ok ? r.json() : Promise.reject())).then(d => setDados(d.ligacoes)).catch(() => setErro("Não foi possível carregar as faturas."));
  }, [aberto, dados, edificioId]);
  return (
    <div className="border border-white/10 rounded-lg">
      <button onClick={() => setAberto(!aberto)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/[0.03]">
        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Detalhes das faturas (12 meses, mês a mês)
      </button>
      {aberto && (
        <div className="px-3 pb-3 space-y-4 bg-[#121212]">
          {erro && <div className="text-xs text-rose-300">{erro}</div>}
          {!dados && !erro && <div className="text-xs text-gray-400">Carregando…</div>}
          {dados?.map(l => <Tabela key={l.id} l={l} />)}
          {dados && <div className="text-[10px] text-gray-500">Em amarelo: perdas evitáveis. Passe o mouse no título da coluna para a explicação.</div>}
        </div>
      )}
    </div>
  );
}
