import React, { useState } from "react";
import WebPortal from "./components/WebPortal";

export default function App() {
  const [refreshCounter, setRefreshCounter] = useState(0);

  const handleDataChanged = () => {
    // Increment counter to force child components to refetch from our single backend server
    setRefreshCounter(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 flex flex-col font-sans" id="sispu-app-root">
      
      {/* 🚀 Header Navbar */}
      <header className="bg-[#0f0f0f] border-b border-white/10 py-3.5 px-6 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold font-mono text-white text-lg shadow-sm shadow-blue-500/20">
              SP
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-white uppercase flex items-center gap-1.5">
                SISPU.JP <span className="text-blue-500 text-xs">2.0</span> — Gestão de Despesas
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold font-mono">
                SECRETARIA DE PLANEJAMENTO E FINANÇAS
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 🖼️ Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
          <WebPortal 
            onRefreshTrigger={refreshCounter} 
            onDataChanged={handleDataChanged} 
          />
        </div>
      </main>

      {/* 🛠️ Global Application Footer */}
      <footer className="bg-[#050505] border-t border-white/5 text-gray-500 text-[11px] py-4 px-6 font-mono text-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
          <span>SISPU.JP 2.0 — Sistema Público de Gestão de Despesas</span>
          <span className="text-gray-400">Ambiente de Produção: <strong>Banco Integrado de Rio do Sul</strong></span>
        </div>
      </footer>
    </div>
  );
}


