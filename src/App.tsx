import React, { useState, useEffect } from "react";
import WebPortal from "./components/WebPortal";
import { Database, CheckCircle2, AlertCircle, Key, X, RefreshCw, Server, GitBranch, Upload, ShieldCheck, Terminal } from "lucide-react";

export default function App() {
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message?: string; db_url_masked?: string }>({ connected: false });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState("postgresql://neondb_owner:SUA_SENHA@ep-gentle-tooth-ac4kw850.sa-east-1.aws.neon.tech/neondb?sslmode=require");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // GitHub Modal state
  const [isGitModalOpen, setIsGitModalOpen] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [gitSubmitting, setGitSubmitting] = useState(false);
  const [gitFeedback, setGitFeedback] = useState<{
    success: boolean;
    message: string;
    push_output?: string;
    git_status?: string;
    git_log?: string;
  } | null>(null);

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

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/db-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database_url: inputUrl })
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({ type: 'success', message: data.message });
        await checkDbStatus();
        handleDataChanged();
        setTimeout(() => {
          setIsModalOpen(false);
          setFeedback(null);
        }, 1500);
      } else {
        setFeedback({ type: 'error', message: data.error || "Erro ao conectar ao PostgreSQL." });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || "Erro de rede ao salvar configuração." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGitPush = async (e: React.FormEvent) => {
    e.preventDefault();
    setGitSubmitting(true);
    setGitFeedback(null);

    try {
      const res = await fetch('/api/github-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_token: githubToken })
      });
      const data = await res.json();

      if (data.success) {
        setGitFeedback({
          success: true,
          message: data.message,
          push_output: data.push_output,
          git_status: data.git_status,
          git_log: data.git_log
        });
      } else {
        setGitFeedback({
          success: false,
          message: data.error || "Falha ao realizar git push."
        });
      }
    } catch (err: any) {
      setGitFeedback({
        success: false,
        message: err.message || "Erro de rede ao realizar push."
      });
    } finally {
      setGitSubmitting(false);
    }
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

      {/* Modal de Configuração do Banco de Dados Neon */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-white/10 rounded-xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Configuração de Banco PostgreSQL (Neon)
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Insira a Connection String completa fornecida pelo seu projeto no <strong>Neon DB</strong> para que todas as alterações do SISPU sejam persistidas permanentemente.
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">
                  DATABASE_URL (Connection String)
                </label>
                <textarea
                  rows={3}
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="postgresql://neondb_owner:SUA_SENHA@ep-gentle-tooth-ac4kw850.sa-east-1.aws.neon.tech/neondb?sslmode=require"
                  className="w-full bg-[#080808] border border-white/15 rounded-lg p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                  required
                />
                <span className="text-[11px] text-gray-500 block mt-1">
                  Certifique-se de substituir <code className="text-amber-400">SENHA</code> pela sua senha real do Neon.
                </span>
              </div>

              {feedback && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    feedback.type === 'success'
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                      : "bg-red-500/10 border border-red-500/30 text-red-300"
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 hover:bg-white/5 border border-transparent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? "Conectando..." : "Testar e Conectar Banco"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Sincronização GitHub (Git Push via GIT_ASKPASS / GITHUB_TOKEN) */}
      {isGitModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-purple-500/20 rounded-xl max-w-xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-purple-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Sincronização Segura com GitHub (Git Push)
                </h2>
              </div>
              <button
                onClick={() => setIsGitModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              O token de autenticação é transmitido de forma isolada via <code className="text-purple-400">GIT_ASKPASS</code> / <code className="text-purple-400">GITHUB_TOKEN</code>, garantindo que suas credenciais nunca sejam expostas na URL do repositório ou no histórico do terminal.
            </p>

            <form onSubmit={handleGitPush} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  GitHub Personal Access Token (PAT)
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-[#080808] border border-white/15 rounded-lg p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
                <span className="text-[11px] text-gray-500 block mt-1">
                  Requer permissão de <code className="text-purple-300">repo</code> ou <code className="text-purple-300">contents:write</code> para o repositório <code className="text-gray-300">jeanrsl098/SisPu.JP</code>.
                </span>
              </div>

              {gitFeedback && (
                <div className="space-y-3 pt-2">
                  <div
                    className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                      gitFeedback.success
                        ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                        : "bg-red-500/10 border border-red-500/30 text-red-300"
                    }`}
                  >
                    {gitFeedback.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <span>{gitFeedback.message}</span>
                  </div>

                  {gitFeedback.push_output && (
                    <div className="bg-[#050505] border border-white/10 rounded-lg p-3 font-mono text-[11px] text-gray-300 overflow-x-auto">
                      <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
                        <Terminal className="w-3 h-3 text-purple-400" /> Saída do Comando Git Push:
                      </div>
                      <pre className="whitespace-pre-wrap">{gitFeedback.push_output}</pre>
                      
                      {gitFeedback.git_log && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Últimos Commits (git log -5):</div>
                          <pre className="text-emerald-400">{gitFeedback.git_log}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGitModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 hover:bg-white/5 border border-transparent"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={gitSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow-md shadow-purple-500/20 disabled:opacity-50"
                >
                  {gitSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {gitSubmitting ? "Executando Push..." : "Executar Push para GitHub"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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


