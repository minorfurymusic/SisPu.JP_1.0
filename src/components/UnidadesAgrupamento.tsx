import React, { useEffect, useMemo, useState } from "react";
import { Link2, Search, X, ChevronDown, ChevronRight } from "lucide-react";

type ContratoResumo = { id: string; codigo_numero: string; despesa_descricao: string };
type UnidadeSugerida = { id: string; nome: string; endereco?: string; agrupada: boolean; contratos: ContratoResumo[] };
type GrupoSugerido = { motivos: string[]; unidades: UnidadeSugerida[] };

const badge = (desc: string) => (/CASAN|ÁGUA|AGUA/i.test(desc) ? "💧 CASAN" : "⚡ CELESC");

async function juntar(unidadeId: string, itemIds: string[]) {
  const res = await fetch(`/api/unidades/${unidadeId}/juntar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
    body: JSON.stringify({ item_ids: itemIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível juntar os contratos.");
  return data;
}

const CHAVE_IGNORADOS = "sispu_agrupamento_ignorados";
const lerIgnorados = (): string[] => {
  try { return JSON.parse(localStorage.getItem(CHAVE_IGNORADOS) || "[]"); } catch { return []; }
};

// Painel de unidades que parecem ser o mesmo local físico; o usuário marca quais juntar e em qual.
export function SugestoesAgrupamento({ onChanged, onError, onSuccess }: {
  onChanged: () => void; onError: (m: string) => void; onSuccess: (m: string) => void;
}) {
  const [grupos, setGrupos] = useState<GrupoSugerido[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ignorados, setIgnorados] = useState<string[]>(lerIgnorados);
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  const [destino, setDestino] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState(false);

  const carregar = () => fetch("/api/unidades/sugestoes-agrupamento").then(r => r.json()).then((g: GrupoSugerido[]) => {
    const ordenados = [...g].sort((a, b) => {
      const mix = (x: GrupoSugerido) => new Set(x.unidades.flatMap(u => u.contratos.map(c => badge(c.despesa_descricao)))).size;
      return mix(b) - mix(a);
    });
    setGrupos(ordenados);
    setMarcadas({});
    setDestino({});
  }).catch(() => setGrupos([]));
  useEffect(() => { carregar(); }, []);

  const chave = (g: GrupoSugerido) => g.unidades.map(u => u.id).sort().join("|");
  const visiveis = useMemo(() => grupos.filter(g => !ignorados.includes(chave(g))), [grupos, ignorados]);

  const ignorar = (g: GrupoSugerido) => {
    const novos = [...ignorados, chave(g)];
    setIgnorados(novos);
    try { localStorage.setItem(CHAVE_IGNORADOS, JSON.stringify(novos)); } catch {}
  };

  const executar = async (g: GrupoSugerido, idx: number) => {
    const escolhidas = g.unidades.filter(u => marcadas[`${idx}:${u.id}`] !== false);
    const alvoId = destino[idx] && escolhidas.some(u => u.id === destino[idx]) ? destino[idx] : escolhidas[0]?.id;
    const itens = escolhidas.filter(u => u.id !== alvoId).flatMap(u => u.contratos.map(c => c.id));
    if (!alvoId || itens.length === 0) { onError("Marque pelo menos duas unidades para juntar."); return; }
    setOcupado(true);
    try {
      await juntar(alvoId, itens);
      onSuccess(`${itens.length} contrato(s) juntado(s) na unidade "${escolhidas.find(u => u.id === alvoId)?.nome}".`);
      onChanged();
      await carregar();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (visiveis.length === 0) return null;
  return (
    <div className="bg-[#121212] p-4 rounded-xl border border-amber-500/30 shadow-sm space-y-3 text-xs">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex items-center gap-2 font-bold text-amber-300">
        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Link2 className="h-4 w-4" />
        Possíveis mesmos locais ({visiveis.length}) — confira e junte os contratos de água e luz do mesmo lugar
      </button>
      {aberto && visiveis.map(g => {
        const idx = grupos.indexOf(g);
        const alvoAtual = destino[idx] || g.unidades[0].id;
        return (
          <div key={chave(g)} className="border border-white/10 rounded-lg p-3 space-y-2 bg-black/20">
            <div className="text-[11px] text-gray-400">{g.motivos.join(" · ")}</div>
            {g.unidades.map(u => (
              <label key={u.id} className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={marcadas[`${idx}:${u.id}`] !== false}
                  onChange={(e) => setMarcadas(prev => ({ ...prev, [`${idx}:${u.id}`]: e.target.checked }))} />
                <span>
                  <span className="font-bold text-white">{u.nome}</span>
                  <span className="text-gray-400"> — {u.endereco || "sem endereço"}</span>
                  <span className="block text-[11px] text-gray-400 font-mono">
                    {u.contratos.map(c => `${badge(c.despesa_descricao)} ${c.codigo_numero}`).join("   ")}
                  </span>
                </span>
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-gray-400">Juntar na unidade:</span>
              <select value={alvoAtual} onChange={(e) => setDestino(prev => ({ ...prev, [idx]: e.target.value }))}
                className="bg-[#27272a] border border-white/15 rounded-lg px-2 py-1 text-white">
                {g.unidades.map(u => <option key={u.id} value={u.id}>{u.nome} — {u.endereco}</option>)}
              </select>
              <button type="button" disabled={ocupado} onClick={() => executar(g, idx)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 disabled:opacity-50">Juntar marcadas</button>
              <button type="button" onClick={() => ignorar(g)}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5">Não é o mesmo local</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Busca contratos de qualquer concessionária (nome, endereço, código atual/antigo, medidor) e
// junta os escolhidos na unidade aberta.
export function JuntarContratosModal({ unidade, itens, onClose, onDone, onError }: {
  unidade: any; itens: any[]; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = useState(false);

  const candidatos = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (q.length < 2) return [];
    return itens.filter(it => it && String(it.unidade_id) !== String(unidade.id)).filter(it => [
      it.codigo_numero, ...(it.codigos_numero_anteriores || []), it.unidade_nome, it.unidade_endereco, it.endereco_contrato,
      it.medidor, ...(it.medidores_fisicos || []).map((m: any) => m.numero), ...(it.medidores_detectados || []).map((m: any) => m.numero),
    ].filter(Boolean).join(" ").toUpperCase().includes(q)).slice(0, 50);
  }, [busca, itens, unidade.id]);

  const confirmar = async () => {
    const ids = Object.keys(marcados).filter(k => marcados[k]);
    if (ids.length === 0) return;
    setOcupado(true);
    try {
      const r = await juntar(unidade.id, ids);
      onDone(`${r.contratos_movidos} contrato(s) juntado(s) em "${unidade.nome}".`);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#18181b] border border-white/10 text-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 my-8 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-base">Juntar contratos em "{unidade.nome}"</h4>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-gray-400">Procure por nome, endereço, código (atual ou antigo) ou medidor. Os contratos marcados passam para esta unidade; a unidade de onde saem é apagada se ficar vazia. Os lançamentos não mudam.</p>
        <div className="flex items-center gap-2 bg-white/5 border border-white/15 rounded-xl px-3 py-2">
          <Search className="h-4 w-4 text-gray-400" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Francisca Roffman, CEI, 1.004.748..."
            className="flex-1 bg-transparent text-sm focus:outline-none" />
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded-xl">
          {busca.trim().length < 2 && <div className="p-3 text-gray-500">Digite pelo menos 2 letras para buscar.</div>}
          {busca.trim().length >= 2 && candidatos.length === 0 && <div className="p-3 text-gray-500">Nenhum contrato encontrado.</div>}
          {candidatos.map(it => (
            <label key={it.id} className="flex items-start gap-2 p-2.5 cursor-pointer hover:bg-white/5">
              <input type="checkbox" className="mt-0.5" checked={!!marcados[it.id]} onChange={(e) => setMarcados(prev => ({ ...prev, [it.id]: e.target.checked }))} />
              <span>
                <span className="font-mono font-bold">{badge(it.despesa_descricao || "")} {it.codigo_numero}</span>
                <span className="block text-gray-400">{it.unidade_nome} — {it.endereco_contrato || it.unidade_endereco || "sem endereço"}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5">Cancelar</button>
          <button type="button" disabled={ocupado || !Object.values(marcados).some(Boolean)} onClick={confirmar}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold disabled:opacity-50">Juntar nesta unidade</button>
        </div>
      </div>
    </div>
  );
}
