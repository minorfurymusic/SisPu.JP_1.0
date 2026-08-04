import React, { useState, useMemo } from "react";
import { 
  ShieldAlert, Zap, Droplets, Sun, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, Activity, Building2, Flame, Award, HelpCircle, Filter, 
  BarChart3, PieChart, FileText, CheckCircle2, ArrowUpRight, Search, RefreshCw, Eye
} from "lucide-react";
import { Lancamento, Secretaria, Unidade, Despesa, ItemDespesa } from "../types";

interface AuditoriaDashboardProps {
  lancamentos: Lancamento[];
  secretarias: Secretaria[];
  unidades: Unidade[];
  despesas?: Despesa[];
  itens?: ItemDespesa[];
  externalConcessionaireFilter?: "ALL" | "CASAN" | "CELESC" | "OUTROS";
}

export default function AuditoriaDashboard({ 
  lancamentos = [], 
  secretarias = [], 
  unidades = [],
  despesas = [],
  itens = [],
  externalConcessionaireFilter
}: AuditoriaDashboardProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [selectedSecretaria, setSelectedSecretaria] = useState<string>("ALL");
  const [selectedConcessionaire, setSelectedConcessionaire] = useState<"ALL" | "CELESC" | "CASAN" | "OUTROS">("ALL");
  const [activeTab, setActiveTab] = useState<"ANOMALIAS" | "RANKING" | "SOLAR" | "IMPOSTOS_PERDAS" | "BANDEIRAS">("ANOMALIAS");

  // Sync external filter from parent top bar if provided
  React.useEffect(() => {
    if (externalConcessionaireFilter) {
      setSelectedConcessionaire(externalConcessionaireFilter);
    }
  }, [externalConcessionaireFilter]);

  // Helper to accurately classify CASAN (water/m³) vs CELESC (electricity/kWh)
  const getConcessionaireInfo = (l: Lancamento) => {
    const textDirect = `${l.codigo_numero || ''} ${l.unidade_nome || ''} ${l.secretaria_nome || ''}`.toLowerCase();
    
    let isCasan = textDirect.includes('casan') || textDirect.includes('água') || textDirect.includes('agua') || textDirect.includes('esgoto') || textDirect.includes('saneamento') || textDirect.includes('hídric') || textDirect.includes('hidric');
    let isCelesc = textDirect.includes('celesc') || textDirect.includes('energia') || textDirect.includes('luz') || textDirect.includes('elétric') || textDirect.includes('eletric') || textDirect.includes('kwh');

    if (!isCasan && !isCelesc && l.item_despesa_id && itens.length > 0) {
      const item = itens.find(it => String(it.id) === String(l.item_despesa_id));
      if (item) {
        const desDesc = (item as any).despesa_descricao || '';
        const itemText = `${item.codigo_numero || ''} ${desDesc} ${item.medidor || ''}`.toLowerCase();
        if (itemText.includes('casan') || itemText.includes('água') || itemText.includes('agua') || itemText.includes('esgoto') || itemText.includes('saneamento') || itemText.includes('hídric') || itemText.includes('hidric')) {
          isCasan = true;
        } else if (itemText.includes('celesc') || itemText.includes('energia') || itemText.includes('luz') || itemText.includes('elétric') || itemText.includes('eletric') || itemText.includes('kwh')) {
          isCelesc = true;
        }

        if (!isCasan && !isCelesc && item.despesa_id && despesas.length > 0) {
          const despesa = despesas.find(d => String(d.id) === String(item.despesa_id));
          if (despesa) {
            const desText = `${despesa.descricao || ''}`.toLowerCase();
            if (desText.includes('casan') || desText.includes('água') || desText.includes('agua') || desText.includes('esgoto') || desText.includes('saneamento') || desText.includes('hídric') || desText.includes('hidric')) {
              isCasan = true;
            } else if (desText.includes('celesc') || desText.includes('energia') || desText.includes('luz') || desText.includes('elétric') || desText.includes('eletric') || desText.includes('kwh')) {
              isCelesc = true;
            }
          }
        }
      }
    }

    // System-wide fallback: If user registered ONLY CASAN / Water despesas in despesas table
    if (!isCasan && !isCelesc && despesas.length > 0) {
      const hasCasanDespesa = despesas.some(d => {
        const txt = (d.descricao || '').toLowerCase();
        return txt.includes('casan') || txt.includes('água') || txt.includes('agua') || txt.includes('esgoto') || txt.includes('saneamento');
      });
      const hasCelescDespesa = despesas.some(d => {
        const txt = (d.descricao || '').toLowerCase();
        return txt.includes('celesc') || txt.includes('energia') || txt.includes('luz');
      });

      if (hasCasanDespesa && !hasCelescDespesa) {
        isCasan = true;
      } else if (hasCelescDespesa && !hasCasanDespesa) {
        isCelesc = true;
      }
    }

    return { isCasan, isCelesc };
  };

  // Filter options for months
  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(lancamentos.map(l => l.mes_ano).filter(Boolean))).sort().reverse();
    return months;
  }, [lancamentos]);

  // Filtered lancamentos
  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter(l => {
      if (selectedMonth !== "ALL" && l.mes_ano !== selectedMonth) return false;
      if (selectedSecretaria !== "ALL" && l.secretaria_id !== selectedSecretaria && l.secretaria_nome !== selectedSecretaria) return false;
      
      const { isCasan, isCelesc } = getConcessionaireInfo(l);

      if (selectedConcessionaire === "CELESC" && !isCelesc) return false;
      if (selectedConcessionaire === "CASAN" && !isCasan) return false;
      if (selectedConcessionaire === "OUTROS" && (isCasan || isCelesc)) return false;

      return true;
    });
  }, [lancamentos, selectedMonth, selectedSecretaria, selectedConcessionaire, despesas, itens]);

  // Global KPIs calculation
  const stats = useMemo(() => {
    let totalKwh = 0;
    let totalM3 = 0;
    let totalValor = 0;
    let totalImposto = 0;
    let totalCredito = 0;
    let count = filteredLancamentos.length;

    filteredLancamentos.forEach(l => {
      const { isCasan } = getConcessionaireInfo(l);
      if (isCasan) {
        totalM3 += Number(l.consumo || 0);
      } else {
        totalKwh += Number(l.consumo || 0);
      }
      totalValor += Number(l.valor_total || 0);
      totalImposto += Number(l.valor_imposto || 0);
      totalCredito += Number(l.valor_credito || 0);
    });

    return { totalKwh, totalM3, totalValor, totalImposto, totalCredito, count };
  }, [filteredLancamentos, despesas, itens]);

  // Anomaly Detection Algorithm (> 20% variance compared to unit average)
  const anomalies = useMemo(() => {
    // Group lancamentos by unit (unidade_nome or item_despesa_id)
    const unitGroups: { [key: string]: Lancamento[] } = {};

    filteredLancamentos.forEach(l => {
      const key = l.unidade_nome || l.item_despesa_id || "Unidade Desconhecida";
      if (!unitGroups[key]) unitGroups[key] = [];
      unitGroups[key].push(l);
    });

    const detectedAnomalies: Array<{
      unitName: string;
      secretariaNome: string;
      currentMonth: string;
      currentValue: number;
      currentConsumo: number;
      avgConsumo: number;
      variancePercent: number;
      type: "VAZAMENTO_AGUA" | "FUGA_ENERGIA";
      lancamento: Lancamento;
    }> = [];

    Object.entries(unitGroups).forEach(([unitName, unitLancamentos]) => {
      if (unitLancamentos.length < 2) return; // Need at least 2 records to calculate historic average

      // Sort by date ascending
      const sorted = [...unitLancamentos].sort((a, b) => new Date(a.mes_ano).getTime() - new Date(b.mes_ano).getTime());
      
      const latest = sorted[sorted.length - 1];
      const history = sorted.slice(0, sorted.length - 1);

      const historyAvgConsumo = history.reduce((acc, curr) => acc + Number(curr.consumo || 0), 0) / history.length;

      if (historyAvgConsumo > 0 && latest.consumo > 0) {
        const variance = ((latest.consumo - historyAvgConsumo) / historyAvgConsumo) * 100;

        if (variance >= 20) {
          const { isCasan } = getConcessionaireInfo(latest);
          detectedAnomalies.push({
            unitName,
            secretariaNome: latest.secretaria_nome || "Não informada",
            currentMonth: latest.mes_ano,
            currentValue: latest.valor_total,
            currentConsumo: latest.consumo,
            avgConsumo: historyAvgConsumo,
            variancePercent: Math.round(variance),
            type: isCasan ? "VAZAMENTO_AGUA" : "FUGA_ENERGIA",
            lancamento: latest
          });
        }
      }
    });

    return detectedAnomalies.sort((a, b) => b.variancePercent - a.variancePercent);
  }, [filteredLancamentos, despesas, itens]);

  // Ranking of Highest Consuming Units
  const unitRanking = useMemo(() => {
    const rankingMap: { [unit: string]: { name: string; sec: string; totalVal: number; totalConsumoKwh: number; totalConsumoM3: number; count: number } } = {};

    filteredLancamentos.forEach(l => {
      const name = l.unidade_nome || "Unidade Não Especificada";
      const sec = l.secretaria_nome || "Geral";

      if (!rankingMap[name]) {
        rankingMap[name] = { name, sec, totalVal: 0, totalConsumoKwh: 0, totalConsumoM3: 0, count: 0 };
      }

      const { isCasan } = getConcessionaireInfo(l);
      if (isCasan) {
        rankingMap[name].totalConsumoM3 += Number(l.consumo || 0);
      } else {
        rankingMap[name].totalConsumoKwh += Number(l.consumo || 0);
      }
      rankingMap[name].totalVal += Number(l.valor_total || 0);
      rankingMap[name].count += 1;
    });

    return Object.values(rankingMap).sort((a, b) => b.totalVal - a.totalVal);
  }, [filteredLancamentos, despesas, itens]);

  // Solar Distributed Generation - 100% Real calculation from filtered database records
  const solarData = useMemo(() => {
    if (selectedConcessionaire === "CASAN") {
      return {
        isWaterConcessionaire: true,
        solarUnits: [],
        totalKwhGenerated: 0,
        totalCompensatedR$: 0,
        message: "Faturas da CASAN referem-se ao abastecimento de água e saneamento hídrico. O sistema de microgeração fotovoltaica (GD) opera exclusivamente integrado à rede elétrica (CELESC)."
      };
    }

    // Filter real lancamentos that have credit values
    const solarLancamentos = filteredLancamentos.filter(l => Number(l.valor_credito || 0) > 0);

    const solarUnitsMap: { [unitName: string]: { name: string; totalKwh: number; compensatedVal: number; count: number } } = {};

    let totalCompensatedR$ = 0;
    let totalKwhGenerated = 0;

    solarLancamentos.forEach(l => {
      const name = l.unidade_nome || "Unidade com Crédito GD";
      if (!solarUnitsMap[name]) {
        solarUnitsMap[name] = { name, totalKwh: 0, compensatedVal: 0, count: 0 };
      }
      solarUnitsMap[name].compensatedVal += Number(l.valor_credito || 0);
      solarUnitsMap[name].totalKwh += Number(l.consumo || 0);
      solarUnitsMap[name].count += 1;

      totalCompensatedR$ += Number(l.valor_credito || 0);
      totalKwhGenerated += Number(l.consumo || 0);
    });

    const solarUnits = Object.values(solarUnitsMap);

    return {
      isWaterConcessionaire: false,
      solarUnits,
      totalKwhGenerated,
      totalCompensatedR$,
      hasRecords: solarUnits.length > 0,
      message: solarUnits.length === 0 
        ? "Nenhum crédito de energia solar (campo valor_credito) registrado nos lançamentos auditados desta seleção." 
        : `Identificados ${solarUnits.length} unidades com créditos de geração distribuída.`
    };
  }, [filteredLancamentos, selectedConcessionaire]);

  // Taxes and Technical Losses - 100% Real calculation from database records
  const taxLossesData = useMemo(() => {
    let totalTax = 0;
    let totalValor = stats.totalValor;
    let countWithTax = 0;

    filteredLancamentos.forEach(l => {
      if (Number(l.valor_imposto || 0) > 0) {
        totalTax += Number(l.valor_imposto);
        countWithTax += 1;
      }
    });

    const effectiveTaxPercent = totalValor > 0 ? (totalTax / totalValor) * 100 : 0;

    return {
      totalTax,
      effectiveTaxPercent,
      countWithTax,
      totalValor,
      isCasanOnly: selectedConcessionaire === "CASAN",
      isCelescOnly: selectedConcessionaire === "CELESC",
      avgWaterPricePerM3: stats.totalM3 > 0 ? (stats.totalValor / stats.totalM3) : 0,
      avgEnergyPricePerKwh: stats.totalKwh > 0 ? (stats.totalValor / stats.totalKwh) : 0,
    };
  }, [filteredLancamentos, stats, selectedConcessionaire]);

  // Tariff Flags Analysis - 100% Real calculation based on measured kWh from database
  const flagAnalysis = useMemo(() => {
    if (selectedConcessionaire === "CASAN") {
      return {
        isWaterConcessionaire: true,
        message: "As Bandeiras Tarifárias ANEEL (Verde, Amarela, Vermelha) aplicam-se exclusivamente às faturas de Energia Elétrica (CELESC). Faturas da CASAN são regidas pelas tabelas da ARESC/CISAN baseadas em faixas de consumo de água (m³) e taxa de esgoto."
      };
    }

    const totalKwh = stats.totalKwh;
    const totalVal = stats.totalValor;

    return {
      isWaterConcessionaire: false,
      totalKwh,
      totalVal,
      flags: [
        {
          flag: "Bandeira Verde",
          description: "Condições favoráveis de geração na bacia hidrográfica (Sem acréscimo tarifário)",
          additionPerKwh: 0,
          estimatedAdditionalCost: 0,
          badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        },
        {
          flag: "Bandeira Amarela",
          description: "Geração térmica menos favorável (+R$ 0,01885 por kWh consumido)",
          additionPerKwh: 0.01885,
          estimatedAdditionalCost: totalKwh * 0.01885,
          badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/30"
        },
        {
          flag: "Bandeira Vermelha P1",
          description: "Acionamento ostensivo de usinas termelétricas (+R$ 0,04463 por kWh consumido)",
          additionPerKwh: 0.04463,
          estimatedAdditionalCost: totalKwh * 0.04463,
          badgeBg: "bg-red-500/20 text-red-300 border-red-500/30"
        },
        {
          flag: "Bandeira Vermelha P2",
          description: "Escassez hídrica e alto custo de combustíveis (+R$ 0,07877 por kWh consumido)",
          additionPerKwh: 0.07877,
          estimatedAdditionalCost: totalKwh * 0.07877,
          badgeBg: "bg-rose-600/30 text-rose-200 border-rose-500/40"
        }
      ]
    };
  }, [stats, selectedConcessionaire]);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-950 p-6 rounded-2xl border border-indigo-500/30 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-indigo-400" />
                Inteligência Fiscal e Auditoria Pública
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Auditoria de Faturas e Detecção de Desvios
            </h2>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
              Monitoramento automatizado de gastos públicos, identificação de anomalias em consumo (&gt;20%), rastreamento de vazamentos, geração distribuída solar e análise tarifária.
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/10 shrink-0">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 px-2">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Filtros:</span>
            </div>

            {/* Mês */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-[#121212] border border-white/15 text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Todos os Meses</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {/* Concessionária */}
            <select
              value={selectedConcessionaire}
              onChange={(e) => setSelectedConcessionaire(e.target.value as any)}
              className="bg-[#121212] border border-white/15 text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Todas Concessionárias</option>
              <option value="CELESC">CELESC (Energia)</option>
              <option value="CASAN">CASAN (Água)</option>
              <option value="OUTROS">Outros Serviços</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Consumo Elétrico */}
        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 hover:border-amber-500/30 transition shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Consumo Elétrico</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-extrabold text-white">
            {stats.totalKwh.toLocaleString("pt-BR")} <span className="text-xs text-amber-400 font-sans font-medium">kWh</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Consumo total acumulado</p>
        </div>

        {/* Consumo Hídrico */}
        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 hover:border-blue-500/30 transition shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Consumo Hídrico</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Droplets className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-extrabold text-white">
            {stats.totalM3.toLocaleString("pt-BR")} <span className="text-xs text-blue-400 font-sans font-medium">m³</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Volume de água medido</p>
        </div>

        {/* Anomalias Detectadas */}
        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 hover:border-red-500/30 transition shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Desvios &gt; 20%</span>
            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400 animate-pulse">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-extrabold text-red-400 flex items-center gap-1.5">
            {anomalies.length} <span className="text-xs text-red-400/80 font-sans font-medium">Alertas</span>
          </div>
          <p className="text-[10px] text-red-400/60 mt-1">Suspeita fuga/vazamento</p>
        </div>

        {/* Energia Solar Produzida */}
        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 hover:border-emerald-500/30 transition shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Energia Solar (GD)</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Sun className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-extrabold text-emerald-400">
            {solarData.totalKwhGenerated.toLocaleString("pt-BR")} <span className="text-xs text-emerald-400 font-sans font-medium">kWh</span>
          </div>
          <p className="text-[10px] text-emerald-400/70 mt-1">Economia R$ {solarData.totalCompensatedR$.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>

        {/* Total Faturado R$ */}
        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 hover:border-indigo-500/30 transition shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Auditado</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-extrabold text-white">
            R$ {stats.totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">{stats.count} faturas analisadas</p>
        </div>

      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab("ANOMALIAS")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "ANOMALIAS"
              ? "bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm"
              : "bg-[#121212] text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-white/5"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>Detecção de Desvios &gt; 20%</span>
          {anomalies.length > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white font-mono text-[10px] rounded-full font-extrabold">
              {anomalies.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("RANKING")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "RANKING"
              ? "bg-indigo-600 text-white border border-indigo-500 shadow-sm"
              : "bg-[#121212] text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-white/5"
          }`}
        >
          <Award className="w-4 h-4 text-indigo-300" />
          <span>Ranking de Unidades Consumidoras</span>
        </button>

        <button
          onClick={() => setActiveTab("SOLAR")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "SOLAR"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
              : "bg-[#121212] text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-white/5"
          }`}
        >
          <Sun className="w-4 h-4 text-emerald-400" />
          <span>Energia Solar (Geração Distribuída)</span>
        </button>

        <button
          onClick={() => setActiveTab("IMPOSTOS_PERDAS")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "IMPOSTOS_PERDAS"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
              : "bg-[#121212] text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-white/5"
          }`}
        >
          <PieChart className="w-4 h-4 text-amber-400" />
          <span>Impostos e Perdas Técnicas</span>
        </button>

        <button
          onClick={() => setActiveTab("BANDEIRAS")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "BANDEIRAS"
              ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm"
              : "bg-[#121212] text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-white/5"
          }`}
        >
          <Flame className="w-4 h-4 text-purple-400" />
          <span>Análise de Bandeira Tarifária</span>
        </button>
      </div>

      {/* TAB CONTENT: ANOMALIAS */}
      {activeTab === "ANOMALIAS" && (
        <div className="space-y-4">
          <div className="bg-[#121212] p-4 rounded-xl border border-white/10 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Algoritmo de Identificação de Fuga de Energia ou Vazamento de Água
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Compara a leitura da fatura atual com a média histórica da mesma Unidade Gestora. Desvios superiores a 20% são sinalizados para inspeção em campo.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 shrink-0">
              Tolerância do Sistema: +20%
            </span>
          </div>

          {anomalies.length === 0 ? (
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-12 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhum Desvio Crítico Detectado</h4>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Todas as faturas auditadas estão operando dentro do padrão de tolerância regular (&lt; 20% de variação em relação à média histórica).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {anomalies.map((item, idx) => (
                <div 
                  key={idx}
                  className={`p-5 rounded-xl border transition relative overflow-hidden ${
                    item.type === "VAZAMENTO_AGUA"
                      ? "bg-blue-950/20 border-blue-500/40 hover:border-blue-400"
                      : "bg-red-950/20 border-red-500/40 hover:border-red-400"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase ${
                        item.type === "VAZAMENTO_AGUA"
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : "bg-red-500/20 text-red-300 border border-red-500/30"
                      }`}>
                        {item.type === "VAZAMENTO_AGUA" ? (
                          <>
                            <Droplets className="w-3 h-3 text-blue-400" />
                            ALERTA: Possível Vazamento de Água
                          </>
                        ) : (
                          <>
                            <Zap className="w-3 h-3 text-red-400" />
                            ALERTA: Possível Fuga de Luz / Sobrecarga
                          </>
                        )}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-2">{item.unitName}</h4>
                      <p className="text-xs text-gray-400">{item.secretariaNome}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-lg font-mono font-extrabold text-red-400 flex items-center justify-end gap-1">
                        <ArrowUpRight className="w-5 h-5" />
                        +{item.variancePercent}%
                      </div>
                      <span className="text-[10px] text-gray-500 uppercase font-bold">Aumento Anormal</span>
                    </div>
                  </div>

                  {/* Comparison Stats */}
                  <div className="grid grid-cols-2 gap-2 bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-xs my-3">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase block">Média Histórica</span>
                      <span className="text-gray-300 font-bold">
                        {Math.round(item.avgConsumo).toLocaleString("pt-BR")} {item.type === "VAZAMENTO_AGUA" ? "m³" : "kWh"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-red-400 uppercase block">Leitura Atual</span>
                      <span className="text-red-300 font-bold">
                        {item.currentConsumo.toLocaleString("pt-BR")} {item.type === "VAZAMENTO_AGUA" ? "m³" : "kWh"}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-gray-400 pt-2 border-t border-white/5">
                    <span>Mês Referência: <strong className="text-gray-200">{item.currentMonth}</strong></span>
                    <span className="font-mono text-white font-bold">R$ {Number(item.currentValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: RANKING */}
      {activeTab === "RANKING" && (
        <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-white/10">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-400" />
                Unidades Gestoras com Maior Consumo e Despesa
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Mapeamento das instalações municipais que mais impactam o orçamento público.
              </p>
            </div>
            <span className="text-xs text-gray-400 font-mono">Total de UCs ativas: {unitRanking.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0a0a0a] text-gray-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3">Posição</th>
                  <th className="p-3">Unidade Gestora</th>
                  <th className="p-3">Secretaria</th>
                  <th className="p-3 text-right">Consumo Energia (kWh)</th>
                  <th className="p-3 text-right">Consumo Água (m³)</th>
                  <th className="p-3 text-right">Total Faturado (R$)</th>
                  <th className="p-3 text-center">Faturas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-gray-300 font-mono">
                {unitRanking.map((u, index) => (
                  <tr key={index} className="hover:bg-white/5 transition">
                    <td className="p-3 font-bold">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] ${
                        index === 0 ? "bg-amber-500 text-black font-extrabold" :
                        index === 1 ? "bg-slate-300 text-black font-extrabold" :
                        index === 2 ? "bg-amber-700 text-white font-extrabold" :
                        "bg-white/10 text-gray-400"
                      }`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="p-3 font-sans font-bold text-white">{u.name}</td>
                    <td className="p-3 font-sans text-gray-400">{u.sec}</td>
                    <td className="p-3 text-right text-amber-300 font-bold">
                      {u.totalConsumoKwh > 0 ? `${u.totalConsumoKwh.toLocaleString("pt-BR")} kWh` : "—"}
                    </td>
                    <td className="p-3 text-right text-blue-300 font-bold">
                      {u.totalConsumoM3 > 0 ? `${u.totalConsumoM3.toLocaleString("pt-BR")} m³` : "—"}
                    </td>
                    <td className="p-3 text-right text-emerald-400 font-bold">
                      R$ {u.totalVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-center font-sans">
                      <span className="px-2 py-0.5 rounded bg-white/10 text-gray-300 text-[10px]">
                        {u.count} un.
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: SOLAR */}
      {activeTab === "SOLAR" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 p-6 rounded-2xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Microgeração Distribuída (GD)
                </span>
                <h3 className="text-lg font-bold text-white mt-1">Balanço do Sistema de Geração Fotovoltaica</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-xl">
                  Créditos reais de energia solar (valor_credito) apurados nas faturas auditadas.
                </p>
              </div>

              <div className="bg-black/50 p-4 rounded-xl border border-emerald-500/30 text-right">
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Créditos Financeiros Auditados</span>
                <span className="text-2xl font-mono font-extrabold text-emerald-400">
                  R$ {solarData.totalCompensatedR$.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {solarData.isWaterConcessionaire ? (
            <div className="bg-[#141414] border border-blue-500/30 rounded-2xl p-8 text-center space-y-3">
              <Droplets className="w-10 h-10 text-blue-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Geração Solar Não Aplicável para CASAN</h4>
              <p className="text-xs text-gray-400 max-w-lg mx-auto">
                {solarData.message}
              </p>
            </div>
          ) : !solarData.hasRecords ? (
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-8 text-center space-y-3">
              <Sun className="w-10 h-10 text-emerald-400/50 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhum Crédito de Energia Solar no Banco de Dados</h4>
              <p className="text-xs text-gray-400 max-w-lg mx-auto">
                {solarData.message}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {solarData.solarUnits.map((item, idx) => (
                <div key={idx} className="bg-[#141414] p-5 rounded-xl border border-white/10 hover:border-emerald-500/30 transition space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                      <Sun className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20">
                      Geração Distribuída
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white">{item.name}</h4>
                    <p className="text-xs text-gray-400 mt-0.5">{item.count} faturas com crédito apurado</p>
                  </div>

                  <div className="pt-3 border-t border-white/5 space-y-1 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Consumo Auditado:</span>
                      <strong className="text-amber-300">{item.totalKwh.toLocaleString("pt-BR")} kWh</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Crédito (valor_credito):</span>
                      <strong className="text-emerald-400">R$ {item.compensatedVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: IMPOSTOS & PERDAS */}
      {activeTab === "IMPOSTOS_PERDAS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Tributação de Serviços Públicos */}
          <div className="bg-[#141414] p-6 rounded-2xl border border-white/10 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <PieChart className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Tributos Fiscais Auditados</h3>
                <p className="text-xs text-gray-400">Valores extraídos diretamente do campo 'valor_imposto' das faturas</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold text-white block">Total de Impostos Registrados</span>
                  <span className="text-[10px] text-gray-400">Soma real de 'valor_imposto' de {taxLossesData.countWithTax} faturas com imposto preenchido</span>
                </div>
                <span className="text-base font-mono font-bold text-amber-300">
                  R$ {taxLossesData.totalTax.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold text-white block">Carga Tributária Efetiva</span>
                  <span className="text-[10px] text-gray-400">Proporção dos impostos sobre o total auditado</span>
                </div>
                <span className="text-base font-mono font-bold text-amber-300">
                  {taxLossesData.effectiveTaxPercent.toFixed(2)}%
                </span>
              </div>

              {taxLossesData.totalTax === 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300/80">
                  Nota: O total de impostos é R$ 0,00 porque o campo 'valor_imposto' nos registros cadastrados está zerado ou não foi informado nas faturas importadas.
                </div>
              )}
            </div>
          </div>

          {/* Análise Tarifária e Eficiência */}
          <div className="bg-[#141414] p-6 rounded-2xl border border-white/10 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Análise Tarifária & Eficiência</h3>
                <p className="text-xs text-gray-400">Métricas calculadas a partir do volume e custo das faturas</p>
              </div>
            </div>

            <div className="space-y-3">
              {taxLossesData.isCasanOnly ? (
                <>
                  <div className="bg-blue-950/20 p-3.5 rounded-xl border border-blue-500/30 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-blue-200 block">Volume Total Hídrico Medido</span>
                      <span className="text-[10px] text-blue-300/70">Consumo em metros cúbicos (CASAN)</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-blue-300">
                      {stats.totalM3.toLocaleString("pt-BR")} m³
                    </span>
                  </div>

                  <div className="bg-blue-950/20 p-3.5 rounded-xl border border-blue-500/30 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-blue-200 block">Custo Médio por m³ de Água</span>
                      <span className="text-[10px] text-blue-300/70">Total faturado CASAN / Volume medido</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-blue-300">
                      R$ {taxLossesData.avgWaterPricePerM3.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / m³
                    </span>
                  </div>

                  <div className="bg-blue-950/20 p-3.5 rounded-xl border border-blue-500/30">
                    <span className="text-xs font-bold text-blue-200 block mb-1">Tarifa de Esgoto Sanitário</span>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Em Santa Catarina, a CASAN aplica adicional de 100% sobre o valor da água para saneamento básico. Monitorar vazamentos evita a cobrança duplicada.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-amber-950/20 p-3.5 rounded-xl border border-amber-500/30 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-amber-200 block">Consumo Elétrico Acumulado</span>
                      <span className="text-[10px] text-amber-300/70">Consumo em kWh (CELESC)</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-amber-300">
                      {stats.totalKwh.toLocaleString("pt-BR")} kWh
                    </span>
                  </div>

                  <div className="bg-amber-950/20 p-3.5 rounded-xl border border-amber-500/30 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-amber-200 block">Custo Médio por kWh</span>
                      <span className="text-[10px] text-amber-300/70">Total faturado CELESC / Consumo kWh</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-amber-300">
                      R$ {taxLossesData.avgEnergyPricePerKwh.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / kWh
                    </span>
                  </div>

                  <div className="bg-red-950/20 p-3.5 rounded-xl border border-red-500/30">
                    <span className="text-xs font-bold text-red-200 block mb-1">Demanda Contratada & Fator de Potência</span>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Para unidades de grande porte, verifique se a demanda medida ultrapassa o contrato ou se há cobrança por reativo excedente (FP &lt; 0,92).
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      )}

      {/* TAB CONTENT: BANDEIRAS */}
      {activeTab === "BANDEIRAS" && (
        <div className="bg-[#141414] p-6 rounded-2xl border border-white/10 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-purple-400" />
              Detalhamento por Bandeira Tarifária ANEEL
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Avaliação do impacto adicional no orçamento municipal calculado a partir do consumo elétrico medido de {stats.totalKwh.toLocaleString("pt-BR")} kWh.
            </p>
          </div>

          {flagAnalysis.isWaterConcessionaire ? (
            <div className="bg-blue-950/20 border border-blue-500/30 rounded-2xl p-8 text-center space-y-3">
              <Droplets className="w-10 h-10 text-blue-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Bandeiras Tarifárias Não se Aplicam a CASAN</h4>
              <p className="text-xs text-gray-400 max-w-xl mx-auto leading-relaxed">
                {flagAnalysis.message}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {flagAnalysis.flags?.map((f, idx) => (
                <div key={idx} className="bg-black/40 p-4 rounded-xl border border-white/10 space-y-3">
                  <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold border ${f.badgeBg}`}>
                    {f.flag}
                  </span>
                  <p className="text-[11px] text-gray-400 leading-snug">{f.description}</p>

                  <div className="pt-2 border-t border-white/5 flex justify-between items-end">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase block">Adicional / kWh</span>
                      <span className="text-xs font-mono font-bold text-white">R$ {f.additionPerKwh.toFixed(5)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-500 uppercase block">Custo Estimado</span>
                      <span className="text-sm font-mono font-bold text-purple-300">
                        R$ {f.estimatedAdditionalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
