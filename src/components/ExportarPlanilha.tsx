import React, { useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { buscaBate } from "../utils/busca";

// Janela para gerar a planilha: período, água/luz, unidades e tipo (simples = consumo e valor pago;
// completo = todas as abas, com impostos, taxas, perdas e relatórios). Usada no Dashboard e no
// painel de uma unidade (que já abre com ela escolhida).

type UnidadeOpcao = { id: string; nome: string; secretaria: string; endereco?: string };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotulo = (m: string) => `${MESES[Number(m.substring(5, 7)) - 1]}/${m.substring(0, 4)}`;

export default function ExportarPlanilha({ meses, deInicial, ateInicial, unidades, unidadesIniciais = [], concInicial = "", relatorio, onFechar }: {
  meses: string[]; deInicial: string; ateInicial: string; unidades: UnidadeOpcao[]; unidadesIniciais?: string[];
  concInicial?: "" | "CELESC" | "CASAN"; relatorio?: () => any; onFechar: () => void;
}) {
  const [de, setDe] = useState(deInicial || meses[0] || "");
  const [ate, setAte] = useState(ateInicial || meses[meses.length - 1] || "");
  const [conc, setConc] = useState<"" | "CELESC" | "CASAN">(concInicial);
  const [tipo, setTipo] = useState<"simples" | "completo">("simples");
  const [escolhidas, setEscolhidas] = useState<string[]>(unidadesIniciais);
  const [todas, setTodas] = useState(unidadesIniciais.length === 0);
  const [busca, setBusca] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  const opcoes = useMemo(() => busca.trim().length >= 2
    ? unidades.filter(u => !escolhidas.includes(u.id) && buscaBate(`${u.nome} ${u.secretaria} ${u.endereco || ""}`, busca)).slice(0, 12) : [], [busca, unidades, escolhidas]);
  const nome = (id: string) => unidades.find(u => u.id === id)?.nome || id;

  const gerar = async () => {
    if (!todas && !escolhidas.length) { setErro("Escolha ao menos uma unidade, ou marque \"Todas as unidades\"."); return; }
    if (de > ate) { setErro("O mês inicial está depois do mês final."); return; }
    setGerando(true); setErro("");
    try {
      const res = await fetch("/api/exportar/tudo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de, ate, concessionaria: conc, unidade_ids: todas ? [] : escolhidas, tipo, relatorio: tipo === "completo" && relatorio ? relatorio() : {} }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Não foi possível gerar a planilha.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      const quem = todas ? "todas" : escolhidas.length === 1 ? nome(escolhidas[0]).split(" - ")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40) : `${escolhidas.length}_unidades`;
      a.href = url; a.download = `sispu_${tipo}_${quem}_${de}_a_${ate}${conc ? `_${conc}` : ""}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onFechar();
    } catch (e: any) { setErro(e.message); } finally { setGerando(false); }
  };

  const botao = (ativo: boolean) => `px-3 py-1.5 rounded-md text-xs font-semibold ${ativo ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-white/5"}`;
  const sel = "bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white";
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onFechar}>
      <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-2xl my-10 p-5 space-y-4 text-sm text-gray-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2"><Download className="h-4 w-4" />Exportar planilha (.xlsx)</h3>
          <button onClick={onFechar} className="p-1 hover:bg-white/10 rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase text-gray-400">Período</div>
          <div className="flex items-center gap-2 text-xs">
            <span>De</span><select value={de} onChange={e => setDe(e.target.value)} className={sel}>{meses.map(m => <option key={m} value={m}>{rotulo(m)}</option>)}</select>
            <span>até</span><select value={ate} onChange={e => setAte(e.target.value)} className={sel}>{meses.map(m => <option key={m} value={m}>{rotulo(m)}</option>)}</select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase text-gray-400">Concessionária</div>
          <div className="flex w-fit bg-black/40 border border-white/10 rounded-lg p-1">
            {([["", "Água e luz"], ["CELESC", "Só luz (CELESC)"], ["CASAN", "Só água (CASAN)"]] as const).map(([k, t]) => <button key={k} onClick={() => setConc(k)} className={botao(conc === k)}>{t}</button>)}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase text-gray-400">Unidades</div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} />Todas as unidades</label>
          {!todas && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {escolhidas.map(id => (
                  <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-500/15 border border-indigo-500/30">
                    {nome(id)}<button onClick={() => setEscolhidas(escolhidas.filter(x => x !== id))} className="hover:text-rose-300"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {!escolhidas.length && <span className="text-xs text-gray-500">Nenhuma escolhida ainda.</span>}
              </div>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar unidade por nome, secretaria, endereço ou código"
                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-xs" />
              {opcoes.map(u => (
                <button key={u.id} onClick={() => { setEscolhidas([...escolhidas, u.id]); setBusca(""); }}
                  className="w-full text-left text-xs px-3 py-1.5 rounded border border-white/10 hover:bg-white/5">
                  <span className="font-semibold">{u.nome}</span> <span className="text-gray-500">{u.secretaria}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase text-gray-400">Tipo</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {([["simples", "Simples", "Consumo e valor pago, mês a mês (lista + tabelas por mês)."], ["completo", "Completo", "Todas as abas: partes da conta, impostos, taxas, perdas, relatórios e cadastros."]] as const).map(([k, t, d]) => (
              <button key={k} onClick={() => setTipo(k)} className={`text-left rounded-lg border px-3 py-2 ${tipo === k ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 hover:bg-white/5"}`}>
                <div className="text-xs font-bold">{t}</div><div className="text-[11px] text-gray-400">{d}</div>
              </button>
            ))}
          </div>
        </div>

        {erro && <div className="text-xs text-rose-300">{erro}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onFechar} className="text-xs px-4 py-2 rounded-lg border border-white/15">Cancelar</button>
          <button disabled={gerando} onClick={gerar} className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" />{gerando ? "Gerando…" : "Gerar planilha"}
          </button>
        </div>
      </div>
    </div>
  );
}
