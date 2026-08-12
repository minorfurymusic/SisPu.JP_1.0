import React, { useState, useEffect } from "react";
import WebPortal from "./components/WebPortal";

export default function App() {
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message?: string; db_url_masked?: string }>({ connected: false });

  const checkDbStatus = async () => {
    try {
      const res = await fetch('/api/db-status');
      const data = await res.json();
      setDbStatus(data);
    } catch (err) {
      console.error("Erro ao checar status do banco:", err);
    }
  };

  useEffect(() => {
    checkDbStatus();
  }, []);

  const handleDataChanged = () => {
    setRefreshCounter(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 flex flex-col font-sans" id="sispu-app-root">
      
      {/* 🚀 Header Navbar */}
      <header className="bg-[#0f0f0f] border-b border-white/10 py-3.5 px-6 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <div className="flex items-center justify-center text-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold font-mono text-white text-lg shadow-sm shadow-blue-500/20">
              SP
            </div>
            <div className="text-center">
              <h1 className="text-sm font-extrabold tracking-tight text-white uppercase flex items-center justify-center gap-1.5">
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
          <span className="text-gray-400">
            {dbStatus.connected ? (
              <span className="text-emerald-400 font-semibold">● Conectado ao Neon PostgreSQL</span>
            ) : (
              <span className="text-amber-400 font-semibold">○ Memória Local (Aguardando Senha do Neon)</span>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}


