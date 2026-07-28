import React, { useState, useEffect } from "react";
import { 
  Monitor, Play, X, Minus, Square, Database, User, ShieldAlert,
  ChevronDown, HelpCircle, FileText, Settings, ClipboardList,
  Edit2, Trash2, Plus, RefreshCw, BarChart3, TrendingUp, Receipt,
  Lightbulb, Droplets, Building2, Check, ArrowRight
} from "lucide-react";
import { Secretaria, Unidade, Despesa, ItemDespesa, Lancamento, AuditoriaRegistro } from "../types";
import DocumentManager from "./DocumentManager";
import SmartTable from "./SmartTable";

interface DesktopSimulatorProps {
  onRefreshTrigger?: number;
  onDataChanged?: () => void;
}

export default function DesktopSimulator({ onRefreshTrigger, onDataChanged }: DesktopSimulatorProps) {
  // Shared States
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [itens, setItens] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [auditorias, setAuditorias] = useState<AuditoriaRegistro[]>([]);
  const [loading, setLoading] = useState(false);

  // PySide6 Window states
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "secretarias" | "unidades" | "despesas" | "itens" | "lancamentos" | "documentos" | "auditoria"
  >("dashboard");
  const [currentUser] = useState("admin");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [statusBarMsg, setStatusBarMsg] = useState("Pronto. Sistema operacional de auditoria ativo.");

  // Hover expansion state
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'energia' | 'agua'>('energia');

  // Form edit modes and states (mirrors WebPortal exactly)
  const [editingSecId, setEditingSecId] = useState<string | null>(null);
  const [secNome, setSecNome] = useState("");
  const [secCodigo, setSecCodigo] = useState("");

  const [editingUniId, setEditingUniId] = useState<string | null>(null);
  const [uniNome, setUniNome] = useState("");
  const [uniSecretariaId, setUniSecretariaId] = useState("");
  const [uniCodigo, setUniCodigo] = useState("");
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

      setStatusBarMsg(`QSqlDatabase conectado. ${lancamentos.length} lançamentos recuperados às ${new Date().toLocaleTimeString()}`);
    } catch (err: any) {
      setStatusBarMsg(`Erro de barramento de dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const notifyChange = () => {
    loadAllData();
    if (onDataChanged) onDataChanged();
  };

  // --- CRUD ACTIONS FOR DESKTOP ---

  // Secretarias
  const handleSaveSecretaria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secNome.trim()) {
      setStatusBarMsg("Erro: Informe o nome da secretaria.");
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
        headers: { "Content-Type": "application/json", "x-user": currentUser },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setStatusBarMsg(editingSecId ? "QSqlQuery: Secretaria atualizada" : "QSqlQuery: Secretaria inserida com sucesso");
        setSecNome("");
        setSecCodigo("");
        setEditingSecId(null);
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Erro SQL: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Exceção de Execução: ${err.message}`);
    }
  };

  const handleEditSecretaria = (s: Secretaria) => {
    setEditingSecId(s.id);
    setSecNome(s.nome);
    setSecCodigo(s.codigo_legado ? String(s.codigo_legado) : "");
    setStatusBarMsg(`Editar registro: ID ${s.id}`);
  };

  const handleDeleteSecretaria = async (id: string) => {
    const s = secretarias.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Confirmar DELETE na tabela "secretarias" para o registro "${s.nome}"?`)) return;

    try {
      const res = await fetch(`/api/secretarias/${id}`, {
        method: "DELETE",
        headers: { "x-user": currentUser }
      });
      if (res.ok) {
        setStatusBarMsg("QSqlQuery: Registro excluído de secretarias");
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Falha de restrição SQL: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Exceção: ${err.message}`);
    }
  };

  // Unidades
  const handleSaveUnidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uniNome.trim() || !uniSecretariaId) {
      setStatusBarMsg("Erro: Informe o nome e a secretaria.");
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
        headers: { "Content-Type": "application/json", "x-user": currentUser },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setStatusBarMsg(editingUniId ? "QSqlQuery: Unidade atualizada" : "QSqlQuery: Unidade inserida");
        setUniNome("");
        setUniSecretariaId("");
        setUniEndereco("");
        setUniCodigo("");
        setEditingUniId(null);
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Erro SQL: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Exceção: ${err.message}`);
    }
  };

  const handleEditUnidade = (u: any) => {
    setEditingUniId(u.id);
    setUniNome(u.nome);
    setUniSecretariaId(u.secretaria_id || "");
    setUniEndereco(u.endereco || "");
    setUniCodigo(u.codigo_legado ? String(u.codigo_legado) : "");
    setStatusBarMsg(`Editar registro: Unidade ID ${u.id}`);
  };

  const handleDeleteUnidade = async (id: string) => {
    const u = unidades.find(x => x.id === id);
    if (!u) return;
    if (!confirm(`Deseja realmente remover a unidade "${u.nome}" da tabela de unidades?`)) return;

    try {
      const res = await fetch(`/api/unidades/${id}`, {
        method: "DELETE",
        headers: { "x-user": currentUser }
      });
      if (res.ok) {
        setStatusBarMsg("QSqlQuery: Registro removido de unidades");
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Restrição de Integridade: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Erro: ${err.message}`);
    }
  };

  // Despesas
  const handleSaveDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desDescricao.trim()) {
      setStatusBarMsg("Erro: Informe a descrição da despesa.");
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
        headers: { "Content-Type": "application/json", "x-user": currentUser },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setStatusBarMsg("QSqlQuery: Despesa salva.");
        setDesDescricao("");
        setDesCodigo("");
        setEditingDesId(null);
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Falha SQL: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Erro: ${err.message}`);
    }
  };

  const handleEditDespesa = (d: Despesa) => {
    setEditingDesId(d.id);
    setDesDescricao(d.descricao);
    setDesCodigo(d.codigo_legado ? String(d.codigo_legado) : "");
    setStatusBarMsg(`Editar despesa: ${d.descricao}`);
  };

  const handleDeleteDespesa = async (id: string) => {
    const d = despesas.find(x => x.id === id);
    if (!d) return;
    if (!confirm(`Confirmar exclusão da despesa "${d.descricao}"?`)) return;

    try {
      const res = await fetch(`/api/despesas/${id}`, {
        method: "DELETE",
        headers: { "x-user": currentUser }
      });
      if (res.ok) {
        setStatusBarMsg("Despesa removida.");
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Erro de exclusão: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Exceção: ${err.message}`);
    }
  };

  // Itens de Despesa / CODNUM Contracts
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCodigoNumero.trim() || !itemDespesaId || !itemUnidadeId) {
      setStatusBarMsg("Erro: Campos obrigatórios em branco.");
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
        headers: { "Content-Type": "application/json", "x-user": currentUser },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setStatusBarMsg("Contrato CODNUM salvo.");
        setItemCodigoNumero("");
        setItemTipoFone("");
        setItemMedidor("");
        setEditingItemId(null);
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Erro SQL: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Erro: ${err.message}`);
    }
  };

  const handleEditItem = (it: any) => {
    setEditingItemId(it.id);
    setItemCodigoNumero(it.codigo_numero);
    setItemDespesaId(it.despesa_id);
    setItemUnidadeId(it.unidade_id);
    setItemTipoFone(it.tipo_fone || "");
    setItemMedidor(it.medidor || "");
    setStatusBarMsg(`Editar contrato: ${it.codigo_numero}`);
  };

  const handleDeleteItem = async (id: string) => {
    const it = itens.find(x => x.id === id);
    if (!it) return;
    if (!confirm(`Deseja realmente remover o contrato CODNUM "${it.codigo_numero}"?`)) return;

    try {
      const res = await fetch(`/api/itens_despesas/${id}`, {
        method: "DELETE",
        headers: { "x-user": currentUser }
      });
      if (res.ok) {
        setStatusBarMsg("Contrato CODNUM excluído.");
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Erro: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Erro: ${err.message}`);
    }
  };

  // Lançamentos Mensais
  const handleSaveLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lancItemId || !lancMesAno || !lancTotal) {
      setStatusBarMsg("Erro: Preencha o CODNUM, data de referência e o valor total.");
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
        headers: { "Content-Type": "application/json", "x-user": currentUser },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setStatusBarMsg("Lançamento gravado com sucesso.");
        setLancConsumo("");
        setLancTotal("");
        setLancImposto("");
        setEditingLancId(null);
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Erro SQL: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Erro: ${err.message}`);
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
    setStatusBarMsg(`Editar lançamento ID: ${l.id}`);
  };

  const handleDeleteLancamento = async (id: string) => {
    if (!confirm(`Deseja remover o lançamento ID: ${id} da base?`)) return;

    try {
      const res = await fetch(`/api/lancamentos/${id}`, {
        method: "DELETE",
        headers: { "x-user": currentUser }
      });
      if (res.ok) {
        setStatusBarMsg("Lançamento excluído da tabela.");
        notifyChange();
      } else {
        const err = await res.json();
        setStatusBarMsg(`Erro: ${err.error}`);
      }
    } catch (err: any) {
      setStatusBarMsg(`Erro: ${err.message}`);
    }
  };

  // Metrics (matching Web)
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

      return {
        label: monthNames[idx],
        kw: filterKw.reduce((acc, l) => acc + (l.consumo || 0), 0) || (1000 + idx * 150),
        m3: filterM3.reduce((acc, l) => acc + (l.consumo || 0), 0) || (30 + idx * 8),
        kwCost: filterKw.reduce((acc, l) => acc + (l.valor_total || 0), 0) || (800 + idx * 120),
        m3Cost: filterM3.reduce((acc, l) => acc + (l.valor_total || 0), 0) || (400 + idx * 60)
      };
    });
  };

  const chartData = getHistoricalChartData();

  // Nested Expanded Details Component
  function ExpandedUnitDetails({ unit }: { unit: any }) {
    const unitItems = itens.filter(it => it.unidade_id === unit.id);
    const concessionaires = Array.from(new Set(unitItems.map(it => it.despesa_descricao || "CONCESSIONÁRIA")));
    const [activeConcessionaire, setActiveConcessionaire] = useState(concessionaires[0] || "");
    
    if (unitItems.length === 0) {
      return (
        <div className="p-3 bg-[#111111] border border-white/10 rounded text-gray-400 italic text-xs">
          Nenhum medidor/contrato CODNUM vinculado a esta unidade.
        </div>
      );
    }
    
    const activeItems = unitItems.filter(it => it.despesa_descricao === activeConcessionaire);
    
    return (
      <div className="space-y-4 bg-[#141414] p-4 rounded border border-white/10 shadow-inner text-gray-300">
        <div className="flex items-center justify-between border-b border-white/15 pb-2">
          <div>
            <h5 className="text-xs font-bold text-gray-100 uppercase tracking-wider">Inspecionar Concessionárias e Medidores</h5>
            <p className="text-[10px] text-gray-400">Dados recuperados do banco centralizado em tempo real</p>
          </div>
          <div className="flex gap-1 bg-[#0a0a0a] p-0.5 rounded border border-white/10">
            {concessionaires.map(conces => (
              <button
                key={conces}
                onClick={() => setActiveConcessionaire(conces)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                  activeConcessionaire === conces
                    ? "bg-indigo-600 text-white shadow"
                    : "hover:bg-white/5 text-gray-400"
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
              <div key={it.id} className="bg-[#1c1c1c] p-4 rounded border border-white/10 space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider block">CODNUM</span>
                    <span className="text-xs font-bold text-gray-100 font-mono">{it.codigo_numero}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider block">UC / Matrícula</span>
                    <span className="text-xs font-bold text-indigo-400 font-mono">{it.medidor || "N/A"}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/10 pt-2">
                  <div>
                    <span className="text-[9px] text-gray-400 block">Competência</span>
                    <span className="font-bold font-mono text-gray-200">
                      {latestLanc ? (() => {
                        const dateObj = new Date(latestLanc.mes_ano);
                        return `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
                      })() : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 block">Valor Último</span>
                    <span className="font-bold text-gray-100 font-mono">
                      {latestLanc ? `R$ ${latestLanc.valor_total.toFixed(2)}` : "R$ 0,00"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 block">Consumo</span>
                    <span className="font-bold font-mono text-gray-200">
                      {latestLanc ? `${latestLanc.consumo} ${activeConcessionaire.toUpperCase().includes("ÁGUA") || activeConcessionaire.toUpperCase().includes("CASAN") ? "m³" : "kWh"}` : "0"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 block">Status</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold inline-block ${
                      latestLanc ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                    }`}>
                      {latestLanc ? "PAGO / VALIDADO" : "PENDENTE"}
                    </span>
                  </div>
                  {isSolar && (
                    <div className="col-span-2 bg-emerald-500/5 p-2 rounded border border-emerald-500/20 flex items-center gap-1.5 mt-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
                      <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">
                        Solar Fotovoltaico Compensando excedentes de geração
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

  // Simulated drop downs for traditional OS menu bar
  const toggleMenu = (menuName: string) => {
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  const closeMenu = () => setOpenMenu(null);

  return (
    <div className="w-full flex flex-col pyside-window rounded-lg bg-[#0f0f0f] text-gray-200 border border-white/10 overflow-hidden shadow-2xl" style={{ minHeight: "680px" }}>
      {/* 🖥️ Classic Windows/Linux Window Frame Titlebar */}
      <div className="bg-[#0a0a0a] text-white px-3 py-2 flex justify-between items-center select-none font-sans text-xs border-b border-white/10">
        <div className="flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
          <span className="font-semibold tracking-wide text-gray-200">SisPubInt - Terminal Administrativo Clássico PySide6 v2.0</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="hover:bg-white/10 p-0.5 rounded text-gray-400 hover:text-white transition">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button className="hover:bg-white/10 p-0.5 rounded text-gray-400 hover:text-white transition">
            <Square className="h-3 w-3" />
          </button>
          <button className="hover:bg-rose-600 hover:text-white p-0.5 rounded text-gray-400 transition">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 📂 Menu Bar (Dropdowns) */}
      <div className="pyside-menu-bar py-1 px-3 flex gap-4 text-xs select-none font-sans relative z-40 border-b border-white/10 bg-[#0c0c0c]">
        <div className="relative">
          <button 
            onClick={() => toggleMenu("arquivo")} 
            className={`px-2 py-1 rounded transition ${openMenu === "arquivo" ? "bg-white/10 text-white" : "hover:bg-white/5 text-gray-300"}`}
          >
            Arquivo
          </button>
          {openMenu === "arquivo" && (
            <div className="absolute left-0 mt-1 w-44 bg-[#0a0a0a] border border-white/10 shadow-2xl rounded py-1 flex flex-col text-left">
              <button onClick={() => { loadAllData(); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Sincronizar Banco</button>
              <div className="border-t border-white/10 my-1"></div>
              <button onClick={() => { setActiveTab("lancamentos"); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Importar Fatura / Lançamentos</button>
              <button onClick={() => { setActiveTab("auditoria"); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Histórico de Auditoria</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button 
            onClick={() => toggleMenu("cadastro")} 
            className={`px-2 py-1 rounded transition ${openMenu === "cadastro" ? "bg-white/10 text-white" : "hover:bg-white/5 text-gray-300"}`}
          >
            Cadastro
          </button>
          {openMenu === "cadastro" && (
            <div className="absolute left-0 mt-1 w-44 bg-[#0a0a0a] border border-white/10 shadow-2xl rounded py-1 flex flex-col text-left">
              <button onClick={() => { setActiveTab("secretarias"); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Secretarias</button>
              <button onClick={() => { setActiveTab("unidades"); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Unidades Gestoras</button>
              <button onClick={() => { setActiveTab("despesas"); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Despesas (Contas)</button>
              <button onClick={() => { setActiveTab("itens"); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Itens e Medidores</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button 
            onClick={() => toggleMenu("processos")} 
            className={`px-2 py-1 rounded transition ${openMenu === "processos" ? "bg-white/10 text-white" : "hover:bg-white/5 text-gray-300"}`}
          >
            Processos
          </button>
          {openMenu === "processos" && (
            <div className="absolute left-0 mt-1 w-48 bg-[#0a0a0a] border border-white/10 shadow-2xl rounded py-1 flex flex-col text-left">
              <button onClick={() => { setActiveTab("lancamentos"); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Lançamentos Mensais</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button 
            onClick={() => toggleMenu("ajuda")} 
            className={`px-2 py-1 rounded transition ${openMenu === "ajuda" ? "bg-white/10 text-white" : "hover:bg-white/5 text-gray-300"}`}
          >
            Ajuda
          </button>
          {openMenu === "ajuda" && (
            <div className="absolute left-0 mt-1 w-44 bg-[#0a0a0a] border border-white/10 shadow-2xl rounded py-1 flex flex-col text-left">
              <button onClick={() => { alert("SisPu.JP 2.0\nTerminal Administrativo de Alta Performance PySide6."); closeMenu(); }} className="px-3 py-1.5 hover:bg-white/5 text-xs text-left text-gray-300 hover:text-white transition">Sobre o SisPu.JP</button>
            </div>
          )}
        </div>
      </div>

      {/* 📑 PySide6 QTabWidget Header Tabs */}
      <div className="bg-[#0a0a0a] border-b border-white/10 flex flex-wrap gap-0.5 px-2 pt-1 z-10">
        <button
          onClick={() => { setActiveTab("dashboard"); closeMenu(); }}
          className={`px-4 py-2 text-xs font-medium rounded-t-md border-t border-x transition-all ${
            activeTab === "dashboard"
              ? "bg-[#0f0f0f] border-white/10 border-b-transparent text-white font-bold translate-y-px"
              : "bg-[#0a0a0a] border-transparent hover:bg-white/5 text-gray-400"
          }`}
        >
          Painel Geral
        </button>
        <button
          onClick={() => { setActiveTab("secretarias"); closeMenu(); }}
          className={`px-4 py-2 text-xs font-medium rounded-t-md border-t border-x transition-all ${
            activeTab === "secretarias"
              ? "bg-[#0f0f0f] border-white/10 border-b-transparent text-white font-bold translate-y-px"
              : "bg-[#0a0a0a] border-transparent hover:bg-white/5 text-gray-400"
          }`}
        >
          Secretarias
        </button>
        <button
          onClick={() => { setActiveTab("unidades"); closeMenu(); }}
          className={`px-4 py-2 text-xs font-medium rounded-t-md border-t border-x transition-all ${
            activeTab === "unidades"
              ? "bg-[#0f0f0f] border-white/10 border-b-transparent text-white font-bold translate-y-px"
              : "bg-[#0a0a0a] border-transparent hover:bg-white/5 text-gray-400"
          }`}
        >
          Unidades
        </button>
        <button
          onClick={() => { setActiveTab("despesas"); closeMenu(); }}
          className={`px-4 py-2 text-xs font-medium rounded-t-md border-t border-x transition-all ${
            activeTab === "despesas"
              ? "bg-[#0f0f0f] border-white/10 border-b-transparent text-white font-bold translate-y-px"
              : "bg-[#0a0a0a] border-transparent hover:bg-white/5 text-gray-400"
          }`}
        >
          Despesas
        </button>
        <button
          onClick={() => { setActiveTab("itens"); closeMenu(); }}
          className={`px-4 py-2 text-xs font-medium rounded-t-md border-t border-x transition-all ${
            activeTab === "itens"
              ? "bg-[#0f0f0f] border-white/10 border-b-transparent text-white font-bold translate-y-px"
              : "bg-[#0a0a0a] border-transparent hover:bg-white/5 text-gray-400"
          }`}
        >
          Itens de Despesa
        </button>
        <button
          onClick={() => { setActiveTab("lancamentos"); closeMenu(); }}
          className={`px-4 py-2 text-xs font-medium rounded-t-md border-t border-x transition-all ${
            activeTab === "lancamentos"
              ? "bg-[#0f0f0f] border-white/10 border-b-transparent text-white font-bold translate-y-px"
              : "bg-[#0a0a0a] border-transparent hover:bg-white/5 text-gray-400"
          }`}
        >
          Lançamentos
        </button>

        <button
          onClick={() => { setActiveTab("auditoria"); closeMenu(); }}
          className={`px-4 py-2 text-xs font-medium rounded-t-md border-t border-x transition-all ${
            activeTab === "auditoria"
              ? "bg-[#0f0f0f] border-white/10 border-b-transparent text-white font-bold translate-y-px"
              : "bg-[#0a0a0a] border-transparent hover:bg-white/5 text-gray-400"
          }`}
        >
          Auditoria
        </button>
      </div>

      {/* 🖼️ PySide6 Page View container */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4" style={{ backgroundColor: "#0f0f0f" }}>
        
        {/* --- TAB: DASHBOARD (Parity with Web!) --- */}
        {activeTab === "dashboard" && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-white/10 pb-1">QtDashboard - Indicadores Municipais de Despesa</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-black/40 p-4 rounded border border-white/10 font-mono text-xs space-y-1">
                <span className="text-gray-400 block uppercase tracking-wider text-[10px]">Total Homologado</span>
                <span className="text-lg font-bold text-white block">R$ {totalSpend.toFixed(2)}</span>
                <span className="text-emerald-500 text-[10px] flex items-center gap-1">● Sincronizado</span>
              </div>
              <div className="bg-black/40 p-4 rounded border border-white/10 font-mono text-xs space-y-1">
                <span className="text-gray-400 block uppercase tracking-wider text-[10px]">Energia kWh</span>
                <span className="text-lg font-bold text-white block">{totalEnergyCons.toLocaleString()} kWh</span>
                <span className="text-gray-400 text-[10px]">Medidores CELESC</span>
              </div>
              <div className="bg-black/40 p-4 rounded border border-white/10 font-mono text-xs space-y-1">
                <span className="text-gray-400 block uppercase tracking-wider text-[10px]">Água m³</span>
                <span className="text-lg font-bold text-white block">{totalWaterCons.toLocaleString()} m³</span>
                <span className="text-gray-400 text-[10px]">Medidores CASAN</span>
              </div>
              <div className="bg-black/40 p-4 rounded border border-white/10 font-mono text-xs space-y-1">
                <span className="text-gray-400 block uppercase tracking-wider text-[10px]">Vinculações</span>
                <span className="text-lg font-bold text-white block">{secretarias.length} Sec / {unidades.length} Uni</span>
                <span className="text-indigo-400 text-[10px] font-bold">{itens.length} Contratos</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-black/40 p-4 rounded border border-white/10 lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-gray-300 font-mono uppercase tracking-wider">Histórico Mensal Consolidação (QGraphicsView)</span>
                  <div className="flex gap-1.5 bg-black/50 p-0.5 rounded border border-white/10 text-[10px] font-semibold">
                    <button
                      onClick={() => setChartMode('energia')}
                      className={`px-3 py-1 rounded transition ${chartMode === 'energia' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
                    >
                      Energia (Celesc)
                    </button>
                    <button
                      onClick={() => setChartMode('agua')}
                      className={`px-3 py-1 rounded transition ${chartMode === 'agua' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
                    >
                      Água (Casan)
                    </button>
                  </div>
                </div>

                <div className="h-44 flex flex-col justify-between">
                  <div className="relative flex-1 flex items-end justify-between px-2 pb-2 border-b border-white/10 h-36 pt-4">
                    {chartData.map((d, i) => {
                      const maxVal = chartMode === 'energia' ? 2500 : 100;
                      const val = chartMode === 'energia' ? d.kw : d.m3;
                      const percent = Math.min(100, Math.max(10, (val / maxVal) * 100));
                      const isEnergy = chartMode === 'energia';

                      return (
                        <div key={i} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                          <div className="absolute bottom-full mb-1 bg-black text-white text-[10px] py-1 px-2 rounded border border-white/15 opacity-0 group-hover:opacity-100 transition z-20 whitespace-nowrap">
                            <span className="font-bold font-mono">{val} {isEnergy ? 'kWh' : 'm³'}</span>
                          </div>
                          <div 
                            style={{ height: `${percent}%` }}
                            className={`w-8 rounded-t transition-all duration-300 cursor-pointer ${
                              isEnergy ? 'bg-amber-500 hover:bg-amber-400' : 'bg-blue-600 hover:bg-blue-500'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="flex justify-between px-2 text-[10px] font-bold text-gray-400">
                    {chartData.map((d, i) => (
                      <span key={i} className="flex-1 text-center font-mono">{d.label}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-black/40 p-4 rounded border border-white/10 flex flex-col justify-between">
                <div className="space-y-3">
                  <span className="text-xs font-bold text-gray-300 font-mono uppercase tracking-wider block border-b border-white/10 pb-1.5">Atalhos PySide</span>
                  <div className="space-y-2 text-xs">
                    <button onClick={() => setActiveTab('secretarias')} className="w-full flex items-center justify-between p-2 bg-[#1c1c1c] border border-white/5 rounded hover:bg-white/5 transition">
                      <span>Módulo Secretarias</span>
                      <ArrowRight className="h-3 w-3 text-indigo-400" />
                    </button>
                    <button onClick={() => setActiveTab('unidades')} className="w-full flex items-center justify-between p-2 bg-[#1c1c1c] border border-white/5 rounded hover:bg-white/5 transition">
                      <span>Módulo Unidades</span>
                      <ArrowRight className="h-3 w-3 text-indigo-400" />
                    </button>
                    <button onClick={() => setActiveTab('lancamentos')} className="w-full flex items-center justify-between p-2 bg-[#1c1c1c] border border-white/5 rounded hover:bg-white/5 transition">
                      <span>Lançamentos Mensais</span>
                      <ArrowRight className="h-3 w-3 text-indigo-400" />
                    </button>
                  </div>
                </div>
                <div className="p-2.5 bg-indigo-500/5 text-indigo-300 rounded border border-indigo-500/10 text-[10px] mt-2">
                  <strong>Equivalência Garantida:</strong> A base relacional integrada assegura que as atualizações em tempo real persistam para ambas as plataformas.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: SECRETARIAS --- */}
        {activeTab === "secretarias" && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-white/10 pb-1">QFormLayout - Gestão de Secretarias</h4>
            
            {/* Form layout */}
            <form onSubmit={handleSaveSecretaria} className="bg-[#1c1c1c] p-4 rounded border border-white/10 flex flex-col md:flex-row gap-4 items-end text-xs font-sans text-gray-200">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Código Legado:</label>
                <input
                  type="number"
                  value={secCodigo}
                  onChange={(e) => setSecCodigo(e.target.value)}
                  placeholder="sem código"
                  className="pyside-input px-3 py-1.5 rounded text-xs w-40 font-mono bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex-1 flex flex-col gap-1.5 w-full">
                <label className="font-semibold text-gray-300">Nome da Secretaria:</label>
                <input
                  type="text"
                  required
                  value={secNome}
                  onChange={(e) => setSecNome(e.target.value)}
                  placeholder="NOME DA SECRETARIA"
                  className="pyside-input px-3 py-1.5 rounded text-xs w-full uppercase bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded transition active:scale-95"
                >
                  {editingSecId ? "Salvar Registro" : "Cadastrar"}
                </button>
                {editingSecId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSecId(null);
                      setSecNome("");
                      setSecCodigo("");
                    }}
                    className="bg-white/10 hover:bg-white/20 text-gray-300 text-xs px-4 py-2 rounded transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {/* QTableWidget Simulation */}
            <div className="bg-[#141414] rounded border border-white/10 overflow-hidden text-gray-300">
              <SmartTable
                tableId="pyside_secretarias"
                data={secretarias}
                searchPlaceholder="Pesquisar tabela de secretarias..."
                columns={[
                  { key: "id", label: "ID (PK)", isPinned: true },
                  { key: "codigo_legado", label: "Código Legado" },
                  { key: "nome", label: "Nome da Secretaria" },
                  { 
                    key: "ativo", 
                    label: "Ativo",
                    render: (item) => <span className="font-mono text-emerald-400">{item.ativo ? "TRUE" : "FALSE"}</span>
                  },
                  {
                    key: "acoes",
                    label: "Ações do Operador",
                    render: (item) => (
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditSecretaria(item)} className="p-1 hover:bg-white/10 text-indigo-400 rounded" title="Editar">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteSecretaria(item.id)} className="p-1 hover:bg-white/10 text-rose-400 rounded" title="Excluir">
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

        {/* --- TAB: UNIDADES --- */}
        {activeTab === "unidades" && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-white/10 pb-1">QFormLayout - Cadastro de Unidades</h4>
            
            {/* Form */}
            <form onSubmit={handleSaveUnidade} className="bg-[#1c1c1c] p-4 rounded border border-white/10 grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs font-sans text-gray-200">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Unidade Consumidora / Matrícula:</label>
                <input
                  type="number"
                  value={uniCodigo}
                  onChange={(e) => setUniCodigo(e.target.value)}
                  placeholder="EX: 10200"
                  className="pyside-input px-3 py-1.5 rounded text-xs font-mono bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Secretaria Vinculada:</label>
                <select
                  required
                  value={uniSecretariaId}
                  onChange={(e) => setUniSecretariaId(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Selecione...</option>
                  {secretarias.map(s => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Nome da Unidade:</label>
                <input
                  type="text"
                  required
                  value={uniNome}
                  onChange={(e) => setUniNome(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs uppercase bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Endereço:</label>
                <input
                  type="text"
                  value={uniEndereco}
                  onChange={(e) => setUniEndereco(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs uppercase bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-4 flex justify-end gap-2 border-t border-white/10 pt-3">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded transition"
                >
                  {editingUniId ? "Salvar Registro" : "Cadastrar Unidade"}
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
                    className="bg-white/10 hover:bg-white/20 text-gray-300 text-xs px-4 py-2 rounded transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {/* SmartTable */}
            <div className="bg-[#141414] rounded border border-white/10 overflow-hidden text-gray-300">
              <SmartTable
                tableId="pyside_unidades"
                data={unidades}
                searchPlaceholder="Pesquisar unidades gestoras no terminal..."
                onRowClick={(item) => setExpandedUnitId(expandedUnitId === item.id ? null : item.id)}
                isRowExpanded={(item) => expandedUnitId === item.id}
                expandedRowRender={(item) => <ExpandedUnitDetails unit={item} />}
                columns={[
                  { key: "id", label: "ID (PK)", isPinned: true },
                  { 
                    key: "codigo_legado", 
                    label: "Unidade Consumidora / UC", 
                    render: (item) => <span className="font-mono font-bold text-indigo-400">{item.codigo_legado || "None"}</span>
                  },
                  { key: "secretaria_nome", label: "Secretaria de Vinculação" },
                  { key: "nome", label: "Nome do Imóvel / Prédio" },
                  { key: "endereco", label: "Endereço Físico" },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleEditUnidade(item)} className="p-1 hover:bg-white/10 text-indigo-400 rounded">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteUnidade(item.id)} className="p-1 hover:bg-white/10 text-rose-400 rounded">
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

        {/* --- TAB: DESPESAS --- */}
        {activeTab === "despesas" && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-white/10 pb-1">QFormLayout - Cadastro de Tipos de Despesa</h4>
            
            {/* Form */}
            <form onSubmit={handleSaveDespesa} className="bg-[#1c1c1c] p-4 rounded border border-white/10 flex flex-col md:flex-row gap-4 items-end text-xs font-sans text-gray-200">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Código do Tipo:</label>
                <input
                  type="number"
                  value={desCodigo}
                  onChange={(e) => setDesCodigo(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs w-40 font-mono bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex-1 flex flex-col gap-1.5 w-full">
                <label className="font-semibold text-gray-300">Descrição do Fornecimento / Concessionária:</label>
                <input
                  type="text"
                  required
                  value={desDescricao}
                  onChange={(e) => setDesDescricao(e.target.value)}
                  placeholder="EX: TELEFONIA MÓVEL - TIM, ENERGIA CELESC"
                  className="pyside-input px-3 py-1.5 rounded text-xs w-full uppercase bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded transition"
                >
                  {editingDesId ? "Salvar" : "Cadastrar Despesa"}
                </button>
                {editingDesId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDesId(null);
                      setDesDescricao("");
                      setDesCodigo("");
                    }}
                    className="bg-white/10 hover:bg-white/20 text-gray-300 text-xs px-4 py-2 rounded transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {/* SmartTable */}
            <div className="bg-[#141414] rounded border border-white/10 overflow-hidden text-gray-300">
              <SmartTable
                tableId="pyside_despesas"
                data={despesas}
                searchPlaceholder="Pesquisar tipos de despesa..."
                columns={[
                  { key: "id", label: "ID (PK)", isPinned: true },
                  { key: "codigo_legado", label: "Cód. Legado" },
                  { key: "descricao", label: "Descrição do Fornecimento" },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditDespesa(item)} className="p-1 hover:bg-white/10 text-indigo-400 rounded">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteDespesa(item.id)} className="p-1 hover:bg-white/10 text-rose-400 rounded">
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

        {/* --- TAB: ITENS --- */}
        {activeTab === "itens" && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-white/10 pb-1">QFormLayout - Cadastro de Medidores e CODNUM</h4>
            
            {/* Form */}
            <form onSubmit={handleSaveItem} className="bg-[#1c1c1c] p-4 rounded border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs font-sans text-gray-200">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Código CODNUM:</label>
                <input
                  type="text"
                  required
                  value={itemCodigoNumero}
                  onChange={(e) => setItemCodigoNumero(e.target.value)}
                  placeholder="EX: CELESC-PREF-101"
                  className="pyside-input px-3 py-1.5 rounded text-xs font-mono uppercase bg-black border border-white/15 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Despesa (Tipo de Conta):</label>
                <select
                  required
                  value={itemDespesaId}
                  onChange={(e) => setItemDespesaId(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs bg-black border border-white/15 text-white focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {despesas.map(d => (
                    <option key={d.id} value={d.id}>{d.descricao}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Unidade Gestora Vinculada:</label>
                <select
                  required
                  value={itemUnidadeId}
                  onChange={(e) => setItemUnidadeId(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs bg-black border border-white/15 text-white focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Tipo de Linha (opcional):</label>
                <input
                  type="text"
                  value={itemTipoFone}
                  onChange={(e) => setItemTipoFone(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs uppercase bg-black border border-white/15 text-white focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-300">Número de Medidor (hidrômetro/telefone):</label>
                <input
                  type="text"
                  value={itemMedidor}
                  onChange={(e) => setItemMedidor(e.target.value)}
                  className="pyside-input px-3 py-1.5 rounded text-xs font-mono bg-black border border-white/15 text-white focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded transition"
                >
                  {editingItemId ? "Salvar" : "Salvar CODNUM"}
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
                    className="bg-white/10 hover:bg-white/20 text-gray-300 text-xs px-4 py-2 rounded transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {/* SmartTable */}
            <div className="bg-[#141414] rounded border border-white/10 overflow-hidden text-gray-300">
              <SmartTable
                tableId="pyside_itens"
                data={itens}
                searchPlaceholder="Buscar medidores..."
                columns={[
                  { key: "id", label: "ID (PK)", isPinned: true },
                  { key: "codigo_numero", label: "CODNUM" },
                  { key: "despesa_descricao", label: "Tipo de Conta" },
                  { key: "unidade_nome", label: "Unidade Gestora" },
                  { key: "medidor", label: "Medidor (MEDITM)" },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditItem(item)} className="p-1 hover:bg-white/10 text-indigo-400 rounded">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-1 hover:bg-white/10 text-rose-400 rounded">
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

        {/* --- TAB: LANÇAMENTOS --- */}
        {activeTab === "lancamentos" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono">Lançamentos Administrativos de Contratos (CODNUM)</h4>
              <div className="flex gap-1.5 bg-black/40 p-0.5 rounded border border-white/5 text-[10px]">
                <button
                  onClick={() => setLancamentoSubView("list")}
                  className={`px-3 py-1 rounded font-bold transition ${
                    lancamentoSubView === "list" 
                      ? "bg-indigo-600 text-white shadow" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  📄 Lista de Lançamentos
                </button>
                <button
                  onClick={() => setLancamentoSubView("new")}
                  className={`px-3 py-1 rounded font-bold transition ${
                    lancamentoSubView === "new" 
                      ? "bg-indigo-600 text-white shadow" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  ➕ Novo Lançamento / Importação
                </button>
              </div>
            </div>

            {lancamentoSubView === "new" ? (
              <div className="space-y-4">
                <DocumentManager 
                  currentUser={currentUser} 
                  onDocumentProcessed={() => {
                    notifyChange();
                    setLancamentoSubView("list");
                  }} 
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Form */}
                <form onSubmit={handleSaveLancamento} className="bg-[#1c1c1c] p-4 rounded border border-white/10 grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs font-sans text-gray-200">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-gray-300">Contrato CODNUM:</label>
                    <select
                      required
                      value={lancItemId}
                      onChange={(e) => setLancItemId(e.target.value)}
                      className="pyside-input px-3 py-1.5 rounded text-xs bg-black border border-white/15 text-white focus:outline-none"
                    >
                      <option value="">Selecione...</option>
                      {itens.map(it => (
                        <option key={it.id} value={it.id}>{it.codigo_numero} ({it.unidade_nome})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-gray-300">Competência (Mês/Ano):</label>
                    <input
                      type="date"
                      required
                      value={lancMesAno}
                      onChange={(e) => setLancMesAno(e.target.value)}
                      className="pyside-input px-3 py-1.5 rounded text-xs font-mono bg-black border border-white/15 text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-gray-300">Consumo:</label>
                    <input
                      type="number"
                      step="any"
                      value={lancConsumo}
                      onChange={(e) => setLancConsumo(e.target.value)}
                      className="pyside-input px-3 py-1.5 rounded text-xs font-mono bg-black border border-white/15 text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-gray-300">Valor Total (R$):</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={lancTotal}
                      onChange={(e) => setLancTotal(e.target.value)}
                      className="pyside-input px-3 py-1.5 rounded text-xs font-mono font-bold bg-black border border-white/15 text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-gray-300">Valor Imposto (R$):</label>
                    <input
                      type="number"
                      step="any"
                      value={lancImposto}
                      onChange={(e) => setLancImposto(e.target.value)}
                      className="pyside-input px-3 py-1.5 rounded text-xs font-mono bg-black border border-white/15 text-white focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-3 flex justify-end gap-2 border-t border-white/10 pt-3">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded transition"
                    >
                      {editingLancId ? "Salvar" : "Lançar Despesa"}
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
                        className="bg-white/10 hover:bg-white/20 text-gray-300 text-xs px-4 py-2 rounded transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>

                {/* SmartTable */}
                <div className="bg-[#141414] rounded border border-white/10 overflow-hidden text-gray-300">
                  <SmartTable
                    tableId="pyside_lancamentos"
                    data={lancamentos}
                    searchPlaceholder="Filtrar lançamentos mensais..."
                    columns={[
                      { key: "id", label: "ID (PK)", isPinned: true },
                      { 
                        key: "mes_ano", 
                        label: "Competência",
                        render: (item) => {
                          const dateObj = new Date(item.mes_ano);
                          return <span className="font-mono">{`${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`}</span>;
                        }
                      },
                      { key: "codigo_numero", label: "CODNUM" },
                      { key: "unidade_nome", label: "Unidade Gestora" },
                      { key: "consumo", label: "Consumo" },
                      { 
                        key: "valor_total", 
                        label: "Valor Total",
                        render: (item) => <span className="font-bold text-indigo-400 font-mono">R$ {item.valor_total.toFixed(2)}</span>
                      },
                      { 
                        key: "valor_imposto", 
                        label: "Imposto",
                        render: (item) => <span className="text-gray-400 font-mono">R$ {item.valor_imposto.toFixed(2)}</span>
                      },
                      {
                        key: "acoes",
                        label: "Ações",
                        render: (item) => (
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditLancamento(item)} className="p-1 hover:bg-white/10 text-indigo-400 rounded">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDeleteLancamento(item.id)} className="p-1 hover:bg-white/10 text-rose-400 rounded">
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
          </div>
        )}



        {/* --- TAB: AUDITORIA --- */}
        {activeTab === "auditoria" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-1">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono">QTableView - Controle de Auditoria</h4>
            </div>

            <div className="bg-[#141414] rounded border border-white/10 overflow-hidden text-gray-300">
              <SmartTable
                tableId="pyside_auditoria"
                data={auditorias}
                searchPlaceholder="Filtrar logs de auditoria..."
                columns={[
                  { key: "id", label: "ID (Log)", isPinned: true },
                  { key: "tabela", label: "Tabela" },
                  { key: "registro_pk", label: "Registro PK" },
                  { 
                    key: "acao", 
                    label: "Ação",
                    render: (item) => (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        item.acao === "INSERT" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/10" :
                        item.acao === "UPDATE" ? "bg-blue-500/15 text-blue-400 border border-blue-500/10" :
                        "bg-rose-500/15 text-rose-400 border border-rose-500/10"
                      }`}>
                        {item.acao}
                      </span>
                    )
                  },
                  { key: "usuario", label: "Usuário" },
                  { 
                    key: "criado_em", 
                    label: "Data/Hora",
                    render: (item) => <span className="font-mono text-gray-400">{new Date(item.criado_em).toLocaleString()}</span>
                  }
                ]}
              />
            </div>
          </div>
        )}

      </div>

      {/* 💻 Windows/Linux Status Bar */}
      <div className="bg-[#0a0a0a] border-t border-white/10 px-3 py-1.5 flex justify-between items-center font-mono text-[10px] text-gray-400 select-none">
        <div className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-emerald-500" />
          <span>{statusBarMsg}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>PORT: 3000</span>
          <span>SSL: ATIVO</span>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-indigo-400" />
            <span className="font-semibold text-gray-300 uppercase">{currentUser}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
