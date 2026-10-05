import React, { useState } from "react";
import { FileSpreadsheet, X, AlertTriangle } from "lucide-react";
import { lerPlanilhaClassificacao, LinhaClassificacao } from "../utils/planilhaClassificacao";

type MatriculaPrevia = { matricula: string; nome_fatura: string; endereco: string; encontrada: boolean };
type GrupoPrevia = {
  chave: string; unidade: string; secretaria: string; nome_final: string; separado: boolean;
  enderecos_diferentes: boolean; nomes_destino: string[]; matriculas: MatriculaPrevia[];
};
type Previa = {
  total_linhas: number; secretarias_novas: string[]; nao_encontradas: string[]; fora_da_planilha: string[]; grupos: GrupoPrevia[];
};

async function postar(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Falha na comunicação com o servidor.");
  return data;
}

// Importa a planilha "matrícula -> unidade no sistema, nome na fatura, secretaria": cria as
// secretarias, junta na mesma unidade as matrículas com o mesmo nome no sistema e nomeia a unidade
// como "NOME NO SISTEMA - NOME NA FATURA". Mostra a prévia antes de gravar.
export function ImportarClassificacaoModal({ onClose, onDone, onError }: {
  onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<LinhaClassificacao[]>([]);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [separar, setSeparar] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const gerarPrevia = async (conteudo: string, sep: string[]) => {
    setErro("");
    const lido = lerPlanilhaClassificacao(conteudo);
    if (lido.erro) { setErro(lido.erro); setPrevia(null); return; }
    if (!lido.linhas.length) { setErro("Nenhuma linha com matrícula foi encontrada."); setPrevia(null); return; }
    setOcupado(true);
    try {
      setLinhas(lido.linhas);
      setPrevia(await postar("/api/classificacao/previa", { linhas: lido.linhas, separar: sep }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const lerArquivo = (f?: File) => {
    if (!f) return;
    f.text().then(t => { setTexto(t); setSeparar([]); gerarPrevia(t, []); });
  };

  const alternarSeparar = (chave: string, marcar: boolean) => {
    const novo = marcar ? [...separar, chave] : separar.filter(c => c !== chave);
    setSeparar(novo);
    gerarPrevia(texto, novo);
  };

  const aplicar = async () => {
    if (!previa) return;
    setOcupado(true);
    try {
      const r = await postar("/api/classificacao/aplicar", { linhas, separar });
      onDone(`${r.secretarias_criadas} secretaria(s) criada(s), ${r.unidades_atualizadas} unidade(s) classificada(s), ` +
        `${r.contratos_classificados} contrato(s) movido(s)` + (r.unidades_removidas ? `, ${r.unidades_removidas} unidade(s) vazia(s) removida(s)` : "") + ".");
    } catch (e: any) {
      onError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const grupos = previa?.grupos || [];
  const gruposAviso = grupos.filter(g => g.enderecos_diferentes || g.separado);
  const gruposComuns = grupos.filter(g => !g.enderecos_diferentes && !g.separado);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#18181b] border border-white/10 text-white rounded-2xl p-6 max-w-4xl w-full shadow-2xl space-y-4 my-8 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-base flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-400" /> Importar classificação (planilha)</h4>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-gray-400">
          No Google Sheets, selecione a tabela inteira <b>com o cabeçalho</b> (Matrícula, Usuário, Unidade, Secretaria…), copie e cole abaixo — ou envie o arquivo CSV.
          A matrícula decide o contrato; matrículas com o mesmo nome em "Unidade" ficam juntas numa unidade chamada "UNIDADE - USUÁRIO". Nada é gravado antes de confirmar.
        </p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} placeholder="Cole aqui as células copiadas da planilha"
          className="w-full bg-white/5 border border-white/15 rounded-xl p-3 font-mono text-[11px] focus:outline-none" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={ocupado || !texto.trim()} onClick={() => { setSeparar([]); gerarPrevia(texto, []); }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold disabled:opacity-50">Ver prévia</button>
          <label className="px-4 py-2 rounded-xl border border-white/15 text-gray-300 hover:bg-white/5 cursor-pointer">
            Enviar CSV
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { lerArquivo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {ocupado && <span className="text-gray-400">Processando…</span>}
        </div>
        {erro && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">{erro}</div>}

        {previa && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["Linhas lidas", previa.total_linhas],
                ["Unidades", grupos.reduce((n, g) => n + g.nomes_destino.length, 0)],
                ["Secretarias novas", previa.secretarias_novas.length],
                ["Matrículas não achadas", previa.nao_encontradas.length],
              ].map(([r, v]) => (
                <div key={r as string} className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-gray-400">{r}</div><div className="text-lg font-bold">{v}</div>
                </div>
              ))}
            </div>

            {previa.secretarias_novas.length > 0 && (
              <div><div className="font-bold mb-1">Secretarias que serão criadas</div>
                <div className="flex flex-wrap gap-1.5">{previa.secretarias_novas.map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">{s}</span>)}</div>
              </div>
            )}

            {gruposAviso.length > 0 && (
              <div className="space-y-2">
                <div className="font-bold text-amber-300 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Mesmo nome no sistema, endereços diferentes — confira</div>
                {gruposAviso.map(g => {
                  const separado = separar.includes(g.chave);
                  return (
                    <div key={g.chave} className="border border-amber-500/30 rounded-lg p-3 bg-black/20 space-y-1.5">
                      <div className="font-bold">{g.unidade} <span className="text-gray-400 font-normal">· {g.secretaria}</span></div>
                      {g.matriculas.map(m => (
                        <div key={m.matricula} className="text-gray-300 font-mono">{m.matricula} — {m.nome_fatura} — {m.endereco || "sem endereço"}</div>
                      ))}
                      <div className="text-gray-400">Vai ficar {separado ? `em ${g.nomes_destino.length} unidades` : "numa unidade só"}:
                        {g.nomes_destino.map((n, i) => <span key={i} className="text-white font-bold block">{n}</span>)}</div>
                      <label className="flex items-center gap-2 cursor-pointer text-amber-200">
                        <input type="checkbox" checked={separado} disabled={ocupado} onChange={(e) => alternarSeparar(g.chave, e.target.checked)} />
                        São locais diferentes — criar uma unidade para cada matrícula
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <div className="font-bold mb-1">Unidades ({gruposComuns.length})</div>
              <div className="max-h-72 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5">
                {gruposComuns.map(g => (
                  <div key={g.chave} className="p-2.5">
                    <div className="font-bold">{g.nome_final}</div>
                    <div className="text-gray-400">{g.secretaria} · <span className="font-mono">{g.matriculas.map(m => m.matricula + (m.encontrada ? "" : " (não achada)")).join(", ")}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {previa.nao_encontradas.length > 0 && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200">
                <b>Matrículas da planilha sem contrato no sistema</b> (ficam de fora; cadastre a fatura antes): <span className="font-mono">{previa.nao_encontradas.join(", ")}</span>
              </div>
            )}
            {previa.fora_da_planilha.length > 0 && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-gray-300">
                <b>Contratos CASAN do sistema que não estão na planilha</b> (não serão mexidos): <span className="font-mono">{previa.fora_da_planilha.join(", ")}</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5">Cancelar</button>
              <button type="button" disabled={ocupado} onClick={aplicar}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold disabled:opacity-50">Aplicar classificação</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
