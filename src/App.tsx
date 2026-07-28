import React, { useState, useEffect } from "react";
import { Globe, FileCheck, HelpCircle, Layers, CheckCircle, LogOut, ShieldCheck } from "lucide-react";
import WebPortal from "./components/WebPortal";
import ProjectReport from "./components/ProjectReport";
import Login from "./components/Login";
import Usuarios from "./components/Usuarios";
import { UsuarioPublico } from "./types";

export default function App() {
  const [viewMode, setViewMode] = useState<"web" | "report" | "usuarios">("web");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [currentUser, setCurrentUser] = useState<UsuarioPublico | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => (res.ok ? res.json() : null))
      .then(data => setCurrentUser(data?.user || null))
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
  };

  const handleDataChanged = () => {
    // Increment counter to force child components to refetch from our single backend server
    setRefreshCounter(prev => prev + 1);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-gray-500 text-sm font-mono">
        Verificando sessão...
      </div>
    );
  }

  if (!currentUser) {
    return <Login onAuthenticated={setCurrentUser} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 flex flex-col font-sans" id="sispu-app-root">
      
      {/* 🚀 System Admin Control Bar */}
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

          {/* Mode Switcher */}
          <div className="flex bg-[#0a0a0a] p-1 rounded-xl border border-white/10 text-xs font-semibold gap-1">
            <button
              onClick={() => setViewMode("web")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
                viewMode === "web"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Globe className="h-4 w-4" />
              <span>Portal do Gestor (Web)</span>
            </button>

            <button
              onClick={() => setViewMode("report")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
                viewMode === "report"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <FileCheck className="h-4 w-4" />
              <span>Auditoria e Controle</span>
            </button>

            {currentUser.role === "admin" && (
              <button
                onClick={() => setViewMode("usuarios")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
                  viewMode === "usuarios"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Usuários</span>
              </button>
            )}
          </div>

          {/* Logged-in user + logout */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-2 font-mono text-[10px] text-gray-400 bg-[#0a0a0a] px-3 py-1.5 rounded-md border border-white/10">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{currentUser.nome.toUpperCase()} · {currentUser.role === "admin" ? "ADMIN" : "OPERADOR"}</span>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 bg-[#0a0a0a] text-gray-400 hover:text-white hover:border-rose-500/40 hover:bg-rose-500/10 transition-colors text-[10px] font-mono uppercase"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* 📖 Informative Header Banner */}
      <section className="bg-gradient-to-r from-[#0f0f0f] to-[#0a0a0a] border-b border-white/10 py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-blue-500 font-mono uppercase tracking-widest">
              Fiscalização e Controle Municipal
            </span>
            <h2 className="text-2xl font-sans font-bold tracking-tight text-white">
              {viewMode === "web" && "Portal do Gestor — Indicadores e Relatórios"}
              {viewMode === "report" && "Auditoria e Controle Interno de Reconstrução"}
              {viewMode === "usuarios" && "Gestão de Usuários e Acessos"}
            </h2>
            <p className="text-xs text-gray-300 max-w-2xl leading-normal text-justify">
              {viewMode === "web" && "Painel de controle estratégico para análise de despesas, consumo de água e energia, auditoria em tempo real e gráficos comparativos consolidados."}
              {viewMode === "report" && "Consolidação e histórico das verificações de integridade do sistema, logs de erro históricos recuperados do sistema legado e diagnósticos estruturais de conformidade de dados."}
              {viewMode === "usuarios" && "Criação e administração de contas de acesso ao sistema. Apenas administradores podem ver esta tela."}
            </p>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 max-w-xs flex items-start gap-2.5">
            <CheckCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-[10px] text-blue-200 leading-normal">
              <strong>Município de Rio do Sul:</strong> lançamentos, medidores e faturas de energia, água e telefonia consolidados em um único repositório de dados.
            </div>
          </div>
        </div>
      </section>

      {/* 🖼️ Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {viewMode === "web" && (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
            <WebPortal
              onRefreshTrigger={refreshCounter}
              onDataChanged={handleDataChanged}
              currentUserNome={currentUser.nome}
            />
          </div>
        )}

        {viewMode === "report" && (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-300 bg-[#0f0f0f] p-6 rounded-xl border border-white/10 text-gray-200 shadow-2xl">
            <ProjectReport />
          </div>
        )}

        {viewMode === "usuarios" && currentUser.role === "admin" && (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-300 bg-[#0f0f0f] p-6 rounded-xl border border-white/10 text-gray-200 shadow-2xl">
            <Usuarios currentUser={currentUser} />
          </div>
        )}
      </main>

      {/* 🛠️ Global Application Footer */}
      <footer className="bg-[#050505] border-t border-white/5 text-gray-500 text-[11px] py-4 px-6 font-mono text-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
          <span>SISPU.JP 2.0 — Sistema Público de Gestão de Despesas e Auditoria</span>
          <span className="text-gray-400">Município de Rio do Sul — sessão de <strong>{currentUser.nome}</strong></span>
        </div>
      </footer>
    </div>
  );
}

