import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  Zap, 
  Droplets, 
  Calendar, 
  Filter, 
  Layers, 
  Search, 
  Edit2, 
  Trash2, 
  FileText, 
  CheckCircle2, 
  Building2, 
  Coins, 
  Sliders,
  Maximize2,
  Minimize2,
  Landmark,
  Lock,
  Unlock,
  AlertCircle,
  X,
  Eye
} from 'lucide-react';
import UnidadeSelectorModal from './UnidadeSelectorModal';

export interface FaturasTreeViewProps {
  lancamentos: any[];
  unidades?: any[];
  onEdit?: (item: any) => void;
  onView?: (item: any) => void;
  onDelete?: (id: string) => void;
  onDeleteMonth?: (monthKey: string, items: any[], monthLabel: string) => void;
  onDeleteGroup?: (monthKey: string, items: any[], groupLabel: string) => void;
  onRefreshData?: () => void;
}

export function getInvoiceType(item: any): 'CELESC' | 'CASAN' {
  if (!item) return 'CELESC';

  // 1. Verificação direta da propriedade concessionaria
  if (item?.concessionaria === 'CASAN') return 'CASAN';
  if (item?.concessionaria === 'CELESC') return 'CELESC';

  // 2. Verificação direta por ID do tipo de despesa
  if (String(item?.despesa_id) === '2' || String(item?.tipo_despesa_id) === '2') return 'CASAN';
  if (String(item?.despesa_id) === '1' || String(item?.tipo_despesa_id) === '1') return 'CELESC';

  // 3. Verificação textual abrangente em todas as propriedades do objeto item
  const fullText = [
    item?.despesa_descricao,
    item?.despesa_nome,
    item?.tipo_despesa,
    item?.unidade_nome,
    item?.codigo_numero,
    item?.medidor,
    item?.layout,
    item?.tipo_relatorio,
    item?.nome_arquivo,
    item?.origem_conteudo
  ].filter(Boolean).join(' ').toUpperCase();

  if (
    fullText.includes('CASAN') ||
    fullText.includes('COMPANHIA CATARINENSE DE AGUAS E SANEAMENTO') ||
    fullText.includes('COMPANHIA CATARINENSE DE ÁGUAS E SANEAMENTO') ||
    fullText.includes('CATARINENSE') ||
    fullText.includes('SANEAMENTO') ||
    fullText.includes('ÁGUA') ||
    fullText.includes('AGUA') ||
    fullText.includes('ESGOTO') ||
    fullText.includes('HIDRÔMETRO') ||
    fullText.includes('HIDROMETRO') ||
    fullText.includes('M³') ||
    fullText.includes('M3')
  ) {
    return 'CASAN';
  }

  if (
    fullText.includes('CELESC') ||
    fullText.includes('ENERGIA') ||
    fullText.includes('LUZ') ||
    fullText.includes('KWH') ||
    fullText.includes('ELETRI')
  ) {
    return 'CELESC';
  }

  return 'CELESC';
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function FaturasTreeView({
  lancamentos,
  unidades = [],
  onEdit,
  onView,
  onDelete,
  onDeleteMonth,
  onDeleteGroup,
  onRefreshData
}: FaturasTreeViewProps) {
  // Filter States
  const [selectedType, setSelectedType] = useState<'ALL' | 'CELESC' | 'CASAN'>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Tree Expansion States (monthKeys that are open)
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});

  // Month Locks (by default false = locked/closed)
  const [unlockedMonths, setUnlockedMonths] = useState<Record<string, boolean>>({});

  // Unidade Selector Modal State
  const [selectedItemForUnidade, setSelectedItemForUnidade] = useState<any | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);

  const toggleLockMonth = (monthKey: string) => {
    setUnlockedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  };

  const handleActionClick = (monthKey: string, actionFn: () => void) => {
    const isUnlocked = Boolean(unlockedMonths[monthKey]);
    if (!isUnlocked) {
      setLockNotice(`O mês selecionado está fechado. Clique no botão "Reabrir" no cabeçalho do mês para permitir editar ou excluir.`);
      setTimeout(() => setLockNotice(null), 4000);
      return;
    }
    actionFn();
  };

  const handleLinkUnidade = async (unidadeId: string) => {
    if (!selectedItemForUnidade) return;
    try {
      const res = await fetch('/api/vincular-unidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_numero: selectedItemForUnidade.codigo_numero,
          item_despesa_id: selectedItemForUnidade.item_despesa_id,
          unidade_id: unidadeId
        })
      });
      const data = await res.json();
      if (data.success) {
        onRefreshData?.();
      }
    } catch (err) {
      console.error("Erro ao vincular unidade:", err);
    }
  };

  // 1. Extract available years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    lancamentos.forEach(item => {
      if (!item || !item.mes_ano) return;
      const yr = item.mes_ano.substring(0, 4);
      if (yr && yr.length === 4 && !isNaN(Number(yr))) {
        yearsSet.add(yr);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [lancamentos]);

  // Set default year if current selectedYear is not 'ALL' and not in list
  React.useEffect(() => {
    if (selectedYear === 'ALL' && availableYears.length > 0) {
      // Keep ALL or auto select top year
    }
  }, [availableYears]);

  // 2. Filtered Lancamentos based on Type, Year, and Search
  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter(item => {
      if (!item || !item.mes_ano) return false;

      // Filter by Type
      if (selectedType !== 'ALL') {
        const itemType = getInvoiceType(item);
        if (itemType !== selectedType) return false;
      }

      // Filter by Year
      const itemYear = item.mes_ano.substring(0, 4);
      if (selectedYear !== 'ALL' && itemYear !== selectedYear) {
        return false;
      }

      // Filter by Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const codnum = (item.codigo_numero || '').toLowerCase();
        const unidade = (item.unidade_nome || '').toLowerCase();
        const despesa = (item.despesa_descricao || '').toLowerCase();
        const mesAnoStr = (item.mes_ano || '').toLowerCase();
        
        return codnum.includes(term) || unidade.includes(term) || despesa.includes(term) || mesAnoStr.includes(term);
      }

      return true;
    });
  }, [lancamentos, selectedType, selectedYear, searchTerm]);

  // 3. Group filtered items by Year and Month (Mês/Ano)
  const groupedTree = useMemo(() => {
    // Map of monthKey (YYYY-MM) -> array of items
    const monthMap: Record<string, any[]> = {};

    filteredLancamentos.forEach(item => {
      const monthKey = item.mes_ano.substring(0, 7); // YYYY-MM
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = [];
      }
      monthMap[monthKey].push(item);
    });

    // Sort monthKeys descending (most recent month first)
    const sortedMonthKeys = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));

    return sortedMonthKeys.map(monthKey => {
      const items = monthMap[monthKey];
      const [year, monthNum] = monthKey.split('-');
      const monthIndex = parseInt(monthNum, 10) - 1;
      const monthName = MONTH_NAMES[monthIndex] || `Mês ${monthNum}`;

      // Calculate totals for this month
      const monthTotalValue = items.reduce((acc, it) => acc + (parseFloat(it.valor_total) || 0), 0);
      const monthTotalConsumption = items.reduce((acc, it) => acc + (parseFloat(it.consumo) || 0), 0);
      const celescCount = items.filter(it => getInvoiceType(it) === 'CELESC').length;
      const casanCount = items.filter(it => getInvoiceType(it) === 'CASAN').length;

      // Subgroup by type inside month
      const celescItems = items.filter(it => getInvoiceType(it) === 'CELESC');
      const casanItems = items.filter(it => getInvoiceType(it) === 'CASAN');

      return {
        monthKey,
        year,
        monthNum,
        monthName,
        label: `${monthName} de ${year} (${monthNum}/${year})`,
        items,
        totalValue: monthTotalValue,
        totalConsumption: monthTotalConsumption,
        celescCount,
        casanCount,
        celescItems,
        casanItems
      };
    });
  }, [filteredLancamentos]);

  // Summary Metrics for the active view
  const overallMetrics = useMemo(() => {
    const totalCount = filteredLancamentos.length;
    const totalValue = filteredLancamentos.reduce((acc, it) => acc + (parseFloat(it.valor_total) || 0), 0);
    const totalConsumo = filteredLancamentos.reduce((acc, it) => acc + (parseFloat(it.consumo) || 0), 0);
    const totalImposto = filteredLancamentos.reduce((acc, it) => acc + (parseFloat(it.valor_imposto) || 0), 0);
    const celescTotal = filteredLancamentos.filter(it => getInvoiceType(it) === 'CELESC').length;
    const casanTotal = filteredLancamentos.filter(it => getInvoiceType(it) === 'CASAN').length;

    return { totalCount, totalValue, totalConsumo, totalImposto, celescTotal, casanTotal };
  }, [filteredLancamentos]);

  // Expand / Collapse Month Handlers
  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  };

  const toggleTypeGroup = (typeKey: string) => {
    setExpandedTypes(prev => ({
      ...prev,
      [typeKey]: !prev[typeKey]
    }));
  };

  const expandAll = () => {
    const newMonths: Record<string, boolean> = {};
    const newTypes: Record<string, boolean> = {};
    groupedTree.forEach(m => {
      newMonths[m.monthKey] = true;
      newTypes[`${m.monthKey}-CELESC`] = true;
      newTypes[`${m.monthKey}-CASAN`] = true;
    });
    setExpandedMonths(newMonths);
    setExpandedTypes(newTypes);
  };

  const collapseAll = () => {
    setExpandedMonths({});
    setExpandedTypes({});
  };

  // Auto-expand the first month on initial render if none expanded
  React.useEffect(() => {
    if (groupedTree.length > 0 && Object.keys(expandedMonths).length === 0) {
      setExpandedMonths({ [groupedTree[0].monthKey]: true });
      setExpandedTypes({
        [`${groupedTree[0].monthKey}-CELESC`]: true,
        [`${groupedTree[0].monthKey}-CASAN`]: true
      });
    }
  }, [groupedTree]);

  return (
    <div className="space-y-5 bg-[#0f0f0f] border border-white/10 p-5 rounded-2xl shadow-xl text-gray-200">
      
      {/* 🟢 TOP CONTROLS & SELECTION BUTTONS */}
      <div className="space-y-4 pb-4 border-b border-white/10">
        
        {/* Title & Filter Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              Árvore do Histórico de Faturas Homologadas
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Organizado hierarquicamente por <span className="text-indigo-300 font-semibold">Mês/Ano</span> e filtrável por <span className="text-amber-300 font-semibold">Tipo de Concessionária</span>.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por CODNUM ou Unidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#161616] border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        {/* Filter Toolbar: Year Selector & Type Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-[#141414] p-3.5 rounded-xl border border-white/5">
          
          {/* 1. SELETOR DE ANO (BOTÕES) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-indigo-400" />
              Filtrar por Ano de Competência:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedYear('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                  selectedYear === 'ALL'
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/20'
                    : 'bg-[#1e1e1e] text-gray-300 border-white/10 hover:bg-white/10'
                }`}
              >
                Todos os Anos
              </button>
              {availableYears.map(year => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                    selectedYear === year
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/20'
                      : 'bg-[#1e1e1e] text-gray-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          {/* 2. FILTRO POR TIPO (CELESC OU CASAN) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-amber-400" />
              Filtrar por Concessionária / Tipo:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedType('ALL')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                  selectedType === 'ALL'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/20'
                    : 'bg-[#1e1e1e] text-gray-300 border-white/10 hover:bg-white/10'
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-emerald-300" />
                Ambos (Celesc + Casan)
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('CELESC')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                  selectedType === 'CELESC'
                    ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/20'
                    : 'bg-[#1e1e1e] text-amber-400/90 border-amber-500/20 hover:bg-amber-500/10'
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-amber-300 fill-amber-300" />
                CELESC (Energia)
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('CASAN')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                  selectedType === 'CASAN'
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/20'
                    : 'bg-[#1e1e1e] text-blue-400/90 border-blue-500/20 hover:bg-blue-500/10'
                }`}
              >
                <Droplets className="h-3.5 w-3.5 text-blue-300 fill-blue-300" />
                CASAN (Água)
              </button>
            </div>
          </div>

        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#141414] border border-white/5 p-2.5 rounded-xl flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-gray-400 block">Total Faturas</span>
              <span className="text-sm font-extrabold text-white font-mono">{overallMetrics.totalCount} faturas</span>
            </div>
          </div>

          <div className="bg-[#141414] border border-white/5 p-2.5 rounded-xl flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-gray-400 block">Valor Total</span>
              <span className="text-sm font-extrabold text-emerald-400 font-mono">
                R$ {overallMetrics.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="bg-[#141414] border border-white/5 p-2.5 rounded-xl flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-gray-400 block">Celesc / Casan</span>
              <span className="text-sm font-extrabold text-amber-300 font-mono">
                {overallMetrics.celescTotal} <span className="text-xs text-amber-500 font-normal">Celesc</span> | {overallMetrics.casanTotal} <span className="text-xs text-blue-400 font-normal">Casan</span>
              </span>
            </div>
          </div>

          <div className="bg-[#141414] border border-white/5 p-2.5 rounded-xl flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-gray-400 block">Consumo Somado</span>
              <span className="text-sm font-extrabold text-blue-300 font-mono">
                {overallMetrics.totalConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Tree controls */}
        <div className="flex justify-between items-center text-xs text-gray-400 pt-1">
          <span className="font-semibold text-gray-300">
            {groupedTree.length} mês(es) encontrado(s) para a seleção
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-semibold px-2.5 py-1 rounded transition flex items-center gap-1 border border-white/5"
            >
              <Maximize2 className="h-3 w-3" /> Expandir Todos
            </button>
            <button
              onClick={collapseAll}
              className="bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-semibold px-2.5 py-1 rounded transition flex items-center gap-1 border border-white/5"
            >
              <Minimize2 className="h-3 w-3" /> Recolher Todos
            </button>
          </div>
        </div>

      </div>

      {/* 🌳 HIERARCHICAL TREE VIEW BODY */}
      <div className="space-y-3 pt-1">
        {lockNotice && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>{lockNotice}</span>
            </div>
            <button onClick={() => setLockNotice(null)} className="text-amber-400 hover:text-amber-200 p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {groupedTree.length === 0 ? (
          <div className="p-8 text-center bg-[#141414] rounded-xl border border-white/5 space-y-2">
            <FileText className="h-8 w-8 text-gray-600 mx-auto" />
            <p className="text-sm text-gray-400 font-medium">
              Nenhuma fatura encontrada com os filtros selecionados.
            </p>
            <p className="text-xs text-gray-500">
              Tente alterar o ano ou escolher "Ambos (Celesc + Casan)".
            </p>
          </div>
        ) : (
          groupedTree.map(monthGroup => {
            const isMonthExpanded = Boolean(expandedMonths[monthGroup.monthKey]);

            return (
              <div 
                key={monthGroup.monthKey} 
                className="bg-[#141414] border border-white/10 rounded-xl overflow-hidden shadow-md transition"
              >
                {/* 1ST LEVEL NODE: MÊS E ANO */}
                <div 
                  onClick={() => toggleMonth(monthGroup.monthKey)}
                  className="w-full bg-[#181818] hover:bg-[#202020] px-4 py-3 flex items-center justify-between cursor-pointer border-b border-white/5 transition select-none group"
                >
                  <div className="flex items-center gap-3">
                    <button className="text-indigo-400 group-hover:text-white transition">
                      {isMonthExpanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      {isMonthExpanded ? (
                        <FolderOpen className="h-5 w-5 text-indigo-400" />
                      ) : (
                        <Folder className="h-5 w-5 text-indigo-400" />
                      )}
                      <span className="font-bold text-white text-sm capitalize">
                        {monthGroup.monthName} / {monthGroup.year}
                      </span>

                      {/* BOTÃO REABRIR / BLOQUEAR NO LUGAR DA BADGE 05/2026 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLockMonth(monthGroup.monthKey);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border shadow-sm ${
                          Boolean(unlockedMonths[monthGroup.monthKey])
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                        }`}
                        title={
                          Boolean(unlockedMonths[monthGroup.monthKey])
                            ? "Mês reaberto. Clique para bloquear edições."
                            : "Clique para reabrir este mês e permitir editar e excluir lançamentos."
                        }
                      >
                        {Boolean(unlockedMonths[monthGroup.monthKey]) ? (
                          <>
                            <Unlock className="h-3.5 w-3.5 text-amber-300" />
                            <span>Bloquear Mês</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-3.5 w-3.5 text-white" />
                            <span>Reabrir</span>
                          </>
                        )}
                      </button>

                      {/* BOTÃO EXCLUIR MÊS INTEIRO - SÓ APARECE SE O MÊS ESTIVER REABERTO */}
                      {Boolean(unlockedMonths[monthGroup.monthKey]) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteMonth) {
                              onDeleteMonth(monthGroup.monthKey, monthGroup.items, monthGroup.label);
                            } else if (onDelete) {
                              if (window.confirm(`Tem certeza que deseja excluir todos os ${monthGroup.items.length} lançamentos de ${monthGroup.label}?`)) {
                                monthGroup.items.forEach((it: any) => {
                                  const targetId = it.id || it.doc_id;
                                  if (targetId) onDelete(String(targetId));
                                });
                              }
                            }
                          }}
                          className="px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600 hover:text-white shadow-md shadow-rose-950/40"
                          title={`Excluir todos os ${monthGroup.items.length} lançamentos do mês de ${monthGroup.label}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-400 group-hover:text-white" />
                          <span>Excluir Mês</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary badges for month node */}
                  <div className="flex items-center gap-3 text-xs">
                    {/* Celesc count */}
                    {(selectedType === 'ALL' || selectedType === 'CELESC') && monthGroup.celescCount > 0 && (
                      <span className="hidden sm:inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[11px] font-semibold">
                        <Zap className="h-3 w-3 fill-amber-400" /> {monthGroup.celescCount} Celesc
                      </span>
                    )}

                    {/* Casan count */}
                    {(selectedType === 'ALL' || selectedType === 'CASAN') && monthGroup.casanCount > 0 && (
                      <span className="hidden sm:inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[11px] font-semibold">
                        <Droplets className="h-3 w-3 fill-blue-400" /> {monthGroup.casanCount} Casan
                      </span>
                    )}

                    {/* Month Total Value */}
                    <span className="font-bold font-mono text-emerald-400 text-xs sm:text-sm bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                      R$ {monthGroup.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>

                    <span className="text-[11px] font-bold text-gray-400 font-mono bg-white/5 px-2 py-1 rounded">
                      {monthGroup.items.length} fatura(s)
                    </span>
                  </div>
                </div>

                {/* EXPANDABLE MONTH CONTENT (SUB-GROUPS BY TYPE) */}
                {isMonthExpanded && (
                  <div className="p-3 space-y-3 bg-[#111111] divide-y divide-white/5">
                    
                    {/* TYPE 1: CELESC SUBGROUP */}
                    {(selectedType === 'ALL' || selectedType === 'CELESC') && monthGroup.celescItems.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div 
                          onClick={() => toggleTypeGroup(`${monthGroup.monthKey}-CELESC`)}
                          className="flex items-center justify-between px-3 py-2 bg-[#1a1810] border border-amber-500/20 rounded-lg cursor-pointer hover:bg-[#222014] transition select-none"
                        >
                          <div className="flex items-center gap-2">
                            {expandedTypes[`${monthGroup.monthKey}-CELESC`] ? (
                              <ChevronDown className="h-4 w-4 text-amber-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-amber-400" />
                            )}
                            <Zap className="h-4 w-4 text-amber-400 fill-amber-400" />
                            <span className="font-bold text-amber-300 text-xs uppercase tracking-wider">
                              CELESC — Energia Elétrica ({monthGroup.celescItems.length} faturas)
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-amber-300">
                              Subtotal: R$ {monthGroup.celescItems.reduce((acc, it) => acc + (parseFloat(it.valor_total) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {onDeleteGroup && Boolean(unlockedMonths[monthGroup.monthKey]) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteGroup(monthGroup.monthKey, monthGroup.celescItems, `CELESC de ${monthGroup.label}`);
                                }}
                                className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600 hover:text-white transition"
                                title={`Excluir todas as ${monthGroup.celescItems.length} faturas CELESC deste mês`}
                              >
                                <Trash2 className="h-3 w-3" /> Excluir CELESC
                              </button>
                            )}
                          </div>
                        </div>

                        {/* CELESC ITEMS TABLE */}
                        {expandedTypes[`${monthGroup.monthKey}-CELESC`] && (
                          <div className="pl-2 border-l-2 border-amber-500/30 ml-2 overflow-x-auto">
                            <table className="w-full text-xs text-left text-gray-300 border-collapse">
                              <thead className="bg-black/40 text-gray-400 uppercase text-[10px] font-mono border-b border-white/10">
                                <tr>
                                  <th className="px-3 py-2">CODNUM</th>
                                  <th className="px-3 py-2">Unidade Gestora</th>
                                  <th className="px-3 py-2 text-right">Consumo (kWh)</th>
                                  <th className="px-3 py-2 text-right">Valor Total</th>
                                  <th className="px-3 py-2 text-right">Impostos</th>
                                  <th className="px-3 py-2 text-center w-20">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {monthGroup.celescItems.map((item, idx) => {
                                  const isUnlocked = Boolean(unlockedMonths[monthGroup.monthKey]);
                                  const isNaoLocalizada = !item.unidade_nome || item.unidade_nome === 'NÃO LOCALIZADA';
                                  return (
                                    <tr key={item.id || `celesc-${idx}`} className="hover:bg-amber-500/5 transition group">
                                      <td className="px-3 py-2 font-mono font-bold text-amber-200">
                                        {item.codigo_numero}
                                      </td>
                                      <td className="px-3 py-2 font-semibold">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedItemForUnidade(item)}
                                          className={`px-2 py-1 rounded border text-left text-xs font-semibold transition flex items-center gap-1.5 group ${
                                            !isNaoLocalizada
                                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/25'
                                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/30 animate-pulse'
                                          }`}
                                          title="Clique para vincular/alterar a Unidade Gestora em tempo real"
                                        >
                                          <Building2 className="h-3 w-3 shrink-0" />
                                          <span className="truncate max-w-[200px]">
                                            {item.unidade_nome || "NÃO LOCALIZADA"}
                                          </span>
                                        </button>
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-semibold text-blue-300">
                                        {item.consumo ? `${parseFloat(item.consumo).toLocaleString('pt-BR')} kWh` : '0 kWh'}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-400">
                                        R$ {(parseFloat(item.valor_total) || 0).toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-gray-400">
                                        R$ {(parseFloat(item.valor_imposto) || 0).toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          {onView && (
                                            <button
                                              type="button"
                                              onClick={() => onView(item)}
                                              className="p-1.5 rounded transition hover:bg-indigo-500/20 text-indigo-300"
                                              title="Visualizar Fatura (somente leitura)"
                                            >
                                              <Eye className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          {onEdit && (
                                            <button
                                              type="button"
                                              onClick={() => handleActionClick(monthGroup.monthKey, () => onEdit(item))}
                                              className={`p-1.5 rounded transition ${
                                                !isUnlocked
                                                  ? 'opacity-30 cursor-not-allowed text-gray-500'
                                                  : 'hover:bg-amber-500/20 text-amber-300'
                                              }`}
                                              title={
                                                !isUnlocked 
                                                  ? "Mês bloqueado. Clique no botão 'Reabrir' no cabeçalho do mês para editar." 
                                                  : "Editar Fatura"
                                              }
                                            >
                                              <Edit2 className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          {onDelete && (item.id || item.doc_id) && (
                                            <button 
                                              type="button"
                                              onClick={() => handleActionClick(monthGroup.monthKey, () => onDelete(String(item.id || item.doc_id)))}
                                              className={`p-1.5 rounded transition ${
                                                !isUnlocked 
                                                  ? 'opacity-30 cursor-not-allowed text-gray-500' 
                                                  : 'hover:bg-rose-500/20 text-rose-400'
                                              }`}
                                              title={
                                                !isUnlocked 
                                                  ? "Mês bloqueado. Clique no botão 'Reabrir' no cabeçalho do mês para excluir." 
                                                  : "Excluir Fatura"
                                              }
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TYPE 2: CASAN SUBGROUP */}
                    {(selectedType === 'ALL' || selectedType === 'CASAN') && monthGroup.casanItems.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div 
                          onClick={() => toggleTypeGroup(`${monthGroup.monthKey}-CASAN`)}
                          className="flex items-center justify-between px-3 py-2 bg-[#101824] border border-blue-500/20 rounded-lg cursor-pointer hover:bg-[#142030] transition select-none"
                        >
                          <div className="flex items-center gap-2">
                            {expandedTypes[`${monthGroup.monthKey}-CASAN`] ? (
                              <ChevronDown className="h-4 w-4 text-blue-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-blue-400" />
                            )}
                            <Droplets className="h-4 w-4 text-blue-400 fill-blue-400" />
                            <span className="font-bold text-blue-300 text-xs uppercase tracking-wider">
                              CASAN — Água e Saneamento ({monthGroup.casanItems.length} faturas)
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-blue-300">
                              Subtotal: R$ {monthGroup.casanItems.reduce((acc, it) => acc + (parseFloat(it.valor_total) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {onDeleteGroup && Boolean(unlockedMonths[monthGroup.monthKey]) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteGroup(monthGroup.monthKey, monthGroup.casanItems, `CASAN de ${monthGroup.label}`);
                                }}
                                className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600 hover:text-white transition"
                                title={`Excluir todas as ${monthGroup.casanItems.length} faturas CASAN deste mês`}
                              >
                                <Trash2 className="h-3 w-3" /> Excluir CASAN
                              </button>
                            )}
                          </div>
                        </div>

                        {/* CASAN ITEMS TABLE */}
                        {expandedTypes[`${monthGroup.monthKey}-CASAN`] && (
                          <div className="pl-2 border-l-2 border-blue-500/30 ml-2 overflow-x-auto">
                            <table className="w-full text-xs text-left text-gray-300 border-collapse">
                              <thead className="bg-black/40 text-gray-400 uppercase text-[10px] font-mono border-b border-white/10">
                                <tr>
                                  <th className="px-3 py-2">CODNUM</th>
                                  <th className="px-3 py-2">Unidade Gestora</th>
                                  <th className="px-3 py-2 text-right">Consumo (m³)</th>
                                  <th className="px-3 py-2 text-right">Valor Total</th>
                                  <th className="px-3 py-2 text-right">Impostos</th>
                                  <th className="px-3 py-2 text-center w-20">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {monthGroup.casanItems.map((item, idx) => {
                                  const isUnlocked = Boolean(unlockedMonths[monthGroup.monthKey]);
                                  const isNaoLocalizada = !item.unidade_nome || item.unidade_nome === 'NÃO LOCALIZADA';
                                  return (
                                    <tr key={item.id || `casan-${idx}`} className="hover:bg-blue-500/5 transition group">
                                      <td className="px-3 py-2 font-mono font-bold text-blue-200">
                                        {item.codigo_numero}
                                      </td>
                                      <td className="px-3 py-2 font-semibold">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedItemForUnidade(item)}
                                          className={`px-2 py-1 rounded border text-left text-xs font-semibold transition flex items-center gap-1.5 group ${
                                            !isNaoLocalizada
                                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/25'
                                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/30 animate-pulse'
                                          }`}
                                          title="Clique para vincular/alterar a Unidade Gestora em tempo real"
                                        >
                                          <Building2 className="h-3 w-3 shrink-0" />
                                          <span className="truncate max-w-[200px]">
                                            {item.unidade_nome || "NÃO LOCALIZADA"}
                                          </span>
                                        </button>
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-semibold text-blue-300">
                                        {item.consumo ? `${parseFloat(item.consumo).toLocaleString('pt-BR')} m³` : '0 m³'}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-400">
                                        R$ {(parseFloat(item.valor_total) || 0).toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-gray-400">
                                        R$ {(parseFloat(item.valor_imposto) || 0).toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          {onView && (
                                            <button
                                              type="button"
                                              onClick={() => onView(item)}
                                              className="p-1.5 rounded transition hover:bg-indigo-500/20 text-indigo-300"
                                              title="Visualizar Fatura (somente leitura)"
                                            >
                                              <Eye className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          {onEdit && (
                                            <button
                                              type="button"
                                              onClick={() => handleActionClick(monthGroup.monthKey, () => onEdit(item))}
                                              className={`p-1.5 rounded transition ${
                                                !isUnlocked
                                                  ? 'opacity-30 cursor-not-allowed text-gray-500'
                                                  : 'hover:bg-blue-500/20 text-blue-300'
                                              }`}
                                              title={
                                                !isUnlocked 
                                                  ? "Mês bloqueado. Clique no botão 'Reabrir' no cabeçalho do mês para editar." 
                                                  : "Editar Fatura"
                                              }
                                            >
                                              <Edit2 className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          {onDelete && (item.id || item.doc_id) && (
                                            <button 
                                              type="button"
                                              onClick={() => handleActionClick(monthGroup.monthKey, () => onDelete(String(item.id || item.doc_id)))}
                                              className={`p-1.5 rounded transition ${
                                                !isUnlocked 
                                                  ? 'opacity-30 cursor-not-allowed text-gray-500' 
                                                  : 'hover:bg-rose-500/20 text-rose-400'
                                              }`}
                                              title={
                                                !isUnlocked 
                                                  ? "Mês bloqueado. Clique no botão 'Reabrir' no cabeçalho do mês para excluir." 
                                                  : "Excluir Fatura"
                                              }
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal para Selecionar e Vincular Unidade Gestora */}
      {selectedItemForUnidade && (
        <UnidadeSelectorModal
          isOpen={!!selectedItemForUnidade}
          codigoNumero={selectedItemForUnidade.codigo_numero}
          currentUnidadeNome={selectedItemForUnidade.unidade_nome || "NÃO LOCALIZADA"}
          unidades={unidades}
          onClose={() => setSelectedItemForUnidade(null)}
          onSelectUnidade={(unidadeId) => {
            handleLinkUnidade(unidadeId);
            setSelectedItemForUnidade(null);
          }}
        />
      )}

    </div>
  );
}
