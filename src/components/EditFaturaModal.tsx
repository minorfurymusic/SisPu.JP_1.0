import React, { useState, useEffect } from "react";
import { 
  FileCode, Info, Plus, Trash2, Check, AlertCircle, AlertTriangle, CheckCircle, History 
} from "lucide-react";

interface ConferenciaLancamentoModalProps {
  isOpen: boolean;
  item: any;
  itens?: any[];
  unidades?: any[];
  onClose: () => void;
  onSaveSuccess: (updatedDoc?: any) => void;
}

export default function ConferenciaLancamentoModal({
  isOpen,
  item,
  unidades = [],
  onClose,
  onSaveSuccess,
}: ConferenciaLancamentoModalProps) {
  const [activeDoc, setActiveDoc] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize activeDoc when item changes
  useEffect(() => {
    if (item) {
      setError(null);
      const isCasan = (item.codigo_numero && String(item.codigo_numero).toLowerCase().includes("casan")) ||
                      (item.layout && String(item.layout).includes("CASAN")) ||
                      (item.concessionaria === 'CASAN') ||
                      (item.unidade_nome && String(item.unidade_nome).includes("CASAN"));

      const layoutType = item.layout || (isCasan ? "CASAN_FATURA" : "CELESC_FATURA");

      const rawExt = item.dados_extraidos || {};

      const docToEdit = {
        id: item.id || item.doc_id,
        nome_arquivo: item.nome_arquivo || rawExt.nome_arquivo || `PMRS.PDF (PÁG ${item.numero_pagina || rawExt.numero_pagina || 1} | MATRÍCULA: ${item.codigo_numero || rawExt.codigo_numero || item.id})`,
        layout: layoutType,
        numero_pagina: item.numero_pagina || rawExt.numero_pagina || 1,
        posicao_na_pagina: item.posicao_na_pagina || rawExt.posicao_na_pagina || 1,
        total_na_pagina: item.total_na_pagina || rawExt.total_na_pagina || 1,
        posicao_no_lote: item.posicao_no_lote || rawExt.posicao_no_lote || 1,
        total_no_lote: item.total_no_lote || rawExt.total_no_lote || 1,
        score: item.score ?? rawExt.score ?? 100,
        status: item.status || "VALIDADO",
        historico_alteracoes: item.historico_alteracoes || [],
        dados_extraidos: {
          codigo_numero: item.codigo_numero || rawExt.codigo_numero || "",
          municipio: item.municipio || rawExt.municipio || "Florianópolis",
          unidade_id: item.unidade_id || rawExt.unidade_id || "",
          unidade_nome: item.unidade_nome || rawExt.unidade_nome || "",
          endereco: item.endereco || rawExt.endereco || item.unidade_endereco || "",
          fatura_num: item.fatura_num || rawExt.fatura_num || rawExt.classe || "",
          chave_acesso: item.chave_acesso || rawExt.chave_acesso || "",
          grupo_subgrupo_tensao: item.grupo_subgrupo_tensao || rawExt.grupo_subgrupo_tensao || rawExt.grupo_tarifario || "A - A4",
          mes_ano: item.mes_ano || rawExt.mes_ano || "",
          nota_fiscal: item.nota_fiscal || rawExt.nota_fiscal || "",
          data_leitura: item.data_leitura || rawExt.data_leitura || "",
          dias_faturados: item.dias_faturados || rawExt.dias_faturados || 30,
          data_vencimento: item.data_vencimento || rawExt.data_vencimento || "",
          valor_total: parseFloat(item.valor_total ?? rawExt.valor_total ?? 0),
          valor_imposto: parseFloat(item.valor_imposto ?? rawExt.valor_imposto ?? 0),
          valor_credito: parseFloat(item.valor_credito ?? rawExt.valor_credito ?? 0),
          consumo: parseFloat(item.consumo ?? rawExt.consumo ?? 0),
          energia_injetada: parseFloat(item.energia_injetada ?? rawExt.energia_injetada ?? 0),
          itens_fatura: Array.isArray(rawExt.itens_fatura) && rawExt.itens_fatura.length > 0 
            ? rawExt.itens_fatura 
            : (Array.isArray(item.itens_fatura) ? item.itens_fatura : [])
        }
      };

      setActiveDoc(docToEdit);
    }
  }, [item]);

  useEffect(() => {
    if (activeDoc?.dados_extraidos?.codigo_numero && (!activeDoc.dados_extraidos.endereco || activeDoc.dados_extraidos.endereco === "N/A")) {
      const codnum = String(activeDoc.dados_extraidos.codigo_numero).replace(/\D/g, "");
      if (codnum) {
        fetch("/api/unidades")
          .then(res => res.json())
          .then(unidades => {
            if (Array.isArray(unidades)) {
              const match = unidades.find((u: any) => {
                const uCod = String(u.codnum || u.uc || u.codigo_legado || u.id || "").replace(/\D/g, "");
                return uCod && uCod === codnum;
              });
              if (match && match.endereco && match.endereco !== "N/A") {
                setActiveDoc((prev: any) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    dados_extraidos: {
                      ...prev.dados_extraidos,
                      endereco: match.endereco
                    }
                  };
                });
              }
            }
          })
          .catch(() => {});
      }
    }
  }, [activeDoc?.dados_extraidos?.codigo_numero, activeDoc?.dados_extraidos?.endereco]);

  if (!isOpen || !activeDoc) return null;

  // Helpers for calculations
  const computeEnergiaInjetada = (itens: any[]) => {
    if (!Array.isArray(itens)) return 0;
    return itens.reduce((acc, it) => {
      const desc = (it?.descricao || "").toUpperCase();
      if (desc.includes("INJETADA") || desc.includes("GDF") || desc.includes("GDI") || desc.includes("GERACAO") || desc.includes("GERAÇÃO")) {
        return acc + (parseFloat(it.quantidade) || 0);
      }
      return acc;
    }, 0);
  };

  const evalConsistencias = (doc: any) => {
    const alerts: string[] = [];
    if (!doc || !doc.dados_extraidos) return alerts;

    const ext = doc.dados_extraidos;
    const items = ext.itens_fatura || [];
    const valTotal = parseFloat(ext.valor_total || 0);

    if (items.length > 0) {
      const sumItems = items.reduce((acc: number, it: any) => acc + (parseFloat(it.valor) || 0), 0);
      if (Math.abs(sumItems - valTotal) > 0.05) {
        alerts.push(`❌ Alerta: Valor total (R$ ${valTotal.toFixed(2)}) diverge da soma dos itens da fatura (R$ ${sumItems.toFixed(2)}).`);
      }
    }

    if (!ext.codigo_numero) {
      alerts.push("⚠️ Código de ligação / Matrícula (CODNUM) não preenchido.");
    }

    if (!ext.mes_ano) {
      alerts.push("⚠️ Competência de referência (mês/ano) não informada.");
    }

    return alerts;
  };

  const recalculateDocTotals = (updatedItens: any[]) => {
    setActiveDoc((prev: any) => {
      if (!prev) return null;
      const sumItemsVal = updatedItens.reduce((acc, it) => acc + (parseFloat(it.valor) || 0), 0);
      const sumImpostos = updatedItens.reduce((acc, it) => acc + ((parseFloat(it.icms) || 0) + (parseFloat(it.pis) || 0)), 0);
      const sumRetencoes = updatedItens.reduce((acc, it) => {
        const ret = (parseFloat(it.irpj_val) || 0) + (parseFloat(it.pis_ret) || 0) + (parseFloat(it.cofins_ret) || 0) + (parseFloat(it.csll_ret) || 0);
        return acc + ret;
      }, 0);

      const inj = computeEnergiaInjetada(updatedItens);

      return {
        ...prev,
        dados_extraidos: {
          ...prev.dados_extraidos,
          itens_fatura: updatedItens,
          valor_total: updatedItens.length > 0 ? parseFloat(sumItemsVal.toFixed(2)) : prev.dados_extraidos.valor_total,
          valor_imposto: sumImpostos > 0 ? parseFloat(sumImpostos.toFixed(2)) : prev.dados_extraidos.valor_imposto,
          valor_credito: sumRetencoes > 0 ? parseFloat(sumRetencoes.toFixed(2)) : prev.dados_extraidos.valor_credito,
          energia_injetada: inj
        }
      };
    });
  };

  const handleFieldChange = (field: string, val: any) => {
    setActiveDoc((prev: any) => {
      if (!prev) return null;
      const isNumber = ['consumo', 'valor_total', 'valor_imposto', 'valor_credito', 'dias_faturados'].includes(field);
      const updatedValue = isNumber ? parseFloat(val || 0) : val;

      return {
        ...prev,
        dados_extraidos: {
          ...prev.dados_extraidos,
          [field]: updatedValue
        }
      };
    });
  };

  const handleItemFieldChange = (itemId: string, field: string, val: any) => {
    if (!activeDoc) return;
    const currentItens = activeDoc.dados_extraidos.itens_fatura || [];
    const isNum = ['quantidade', 'valor_unitario', 'valor', 'pis', 'icms', 'irpj_pct', 'irpj_val', 'pis_ret', 'cofins_ret', 'csll_ret', 'cofins'].includes(field);
    const updatedVal = isNum ? parseFloat(val || 0) : val;

    const updatedItens = currentItens.map((it: any, idx: number) => {
      const currentId = it.id || `item-${idx}`;
      if (currentId === itemId || it.id === itemId) {
        const updated = { ...it, [field]: updatedVal };
        if (field === 'quantidade' || field === 'valor_unitario') {
          const qty = parseFloat(field === 'quantidade' ? val : (it.quantidade ?? 0)) || 0;
          const unit = parseFloat(field === 'valor_unitario' ? val : (it.valor_unitario ?? 0)) || 0;
          updated.valor = parseFloat((qty * unit).toFixed(2));
        }
        return updated;
      }
      return it;
    });

    recalculateDocTotals(updatedItens);
  };

  const handleAddItem = () => {
    if (!activeDoc) return;
    const currentItens = activeDoc.dados_extraidos.itens_fatura || [];
    const newItem = {
      id: String(Date.now()),
      descricao: "Novo Item de Fatura",
      quantidade: 1,
      valor_unitario: 0.00,
      valor: 0.00,
      pis: 0.00,
      icms: 0.00,
      irpj_pct: 0,
      irpj_val: 0.00,
      pis_ret: 0.00,
      cofins_ret: 0.00,
      csll_ret: 0.00,
      cofins: 0.00
    };
    recalculateDocTotals([...currentItens, newItem]);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activeDoc) return;
    const currentItens = activeDoc.dados_extraidos.itens_fatura || [];
    const updatedItens = currentItens.filter((it: any, idx: number) => {
      if (!it) return false;
      const currentId = it.id || `item-${idx}`;
      return currentId !== itemId && it.id !== itemId;
    });
    recalculateDocTotals(updatedItens);
  };

  const handleSave = async () => {
    if (!activeDoc) return;
    setLoading(true);
    setError(null);

    try {
      const ext = activeDoc.dados_extraidos;
      const targetId = activeDoc.id;

      // Prepare payload for lancamentos API
      const payloadLancamento = {
        item_despesa_id: ext.unidade_id || undefined,
        codigo_numero: ext.codigo_numero,
        mes_ano: ext.mes_ano,
        consumo: ext.consumo,
        valor_total: ext.valor_total,
        valor_imposto: ext.valor_imposto,
        valor_credito: ext.valor_credito,
        dados_extraidos: ext
      };

      // 1. Send update to /api/lancamentos/:id
      let res = await fetch(`/api/lancamentos/${targetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
        body: JSON.stringify(payloadLancamento)
      });

      // 2. If 404, try /api/documentos/:id
      if (!res.ok) {
        const payloadDoc = {
          dados_extraidos: ext,
          status: "VALIDADO"
        };

        res = await fetch(`/api/documentos/${targetId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
          body: JSON.stringify(payloadDoc)
        });
      }

      if (res.ok) {
        // Option to bind unit if changed
        if (ext.codigo_numero && ext.unidade_id) {
          fetch('/api/vincular-unidade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              codigo_numero: ext.codigo_numero,
              unidade_id: ext.unidade_id
            })
          }).catch(() => {});
        }

        onSaveSuccess(activeDoc);
        onClose();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Erro ao salvar as alterações do lançamento.");
      }
    } catch (err: any) {
      setError(err.message || "Erro de conexão ao salvar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f0f0f] border border-white/15 rounded-xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Title Bar */}
        <div className="bg-[#0a0a0a] px-5 py-3.5 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FileCode className="h-4.5 w-4.5 text-indigo-400" />
            <h4 className="font-bold text-sm uppercase tracking-wide text-gray-200">
              Conferência do Lançamento: {activeDoc.nome_arquivo}
            </h4>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition font-bold text-sm px-2 py-1 rounded hover:bg-white/5"
          >
            ✕ Fechar
          </button>
        </div>

        {/* EDITABLE CELL SHEET & WARNINGS */}
        <div className="bg-[#141414] p-5 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
            
            {error && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 p-3 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* High-Fidelity Position Metadata (Etapa 9) */}
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg text-xs space-y-2">
                <span className="font-bold text-indigo-300 flex items-center gap-1.5 font-mono uppercase text-[9px]">
                  <Info className="h-3.5 w-3.5 text-indigo-400" />
                  Rastreabilidade de Importação (FaturaImportada)
                </span>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-gray-300">
                  <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                    <span className="text-gray-500 block text-[8px] uppercase">Pág. PDF</span>
                    <span className="text-gray-200 font-bold text-xs">{activeDoc.numero_pagina || 1}</span>
                  </div>
                  <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                    <span className="text-gray-500 block text-[8px] uppercase">Pos. Página</span>
                    <span className="text-gray-200 font-bold text-xs">
                      {activeDoc.posicao_na_pagina || 1} <span className="text-[9px] text-gray-500">/ {activeDoc.total_na_pagina || 1}</span>
                    </span>
                  </div>
                  <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                    <span className="text-gray-500 block text-[8px] uppercase">Pos. Lote</span>
                    <span className="text-gray-200 font-bold text-xs">
                      {activeDoc.posicao_no_lote || 1} <span className="text-[9px] text-gray-500">/ {activeDoc.total_no_lote || 1}</span>
                    </span>
                  </div>
                </div>
                {activeDoc.score !== undefined && (
                  <div className="flex justify-between items-center text-[10px] bg-black/20 p-1.5 rounded border border-white/5 font-mono text-gray-400">
                    <span>Score Confiança:</span>
                    <span className="font-bold text-emerald-400">{activeDoc.score}/100</span>
                  </div>
                )}
              </div>

              {/* BLOCO 1 — IDENTIFICAÇÃO DA FATURA */}
              <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                  Bloco 1 — Identificação da Fatura
                </span>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  {/* ROW 1 */}
                  {/* Col 1: UC */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Unidade Consumidora / CODNUM</label>
                    <input
                      type="text"
                      value={activeDoc.dados_extraidos.codigo_numero || ""}
                      onChange={(e) => handleFieldChange("codigo_numero", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono font-bold outline-none transition"
                    />
                  </div>
                  {/* Col 2: Município */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Município</label>
                    <input
                      type="text"
                      value={activeDoc.dados_extraidos.municipio || "Florianópolis"}
                      onChange={(e) => handleFieldChange("municipio", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-semibold outline-none transition"
                    />
                  </div>
                  {/* Col 3: Concessionária */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Concessionária</label>
                    <input
                      type="text"
                      disabled
                      value={activeDoc.layout.includes("CELESC") ? "CELESC" : "CASAN"}
                      className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 font-bold text-amber-400 outline-none cursor-not-allowed text-[11px]"
                    />
                  </div>

                  {/* ROW 2 */}
                  {/* Col 1: Endereço */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Endereço</label>
                    <input
                      type="text"
                      value={activeDoc.dados_extraidos.endereco || ""}
                      onChange={(e) => handleFieldChange("endereco", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white outline-none transition"
                    />
                  </div>
                  {/* Col 2: Fatura */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Fatura</label>
                    <input
                      type="text"
                      value={activeDoc.dados_extraidos.fatura_num || ""}
                      onChange={(e) => handleFieldChange("fatura_num", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono outline-none transition"
                    />
                  </div>
                  {/* Col 3: Chave de Acesso */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Chave de Acesso</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={activeDoc.dados_extraidos.chave_acesso || ""}
                        onChange={(e) => handleFieldChange("chave_acesso", e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2 py-1 text-white font-mono text-[9px] outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const key = activeDoc.dados_extraidos.chave_acesso || "";
                          navigator.clipboard.writeText(key);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className={`px-2 py-1 rounded text-[9px] font-mono font-bold flex items-center shrink-0 transition ${
                          copiedKey ? "bg-emerald-600 text-white" : "bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30"
                        }`}
                      >
                        {copiedKey ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* ROW 3 */}
                  {/* Col 1: Grupo / Subgrupo Tensão */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Grupo / Subgrupo Tensão</label>
                    <input
                      type="text"
                      value={activeDoc.dados_extraidos.grupo_subgrupo_tensao || "A - A4"}
                      onChange={(e) => handleFieldChange("grupo_subgrupo_tensao", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white outline-none transition"
                    />
                  </div>
                  {/* Col 2: Competência de Referência */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Competência de Referência</label>
                    <input
                      type="date"
                      value={activeDoc.dados_extraidos.mes_ano ? activeDoc.dados_extraidos.mes_ano.substring(0, 10) : ""}
                      onChange={(e) => handleFieldChange("mes_ano", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono outline-none transition"
                    />
                  </div>
                  {/* Col 3: Nota Fiscal (NF) */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Nota Fiscal (NF)</label>
                    <input
                      type="text"
                      value={activeDoc.dados_extraidos.nota_fiscal || ""}
                      onChange={(e) => handleFieldChange("nota_fiscal", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono outline-none transition"
                    />
                  </div>

                  {/* ROW 4 */}
                  {/* Col 1: Data Leitura & Dias Faturados */}
                  <div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-gray-500 text-[8px] uppercase font-mono block">Data Leitura</label>
                        <input
                          type="text"
                          value={activeDoc.dados_extraidos.data_leitura || ""}
                          onChange={(e) => handleFieldChange("data_leitura", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2 py-1.5 text-white text-center font-mono outline-none transition text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-[8px] uppercase font-mono block">Dias Faturados</label>
                        <input
                          type="number"
                          value={activeDoc.dados_extraidos.dias_faturados || 30}
                          onChange={(e) => handleFieldChange("dias_faturados", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2 py-1.5 text-white text-center font-mono outline-none transition text-[11px]"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Col 2: Data de Vencimento */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Data de Vencimento</label>
                    <input
                      type="text"
                      value={activeDoc.dados_extraidos.data_vencimento || ""}
                      onChange={(e) => handleFieldChange("data_vencimento", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono font-bold outline-none transition"
                    />
                  </div>
                  {/* Col 3: Valor Total */}
                  <div>
                    <label className="text-gray-500 text-[10px] uppercase font-mono">Valor Total da Fatura (R$)</label>
                    <input
                      type="number"
                      step="any"
                      value={activeDoc.dados_extraidos.valor_total ?? 0}
                      onChange={(e) => handleFieldChange("valor_total", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono font-bold outline-none transition"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCO 2 — ITENS DA FATURA */}
              <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                    Bloco 2 — Itens da Fatura (Auditáveis)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1 rounded flex items-center gap-1 transition"
                  >
                    <Plus className="h-3 w-3" /> Adicionar Item
                  </button>
                </div>
                
                <div className="overflow-x-auto max-h-[600px] border border-white/10 rounded-lg bg-[#111111] shadow-inner">
                  <table className="w-full text-left text-[10px] border-collapse min-w-[840px]">
                    <thead className="bg-[#1c1c1c] text-gray-200 font-mono text-[9px] font-bold border-b border-white/10 uppercase tracking-tight">
                      <tr>
                        <th rowSpan={2} className="px-1.5 py-1 w-[15%] text-left align-middle border-r border-white/10">Itens da Fatura</th>
                        <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10">Quantidade</th>
                        <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10 leading-tight">Preço unitário<br/><span className="text-[8px] text-gray-400 font-normal lowercase">c/ tributos</span></th>
                        <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10">Valor</th>
                        <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10 leading-tight">COFINS/<br/>PIS</th>
                        <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10">ICMS</th>
                        <th colSpan={5} className="px-1 py-0.5 text-center border-b border-white/10 bg-white/5 text-amber-300 font-bold tracking-normal">Tributos Federais Retidos</th>
                        <th rowSpan={2} className="w-6 p-0 text-center align-middle"></th>
                      </tr>
                      <tr className="bg-white/[0.02]">
                        <th className="px-1 py-1 text-center border-r border-white/10 text-[8px] font-normal text-gray-300">IRPJ (%)</th>
                        <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">IRPJ</th>
                        <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">PIS</th>
                        <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">COFINS</th>
                        <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">CSLL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-black/20">
                      {(() => {
                        const validItens = activeDoc.dados_extraidos.itens_fatura || [];

                        if (validItens.length === 0) {
                          return (
                            <tr>
                              <td colSpan={12} className="text-center py-4 text-gray-500 italic">
                                Nenhum item adicionado. Clique em "Adicionar Item" acima.
                              </td>
                            </tr>
                          );
                        }

                        return validItens.map((item: any, itemIdx: number) => {
                          if (!item) return null;
                          const itemId = item.id || `item-${itemIdx}`;
                          return (
                            <tr key={itemId} className="hover:bg-white/5 transition-colors">
                              {/* 1. Descrição */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="text"
                                  value={item.descricao || ""}
                                  onChange={(e) => handleItemFieldChange(itemId, "descricao", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-gray-200 outline-none text-[10px] truncate"
                                  title={item.descricao}
                                />
                              </td>
                              {/* 2. Quantidade */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={typeof item.quantidade === 'number' ? Number(item.quantidade.toFixed(3)) : (item.quantidade ?? 0)}
                                  onChange={(e) => handleItemFieldChange(itemId, "quantidade", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* 3. Preço unitário */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="any"
                                  value={item.valor_unitario ?? 0}
                                  onChange={(e) => handleItemFieldChange(itemId, "valor_unitario", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* 4. Valor */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={typeof item.valor === 'number' ? Number(item.valor.toFixed(2)) : (item.valor ?? 0)}
                                  onChange={(e) => handleItemFieldChange(itemId, "valor", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-indigo-300 font-semibold outline-none text-[10px]"
                                />
                              </td>
                              {/* 5. COFINS/PIS */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={typeof item.pis === 'number' ? Number(item.pis.toFixed(2)) : (item.pis ?? 0)}
                                  onChange={(e) => handleItemFieldChange(itemId, "pis", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* 6. ICMS */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={typeof item.icms === 'number' ? Number(item.icms.toFixed(2)) : (item.icms ?? 0)}
                                  onChange={(e) => handleItemFieldChange(itemId, "icms", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* 7. IRPJ (%) */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.irpj_pct ?? 0}
                                  onChange={(e) => handleItemFieldChange(itemId, "irpj_pct", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-center font-mono text-gray-400 outline-none text-[10px]"
                                />
                              </td>
                              {/* 8. IRPJ */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={typeof item.irpj_val === 'number' ? Number(item.irpj_val.toFixed(2)) : (item.irpj_val ?? (item.cofins ?? 0))}
                                  onChange={(e) => handleItemFieldChange(itemId, "irpj_val", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-amber-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* 9. PIS */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={typeof item.pis_ret === 'number' ? Number(item.pis_ret.toFixed(2)) : (item.pis_ret ?? 0)}
                                  onChange={(e) => handleItemFieldChange(itemId, "pis_ret", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* 10. COFINS */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={typeof item.cofins_ret === 'number' ? Number(item.cofins_ret.toFixed(2)) : (item.cofins_ret ?? 0)}
                                  onChange={(e) => handleItemFieldChange(itemId, "cofins_ret", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* 11. CSLL */}
                              <td className="p-0.5 border-r border-white/5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={typeof item.csll_ret === 'number' ? Number(item.csll_ret.toFixed(2)) : (item.csll_ret ?? 0)}
                                  onChange={(e) => handleItemFieldChange(itemId, "csll_ret", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                />
                              </td>
                              {/* Action cell */}
                              <td className="p-0.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(itemId)}
                                  className="text-gray-500 hover:text-rose-400 p-1 transition"
                                  title="Excluir item"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BLOCO 3 — VALORES TOTAIS EXTRAÍDOS */}
              <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                  Bloco 3 — Valores Totais Extraídos
                </span>
                <div className="grid grid-cols-5 gap-2">
                  <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                    <span className="text-gray-500 text-[9px] uppercase block font-mono">Valor Total</span>
                    <span className="text-xs font-bold font-mono text-indigo-400 block truncate">
                      R$ {(activeDoc.dados_extraidos.valor_total ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                    <span className="text-gray-500 text-[9px] uppercase block font-mono">Energia Injetada</span>
                    <span className="text-xs font-bold font-mono text-emerald-400 block truncate">
                      {(() => {
                        const inj = activeDoc.dados_extraidos.energia_injetada ?? computeEnergiaInjetada(activeDoc.dados_extraidos.itens_fatura || []);
                        return `${inj.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kWh`;
                      })()}
                    </span>
                  </div>
                  <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                    <span className="text-gray-500 text-[9px] uppercase block font-mono">Tributos Totais</span>
                    <span className="text-xs font-bold font-mono text-amber-500 block truncate">
                      R$ {(activeDoc.dados_extraidos.valor_imposto ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                    <span className="text-gray-500 text-[9px] uppercase block font-mono">Tributos Retidos / Créditos</span>
                    <span className={`text-xs font-bold font-mono block truncate ${
                      (activeDoc.dados_extraidos.valor_credito ?? 0) < 0 ? "text-amber-400" : "text-emerald-400"
                    }`}>
                      R$ {(activeDoc.dados_extraidos.valor_credito ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                    <span className="text-gray-500 text-[9px] uppercase block font-mono">Valor Líquido</span>
                    <span className="text-xs font-extrabold font-mono text-white block truncate">
                      R$ {(activeDoc.dados_extraidos.valor_total ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {/* Consumo Calculado Info Panel */}
                <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-lg p-2.5 flex justify-between items-center">
                  <span className="text-[10px] text-indigo-300 font-medium font-mono uppercase">Consumo de Auditoria Financeira:</span>
                  <span className="text-xs font-extrabold text-indigo-400 font-mono">
                    {(activeDoc.dados_extraidos.consumo ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {activeDoc.layout.includes("CELESC") ? "kWh" : "m³"}
                  </span>
                </div>
              </div>

              {/* BLOCO 4 — CONSISTÊNCIAS DA FATURA */}
              {(() => {
                const alerts = evalConsistencias(activeDoc);
                return (
                  <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                      Bloco 4 — Consistências da Fatura
                    </span>
                    {alerts.length > 0 ? (
                      <div className="space-y-1.5">
                        {alerts.map((alert, aIdx) => {
                          const isError = alert.startsWith("❌");
                          return (
                            <div
                              key={aIdx}
                              className={`p-2.5 rounded text-[10px] leading-relaxed flex items-center gap-2 border ${
                                isError
                                  ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                                  : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                              }`}
                            >
                              {isError ? (
                                <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              )}
                              <span>{alert}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded text-[10px] flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>Fatura em conformidade total. Nenhuma inconsistência detectada.</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Audit History inside Modal if present */}
              {activeDoc.historico_alteracoes && activeDoc.historico_alteracoes.length > 0 && (
                <div className="bg-black/40 border border-white/10 p-3 rounded-lg text-xs space-y-1.5">
                  <span className="font-bold text-gray-300 flex items-center gap-1 font-mono text-[10px] uppercase">
                    <History className="h-3.5 w-3.5 text-indigo-400" />
                    Histórico de Auditoria da Sessão
                  </span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {activeDoc.historico_alteracoes.map((item: any, hIdx: number) => (
                      <div key={hIdx} className="text-[10px] text-gray-400 border-b border-white/5 pb-1 last:border-0 flex justify-between">
                        <span>
                          Célula <strong className="text-gray-200 font-mono">{item.campo}</strong>: {item.antes} ➜ {item.depois}
                        </span>
                        <span className="text-[9px] text-gray-500 font-mono">por {item.usuario}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 pt-4 mt-4">
              <button 
                type="button"
                onClick={onClose}
                disabled={loading}
                className="bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold px-4 py-2 rounded-md transition"
              >
                Descartar Edição
              </button>
              <button 
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2 rounded-md shadow-lg flex items-center gap-1 transition disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {loading ? "Salvando..." : "Aplicar e Validar Lançamento"}
              </button>
            </div>

          </div>

      </div>
    </div>
  );
}
