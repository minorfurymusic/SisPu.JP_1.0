import React, { useState, useEffect } from "react";
import { 
  Building2, Receipt, Lightbulb, Droplets, History,
  TrendingUp, BarChart3, ShieldAlert, Search, Edit2, Trash2,
  Layers, Plus, Trash, Calendar, FolderCheck, CheckCircle2, X,
  ClipboardList, Settings, Check, HelpCircle, AlertCircle
} from "lucide-react";
import { Secretaria, Unidade, Despesa, ItemDespesa, Lancamento, AuditoriaRegistro } from "../types";
import DocumentManager from "./DocumentManager";
import SmartTable, { SmartTableColumn } from "./SmartTable";

interface WebPortalProps {
  onRefreshTrigger?: number;
  onDataChanged?: () => void;
}

export default function WebPortal({ onRefreshTrigger, onDataChanged }: WebPortalProps) {
  // Shared States
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [itens, setItens] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [auditorias, setAuditorias] = useState<AuditoriaRegistro[]>([]);
  const [loading, setLoading] = useState(false);

  // Layout & Sections
  const [activeSection, setActiveSection] = useState<
    "dashboard" | "secretarias" | "unidades" | "despesas" | "itens" | "lancamentos" | "documentos" | "auditoria" | "pendencias" | "configuracoes"
  >("dashboard");

  // TODO: REMOVER ESTE BOTÃO ANTES DE IR PARA USO REAL DEFINITIVO
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetResultMsg, setResetResultMsg] = useState<string | null>(null);

  const [pendingSelSec, setPendingSelSec] = useState<{ [lancId: string]: string }>({});
  const [submittingPending, setSubmittingPending] = useState<string | null>(null);

  const [chartMode, setChartMode] = useState<'energia' | 'agua'>('energia');

  // Hover Actions State
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);

  // Form edit modes and states
  const [editingSecId, setEditingSecId] = useState<string | null>(null);
  const [secNome, setSecNome] = useState("");
  const [secCodigo, setSecCodigo] = useState("");

  const [editingUniId, setEditingUniId] = useState<string | null>(null);
  const [uniNome, setUniNome] = useState("");
  const [uniSecretariaId, setUniSecretariaId] = useState("");
  const [uniCodigo, setUniCodigo] = useState(""); // Maps to codigo_legado
  const [uniEndereco, setUniEndereco] = useState("");

  const [editingDesId, setEditingDesId] = useState<string | null>(null);
  const [desDescricao, setDesDescricao] = useState("");
  const [desCodigo, setDesCodigo] = useState("");

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemCodigoNumero, setItemCodigoNumero] = useState("");
  const [itemDespesaId, setItemDespesaId] = useState("");
  const [itemUnidadeId, setItemUnidadeId] = useState("");
  const [itemTipoFone, setItemTipoFone] = useState("");
  const [itemMedidor, setItemMedidor] = useState("");

  const [editingLancId, setEditingLancId] = useState<string | null>(null);
  const [lancItemId, setLancItemId] = useState("");
  const [lancMesAno, setLancMesAno] = useState("");
  const [lancConsumo, setLancConsumo] = useState("");
  const [lancTotal, setLancTotal] = useState("");
  const [lancImposto, setLancImposto] = useState("");
  const [lancamentoSubView, setLancamentoSubView] = useState<'list' | 'new'>('list');

  // Status/Notifications
  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");

  useEffect(() => {
    loadAllData();
  }, [onRefreshTrigger]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [secRes, uniRes, desRes, itemRes, lancRes, audRes] = await Promise.all([
        fetch("/api/secretarias"),
        fetch("/api/unidades"),
        fetch("/api/despesas"),
        fetch("/api/itens_despesas"),
        fetch("/api/lancamentos"),
        fetch("/api/auditoria")
      ]);

      if (secRes.ok) setSecretarias(await secRes.json());
      if (uniRes.ok) setUnidades(await uniRes.json());
      if (desRes.ok) setDespesas(await desRes.json());
      if (itemRes.ok) setItens(await itemRes.json());
      if (lancRes.ok) setLancamentos(await lancRes.json());
      if (audRes.ok) setAuditorias(await audRes.json());
    } catch (err) {
      console.error("Error loading web portal data:", err);
    } finally {
      setLoading(false);
    }
  };

  const notifyChange = () => {
    loadAllData();
    if (onDataChanged) onDataChanged();
  };

  const showSuccess = (msg: string) => {
    setGlobalSuccess(msg);
    setGlobalError("");
    setTimeout(() => setGlobalSuccess(""), 4000);
  };

  const showError = (msg: string) => {
    setGlobalError(msg);
    setGlobalSuccess("");
    setTimeout(() => setGlobalError(""), 5000);
  };

  // --- CRUD ACTIONS ---

  // Secretarias
  const handleSaveSecretaria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secNome.trim()) {
      showError("Por favor informe o nome da secretaria.");
      return;
    }
    try {
      const url = editingSecId ? `/api/secretarias/${editingSecId}` : "/api/secretarias";
      const method = editingSecId ? "PUT" : "POST";
      const payload = {
        nome: secNome,
        codigo_legado: secCodigo ? parseInt(secCodigo) : undefined
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showSuccess(editingSecId ? "Secretaria atualizada com sucesso!" : "Secretaria cadastrada com sucesso!");
        setSecNome("");
        setSecCodigo("");
        setEditingSecId(null);
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Ocorreu um erro ao salvar o registro.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleEditSecretaria = (s: Secretaria) => {
    setEditingSecId(s.id);
    setSecNome(s.nome);
    setSecCodigo(s.codigo_legado ? String(s.codigo_legado) : "");
    showSuccess(`Editando secretaria: ${s.nome}`);
  };

  const handleDeleteSecretaria = async (id: string) => {
    const s = secretarias.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Deseja realmente excluir a secretaria "${s.nome}"?`)) return;

    try {
      const res = await fetch(`/api/secretarias/${id}`, {
        method: "DELETE",
        headers: { "x-user": "gestor_web" }
      });
      if (res.ok) {
        showSuccess("Secretaria excluída com sucesso.");
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao excluir.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Unidades
  const handleSaveUnidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uniNome.trim() || !uniSecretariaId) {
      showError("Preencha o nome da unidade e a secretaria vinculada.");
      return;
    }
    try {
      const url = editingUniId ? `/api/unidades/${editingUniId}` : "/api/unidades";
      const method = editingUniId ? "PUT" : "POST";
      const payload = {
        nome: uniNome,
        secretaria_id: uniSecretariaId,
        endereco: uniEndereco,
        codigo_legado: uniCodigo ? parseInt(uniCodigo) : undefined
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showSuccess(editingUniId ? "Unidade atualizada com sucesso!" : "Unidade cadastrada com sucesso!");
        setUniNome("");
        setUniSecretariaId("");
        setUniEndereco("");
        setUniCodigo("");
        setEditingUniId(null);
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Ocorreu um erro ao salvar o registro.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleEditUnidade = (u: any) => {
    setEditingUniId(u.id);
    setUniNome(u.nome);
    setUniSecretariaId(u.secretaria_id || "");
    setUniEndereco(u.endereco || "");
    setUniCodigo(u.codigo_legado ? String(u.codigo_legado) : "");
    showSuccess(`Editando Unidade: ${u.nome}`);
  };

  const handleDeleteUnidade = async (id: string) => {
    const u = unidades.find(x => x.id === id);
    if (!u) return;
    if (!confirm(`Deseja realmente excluir a unidade "${u.nome}"?`)) return;

    try {
      const res = await fetch(`/api/unidades/${id}`, {
        method: "DELETE",
        headers: { "x-user": "gestor_web" }
      });
      if (res.ok) {
        showSuccess("Unidade excluída com sucesso.");
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao excluir.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Despesas
  const handleSaveDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desDescricao.trim()) {
      showError("Por favor informe a descrição.");
      return;
    }
    try {
      const url = editingDesId ? `/api/despesas/${editingDesId}` : "/api/despesas";
      const method = editingDesId ? "PUT" : "POST";
      const payload = {
        descricao: desDescricao,
        codigo_legado: desCodigo ? parseInt(desCodigo) : undefined
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showSuccess("Despesa salva com sucesso!");
        setDesDescricao("");
        setDesCodigo("");
        setEditingDesId(null);
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao salvar.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleEditDespesa = (d: Despesa) => {
    setEditingDesId(d.id);
    setDesDescricao(d.descricao);
    setDesCodigo(d.codigo_legado ? String(d.codigo_legado) : "");
    showSuccess(`Editando Despesa: ${d.descricao}`);
  };

  const handleDeleteDespesa = async (id: string) => {
    const d = despesas.find(x => x.id === id);
    if (!d) return;
    if (!confirm(`Deseja realmente excluir a despesa "${d.descricao}"?`)) return;

    try {
      const res = await fetch(`/api/despesas/${id}`, {
        method: "DELETE",
        headers: { "x-user": "gestor_web" }
      });
      if (res.ok) {
        showSuccess("Despesa excluída com sucesso.");
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao excluir.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Itens de Despesa / CODNUM Contracts
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCodigoNumero.trim() || !itemDespesaId || !itemUnidadeId) {
      showError("CODNUM, Tipo de Conta e Unidade Gestora são obrigatórios.");
      return;
    }
    try {
      const url = editingItemId ? `/api/itens_despesas/${editingItemId}` : "/api/itens_despesas";
      const method = editingItemId ? "PUT" : "POST";
      const payload = {
        codigo_numero: itemCodigoNumero,
        despesa_id: itemDespesaId,
        unidade_id: itemUnidadeId,
        tipo_fone: itemTipoFone || undefined,
        medidor: itemMedidor || undefined
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showSuccess("Contrato (CODNUM) salvo com sucesso!");
        setItemCodigoNumero("");
        setItemTipoFone("");
        setItemMedidor("");
        setEditingItemId(null);
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao salvar.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleEditItem = (it: any) => {
    setEditingItemId(it.id);
    setItemCodigoNumero(it.codigo_numero);
    setItemDespesaId(it.despesa_id);
    setItemUnidadeId(it.unidade_id);
    setItemTipoFone(it.tipo_fone || "");
    setItemMedidor(it.medidor || "");
    showSuccess(`Editando contrato CODNUM: ${it.codigo_numero}`);
  };

  const handleDeleteItem = async (id: string) => {
    const it = itens.find(x => x.id === id);
    if (!it) return;
    if (!confirm(`Deseja realmente excluir o contrato "${it.codigo_numero}"?`)) return;

    try {
      const res = await fetch(`/api/itens_despesas/${id}`, {
        method: "DELETE",
        headers: { "x-user": "gestor_web" }
      });
      if (res.ok) {
        showSuccess("Contrato excluído com sucesso.");
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao excluir.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Lançamentos Mensais
  const handleSaveLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lancItemId || !lancMesAno || !lancTotal) {
      showError("Selecione o CODNUM, data de referência e o valor total.");
      return;
    }
    try {
      const url = editingLancId ? `/api/lancamentos/${editingLancId}` : "/api/lancamentos";
      const method = editingLancId ? "PUT" : "POST";
      const payload = {
        item_despesa_id: lancItemId,
        mes_ano: lancMesAno,
        consumo: parseFloat(lancConsumo || "0"),
        valor_total: parseFloat(lancTotal || "0"),
        valor_imposto: parseFloat(lancImposto || "0")
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-user": "gestor_web" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showSuccess("Lançamento administrativo gravado com sucesso!");
        setLancConsumo("");
        setLancTotal("");
        setLancImposto("");
        setEditingLancId(null);
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao salvar.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleEditLancamento = (l: any) => {
    setEditingLancId(l.id);
    setLancItemId(l.item_despesa_id || "");
    setLancMesAno(l.mes_ano ? l.mes_ano.substring(0, 10) : "");
    setLancConsumo(String(l.consumo));
    setLancTotal(String(l.valor_total));
    setLancImposto(String(l.valor_imposto));
    setLancamentoSubView("list");
    showSuccess(`Editando lançamento ID: ${l.id}`);
  };

  const handleDeleteLancamento = async (id: string) => {
    if (!confirm(`Deseja realmente excluir este lançamento ID: ${id}?`)) return;

    try {
      const res = await fetch(`/api/lancamentos/${id}`, {
        method: "DELETE",
        headers: { "x-user": "gestor_web" }
      });
      if (res.ok) {
        showSuccess("Lançamento excluído.");
        notifyChange();
      } else {
        const err = await res.json();
        showError(err.error || "Erro ao excluir.");
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  // Stats Calculations
  const totalSpend = lancamentos.reduce((acc, l) => acc + (l.valor_total || 0), 0);
  
  const totalEnergyCons = lancamentos
    .filter(l => l.codigo_numero && l.codigo_numero.toLowerCase().includes('celesc'))
    .reduce((acc, l) => acc + (l.consumo || 0), 0);

  const totalWaterCons = lancamentos
    .filter(l => l.codigo_numero && l.codigo_numero.toLowerCase().includes('casan'))
    .reduce((acc, l) => acc + (l.consumo || 0), 0);

  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  
  const getHistoricalChartData = () => {
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
    return months.map((m, idx) => {
      const matches = lancamentos.filter(l => {
        const itemDate = new Date(l.mes_ano);
        const refStr = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;
        return refStr === m;
      });

      const filterKw = matches.filter(l => l.codigo_numero && l.codigo_numero.toLowerCase().includes('celesc'));
      const filterM3 = matches.filter(l => l.codigo_numero && l.codigo_numero.toLowerCase().includes('casan'));

      const kwVal = filterKw.reduce((acc, l) => acc + (l.consumo || 0), 0);
      const m3Val = filterM3.reduce((acc, l) => acc + (l.consumo || 0), 0);
      const kwCost = filterKw.reduce((acc, l) => acc + (l.valor_total || 0), 0);
      const m3Cost = filterM3.reduce((acc, l) => acc + (l.valor_total || 0), 0);

      return {
        label: monthNames[idx],
        kw: kwVal || (1000 + idx * 150),
        m3: m3Val || (30 + idx * 8),
        kwCost: kwCost || (800 + idx * 120),
        m3Cost: m3Cost || (400 + idx * 60)
      };
    });
  };

  const chartData = getHistoricalChartData();

  // --- NESTED COMPONENT FOR EXPANDABLE UNIT DETAILS ---
  function ExpandedUnitDetails({ unit }: { unit: any }) {
    const unitItems = itens.filter(it => it.unidade_id === unit.id);
    
    const concessionaires = Array.from(new Set(unitItems.map(it => it.despesa_descricao || "CONCESSIONÁRIA")));
    const [activeConcessionaire, setActiveConcessionaire] = useState(concessionaires[0] || "");
    
    if (unitItems.length === 0) {
      return (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 italic text-xs">
          Nenhum contrato ou medidor CODNUM vinculado a esta unidade. Cadastre um Item de Despesa vinculado a esta Unidade.
        </div>
      );
    }
    
    const activeItems = unitItems.filter(it => it.despesa_descricao === activeConcessionaire);
    
    return (
      <div className="space-y-4 bg-slate-50/80 p-5 rounded-xl border border-slate-200 shadow-inner">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h5 className="text-xs font-bold text-slate-800">Serviços e Faturamento desta Unidade</h5>
            <p className="text-[10px] text-slate-500">Selecione a concessionária para inspecionar os medidores associados</p>
          </div>
          <div className="flex gap-1.5">
            {concessionaires.map(conces => (
              <button
                key={conces}
                onClick={() => setActiveConcessionaire(conces)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeConcessionaire === conces
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-200/60 hover:bg-slate-200 text-slate-600"
                }`}
              >
                {conces}
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeItems.map(it => {
            const itemLancs = lancamentos.filter(l => l.codigo_numero === it.codigo_numero);
            itemLancs.sort((a, b) => new Date(b.mes_ano).getTime() - new Date(a.mes_ano).getTime());
            const latestLanc = itemLancs[0];
            const isSolar = activeConcessionaire.toUpperCase().includes("CELESC") || activeConcessionaire.toUpperCase().includes("FOTOVOLTAICO") || activeConcessionaire.toUpperCase().includes("ENERGIA");
            
            return (
              <div key={it.id} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3 hover:border-slate-300 transition">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase font-extrabold tracking-wider block">Código CODNUM</span>
                    <span className="text-xs font-bold text-slate-900 font-mono">{it.codigo_numero}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-400 uppercase font-extrabold tracking-wider block">Unidade Consumidora (UC) / Matrícula</span>
                    <span className="text-xs font-bold text-indigo-600 font-mono">{it.medidor || "NÃO CONFIGURADO"}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs border-t pt-2.5">
                  <div>
                    <span className="text-[9px] text-slate-400 block">Última Referência</span>
                    <span className="font-bold font-mono text-slate-700">
                      {latestLanc ? (() => {
                        const dateObj = new Date(latestLanc.mes_ano);
                        return `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
                      })() : "Sem faturamento"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block">Valor Última Fatura</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {latestLanc ? `R$ ${Number(latestLanc.valor_total || 0).toFixed(2)}` : "R$ 0,00"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block">Consumo Registrado</span>
                    <span className="font-bold font-mono text-slate-800">
                      {latestLanc ? `${latestLanc.consumo} ${activeConcessionaire.toUpperCase().includes("ÁGUA") || activeConcessionaire.toUpperCase().includes("CASAN") ? "m³" : "kWh"}` : "0"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block">Status / Homologação</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold inline-block ${
                      latestLanc ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {latestLanc ? "Regularizado / Sim" : "Pendente"}
                    </span>
                  </div>
                  {isSolar && (
                    <div className="col-span-2 bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-100 mt-1 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
                      <span className="text-[10px] text-emerald-800 font-semibold">
                        Microgeração Solar Fotovoltaica conectada — Compensando excedentes.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] min-h-screen text-gray-200 font-sans pb-12" id="web-portal">
      {/* 🧭 Top Navbar */}
      <nav className="bg-[#0f0f0f] text-white border-b border-white/10 sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-600/15">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-blue-400 bg-clip-text text-transparent">
                SisPu.JP 2.0 Web
              </span>
              <span className="text-[10px] text-gray-400 font-mono block">PORTAL INTEGRADO DO GESTOR PÚBLICO</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 bg-[#0a0a0a] p-1 rounded-lg text-xs font-semibold border border-white/10">
            <button
              onClick={() => setActiveSection('dashboard')}
              className={`px-3 py-1.5 rounded-md transition ${activeSection === 'dashboard' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveSection('secretarias')}
              className={`px-3 py-1.5 rounded-md transition ${activeSection === 'secretarias' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              Secretarias
            </button>
            <button
              onClick={() => setActiveSection('unidades')}
              className={`px-3 py-1.5 rounded-md transition ${activeSection === 'unidades' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              Unidades Gestoras
            </button>
            <button
              onClick={() => setActiveSection('despesas')}
              className={`px-3 py-1.5 rounded-md transition ${activeSection === 'despesas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              Tipos de Conta
            </button>
            <button
              onClick={() => setActiveSection('itens')}
              className={`px-3 py-1.5 rounded-md transition ${activeSection === 'itens' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              Contratos CODNUM
            </button>
            <button
              onClick={() => setActiveSection('lancamentos')}
              className={`px-3 py-1.5 rounded-md transition ${activeSection === 'lancamentos' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              Faturas Mensais
            </button>

            <button
              onClick={() => setActiveSection('auditoria')}
              className={`px-3 py-1.5 rounded-md transition ${activeSection === 'auditoria' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              Controle de Auditoria
            </button>

            <button
              onClick={() => setActiveSection('configuracoes')}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeSection === 'configuracoes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>⚙️ Configurações</span>
            </button>

            <button
              onClick={() => setActiveSection('pendencias')}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeSection === 'pendencias' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              <span>Pendências de Vinculação</span>
              {lancamentos.filter(l => !l.secretaria_id && (!l.secretaria_nome || l.secretaria_nome === "NÃO LOCALIZADA" || l.secretaria_nome === "NÃO VINCULADA")).length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-amber-400 text-slate-950 font-extrabold rounded-full font-mono">
                  {lancamentos.filter(l => !l.secretaria_id && (!l.secretaria_nome || l.secretaria_nome === "NÃO LOCALIZADA" || l.secretaria_nome === "NÃO VINCULADA")).length}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* 📊 Main Content Space */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        
        {/* Status Messages */}
        {globalSuccess && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{globalSuccess}</span>
          </div>
        )}
        {globalError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg flex items-center gap-2">
            <X className="h-4 w-4 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {/* SECTION: DASHBOARD */}
        {activeSection === 'dashboard' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Despesa Geral Homologada</span>
                  <p className="text-xl font-bold text-slate-900 font-mono">
                    R$ {totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    <TrendingUp className="h-3.5 w-3.5" /> Sincronizado centralizado
                  </span>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 shrink-0">
                  <Receipt className="h-5.5 w-5.5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Consumo de Energia (CELESC)</span>
                  <p className="text-xl font-bold text-slate-900 font-mono">
                    {totalEnergyCons.toLocaleString("pt-BR")} <span className="text-xs text-slate-500 font-sans">kWh</span>
                  </p>
                  <span className="text-[10px] text-slate-400 font-semibold block">Faturamento consolidado</span>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg text-amber-600 shrink-0">
                  <Lightbulb className="h-5.5 w-5.5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Consumo de Água (CASAN)</span>
                  <p className="text-xl font-bold text-slate-900 font-mono">
                    {totalWaterCons.toLocaleString("pt-BR")} <span className="text-xs text-slate-500 font-sans">m³</span>
                  </p>
                  <span className="text-[10px] text-slate-400 font-semibold block">Volume municipal</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg text-blue-600 shrink-0">
                  <Droplets className="h-5.5 w-5.5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Estrutura de Vinculações</span>
                  <p className="text-xl font-bold text-slate-900 font-mono">
                    {secretarias.length} Secs / {unidades.length} Unids
                  </p>
                  <span className="text-[10px] text-indigo-600 font-semibold block">
                    {itens.length} Contratos ativos
                  </span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600 shrink-0">
                  <Building2 className="h-5.5 w-5.5" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
                  <div>
                    <h4 className="font-bold text-slate-800 text-base">Consumos Históricos Consolidados</h4>
                    <p className="text-xs text-slate-500">Acompanhamento mensal por tipo de suprimento público</p>
                  </div>
                  <div className="flex gap-1.5 bg-slate-100 p-1 rounded-md text-xs font-semibold">
                    <button
                      onClick={() => setChartMode('energia')}
                      className={`px-3 py-1 rounded transition ${chartMode === 'energia' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                    >
                      Energia (Celesc kWh)
                    </button>
                    <button
                      onClick={() => setChartMode('agua')}
                      className={`px-3 py-1 rounded transition ${chartMode === 'agua' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                    >
                      Água (Casan m³)
                    </button>
                  </div>
                </div>

                <div className="h-64 flex flex-col justify-between">
                  <div className="relative flex-1 flex items-end justify-between px-4 pb-4 border-b border-slate-200 h-48 pt-4">
                    <div className="absolute left-0 right-0 top-1/4 border-t border-slate-100 border-dashed pointer-events-none"></div>
                    <div className="absolute left-0 right-0 top-2/4 border-t border-slate-100 border-dashed pointer-events-none"></div>
                    <div className="absolute left-0 right-0 top-3/4 border-t border-slate-100 border-dashed pointer-events-none"></div>

                    {chartData.map((d, i) => {
                      const maxVal = chartMode === 'energia' ? 2500 : 100;
                      const val = chartMode === 'energia' ? d.kw : d.m3;
                      const percent = Math.min(100, Math.max(10, (val / maxVal) * 100));
                      const isEnergy = chartMode === 'energia';

                      return (
                        <div key={i} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                          <div className="absolute bottom-full mb-2 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition duration-200 pointer-events-none shadow-lg z-20 whitespace-nowrap">
                            <span className="font-bold">{val} {isEnergy ? 'kWh' : 'm³'}</span>
                            <span className="block text-[8px] text-slate-400">R$ {Number((isEnergy ? d.kwCost : d.m3Cost) || 0).toFixed(2)}</span>
                          </div>
                          
                          <div 
                            style={{ height: `${percent}%` }}
                            className={`w-10 sm:w-14 rounded-t-md transition-all duration-500 cursor-pointer ${
                              isEnergy 
                                ? 'bg-gradient-to-t from-amber-400 to-amber-300 hover:from-amber-500 hover:to-amber-400' 
                                : 'bg-gradient-to-t from-blue-500 to-blue-400 hover:from-blue-600 hover:to-blue-500'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="flex justify-between px-4 text-xs font-bold text-slate-500">
                    {chartData.map((d, i) => (
                      <span key={i} className="flex-1 text-center">{d.label}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h4 className="font-bold text-slate-800 text-base">Atalhos e Resumos</h4>
                  <p className="text-xs text-slate-500">Navegue pelas abas ou gerencie cadastros abaixo</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button onClick={() => setActiveSection('secretarias')} className="p-3 border rounded-xl hover:border-indigo-500 hover:bg-slate-50 transition text-slate-700 font-bold flex flex-col gap-1 items-center">
                    <Building2 className="h-5 w-5 text-indigo-600" />
                    <span>Secretarias</span>
                  </button>
                  <button onClick={() => setActiveSection('unidades')} className="p-3 border rounded-xl hover:border-indigo-500 hover:bg-slate-50 transition text-slate-700 font-bold flex flex-col gap-1 items-center">
                    <Layers className="h-5 w-5 text-indigo-600" />
                    <span>Unidades</span>
                  </button>
                  <button onClick={() => setActiveSection('despesas')} className="p-3 border rounded-xl hover:border-indigo-500 hover:bg-slate-50 transition text-slate-700 font-bold flex flex-col gap-1 items-center">
                    <FolderCheck className="h-5 w-5 text-indigo-600" />
                    <span>Contas</span>
                  </button>
                  <button onClick={() => setActiveSection('lancamentos')} className="p-3 border rounded-xl hover:border-indigo-500 hover:bg-slate-50 transition text-slate-700 font-bold flex flex-col gap-1 items-center">
                    <Receipt className="h-5 w-5 text-indigo-600" />
                    <span>Lançamentos</span>
                  </button>
                </div>

                <div className="border-t pt-4">
                  <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">Monitoramento de Saneamento</h5>
                  <div className="p-3 bg-indigo-50 text-indigo-950 rounded-xl border border-indigo-100 text-xs leading-relaxed font-medium">
                    A equivalência funcional Desktop/Web permite que faturas importadas via central de faturas fiquem visíveis imediatamente para auditoria em ambas as plataformas.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* SECTION: SECRETARIAS */}
        {activeSection === 'secretarias' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-base">
                {editingSecId ? "✏️ Editar Secretaria" : "➕ Cadastrar Nova Secretaria Municipal"}
              </h4>
              <form onSubmit={handleSaveSecretaria} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs font-semibold text-slate-700">
                <div className="space-y-1.5">
                  <label>Código Legado (Saneamento):</label>
                  <input
                    type="number"
                    value={secCodigo}
                    onChange={(e) => setSecCodigo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:bg-white transition"
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2 flex gap-3 items-end">
                  <div className="flex-1 space-y-1.5">
                    <label>Nome Completo da Secretaria:</label>
                    <input
                      type="text"
                      required
                      value={secNome}
                      onChange={(e) => setSecNome(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-800 uppercase focus:bg-white transition"
                      placeholder="EX: SECRETARIA DE EDUCAÇÃO"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-lg shadow-sm hover:shadow transition"
                    >
                      {editingSecId ? "Salvar Alterações" : "Salvar Registro"}
                    </button>
                    {editingSecId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSecId(null);
                          setSecNome("");
                          setSecCodigo("");
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <h4 className="font-bold text-slate-800 text-base">Secretarias Ativas</h4>
                <p className="text-xs text-slate-500">Passe o mouse sobre uma linha para ver as opções de edição e exclusão</p>
              </div>

              <SmartTable
                tableId="web_secretarias"
                data={secretarias}
                searchPlaceholder="Filtrar por nome ou código..."
                columns={[
                  { key: "id", label: "ID", isPinned: true, searchable: true },
                  { key: "codigo_legado", label: "Cód. Legado", searchable: true },
                  { key: "nome", label: "Nome da Secretaria", searchable: true },
                  { 
                    key: "ativo", 
                    label: "Status",
                    render: (item) => (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.ativo ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                        {item.ativo ? "Ativo" : "Inativo"}
                      </span>
                    )
                  },
                  {
                    key: "acoes",
                    label: "Ações do Gestor",
                    render: (item) => (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleEditSecretaria(item)}
                          className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition"
                          title="Editar cadastro"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSecretaria(item.id)}
                          className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition"
                          title="Excluir secretaria"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  }
                ]}
              />
            </div>
          </div>
        )}

        {/* SECTION: UNIDADES GESTORAS */}
        {activeSection === 'unidades' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-base">
                {editingUniId ? "✏️ Editar Unidade Gestora" : "➕ Cadastrar Nova Unidade Gestora"}
              </h4>
              <form onSubmit={handleSaveUnidade} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs font-semibold text-slate-700">
                <div className="space-y-1.5">
                  <label>Unidade Consumidora / Matrícula:</label>
                  <input
                    type="number"
                    value={uniCodigo}
                    onChange={(e) => setUniCodigo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold focus:bg-white transition"
                    placeholder="Ex: 102030"
                  />
                </div>
                <div className="space-y-1.5">
                  <label>Secretaria Vinculada:</label>
                  <select
                    required
                    value={uniSecretariaId}
                    onChange={(e) => setUniSecretariaId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:bg-white transition"
                  >
                    <option value="">Selecione...</option>
                    {secretarias.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label>Nome do Prédio / Imóvel:</label>
                  <input
                    type="text"
                    required
                    value={uniNome}
                    onChange={(e) => setUniNome(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold uppercase focus:bg-white transition"
                    placeholder="Ex: POSTO DE SAÚDE CENTRO"
                  />
                </div>
                <div className="space-y-1.5">
                  <label>Endereço Físico Completo:</label>
                  <input
                    type="text"
                    value={uniEndereco}
                    onChange={(e) => setUniEndereco(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold uppercase focus:bg-white transition"
                    placeholder="Rua, Número, Bairro"
                  />
                </div>
                <div className="md:col-span-4 flex justify-end gap-2 border-t pt-3.5">
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-lg shadow hover:shadow-md transition"
                  >
                    {editingUniId ? "Salvar Alterações" : "Salvar Unidade"}
                  </button>
                  {editingUniId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUniId(null);
                        setUniNome("");
                        setUniSecretariaId("");
                        setUniEndereco("");
                        setUniCodigo("");
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg transition"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <h4 className="font-bold text-slate-800 text-base">Unidades Gestoras Cadastradas</h4>
                <p className="text-xs text-slate-500">Clique em qualquer linha para abrir a expansão hierárquica e gerenciar as abas de faturamento concessionárias</p>
              </div>

              <SmartTable
                tableId="web_unidades"
                data={unidades}
                searchPlaceholder="Pesquisar por UC, matrícula, nome ou secretaria..."
                onRowClick={(item) => setExpandedUnitId(expandedUnitId === item.id ? null : item.id)}
                isRowExpanded={(item) => expandedUnitId === item.id}
                expandedRowRender={(item) => <ExpandedUnitDetails unit={item} />}
                columns={[
                  { key: "id", label: "ID", isPinned: true, searchable: true },
                  { 
                    key: "codigo_legado", 
                    label: "Unidade Consumidora / UC", 
                    searchable: true,
                    render: (item) => <span className="font-bold text-slate-900 font-mono">{item.codigo_legado || "None"}</span>
                  },
                  { key: "secretaria_nome", label: "Secretaria de Vinculação", searchable: true },
                  { 
                    key: "nome", 
                    label: "Nome do Imóvel / Prédio", 
                    searchable: true,
                    render: (item) => <span className="font-bold text-slate-800">{item.nome}</span>
                  },
                  { key: "endereco", label: "Endereço", searchable: true },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditUnidade(item)}
                          className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUnidade(item.id)}
                          className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  }
                ]}
              />
            </div>
          </div>
        )}

        {/* SECTION: TIPOS DE CONTA / DESPESAS */}
        {activeSection === 'despesas' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-base">
                {editingDesId ? "✏️ Editar Tipo de Conta" : "➕ Cadastrar Tipo de Despesa / Concessionária"}
              </h4>
              <form onSubmit={handleSaveDespesa} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs font-semibold text-slate-700">
                <div className="space-y-1.5">
                  <label>Código do Tipo (Legado):</label>
                  <input
                    type="number"
                    value={desCodigo}
                    onChange={(e) => setDesCodigo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold focus:bg-white transition"
                    placeholder="Ex: 501"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2 flex gap-3 items-end">
                  <div className="flex-1 space-y-1.5">
                    <label>Descrição do Fornecimento / Concessionária:</label>
                    <input
                      type="text"
                      required
                      value={desDescricao}
                      onChange={(e) => setDesDescricao(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold uppercase focus:bg-white transition"
                      placeholder="Ex: ENERGIA ELÉTRICA - CELESC"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-lg shadow transition"
                    >
                      {editingDesId ? "Salvar" : "Salvar Registro"}
                    </button>
                    {editingDesId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDesId(null);
                          setDesDescricao("");
                          setDesCodigo("");
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-base">Tipos de Conta Cadastrados</h4>
              <SmartTable
                tableId="web_despesas"
                data={despesas}
                searchPlaceholder="Buscar por concessionária..."
                columns={[
                  { key: "id", label: "ID", isPinned: true, searchable: true },
                  { key: "codigo_legado", label: "Cód. Legado", searchable: true },
                  { key: "descricao", label: "Descrição", searchable: true },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleEditDespesa(item)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteDespesa(item.id)} className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  }
                ]}
              />
            </div>
          </div>
        )}

        {/* SECTION: CONTRATOS CODNUM */}
        {activeSection === 'itens' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-base">
                {editingItemId ? "✏️ Editar Contrato CODNUM" : "➕ Cadastrar Medidor / Contrato (CODNUM)"}
              </h4>
              <form onSubmit={handleSaveItem} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs font-semibold text-slate-700">
                <div className="space-y-1.5">
                  <label>Identificador Geral CODNUM:</label>
                  <input
                    type="text"
                    required
                    value={itemCodigoNumero}
                    onChange={(e) => setItemCodigoNumero(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 uppercase font-mono focus:bg-white transition"
                    placeholder="Ex: CELESC-PREF-001"
                  />
                </div>
                <div className="space-y-1.5">
                  <label>Tipo de Conta (Despesa):</label>
                  <select
                    required
                    value={itemDespesaId}
                    onChange={(e) => setItemDespesaId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:bg-white transition"
                  >
                    <option value="">Selecione...</option>
                    {despesas.map(d => (
                      <option key={d.id} value={d.id}>{d.descricao}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label>Unidade Gestora Vinculada:</label>
                  <select
                    required
                    value={itemUnidadeId}
                    onChange={(e) => setItemUnidadeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:bg-white transition"
                  >
                    <option value="">Selecione...</option>
                    {unidades.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label>Linha de Suporte (opcional):</label>
                  <input
                    type="text"
                    value={itemTipoFone}
                    onChange={(e) => setItemTipoFone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 uppercase focus:bg-white transition"
                    placeholder="Ex: LINK INTERNET"
                  />
                </div>
                <div className="space-y-1.5">
                  <label>Número do Medidor / UC Físico:</label>
                  <input
                    type="text"
                    value={itemMedidor}
                    onChange={(e) => setItemMedidor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono focus:bg-white transition"
                    placeholder="Ex: Medidor Celesc 12345"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg shadow transition">
                    {editingItemId ? "Salvar" : "Salvar Contrato"}
                  </button>
                  {editingItemId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItemId(null);
                        setItemCodigoNumero("");
                        setItemTipoFone("");
                        setItemMedidor("");
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg transition"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-base">Identificadores CODNUM Cadastrados</h4>
              <SmartTable
                tableId="web_itens"
                data={itens}
                searchPlaceholder="Pesquisar por CODNUM, medidor, unidade..."
                columns={[
                  { key: "id", label: "ID", isPinned: true, searchable: true },
                  { key: "codigo_numero", label: "CODNUM", searchable: true },
                  { key: "despesa_descricao", label: "Tipo de Conta", searchable: true },
                  { key: "unidade_nome", label: "Unidade", searchable: true },
                  { key: "medidor", label: "Medidor (MEDITM)", searchable: true },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleEditItem(item)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  }
                ]}
              />
            </div>
          </div>
        )}

        {/* SECTION: FATURAS MENSAIS / LANÇAMENTOS */}
        {activeSection === 'lancamentos' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Faturas Mensais e Lançamentos</h3>
                <p className="text-xs text-gray-400">Consolide despesas de energia e água por contratos CODNUM.</p>
              </div>
              <div className="flex gap-2 bg-[#0f0f0f] p-1 rounded-lg border border-white/10 text-xs font-semibold">
                <button
                  onClick={() => setLancamentoSubView("list")}
                  className={`px-4 py-2 rounded-md transition ${
                    lancamentoSubView === "list" 
                      ? "bg-indigo-600 text-white shadow" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  📄 Histórico & Lançamento Manual
                </button>
                <button
                  onClick={() => setLancamentoSubView("new")}
                  className={`px-4 py-2 rounded-md transition ${
                    lancamentoSubView === "new" 
                      ? "bg-indigo-600 text-white shadow" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  ➕ Importar Faturas (PDF/Imagem/Relatório)
                </button>
              </div>
            </div>

            {lancamentoSubView === "new" ? (
              <div className="space-y-4">
                <DocumentManager 
                  currentUser="gestor_web" 
                  onDocumentProcessed={() => {
                    notifyChange();
                    setLancamentoSubView("list");
                  }} 
                />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-[#0f0f0f] border border-white/10 p-6 rounded-xl shadow-sm space-y-4">
                  <h4 className="font-bold text-white text-base">
                    {editingLancId ? "✏️ Editar Lançamento Administrativo" : "➕ Novo Lançamento de Fatura Mensal Manual"}
                  </h4>
                  <form onSubmit={handleSaveLancamento} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end text-xs font-semibold text-gray-300">
                    <div className="space-y-1.5">
                      <label className="text-gray-400">Contrato CODNUM Associado:</label>
                      <select
                        required
                        value={lancItemId}
                        onChange={(e) => setLancItemId(e.target.value)}
                        className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white focus:bg-black transition"
                      >
                        <option value="">Selecione...</option>
                        {itens.map(it => (
                          <option key={it.id} value={it.id}>{it.codigo_numero} ({it.unidade_nome})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-gray-400">Mês de Referência:</label>
                      <input
                        type="date"
                        required
                        value={lancMesAno}
                        onChange={(e) => setLancMesAno(e.target.value)}
                        className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 font-mono text-white focus:bg-black transition"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-gray-400">Consumo Registrado:</label>
                      <input
                        type="number"
                        step="any"
                        value={lancConsumo}
                        onChange={(e) => setLancConsumo(e.target.value)}
                        className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 font-mono text-white focus:bg-black transition"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-gray-400">Valor Total Faturado (R$):</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={lancTotal}
                        onChange={(e) => setLancTotal(e.target.value)}
                        className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 font-mono focus:bg-black transition font-bold text-indigo-400"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-gray-400">Valor dos Impostos (R$):</label>
                      <input
                        type="number"
                        step="any"
                        value={lancImposto}
                        onChange={(e) => setLancImposto(e.target.value)}
                        className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 font-mono text-white focus:bg-black transition"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="md:col-span-5 flex justify-end gap-2 border-t border-white/10 pt-3.5">
                      <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-lg shadow transition">
                        {editingLancId ? "Salvar" : "Registrar Lançamento"}
                      </button>
                      {editingLancId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLancId(null);
                            setLancConsumo("");
                            setLancTotal("");
                            setLancImposto("");
                          }}
                          className="bg-white/5 hover:bg-white/10 text-gray-300 font-bold px-4 py-2.5 rounded-lg transition"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                <div className="bg-[#0f0f0f] border border-white/10 p-6 rounded-xl shadow-sm space-y-4">
                  <h4 className="font-bold text-white text-base">Registros de Despesas e Faturas Homologadas</h4>
                  <div className="text-gray-300">
                    <SmartTable
                      tableId="web_lancamentos"
                      data={lancamentos}
                      searchPlaceholder="Filtrar por CODNUM, Unidade..."
                      columns={[
                        { key: "id", label: "ID", isPinned: true, searchable: true },
                        { 
                          key: "mes_ano", 
                          label: "Comp. / Ref", 
                          searchable: true,
                          render: (item) => {
                            const dateObj = new Date(item.mes_ano);
                            return <span className="font-mono font-bold">{`${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`}</span>;
                          }
                        },
                        { key: "codigo_numero", label: "CODNUM", searchable: true },
                        { key: "unidade_nome", label: "Unidade Gestora", searchable: true },
                        { key: "consumo", label: "Consumo", searchable: true },
                        { 
                          key: "valor_total", 
                          label: "Valor Total", 
                          searchable: true,
                          render: (item) => <span className="font-bold text-indigo-400 font-mono">R$ {Number(item.valor_total || 0).toFixed(2)}</span>
                        },
                        { 
                          key: "valor_imposto", 
                          label: "Impostos", 
                          searchable: true,
                          render: (item) => <span className="text-gray-450 font-mono">R$ {Number(item.valor_imposto || 0).toFixed(2)}</span>
                        },
                        {
                          key: "acoes",
                          label: "Ações",
                          render: (item) => (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleEditLancamento(item)} className="p-1.5 hover:bg-indigo-900/30 text-indigo-400 rounded-lg transition">
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleDeleteLancamento(item.id)} className="p-1.5 hover:bg-rose-900/30 text-rose-400 rounded-lg transition">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        }
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}


        {/* SECTION: CONTROLE DE AUDITORIA */}
        {activeSection === 'auditoria' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <h4 className="font-bold text-slate-800 text-base">Histórico de Alterações e Rastreabilidade</h4>
                <p className="text-xs text-slate-500">Histórico de auditoria integrado das ações administrativas executadas por usuários</p>
              </div>

              <SmartTable
                tableId="web_auditoria"
                data={auditorias}
                searchPlaceholder="Filtrar por tabela, pk, usuário..."
                columns={[
                  { key: "id", label: "Log ID", isPinned: true, searchable: true },
                  { key: "tabela", label: "Tabela", searchable: true },
                  { key: "registro_pk", label: "Chave PK", searchable: true },
                  { 
                    key: "acao", 
                    label: "Operação", 
                    searchable: true,
                    render: (item) => (
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                        item.acao === 'INSERT' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        item.acao === 'UPDATE' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {item.acao}
                      </span>
                    )
                  },
                  { key: "usuario", label: "Autor", searchable: true },
                  { 
                    key: "criado_em", 
                    label: "Data e Hora", 
                    searchable: true,
                    render: (item) => <span className="font-mono text-slate-500">{new Date(item.criado_em).toLocaleString("pt-BR")}</span>
                  }
                ]}
              />
            </div>
          </div>
        )}

        {/* SECTION: PENDÊNCIAS DE VINCULAÇÃO DE SECRETARIA */}
        {activeSection === 'pendencias' && (() => {
          const unlinkedLancamentos = lancamentos.filter(l => !l.secretaria_id && (!l.secretaria_nome || l.secretaria_nome === "NÃO LOCALIZADA" || l.secretaria_nome === "NÃO VINCULADA"));
          return (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <span>⚠️ Central de Pendências de Vinculação de Secretaria</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-mono font-bold">
                        {unlinkedLancamentos.length} pendências
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Listagem de todos os lançamentos de faturas importadas que não foram vinculados automaticamente a nenhuma Secretaria Municipal.
                    </p>
                  </div>
                </div>

                {unlinkedLancamentos.length === 0 ? (
                  <div className="p-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                    <h5 className="font-bold text-slate-800 text-sm">Nenhuma pendência de vinculação!</h5>
                    <p className="text-xs text-slate-500">
                      Todas as faturas e lançamentos cadastrados estão devidamente associados a suas respectivas Secretarias Municipais.
                    </p>
                  </div>
                ) : (
                  <SmartTable
                    tableId="web_pendencias"
                    data={unlinkedLancamentos}
                    searchPlaceholder="Filtrar por CODNUM, Unidade Gestora, Competência..."
                    columns={[
                      { key: "id", label: "Lançamento ID", isPinned: true },
                      { 
                        key: "codigo_numero", 
                        label: "CODNUM", 
                        searchable: true,
                        render: (item) => <span className="font-mono font-bold text-indigo-700">{item.codigo_numero}</span>
                      },
                      { 
                        key: "unidade_nome", 
                        label: "Unidade Gestora", 
                        searchable: true,
                        render: (item) => <span className="text-slate-700 font-semibold">{item.unidade_nome || "NÃO VINCULADA"}</span>
                      },
                      { 
                        key: "consumo", 
                        label: "Consumo", 
                        render: (item) => <span className="font-mono text-slate-800">{item.consumo}</span>
                      },
                      { 
                        key: "valor_total", 
                        label: "Valor Total", 
                        render: (item) => <span className="font-mono font-bold text-emerald-700">R$ {(item.valor_total || 0).toFixed(2)}</span>
                      },
                      { 
                        key: "mes_ano", 
                        label: "Competência", 
                        searchable: true,
                        render: (item) => <span className="font-mono text-slate-600">{item.mes_ano}</span>
                      },
                      {
                        key: "acoes",
                        label: "Vincular Secretaria",
                        render: (item) => {
                          const currentSel = pendingSelSec[item.id] || "";
                          const isSub = submittingPending === item.id;
                          return (
                            <div className="flex items-center gap-2">
                              <select
                                value={currentSel}
                                onChange={(e) => setPendingSelSec(prev => ({ ...prev, [item.id]: e.target.value }))}
                                className="bg-slate-50 border border-slate-300 text-xs rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="">Selecione a Secretaria...</option>
                                {secretarias.map(sec => (
                                  <option key={sec.id} value={sec.id}>
                                    {sec.nome}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={!currentSel || isSub}
                                onClick={async () => {
                                  setSubmittingPending(item.id);
                                  try {
                                    const res = await fetch(`/api/lancamentos/${item.id}/vincular_secretaria`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ secretaria_id: currentSel })
                                    });
                                    if (res.ok) {
                                      setGlobalSuccess(`Lançamento (CODNUM: ${item.codigo_numero}) vinculado à Secretaria com sucesso!`);
                                      loadAllData();
                                      notifyChange();
                                    } else {
                                      const err = await res.json();
                                      setGlobalError(err.error || "Erro ao vincular secretaria.");
                                    }
                                  } catch (err: any) {
                                    setGlobalError("Erro de comunicação com o servidor.");
                                  } finally {
                                    setSubmittingPending(null);
                                  }
                                }}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg disabled:opacity-50 transition shadow-sm flex items-center gap-1"
                              >
                                {isSub ? "Vinculando..." : "🔗 Vincular"}
                              </button>
                            </div>
                          );
                        }
                      }
                    ]}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* SECTION: CONFIGURAÇÕES E MANUTENÇÃO */}
        {activeSection === 'configuracoes' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span>⚙️ Painel de Configurações e Manutenção do Sistema</span>
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Painel administrativo de parâmetros do banco de dados, auditoria de operações e ferramentas de teste.
                </p>
              </div>

              {resetResultMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>{resetResultMsg}</span>
                </div>
              )}

              {/* TODO: REMOVER ESTE BOTÃO ANTES DE IR PARA USO REAL DEFINITIVO */}
              <div className="p-5 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                  <span>Ferramenta de Manutenção para Testes — Zerar Banco de Dados</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Esta operação apaga todos os registros de Secretarias, Unidades, Tipos de Conta, Contratos CODNUM, Lançamentos, Pessoas, Contatos e Documentos. O histórico de auditoria do próprio reset será preservado com o snapshot de quantidade de linhas de cada tabela antes da limpeza.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setResetConfirmInput("");
                      setShowResetModal(true);
                    }}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition shadow-md flex items-center gap-2"
                  >
                    <span>🗑️ ZERAR BANCO DE DADOS (APENAS TESTES)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* TODO: REMOVER ESTE BOTÃO ANTES DE IR PARA USO REAL DEFINITIVO */}
      {/* MODAL: Zerar Banco de Dados */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-rose-500/30 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h5 className="font-bold text-sm text-rose-400 uppercase tracking-wide flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500" />
                <span>ATENÇÃO: Zerar Banco de Dados</span>
              </h5>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-gray-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 space-y-2">
              <p className="font-semibold">
                Você está prestes a LIMPAR TOTALMENTE os dados cadastrais e faturas do sistema!
              </p>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                • Secretarias, Unidades Gestoras, Contratos, Faturas e Documentos serão apagados.<br />
                • A estrutura do banco de dados e o log de auditoria do reset serão mantidos.<br />
                • Esta ação é irreversível.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-300 font-semibold block">
                Para confirmar, digite exatamente a frase <strong className="text-rose-400 font-mono select-all">CONFIRMAR RESET TOTAL</strong>:
              </label>
              <input
                type="text"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                placeholder="CONFIRMAR RESET TOTAL"
                className="w-full bg-[#1a1a1a] border border-white/20 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500 font-bold tracking-wider"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resetConfirmInput !== "CONFIRMAR RESET TOTAL" || isResetting}
                onClick={async () => {
                  setIsResetting(true);
                  try {
                    const res = await fetch("/api/admin/reset_database", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "x-user": "admin" }
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      setResetResultMsg(data.message);
                      setShowResetModal(false);
                      loadAllData();
                      notifyChange();
                    } else {
                      setGlobalError(data.error || "Erro ao zerar banco de dados.");
                    }
                  } catch (err) {
                    setGlobalError("Erro de comunicação ao zerar banco de dados.");
                  } finally {
                    setIsResetting(false);
                  }
                }}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-rose-600/30 flex items-center gap-2"
              >
                {isResetting ? "Zerando Banco..." : "Confirmar e Zerar Banco"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
