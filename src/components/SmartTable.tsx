import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowUpDown, ArrowUp, ArrowDown, Settings, 
  Eye, EyeOff, Pin, PinOff, RefreshCw, GripVertical, Search 
} from "lucide-react";

export interface SmartTableColumn {
  key: string;
  label: string;
  render?: (item: any) => React.ReactNode;
  isPinned?: boolean;
  searchable?: boolean;
  type?: "string" | "number" | "currency" | "date" | "boolean";
}

interface SmartTableProps {
  tableId: string;
  data: any[];
  columns: SmartTableColumn[];
  searchPlaceholder?: string;
  onRowClick?: (item: any) => void;
  expandedRowRender?: (item: any) => React.ReactNode;
  isRowExpanded?: (item: any) => boolean;
  rowClassName?: (item: any) => string;
}

interface TableConfig {
  columnOrder: string[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: string[];
}

export default function SmartTable({
  tableId,
  data,
  columns,
  searchPlaceholder = "Pesquisar...",
  onRowClick,
  expandedRowRender,
  isRowExpanded,
  rowClassName
}: SmartTableProps) {
  // State for config
  const [config, setConfig] = useState<TableConfig>({
    columnOrder: [],
    hiddenColumns: [],
    columnWidths: {},
    pinnedColumns: []
  });

  // Local filtering & sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  // Resize refs & states
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Load configuration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`sispu_table_config:${tableId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
      } catch (e) {
        resetConfig();
      }
    } else {
      resetConfig();
    }
  }, [tableId, columns]);

  const resetConfig = () => {
    const defaultConfig: TableConfig = {
      columnOrder: columns.map(c => c.key),
      hiddenColumns: [],
      columnWidths: columns.reduce((acc, c) => {
        acc[c.key] = 150; // default starting width
        return acc;
      }, {} as Record<string, number>),
      pinnedColumns: columns.filter(c => c.isPinned).map(c => c.key)
    };
    setConfig(defaultConfig);
    saveConfig(defaultConfig);
  };

  const saveConfig = (newConfig: TableConfig) => {
    localStorage.setItem(`sispu_table_config:${tableId}`, JSON.stringify(newConfig));
    setConfig(newConfig);
  };

  // Drag and Drop handlers for Column Reordering
  const handleDragStart = (e: React.DragEvent, colKey: string) => {
    setDraggedCol(colKey);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string) => {
    if (draggedCol && draggedCol !== targetKey) {
      e.preventDefault();
    }
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    if (draggedCol && draggedCol !== targetKey) {
      const newOrder = [...config.columnOrder];
      const draggedIdx = newOrder.indexOf(draggedCol);
      const targetIdx = newOrder.indexOf(targetKey);

      if (draggedIdx !== -1 && targetIdx !== -1) {
        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, draggedCol);
        const updated = { ...config, columnOrder: newOrder };
        saveConfig(updated);
      }
    }
    setDraggedCol(null);
  };

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const th = (e.target as HTMLElement).closest("th");
    if (!th) return;

    resizeRef.current = {
      key: colKey,
      startX: e.clientX,
      startWidth: th.offsetWidth
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const { key, startX, startWidth } = resizeRef.current;
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(60, startWidth + deltaX);

    setConfig(prev => {
      const updatedWidths = { ...prev.columnWidths, [key]: newWidth };
      const updated = { ...prev, columnWidths: updatedWidths };
      localStorage.setItem(`sispu_table_config:${tableId}`, JSON.stringify(updated));
      return updated;
    });
  };

  const handleResizeEnd = () => {
    resizeRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  };

  // Toggle column visibility
  const toggleVisibility = (colKey: string) => {
    const isHidden = config.hiddenColumns.includes(colKey);
    let newHidden = [...config.hiddenColumns];
    if (isHidden) {
      newHidden = newHidden.filter(k => k !== colKey);
    } else {
      newHidden.push(colKey);
    }
    saveConfig({ ...config, hiddenColumns: newHidden });
  };

  // Toggle pin
  const togglePin = (colKey: string) => {
    const isPinned = config.pinnedColumns.includes(colKey);
    let newPinned = [...config.pinnedColumns];
    if (isPinned) {
      newPinned = newPinned.filter(k => k !== colKey);
    } else {
      newPinned.push(colKey);
    }
    saveConfig({ ...config, pinnedColumns: newPinned });
  };

  // Toggle sorting
  const handleSort = (colKey: string) => {
    if (sortField === colKey) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(colKey);
      setSortDirection("asc");
    }
  };

  // Filter and sort raw data
  const filteredData = React.useMemo(() => {
    let result = [...data];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => {
        return columns.some(col => {
          if (col.searchable === false) return false;
          
          // If custom render is present, we try searching raw key value
          const val = item[col.key];
          if (val === undefined || val === null) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // Sort
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Handle string casing
        if (typeof valA === "string") valA = valA.toUpperCase();
        if (typeof valB === "string") valB = valB.toUpperCase();

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, columns, searchQuery, sortField, sortDirection]);

  // Determine actual column order including hidden ones filter
  const visibleColumns = config.columnOrder
    .map(key => columns.find(c => c.key === key))
    .filter((c): c is SmartTableColumn => !!c && !config.hiddenColumns.includes(c.key));

  // Render headers
  const renderHeader = (col: SmartTableColumn) => {
    const isPinned = config.pinnedColumns.includes(col.key);
    const colWidth = config.columnWidths[col.key] || 150;

    return (
      <th
        key={col.key}
        draggable
        onDragStart={(e) => handleDragStart(e, col.key)}
        onDragOver={(e) => handleDragOver(e, col.key)}
        onDrop={(e) => handleDrop(e, col.key)}
        className={`px-4 py-3 bg-slate-50 text-slate-700 uppercase font-bold text-[11px] border-b border-slate-200 relative select-none group/th transition-all ${
          isPinned ? "sticky left-0 z-20 bg-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" : ""
        }`}
        style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
      >
        <div className="flex items-center justify-between gap-1.5 w-full">
          <span 
            onClick={() => handleSort(col.key)}
            className="cursor-pointer flex items-center gap-1.5 hover:text-slate-900 flex-1 truncate"
            title="Clique para ordenar"
          >
            <GripVertical className="h-3 w-3 text-slate-300 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />
            <span className="truncate">{col.label}</span>
            {sortField === col.key ? (
              sortDirection === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              )
            ) : (
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-300 shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />
            )}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => togglePin(col.key)}
              className={`p-0.5 rounded hover:bg-slate-200 transition ${isPinned ? "text-indigo-600" : "text-slate-300 opacity-0 group-hover/th:opacity-100"}`}
              title={isPinned ? "Descongelar coluna" : "Congelar/Fixar coluna"}
            >
              <Pin className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={(e) => handleResizeStart(e, col.key)}
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 bg-slate-200/50 z-30 opacity-0 group-hover/th:opacity-100 transition-opacity"
        />
      </th>
    );
  };

  return (
    <div className="w-full space-y-3 font-sans">
      {/* 🔍 SEARCH AND CONTROLS HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200/80 shadow-sm">
        <div className="relative w-full sm:w-72">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => setShowConfigModal(true)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
          >
            <Settings className="h-3.5 w-3.5 text-slate-500" />
            Gerenciar Colunas
          </button>
          <button
            onClick={resetConfig}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold flex items-center justify-center transition active:scale-95"
            title="Restaurar layout original da tabela"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* 📊 TABLE LAYOUT CONTAINER */}
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 shadow-sm bg-white">
        <table className="w-full border-collapse text-left text-xs text-slate-600">
          <thead>
            <tr className="border-b border-slate-200">
              {visibleColumns.map(col => renderHeader(col))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-slate-400 italic">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              filteredData.map((item, idx) => {
                const isExpanded = isRowExpanded ? isRowExpanded(item) : false;
                const rowCustomClass = rowClassName ? rowClassName(item) : "";
                
                return (
                  <React.Fragment key={item.id || idx}>
                    <tr
                      onClick={() => onRowClick && onRowClick(item)}
                      className={`hover:bg-slate-50/80 transition-colors group ${
                        onRowClick ? "cursor-pointer" : ""
                      } ${rowCustomClass}`}
                    >
                      {visibleColumns.map(col => {
                        const isPinned = config.pinnedColumns.includes(col.key);
                        const width = config.columnWidths[col.key] || 150;

                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-2.5 transition-all text-slate-800 ${
                              isPinned ? "sticky left-0 bg-white/95 group-hover:bg-slate-50/95 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" : ""
                            }`}
                            style={{ maxWidth: `${width}px`, minWidth: `${width}px`, width: `${width}px` }}
                          >
                            <div className="truncate">
                              {col.render ? col.render(item) : (item[col.key] !== undefined && item[col.key] !== null ? String(item[col.key]) : "-")}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && expandedRowRender && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={visibleColumns.length} className="px-6 py-4 border-b border-slate-200/80">
                          {expandedRowRender(item)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ⚙️ GERENCIAR COLUNAS POPUP MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Visualização de Colunas</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Ordene, oculte ou congele as colunas desta tabela de dados</p>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base px-2 py-1 rounded hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Arrastar para ordenar e configurar</span>
                <div className="space-y-1.5">
                  {config.columnOrder.map((key) => {
                    const col = columns.find(c => c.key === key);
                    if (!col) return null;
                    const isHidden = config.hiddenColumns.includes(key);
                    const isPinned = config.pinnedColumns.includes(key);

                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold transition ${
                          isHidden ? "bg-slate-50/60 border-slate-100 text-slate-400" : "bg-white border-slate-200 text-slate-700 shadow-sm"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                          <span className="truncate">{col.label}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => toggleVisibility(key)}
                            className={`p-1 rounded hover:bg-slate-100 transition ${isHidden ? "text-slate-400" : "text-indigo-600"}`}
                            title={isHidden ? "Exibir coluna" : "Ocultar coluna"}
                          >
                            {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          
                          <button
                            onClick={() => togglePin(key)}
                            className={`p-1 rounded hover:bg-slate-100 transition ${isPinned ? "text-indigo-600" : "text-slate-300"}`}
                            title={isPinned ? "Descongelar coluna" : "Congelar coluna"}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <button
                onClick={resetConfig}
                className="text-slate-500 hover:text-slate-700 font-bold text-xs hover:underline transition"
              >
                Limpar Personalizações
              </button>
              <button
                onClick={() => setShowConfigModal(false)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm hover:shadow transition"
              >
                Aplicar Layout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
