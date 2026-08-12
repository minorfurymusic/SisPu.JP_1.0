import React, { useState, useEffect, useMemo } from "react";
import { 
  Building2, Receipt, Lightbulb, Droplets, History,
  TrendingUp, BarChart3, ShieldAlert, Search, Edit2, Trash2,
  Layers, Plus, Trash, Calendar, FolderCheck, CheckCircle2, X,
  ClipboardList, Settings, Check, HelpCircle, Filter, FolderTree, Table
} from "lucide-react";
import { Secretaria, Unidade, Despesa, ItemDespesa, Lancamento, AuditoriaRegistro } from "../types";
import DocumentManager from "./DocumentManager";
import SmartTable, { SmartTableColumn } from "./SmartTable";
import FaturasTreeView from "./FaturasTreeView";
import EditFaturaModal from "./EditFaturaModal";

interface WebPortalProps {
  onRefreshTrigger?: number;
  onDataChanged?: () => void;
}

// Helper para renderizar badge da Concessionária (CELESC / CASAN)
const renderConcessionariaBadge = (desc?: string) => {
  const d = (desc || "").toUpperCase();
  if (d.includes("CASAN") || d.includes("ÁGUA") || d.includes("AGUA")) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
        💧 CASAN
      </span>
    );
  }
  if (d.includes("CELESC") || d.includes("ENERGIA") || d.includes("LUZ")) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        ⚡ CELESC
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-500/20">
      {desc || "N/A"}
    </span>
  );
};

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
    "dashboard" | "secretarias" | "unidades" | "despesas" | "itens" | "lancamentos" | "documentos" | "auditoria"
  >("dashboard");

  const [chartMode, setChartMode] = useState<'energia' | 'agua'>('energia');

  // Hover Actions State
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);

  // Form edit modes and states
  const [formModal, setFormModal] = useState<'secretaria' | 'unidade' | 'despesa' | 'item' | null>(null);

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
  const [modalEditItem, setModalEditItem] = useState<any | null>(null);
  const [lancItemId, setLancItemId] = useState("");
  const [lancMesAno, setLancMesAno] = useState("");
  const [lancConsumo, setLancConsumo] = useState("");
  const [lancTotal, setLancTotal] = useState("");
  const [lancImposto, setLancImposto] = useState("");
  const [lancamentoSubView, setLancamentoSubView] = useState<'list' | 'new'>('list');
  const [faturasViewMode, setFaturasViewMode] = useState<'tree' | 'table'>('tree');

  // CODNUM Filter & View Mode
  const [itemConcessionariaFilter, setItemConcessionariaFilter] = useState<'ambos' | 'celesc' | 'casan'>('ambos');
  const [itemViewMode, setItemViewMode] = useState<'tabela' | 'arvore'>('tabela');

  // Unidades Gestoras Concessionária Filter
  const [unidadesConcessionariaFilter, setUnidadesConcessionariaFilter] = useState<'ambos' | 'celesc' | 'casan'>('ambos');

  const filteredUnidades = useMemo(() => {
    return unidades.filter(u => {
      if (!u) return false;
      if (unidadesConcessionariaFilter === 'ambos') return true;
      
      const uConcess = (u.concessionaria || "").toUpperCase();
      const isDirectMatch = unidadesConcessionariaFilter === 'celesc'
        ? (uConcess.includes("CELESC") || uConcess.includes("ENERGIA") || uConcess.includes("LUZ"))
        : (uConcess.includes("CASAN") || uConcess.includes("ÁGUA") || uConcess.includes("AGUA"));

      if (isDirectMatch) return true;

      // Check linked items
      const unitItens = itens.filter(i => String(i.unidade_id) === String(u.id));
      return unitItens.some(i => {
        const desc = (i.despesa_descricao || "").toUpperCase();
        if (unidadesConcessionariaFilter === 'celesc') {
          return desc.includes("CELESC") || desc.includes("ENERGIA") || desc.includes("LUZ");
        } else {
          return desc.includes("CASAN") || desc.includes("ÁGUA") || desc.includes("AGUA");
        }
      });
    });
  }, [unidades, unidadesConcessionariaFilter, itens]);

  const filteredItens = useMemo(() => {
    return itens.filter(item => {
      if (!item) return false;
      const desc = (item.despesa_descricao || "").toUpperCase();
      if (itemConcessionariaFilter === 'celesc') {
        return desc.includes("CELESC") || desc.includes("ENERGIA") || desc.includes("LUZ");
      }
      if (itemConcessionariaFilter === 'casan') {
        return desc.includes("CASAN") || desc.includes("ÁGUA") || desc.includes("AGUA");
      }
      return true;
    });
  }, [itens, itemConcessionariaFilter]);

  const celescItens = useMemo(() => {
    return itens.filter(i => {
      const desc = (i?.despesa_descricao || "").toUpperCase();
      return desc.includes("CELESC") || desc.includes("ENERGIA") || desc.includes("LUZ");
    });
  }, [itens]);

  const casanItens = useMemo(() => {
    return itens.filter(i => {
      const desc = (i?.despesa_descricao || "").toUpperCase();
      return desc.includes("CASAN") || desc.includes("ÁGUA") || desc.includes("AGUA");
    });
  }, [itens]);

  const outrosItens = useMemo(() => {
    return itens.filter(i => {
      const desc = (i?.despesa_descricao || "").toUpperCase();
      const isCelesc = desc.includes("CELESC") || desc.includes("ENERGIA") || desc.includes("LUZ");
      const isCasan = desc.includes("CASAN") || desc.includes("ÁGUA") || desc.includes("AGUA");
      return !isCelesc && !isCasan;
    });
  }, [itens]);

  // Status/Notifications
  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");

  // Confirmation Modal
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

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
  const handleOpenCreateSecretaria = () => {
    setEditingSecId(null);
    setSecNome("");
    setSecCodigo("");
    setFormModal('secretaria');
  };

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
        setFormModal(null);
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
    if (!s || !s.id) return;
    setEditingSecId(s.id);
    setSecNome(s.nome);
    setSecCodigo(s.codigo_legado ? String(s.codigo_legado) : "");
    setFormModal('secretaria');
  };

  const handleDeleteSecretaria = (id: string) => {
    if (!id) return;
    const s = secretarias.find(x => String(x?.id) === String(id));

    setDeleteModal({
      isOpen: true,
      title: "Excluir Secretaria",
      description: `Tem certeza que deseja excluir a secretaria "${s?.nome || id}"?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/secretarias/${id}`, {
            method: "DELETE",
            headers: { "x-user": "gestor_web" }
          });
          if (res.ok) {
            showSuccess(`Secretaria "${s?.nome || id}" excluída com sucesso.`);
            notifyChange();
          } else {
            const err = await res.json().catch(() => ({}));
            showError(err.error || "Erro ao excluir secretaria.");
          }
        } catch (err: any) {
          showError(err.message || "Erro de conexão ao excluir.");
        }
      }
    });
  };

  // Unidades
  const handleOpenCreateUnidade = () => {
    setEditingUniId(null);
    setUniNome("");
    setUniSecretariaId("");
    setUniEndereco("");
    setUniCodigo("");
    setFormModal('unidade');
  };

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
        codigo_legado: uniCodigo ? parseInt(uniCodigo) : undefined,
        uc: uniCodigo || undefined,
        codnum: uniCodigo || undefined
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
        setFormModal(null);
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
    if (!u || !u.id) return;
    setEditingUniId(u.id);
    setUniNome(u.nome);
    setUniSecretariaId(u.secretaria_id || "");
    setUniEndereco(u.endereco || "");
    setUniCodigo(u.codigo_legado ? String(u.codigo_legado) : "");
    setFormModal('unidade');
  };

  const handleDeleteUnidade = (id: string) => {
    if (!id) return;
    const u = unidades.find(x => String(x?.id) === String(id));

    setDeleteModal({
      isOpen: true,
      title: "Excluir Unidade",
      description: `Tem certeza que deseja excluir a unidade "${u?.nome || id}"?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/unidades/${id}`, {
            method: "DELETE",
            headers: { "x-user": "gestor_web" }
          });
          if (res.ok) {
            showSuccess(`Unidade "${u?.nome || id}" excluída com sucesso.`);
            notifyChange();
          } else {
            const err = await res.json().catch(() => ({}));
            showError(err.error || "Erro ao excluir unidade.");
          }
        } catch (err: any) {
          showError(err.message || "Erro de conexão ao excluir.");
        }
      }
    });
  };

  // Despesas
  const handleOpenCreateDespesa = () => {
    setEditingDesId(null);
    setDesDescricao("");
    setDesCodigo("");
    setFormModal('despesa');
  };

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
        setFormModal(null);
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
    if (!d || !d.id) return;
    setEditingDesId(d.id);
    setDesDescricao(d.descricao);
    setDesCodigo(d.codigo_legado ? String(d.codigo_legado) : "");
    setFormModal('despesa');
  };

  const handleDeleteDespesa = (id: string) => {
    if (!id) return;
    const d = despesas.find(x => String(x?.id) === String(id));

    setDeleteModal({
      isOpen: true,
      title: "Excluir Despesa",
      description: `Tem certeza que deseja excluir a despesa "${d?.descricao || id}"?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/despesas/${id}`, {
            method: "DELETE",
            headers: { "x-user": "gestor_web" }
          });
          if (res.ok) {
            showSuccess(`Despesa "${d?.descricao || id}" excluída com sucesso.`);
            notifyChange();
          } else {
            const err = await res.json().catch(() => ({}));
            showError(err.error || "Erro ao excluir despesa.");
          }
        } catch (err: any) {
          showError(err.message || "Erro de conexão ao excluir.");
        }
      }
    });
  };

  // Itens de Despesa / CODNUM Contracts
  const handleOpenCreateItem = () => {
    setEditingItemId(null);
    setItemCodigoNumero("");
    setItemDespesaId("");
    setItemUnidadeId("");
    setItemTipoFone("");
    setItemMedidor("");
    setFormModal('item');
  };

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
        setFormModal(null);
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
    if (!it || !it.id) return;
    setEditingItemId(it.id);
    setItemCodigoNumero(it.codigo_numero);
    setItemDespesaId(it.despesa_id);
    setItemUnidadeId(it.unidade_id);
    setItemTipoFone(it.tipo_fone || "");
    setItemMedidor(it.medidor || "");
    setFormModal('item');
  };

  const handleDeleteItem = (id: string) => {
    if (!id) return;
    const it = itens.find(x => String(x?.id) === String(id));

    setDeleteModal({
      isOpen: true,
      title: "Excluir Contrato",
      description: `Tem certeza que deseja excluir o contrato "${it?.codigo_numero || id}"?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/itens_despesas/${id}`, {
            method: "DELETE",
            headers: { "x-user": "gestor_web" }
          });
          if (res.ok) {
            showSuccess(`Contrato "${it?.codigo_numero || id}" excluído com sucesso.`);
            notifyChange();
          } else {
            const err = await res.json().catch(() => ({}));
            showError(err.error || "Erro ao excluir contrato.");
          }
        } catch (err: any) {
          showError(err.message || "Erro de conexão ao excluir.");
        }
      }
    });
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
    if (!l) return;
    setModalEditItem(l);
  };

  const handleDeleteLancamento = (id: string) => {
    if (!id) return;
    const l = lancamentos.find(x => String(x?.id) === String(id) || String(x?.doc_id) === String(id));
    const label = l ? `${l.codigo_numero || 'Fatura'} - ${l.mes_ano ? l.mes_ano.substring(0,7) : id}` : id;

    setDeleteModal({
      isOpen: true,
      title: "Excluir Lançamento / Fatura",
      description: `Tem certeza que deseja excluir o lançamento "${label}"? Esta ação removerá a fatura permanentemente.`,
      onConfirm: async () => {
        try {
          let res = await fetch(`/api/lancamentos/${id}`, {
            method: "DELETE",
            headers: { "x-user": "gestor_web" }
          });

          if (!res.ok && res.status === 404) {
            res = await fetch(`/api/documentos/${id}`, {
              method: "DELETE",
              headers: { "x-user": "gestor_web" }
            });
          }

          if (res.ok) {
            showSuccess("Fatura / Lançamento excluído com sucesso.");
            setLancamentos(prev => prev.filter(item => String(item?.id) !== String(id) && String((item as any)?.doc_id) !== String(id)));
            notifyChange();
          } else {
            const err = await res.json().catch(() => ({}));
            showError(err.error || "Erro ao excluir fatura.");
          }
        } catch (err: any) {
          showError(err.message || "Erro de conexão ao excluir.");
        }
      }
    });
  };

  const handleDeleteMonth = (monthKey: string, items: any[], monthLabel: string) => {
    if (!items || items.length === 0) return;

    setDeleteModal({
      isOpen: true,
      title: `Excluir Mês Completo (${monthLabel})`,
      description: `Atenção: Você está prestes a excluir TODOS os ${items.length} lançamento(s) do mês de ${monthLabel}. Esta ação removerá permanentemente todas as faturas deste mês. Deseja continuar?`,
      onConfirm: async () => {
        try {
          let successCount = 0;
          let failCount = 0;

          for (const item of items) {
            const targetId = item.id || item.doc_id;
            if (!targetId) continue;

            let res = await fetch(`/api/lancamentos/${targetId}`, {
              method: "DELETE",
              headers: { "x-user": "gestor_web" }
            });

            if (!res.ok && res.status === 404) {
              res = await fetch(`/api/documentos/${targetId}`, {
                method: "DELETE",
                headers: { "x-user": "gestor_web" }
              });
            }

            if (res.ok) {
              successCount++;
            } else {
              failCount++;
            }
          }

          if (successCount > 0) {
            showSuccess(`${successCount} lançamento(s) do mês ${monthLabel} foram excluídos com sucesso.`);
            loadAllData();
            notifyChange();
          }
          if (failCount > 0) {
            showError(`Não foi possível excluir ${failCount} lançamento(s).`);
          }
        } catch (err: any) {
          showError("Erro de conexão ao processar exclusão do mês.");
        }
      }
    });
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

  const availableYears = React.useMemo(() => {
    const yearsSet = new Set<number>();
    lancamentos.forEach(l => {
      if (l && l.mes_ano) {
        const year = parseInt(String(l.mes_ano).substring(0, 4), 10);
        if (!isNaN(year) && year > 1900 && year < 2100) {
          yearsSet.add(year);
        }
      }
    });
    const list = Array.from(yearsSet).sort((a, b) => b - a);
    if (list.length === 0) {
      list.push(2026);
    }
    return list;
  }, [lancamentos]);

  const [selectedYear, setSelectedYear] = useState<number>(2026);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears]);

  const yearlyChartData = React.useMemo(() => {
    return monthNames.map((mName, idx) => {
      const monthNumStr = String(idx + 1).padStart(2, '0');
      const refPrefix = `${selectedYear}-${monthNumStr}`;

      const matches = lancamentos.filter(l => {
        if (!l || !l.mes_ano) return false;
        return String(l.mes_ano).substring(0, 7) === refPrefix;
      });

      const filterCelesc = matches.filter(l => {
        const desc = (l.despesa_descricao || "").toUpperCase();
        const cod = (l.codigo_numero || "").toUpperCase();
        const id = String(l.despesa_id || "");
        return desc.includes("CELESC") || desc.includes("ENERGIA") || cod.includes("CELESC") || id === "1" || (!id && !desc.includes("CASAN"));
      });

      const filterCasan = matches.filter(l => {
        const desc = (l.despesa_descricao || "").toUpperCase();
        const cod = (l.codigo_numero || "").toUpperCase();
        const id = String(l.despesa_id || "");
        return desc.includes("CASAN") || desc.includes("ÁGUA") || desc.includes("AGUA") || cod.includes("CASAN") || id === "2";
      });

      const listToUse = chartMode === 'energia' ? filterCelesc : filterCasan;

      const consumo = listToUse.reduce((acc, l) => acc + Number(l.consumo || 0), 0);
      const valor_total = listToUse.reduce((acc, l) => acc + Number(l.valor_total || 0), 0);
      const valor_imposto = listToUse.reduce((acc, l) => acc + Number(l.valor_imposto || 0), 0);
      const energia_injetada = chartMode === 'energia' ? listToUse.reduce((acc, l) => acc + Number(l.energia_injetada || 0), 0) : 0;
      const desperdicio = 0;

      return {
        monthIndex: idx,
        label: mName,
        monthFull: `${mName} / ${selectedYear}`,
        count: listToUse.length,
        consumo,
        valor_total,
        valor_imposto,
        energia_injetada,
        desperdicio
      };
    });
  }, [lancamentos, selectedYear, chartMode]);

  const chartMaxes = React.useMemo(() => {
    const maxConsumo = Math.max(...yearlyChartData.map(d => d.consumo), 1);
    const maxValor = Math.max(...yearlyChartData.map(d => d.valor_total), 1);
    const maxImposto = Math.max(...yearlyChartData.map(d => d.valor_imposto), 1);
    const maxInjetada = Math.max(...yearlyChartData.map(d => d.energia_injetada), 1);
    return { maxConsumo, maxValor, maxImposto, maxInjetada };
  }, [yearlyChartData]);

  // --- NESTED COMPONENT FOR EXPANDABLE UNIT DETAILS ---
  function ExpandedUnitDetails({ unit }: { unit: any }) {
    if (!unit || !unit.id) return null;
    const unitItems = itens.filter(it => it && it.unidade_id === unit.id);
    
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
              <div key={it?.id || it?.codigo_numero || `item-${Math.random()}`} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3 hover:border-slate-300 transition">
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
                      {latestLanc ? `R$ ${latestLanc.valor_total.toFixed(2)}` : "R$ 0,00"}
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
            {/* Full Width Annual Chart Section */}
            <div className="bg-[#0f0f0f] p-6 rounded-xl border border-white/10 shadow-lg space-y-5 w-full">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h4 className="font-bold text-white text-xl">Histórico</h4>
                  
                  <div className="flex items-center gap-2 bg-[#141414] px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-gray-300">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[11px]">Ano:</span>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="bg-[#0a0a0a] border border-white/20 rounded px-2.5 py-0.5 font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-xs"
                    >
                      {availableYears.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-1.5 bg-[#141414] p-1 rounded-lg border border-white/10 text-xs font-semibold">
                  <button
                    onClick={() => setChartMode('energia')}
                    className={`px-3 py-1.5 rounded transition ${chartMode === 'energia' ? 'bg-amber-500 text-black font-bold shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                    Energia (Celesc kWh)
                  </button>
                  <button
                    onClick={() => setChartMode('agua')}
                    className={`px-3 py-1.5 rounded transition ${chartMode === 'agua' ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                    Água (Casan m³)
                  </button>
                </div>
              </div>

              {/* Chart Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-300 bg-[#141414] p-3 rounded-lg border border-white/10">
                <div className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm inline-block shadow-sm ${chartMode === 'energia' ? 'bg-amber-400' : 'bg-blue-500'}`}></span>
                  <span>Consumo ({chartMode === 'energia' ? 'kWh' : 'm³'})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block shadow-sm"></span>
                  <span>Valor Total (R$)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block shadow-sm"></span>
                  <span>Imposto (R$)</span>
                </div>
                {chartMode === 'energia' && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-sky-400 inline-block shadow-sm"></span>
                      <span>Energia Injetada (kWh)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-rose-400 inline-block shadow-sm"></span>
                      <span>Desperdício</span>
                    </div>
                  </>
                )}
              </div>

              {/* Chart Display Area (Annual 12 Months) */}
              <div className="pt-2">
                <div className="relative h-64 border-b border-white/10 pb-2 flex items-end justify-between gap-1 sm:gap-2">
                  {/* Grid Lines */}
                  <div className="absolute left-0 right-0 top-1/4 border-t border-white/5 border-dashed pointer-events-none"></div>
                  <div className="absolute left-0 right-0 top-2/4 border-t border-white/5 border-dashed pointer-events-none"></div>
                  <div className="absolute left-0 right-0 top-3/4 border-t border-white/5 border-dashed pointer-events-none"></div>

                  {yearlyChartData.map((d) => {
                    const hConsumo = d.consumo > 0 ? Math.max(6, (d.consumo / chartMaxes.maxConsumo) * 100) : 0;
                    const hValor = d.valor_total > 0 ? Math.max(6, (d.valor_total / chartMaxes.maxValor) * 100) : 0;
                    const hImposto = d.valor_imposto > 0 ? Math.max(6, (d.valor_imposto / chartMaxes.maxImposto) * 100) : 0;
                    const hInjetada = d.energia_injetada > 0 ? Math.max(6, (d.energia_injetada / chartMaxes.maxInjetada) * 100) : 0;
                    const hDesperdicio = d.desperdicio > 0 ? Math.max(6, d.desperdicio) : 0;

                    const unitStr = chartMode === 'energia' ? 'kWh' : 'm³';

                    return (
                      <div key={d.monthIndex} className="flex-1 flex flex-col items-center group relative h-full justify-end px-0.5 sm:px-1">
                        {/* Tooltip on Hover */}
                        <div className="absolute bottom-full mb-2 bg-[#181818] border border-white/20 text-white text-[11px] p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none shadow-2xl z-30 whitespace-nowrap min-w-[160px]">
                          <span className="font-bold text-gray-200 block border-b border-white/10 pb-1 mb-1 font-mono">
                            {d.monthFull} ({d.count} fatura{d.count !== 1 ? 's' : ''})
                          </span>
                          <div className="space-y-0.5 text-[10px]">
                            <div className="flex justify-between gap-2 text-amber-300">
                              <span>Consumo:</span>
                              <span className="font-bold font-mono">{d.consumo.toLocaleString('pt-BR')} {unitStr}</span>
                            </div>
                            <div className="flex justify-between gap-2 text-emerald-300">
                              <span>Valor Total:</span>
                              <span className="font-bold font-mono">R$ {d.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between gap-2 text-indigo-300">
                              <span>Impostos:</span>
                              <span className="font-bold font-mono">R$ {d.valor_imposto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            {chartMode === 'energia' && (
                              <>
                                <div className="flex justify-between gap-2 text-sky-300">
                                  <span>Energia Injetada:</span>
                                  <span className="font-bold font-mono">{d.energia_injetada.toLocaleString('pt-BR')} kWh</span>
                                </div>
                                <div className="flex justify-between gap-2 text-rose-300">
                                  <span>Desperdício:</span>
                                  <span className="font-bold font-mono">{d.desperdicio} kWh</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Multi-Column Group */}
                        <div className="w-full h-full flex items-end justify-center gap-0.5 sm:gap-1">
                          {/* Consumo Bar */}
                          <div
                            style={{ height: `${hConsumo}%` }}
                            className={`flex-1 rounded-t-sm transition-all duration-300 ${
                              d.consumo > 0 
                                ? (chartMode === 'energia' ? 'bg-amber-400 hover:bg-amber-300' : 'bg-blue-500 hover:bg-blue-400') 
                                : 'bg-white/5'
                            }`}
                            title={`Consumo: ${d.consumo} ${unitStr}`}
                          />
                          {/* Valor Total Bar */}
                          <div
                            style={{ height: `${hValor}%` }}
                            className={`flex-1 rounded-t-sm transition-all duration-300 ${d.valor_total > 0 ? 'bg-emerald-400 hover:bg-emerald-300' : 'bg-white/5'}`}
                            title={`Valor: R$ ${d.valor_total}`}
                          />
                          {/* Imposto Bar */}
                          <div
                            style={{ height: `${hImposto}%` }}
                            className={`flex-1 rounded-t-sm transition-all duration-300 ${d.valor_imposto > 0 ? 'bg-indigo-400 hover:bg-indigo-300' : 'bg-white/5'}`}
                            title={`Imposto: R$ ${d.valor_imposto}`}
                          />
                          {/* Celesc Specific Columns */}
                          {chartMode === 'energia' && (
                            <>
                              {/* Energia Injetada Bar */}
                              <div
                                style={{ height: `${hInjetada}%` }}
                                className={`flex-1 rounded-t-sm transition-all duration-300 ${d.energia_injetada > 0 ? 'bg-sky-400 hover:bg-sky-300' : 'bg-white/5'}`}
                                title={`Energia Injetada: ${d.energia_injetada} kWh`}
                              />
                              {/* Desperdício Bar */}
                              <div
                                style={{ height: `${hDesperdicio}%` }}
                                className={`flex-1 rounded-t-sm transition-all duration-300 ${d.desperdicio > 0 ? 'bg-rose-400 hover:bg-rose-300' : 'bg-white/5'}`}
                                title={`Desperdício: ${d.desperdicio}`}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Month Labels (12 Months) */}
                <div className="flex justify-between pt-2 px-0.5 text-xs font-bold text-gray-400 font-mono">
                  {yearlyChartData.map((d) => (
                    <span key={d.monthIndex} className="flex-1 text-center text-[10px] sm:text-xs">
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* SECTION: SECRETARIAS */}
        {activeSection === 'secretarias' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#121212] p-5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-500" />
                  Secretarias Cadastradas
                </h4>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Gerencie a estrutura administrativa municipal e códigos legados
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateSecretaria}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm hover:shadow flex items-center gap-2 transition active:scale-95 shrink-0"
              >
                <Plus className="h-4 w-4" />
                Nova Secretaria
              </button>
            </div>

            <div className="bg-white dark:bg-[#0f0f0f] p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <SmartTable
                tableId="web_secretarias"
                data={secretarias}
                searchPlaceholder="Filtrar por nome ou código..."
                columns={[
                  { key: "codigo_legado", label: "Cód. Legado", searchable: true },
                  { key: "nome", label: "Nome da Secretaria", searchable: true },
                  { 
                    key: "ativo", 
                    label: "Status",
                    render: (item) => (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item?.ativo ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                        {item?.ativo ? "Ativo" : "Inativo"}
                      </span>
                    )
                  },
                  {
                    key: "acoes",
                    label: "Ações do Gestor",
                    render: (item) => (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => item && handleEditSecretaria(item)}
                          className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                          title="Editar cadastro"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => item?.id && handleDeleteSecretaria(item.id)}
                          className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
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
            <div className="bg-white dark:bg-[#121212] p-5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-500" />
                  Unidades Gestoras Cadastradas
                </h4>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Clique em qualquer linha para abrir a expansão hierárquica e gerenciar as abas de faturamento
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateUnidade}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm hover:shadow flex items-center gap-2 transition active:scale-95 shrink-0"
              >
                <Plus className="h-4 w-4" />
                Nova Unidade Gestora
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-[#121212] p-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <span className="text-xs font-bold text-slate-500 dark:text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Filter className="h-3.5 w-3.5 text-indigo-500" />
                  Filtrar Concessionária:
                </span>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/40 p-1 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold">
                  <button
                    onClick={() => setUnidadesConcessionariaFilter('ambos')}
                    className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                      unidadesConcessionariaFilter === 'ambos'
                        ? "bg-emerald-600 text-white shadow-sm font-bold"
                        : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Ambos (Celesc + Casan)
                  </button>
                  <button
                    onClick={() => setUnidadesConcessionariaFilter('celesc')}
                    className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                      unidadesConcessionariaFilter === 'celesc'
                        ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                        : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    }`}
                  >
                    ⚡ CELESC (Energia)
                  </button>
                  <button
                    onClick={() => setUnidadesConcessionariaFilter('casan')}
                    className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                      unidadesConcessionariaFilter === 'casan'
                        ? "bg-sky-600 text-white font-bold shadow-sm"
                        : "text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                    }`}
                  >
                    💧 CASAN (Água)
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#0f0f0f] p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <SmartTable
                tableId="web_unidades"
                data={filteredUnidades}
                searchPlaceholder="Pesquisar por UC, matrícula, nome ou secretaria..."
                onRowClick={(item) => item?.id && setExpandedUnitId(expandedUnitId === item.id ? null : item.id)}
                isRowExpanded={(item) => Boolean(item?.id && expandedUnitId === item.id)}
                expandedRowRender={(item) => item ? <ExpandedUnitDetails unit={item} /> : null}
                columns={[
                  { 
                    key: "codigo_legado", 
                    label: "Unidade Consumidora / UC", 
                    searchable: true,
                    render: (item) => {
                      const displayUC = (item?.uc && item.uc !== "N/A") ? item.uc : 
                                        (item?.codnum && item.codnum !== "N/A") ? item.codnum : 
                                        (item?.codigo_legado && item.codigo_legado !== "None" && item.codigo_legado !== "N/A") ? String(item.codigo_legado) : "None";
                      return <span className="font-bold text-slate-900 dark:text-white font-mono">{displayUC}</span>;
                    }
                  },
                  {
                    key: "concessionaria",
                    label: "Concessionária",
                    searchable: true,
                    render: (item) => {
                      if (!item) return null;
                      if (item.concessionaria) {
                        return renderConcessionariaBadge(item.concessionaria);
                      }
                      const unitItens = itens.filter(i => String(i.unidade_id) === String(item.id));
                      if (unitItens.length > 0) {
                        const despesasDescs: string[] = Array.from(new Set<string>(unitItens.map(i => (i.despesa_descricao || '') as string).filter(Boolean)));
                        if (despesasDescs.length > 0) {
                          return (
                            <div className="flex flex-wrap gap-1">
                              {despesasDescs.map((desc: string, idx: number) => (
                                <React.Fragment key={idx}>{renderConcessionariaBadge(desc)}</React.Fragment>
                              ))}
                            </div>
                          );
                        }
                      }
                      return renderConcessionariaBadge(item.concessionaria);
                    }
                  },
                  { key: "secretaria_nome", label: "Secretaria de Vinculação", searchable: true },
                  { 
                    key: "nome", 
                    label: "Nome do Imóvel / Prédio", 
                    searchable: true,
                    render: (item) => <span className="font-bold text-slate-800 dark:text-gray-200">{item?.nome}</span>
                  },
                  { key: "endereco", label: "Endereço", searchable: true },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => item && handleEditUnidade(item)}
                          className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                          title="Editar unidade"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => item?.id && handleDeleteUnidade(item.id)}
                          className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                          title="Excluir unidade"
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
            <div className="bg-white dark:bg-[#121212] p-5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-indigo-500" />
                  Tipos de Conta Cadastrados
                </h4>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Gerencie as concessionárias e modalidades de serviços contratados
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateDespesa}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm hover:shadow flex items-center gap-2 transition active:scale-95 shrink-0"
              >
                <Plus className="h-4 w-4" />
                Novo Tipo de Conta
              </button>
            </div>

            <div className="bg-white dark:bg-[#0f0f0f] p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <SmartTable
                tableId="web_despesas"
                data={despesas}
                searchPlaceholder="Buscar por concessionária..."
                columns={[
                  { key: "codigo_legado", label: "Cód. Legado", searchable: true },
                  { 
                    key: "concessionaria", 
                    label: "Concessionária", 
                    searchable: true,
                    render: (item) => renderConcessionariaBadge(item?.descricao)
                  },
                  { key: "descricao", label: "Descrição", searchable: true },
                  {
                    key: "acoes",
                    label: "Ações",
                    render: (item) => (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => item && handleEditDespesa(item)}
                          className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                          title="Editar despesa"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => item?.id && handleDeleteDespesa(item.id)}
                          className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                          title="Excluir despesa"
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

        {/* SECTION: CONTRATOS CODNUM */}
        {activeSection === 'itens' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#121212] p-5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-indigo-500" />
                  Identificadores CODNUM Cadastrados
                </h4>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Gerencie os medidores e contratos vinculados às concessionárias e unidades
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateItem}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm hover:shadow flex items-center gap-2 transition active:scale-95 shrink-0"
              >
                <Plus className="h-4 w-4" />
                Novo Contrato CODNUM
              </button>
            </div>

            {/* Filter Bar & View Mode Switcher */}
            <div className="bg-white dark:bg-[#121212] p-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <span className="text-xs font-bold text-slate-500 dark:text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Filter className="h-3.5 w-3.5 text-indigo-500" />
                  Filtrar Concessionária:
                </span>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/40 p-1 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold">
                  <button
                    onClick={() => setItemConcessionariaFilter('ambos')}
                    className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                      itemConcessionariaFilter === 'ambos'
                        ? "bg-emerald-600 text-white shadow-sm font-bold"
                        : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Ambos (Celesc + Casan)
                  </button>
                  <button
                    onClick={() => setItemConcessionariaFilter('celesc')}
                    className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                      itemConcessionariaFilter === 'celesc'
                        ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                        : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    }`}
                  >
                    ⚡ CELESC (Energia)
                  </button>
                  <button
                    onClick={() => setItemConcessionariaFilter('casan')}
                    className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                      itemConcessionariaFilter === 'casan'
                        ? "bg-sky-600 text-white font-bold shadow-sm"
                        : "text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                    }`}
                  >
                    💧 CASAN (Água)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-black/40 p-1 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold shrink-0">
                <button
                  onClick={() => setItemViewMode('tabela')}
                  className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                    itemViewMode === 'tabela'
                      ? "bg-indigo-600 text-white shadow-sm font-bold"
                      : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Table className="h-3.5 w-3.5" />
                  Visão em Tabela
                </button>
                <button
                  onClick={() => setItemViewMode('arvore')}
                  className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                    itemViewMode === 'arvore'
                      ? "bg-indigo-600 text-white shadow-sm font-bold"
                      : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <FolderTree className="h-3.5 w-3.5" />
                  Árvore por Concessionária
                </button>
              </div>
            </div>

            {/* View Mode Content */}
            {itemViewMode === 'arvore' ? (
              <div className="space-y-6">
                {/* CELESC Tree Card */}
                {(itemConcessionariaFilter === 'ambos' || itemConcessionariaFilter === 'celesc') && (
                  <div className="bg-white dark:bg-[#0f0f0f] rounded-xl border border-amber-500/30 overflow-hidden shadow-sm">
                    <div className="bg-amber-500/10 p-4 border-b border-amber-500/20 flex justify-between items-center">
                      <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400 text-sm">
                        <span>⚡ CELESC — ENERGIA ELÉTRICA</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-500/30">
                          {celescItens.length} contrato(s)
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      {celescItens.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-gray-400 italic p-2">Nenhum contrato da Celesc cadastrado.</p>
                      ) : (
                        <SmartTable
                          tableId="web_itens_celesc"
                          data={celescItens}
                          searchPlaceholder="Pesquisar contratos Celesc..."
                          columns={[
                            { 
                              key: "concessionaria", 
                              label: "Concessionária", 
                              searchable: true,
                              render: (item) => renderConcessionariaBadge(item?.despesa_descricao)
                            },
                            { 
                              key: "codigo_numero", 
                              label: "CODNUM", 
                              searchable: true,
                              render: (item) => <span className="font-bold font-mono text-slate-900 dark:text-white">{item?.codigo_numero}</span>
                            },
                            { key: "unidade_nome", label: "Unidade Gestora", searchable: true },
                            { 
                              key: "medidor", 
                              label: "Medidor (MEDITM)", 
                              searchable: true,
                              render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">{item?.medidor || "N/A"}</span>
                            },
                            { 
                              key: "tipo_fone", 
                              label: "Linha / Suporte", 
                              searchable: true,
                              render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{item?.tipo_fone || "N/A"}</span>
                            },
                            {
                              key: "acoes",
                              label: "Ações",
                              render: (item) => (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => item && handleEditItem(item)}
                                    className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                                    title="Editar contrato CODNUM"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => item?.id && handleDeleteItem(item.id)}
                                    className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                                    title="Excluir contrato CODNUM"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            }
                          ]}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* CASAN Tree Card */}
                {(itemConcessionariaFilter === 'ambos' || itemConcessionariaFilter === 'casan') && (
                  <div className="bg-white dark:bg-[#0f0f0f] rounded-xl border border-sky-500/30 overflow-hidden shadow-sm">
                    <div className="bg-sky-500/10 p-4 border-b border-sky-500/20 flex justify-between items-center">
                      <div className="flex items-center gap-2 font-bold text-sky-700 dark:text-sky-400 text-sm">
                        <span>💧 CASAN — ÁGUA E SANEAMENTO</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 border border-sky-500/30">
                          {casanItens.length} contrato(s)
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      {casanItens.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-gray-400 italic p-2">Nenhum contrato da Casan cadastrado.</p>
                      ) : (
                        <SmartTable
                          tableId="web_itens_casan"
                          data={casanItens}
                          searchPlaceholder="Pesquisar contratos Casan..."
                          columns={[
                            { 
                              key: "concessionaria", 
                              label: "Concessionária", 
                              searchable: true,
                              render: (item) => renderConcessionariaBadge(item?.despesa_descricao)
                            },
                            { 
                              key: "codigo_numero", 
                              label: "CODNUM", 
                              searchable: true,
                              render: (item) => <span className="font-bold font-mono text-slate-900 dark:text-white">{item?.codigo_numero}</span>
                            },
                            { key: "unidade_nome", label: "Unidade Gestora", searchable: true },
                            { 
                              key: "medidor", 
                              label: "Medidor (MEDITM)", 
                              searchable: true,
                              render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">{item?.medidor || "N/A"}</span>
                            },
                            { 
                              key: "tipo_fone", 
                              label: "Linha / Suporte", 
                              searchable: true,
                              render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{item?.tipo_fone || "N/A"}</span>
                            },
                            {
                              key: "acoes",
                              label: "Ações",
                              render: (item) => (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => item && handleEditItem(item)}
                                    className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                                    title="Editar contrato CODNUM"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => item?.id && handleDeleteItem(item.id)}
                                    className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                                    title="Excluir contrato CODNUM"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            }
                          ]}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* OUTROS Group (if any) */}
                {itemConcessionariaFilter === 'ambos' && outrosItens.length > 0 && (
                  <div className="bg-white dark:bg-[#0f0f0f] rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
                    <div className="bg-slate-100 dark:bg-white/5 p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
                      <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-gray-300 text-sm">
                        <span>📦 OUTRAS CONCESSIONÁRIAS</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 dark:bg-white/10">
                          {outrosItens.length} contrato(s)
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <SmartTable
                        tableId="web_itens_outros"
                        data={outrosItens}
                        searchPlaceholder="Pesquisar outros contratos..."
                        columns={[
                          { 
                            key: "concessionaria", 
                            label: "Concessionária", 
                            searchable: true,
                            render: (item) => renderConcessionariaBadge(item?.despesa_descricao)
                          },
                          { 
                            key: "codigo_numero", 
                            label: "CODNUM", 
                            searchable: true,
                            render: (item) => <span className="font-bold font-mono text-slate-900 dark:text-white">{item?.codigo_numero}</span>
                          },
                          { key: "unidade_nome", label: "Unidade Gestora", searchable: true },
                          { 
                            key: "medidor", 
                            label: "Medidor (MEDITM)", 
                            searchable: true,
                            render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">{item?.medidor || "N/A"}</span>
                          },
                          { 
                            key: "tipo_fone", 
                            label: "Linha / Suporte", 
                            searchable: true,
                            render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{item?.tipo_fone || "N/A"}</span>
                          },
                          {
                            key: "acoes",
                            label: "Ações",
                            render: (item) => (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => item && handleEditItem(item)}
                                  className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                                  title="Editar contrato CODNUM"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => item?.id && handleDeleteItem(item.id)}
                                  className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                                  title="Excluir contrato CODNUM"
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
              </div>
            ) : (
              <div className="bg-white dark:bg-[#0f0f0f] p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
                <SmartTable
                  tableId="web_itens"
                  data={filteredItens}
                  searchPlaceholder="Pesquisar por CODNUM, medidor, unidade..."
                  columns={[
                    { 
                      key: "concessionaria", 
                      label: "Concessionária", 
                      searchable: true,
                      render: (item) => renderConcessionariaBadge(item?.despesa_descricao)
                    },
                    { 
                      key: "codigo_numero", 
                      label: "CODNUM", 
                      searchable: true,
                      render: (item) => <span className="font-bold font-mono text-slate-900 dark:text-white">{item?.codigo_numero}</span>
                    },
                    { key: "unidade_nome", label: "Unidade Gestora", searchable: true },
                    { 
                      key: "medidor", 
                      label: "Medidor (MEDITM)", 
                      searchable: true,
                      render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">{item?.medidor || "N/A"}</span>
                    },
                    { 
                      key: "tipo_fone", 
                      label: "Linha / Suporte", 
                      searchable: true,
                      render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{item?.tipo_fone || "N/A"}</span>
                    },
                    {
                      key: "acoes",
                      label: "Ações",
                      render: (item) => (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => item && handleEditItem(item)}
                            className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                            title="Editar contrato CODNUM"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => item?.id && handleDeleteItem(item.id)}
                            className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-white/10 transition"
                            title="Excluir contrato CODNUM"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    }
                  ]}
                />
              </div>
            )}
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
                        {itens.filter(Boolean).map((it, idx) => (
                          <option key={it.id || `item-${idx}`} value={it.id}>{it.codigo_numero} ({it.unidade_nome})</option>
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

                <div className="space-y-4">
                  <div className="bg-[#0f0f0f] border border-white/10 p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-white text-base">Registros de Despesas e Faturas Homologadas</h4>
                      <p className="text-xs text-gray-400">
                        {faturasViewMode === 'tree' 
                          ? 'Visualizando em estrutura de árvore agrupada por Mês/Ano e Concessionária (Celesc/Casan)' 
                          : 'Visualizando em lista plana estilo tabela'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[#161616] p-1 rounded-lg border border-white/10 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setFaturasViewMode('tree')}
                        className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                          faturasViewMode === 'tree'
                            ? 'bg-indigo-600 text-white font-bold shadow'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Layers className="h-3.5 w-3.5 text-indigo-300" />
                        🌳 Árvore por Mês/Ano
                      </button>
                      <button
                        type="button"
                        onClick={() => setFaturasViewMode('table')}
                        className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                          faturasViewMode === 'table'
                            ? 'bg-indigo-600 text-white font-bold shadow'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        📋 Tabela Simples
                      </button>
                    </div>
                  </div>

                  {faturasViewMode === 'tree' ? (
                    <FaturasTreeView 
                      lancamentos={lancamentos} 
                      onEdit={handleEditLancamento}
                      onDelete={handleDeleteLancamento}
                      onDeleteMonth={handleDeleteMonth}
                    />
                  ) : (
                    <div className="bg-[#0f0f0f] border border-white/10 p-6 rounded-xl shadow-sm space-y-4 text-gray-300">
                      <SmartTable
                        tableId="web_lancamentos"
                        data={lancamentos}
                        searchPlaceholder="Filtrar por CODNUM, Unidade..."
                        columns={[
                          { 
                            key: "mes_ano", 
                            label: "Comp. / Ref", 
                            searchable: true,
                            render: (item) => {
                              if (!item || !item.mes_ano) return null;
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
                            render: (item) => <span className="font-bold text-indigo-400 font-mono">R$ {(item?.valor_total || 0).toFixed(2)}</span>
                          },
                          { 
                            key: "valor_imposto", 
                            label: "Impostos", 
                            searchable: true,
                            render: (item) => <span className="text-gray-450 font-mono">R$ {(item?.valor_imposto || 0).toFixed(2)}</span>
                          },
                          {
                            key: "acoes",
                            label: "Ações",
                            render: (item) => (
                              <div className="flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => item && handleEditLancamento(item)} 
                                  className="p-1.5 hover:bg-indigo-900/30 text-indigo-400 rounded-lg transition"
                                  title="Editar Lançamento"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button 
                                  onClick={() => (item?.id || item?.doc_id) && handleDeleteLancamento(String(item.id || item.doc_id))} 
                                  className="p-1.5 hover:bg-rose-900/30 text-rose-400 hover:text-rose-300 rounded-lg transition"
                                  title="Excluir Lançamento"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )
                          }
                        ]}
                      />
                    </div>
                  )}
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
                        item?.acao === 'INSERT' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        item?.acao === 'UPDATE' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {item?.acao || ""}
                      </span>
                    )
                  },
                  { key: "usuario", label: "Autor", searchable: true },
                  { 
                    key: "criado_em", 
                    label: "Data e Hora", 
                    searchable: true,
                    render: (item) => <span className="font-mono text-slate-500">{item?.criado_em ? new Date(item.criado_em).toLocaleString("pt-BR") : ""}</span>
                  }
                ]}
              />
            </div>
          </div>
        )}

        {/* CUSTOM DELETE CONFIRMATION MODAL */}
        {deleteModal?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="bg-[#18181b] border border-white/10 text-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-rose-400 font-bold text-lg">
                <ShieldAlert className="h-6 w-6 shrink-0" />
                <h3>{deleteModal.title}</h3>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {deleteModal.description}
              </p>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDeleteModal(null)}
                  className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = deleteModal.onConfirm;
                    setDeleteModal(null);
                    action();
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition text-sm shadow-lg shadow-rose-900/30"
                >
                  Excluir Definitivamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Overlay Modal for Secretarias, Unidades, Despesas, Itens Editing/Creation */}
        {formModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-[#18181b] border border-white/10 text-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5 font-bold text-lg text-white">
                  {formModal === 'secretaria' && <Building2 className="h-5 w-5 text-indigo-400" />}
                  {formModal === 'unidade' && <Building2 className="h-5 w-5 text-indigo-400" />}
                  {formModal === 'despesa' && <Receipt className="h-5 w-5 text-indigo-400" />}
                  {formModal === 'item' && <Lightbulb className="h-5 w-5 text-indigo-400" />}
                  <h3>
                    {formModal === 'secretaria' && (editingSecId ? "Editar Secretaria" : "Nova Secretaria Municipal")}
                    {formModal === 'unidade' && (editingUniId ? "Editar Unidade Gestora" : "Nova Unidade Gestora")}
                    {formModal === 'despesa' && (editingDesId ? "Editar Tipo de Conta" : "Novo Tipo de Conta / Concessionária")}
                    {formModal === 'item' && (editingItemId ? "Editar Contrato CODNUM" : "Novo Contrato / Medidor (CODNUM)")}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFormModal(null)}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* FORM: SECRETARIA */}
              {formModal === 'secretaria' && (
                <form onSubmit={handleSaveSecretaria} className="space-y-4 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <label className="text-gray-300">Nome Completo da Secretaria:</label>
                    <input
                      type="text"
                      required
                      value={secNome}
                      onChange={(e) => setSecNome(e.target.value)}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 uppercase transition"
                      placeholder="EX: SECRETARIA DE EDUCAÇÃO"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-gray-300">Código Legado / Saneamento (opcional):</label>
                    <input
                      type="number"
                      value={secCodigo}
                      onChange={(e) => setSecCodigo(e.target.value)}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                      placeholder="Ex: 101"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setFormModal(null)}
                      className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition text-sm font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition text-sm shadow-lg shadow-indigo-900/30"
                    >
                      {editingSecId ? "Salvar Alterações" : "Cadastrar Secretaria"}
                    </button>
                  </div>
                </form>
              )}

              {/* FORM: UNIDADE GESTORA */}
              {formModal === 'unidade' && (
                <form onSubmit={handleSaveUnidade} className="space-y-4 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <label className="text-gray-300">Secretaria Vinculada:</label>
                    <select
                      required
                      value={uniSecretariaId}
                      onChange={(e) => setUniSecretariaId(e.target.value)}
                      className="w-full bg-[#27272a] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="">Selecione a secretaria...</option>
                      {secretarias.filter(Boolean).map((s, idx) => (
                        <option key={s.id || `sec-${idx}`} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-gray-300">Nome do Prédio / Imóvel:</label>
                    <input
                      type="text"
                      required
                      value={uniNome}
                      onChange={(e) => setUniNome(e.target.value)}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 uppercase transition"
                      placeholder="EX: POSTO DE SAÚDE CENTRO"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-gray-300">Unidade Consumidora / UC:</label>
                      <input
                        type="number"
                        value={uniCodigo}
                        onChange={(e) => setUniCodigo(e.target.value)}
                        className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition font-mono"
                        placeholder="Ex: 102030"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-gray-300">Endereço Físico:</label>
                      <input
                        type="text"
                        value={uniEndereco}
                        onChange={(e) => setUniEndereco(e.target.value)}
                        className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 uppercase transition"
                        placeholder="Rua, Número, Bairro"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setFormModal(null)}
                      className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition text-sm font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition text-sm shadow-lg shadow-indigo-900/30"
                    >
                      {editingUniId ? "Salvar Alterações" : "Cadastrar Unidade"}
                    </button>
                  </div>
                </form>
              )}

              {/* FORM: TIPO DE DESPESA */}
              {formModal === 'despesa' && (
                <form onSubmit={handleSaveDespesa} className="space-y-4 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <label className="text-gray-300">Descrição da Concessionária / Modalidade:</label>
                    <input
                      type="text"
                      required
                      value={desDescricao}
                      onChange={(e) => setDesDescricao(e.target.value)}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 uppercase transition"
                      placeholder="EX: ENERGIA ELÉTRICA - CELESC"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-gray-300">Código Legado (opcional):</label>
                    <input
                      type="number"
                      value={desCodigo}
                      onChange={(e) => setDesCodigo(e.target.value)}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition font-mono"
                      placeholder="Ex: 501"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setFormModal(null)}
                      className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition text-sm font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition text-sm shadow-lg shadow-indigo-900/30"
                    >
                      {editingDesId ? "Salvar Alterações" : "Cadastrar Tipo de Conta"}
                    </button>
                  </div>
                </form>
              )}

              {/* FORM: ITEM / CONTRATO CODNUM */}
              {formModal === 'item' && (
                <form onSubmit={handleSaveItem} className="space-y-4 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <label className="text-gray-300">Identificador CODNUM:</label>
                    <input
                      type="text"
                      required
                      value={itemCodigoNumero}
                      onChange={(e) => setItemCodigoNumero(e.target.value)}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 uppercase font-mono transition"
                      placeholder="Ex: CELESC-PREF-001"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-gray-300">Tipo de Conta (Despesa):</label>
                      <select
                        required
                        value={itemDespesaId}
                        onChange={(e) => setItemDespesaId(e.target.value)}
                        className="w-full bg-[#27272a] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                      >
                        <option value="">Selecione...</option>
                        {despesas.filter(Boolean).map((d, idx) => (
                          <option key={d.id || `desp-${idx}`} value={d.id}>{d.descricao}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-gray-300">Unidade Gestora Vinculada:</label>
                      <select
                        required
                        value={itemUnidadeId}
                        onChange={(e) => setItemUnidadeId(e.target.value)}
                        className="w-full bg-[#27272a] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                      >
                        <option value="">Selecione...</option>
                        {unidades.filter(Boolean).map((u, idx) => (
                          <option key={u.id || `uni-${idx}`} value={u.id}>{u.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-gray-300">Medidor / UC Físico (MEDITM):</label>
                      <input
                        type="text"
                        value={itemMedidor}
                        onChange={(e) => setItemMedidor(e.target.value)}
                        className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition font-mono"
                        placeholder="Ex: Medidor Celesc 12345"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-gray-300">Linha de Suporte (opcional):</label>
                      <input
                        type="text"
                        value={itemTipoFone}
                        onChange={(e) => setItemTipoFone(e.target.value)}
                        className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 uppercase transition"
                        placeholder="Ex: LINK INTERNET"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setFormModal(null)}
                      className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition text-sm font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition text-sm shadow-lg shadow-indigo-900/30"
                    >
                      {editingItemId ? "Salvar Alterações" : "Cadastrar Contrato"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Overlay Modal for Full Invoice Editing */}
        <EditFaturaModal
          isOpen={!!modalEditItem}
          item={modalEditItem}
          itens={itens}
          unidades={unidades}
          onClose={() => setModalEditItem(null)}
          onSaveSuccess={() => {
            showSuccess("Fatura / Lançamento atualizado com sucesso!");
            notifyChange();
            loadAllData();
          }}
        />

      </div>
    </div>
  );
}
