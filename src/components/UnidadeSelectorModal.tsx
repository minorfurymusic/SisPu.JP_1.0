import React, { useState, useMemo } from 'react';
import { Building2, Search, X, Check, Landmark } from 'lucide-react';

export interface UnidadeSelectorModalProps {
  isOpen: boolean;
  codigoNumero?: string;
  currentUnidadeNome?: string;
  unidades: any[];
  onClose: () => void;
  onSelectUnidade: (unidadeId: string, unidadeNome: string) => Promise<void> | void;
}

export default function UnidadeSelectorModal({
  isOpen,
  codigoNumero,
  currentUnidadeNome,
  unidades,
  onClose,
  onSelectUnidade
}: UnidadeSelectorModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredUnidades = useMemo(() => {
    if (!searchTerm.trim()) return unidades;
    const term = searchTerm.toLowerCase();
    return unidades.filter(u => {
      const nome = (u.nome || '').toLowerCase();
      const sec = (u.secretaria_nome || u.secretaria || '').toLowerCase();
      const cod = (u.codigo_legado || '').toString().toLowerCase();
      return nome.includes(term) || sec.includes(term) || cod.includes(term);
    });
  }, [unidades, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#18181b] border border-white/10 text-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Building2 className="h-6 w-6 shrink-0" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">Vincular Unidade Gestora</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {codigoNumero ? (
                  <>CODNUM / Contrato: <span className="text-amber-300 font-mono font-bold">{codigoNumero}</span></>
                ) : (
                  'Selecione a unidade gestora correspondente'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current status */}
        {currentUnidadeNome && (
          <div className="bg-[#222226] border border-white/5 rounded-xl p-3 text-xs flex items-center justify-between">
            <span className="text-gray-400 font-medium">Unidade Atual:</span>
            <span className={`font-bold font-mono px-2 py-0.5 rounded ${
              currentUnidadeNome === 'NÃO LOCALIZADA'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {currentUnidadeNome}
            </span>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-indigo-400" />
          <input
            type="text"
            autoFocus
            placeholder="Escreva para filtrar as unidades cadastradas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#121214] border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>

        {/* Scrollable list of units */}
        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs">
          {filteredUnidades.length === 0 ? (
            <div className="p-6 text-center text-gray-400 bg-[#121214] rounded-xl border border-white/5">
              Nenhuma unidade encontrada para "{searchTerm}".
            </div>
          ) : (
            filteredUnidades.map((u) => {
              const isSelected = currentUnidadeNome === u.nome;
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    await onSelectUnidade(u.id, u.nome);
                    setIsSubmitting(false);
                    onClose();
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between group ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                      : 'bg-[#121214] border-white/5 hover:border-indigo-500/40 hover:bg-[#1a1a20] text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Landmark className="h-4 w-4 text-indigo-400 shrink-0 group-hover:scale-110 transition" />
                    <div>
                      <div className="font-bold text-gray-100 group-hover:text-indigo-300 transition text-xs">
                        {u.nome}
                      </div>
                      {u.secretaria_nome && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Sec: {u.secretaria_nome}
                        </div>
                      )}
                    </div>
                  </div>

                  {isSelected ? (
                    <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                  ) : (
                    <span className="text-[10px] font-semibold text-indigo-400 opacity-0 group-hover:opacity-100 transition">
                      Selecionar →
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-gray-400">
          <span>{filteredUnidades.length} unidade(s) disponível(is)</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-medium transition"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
