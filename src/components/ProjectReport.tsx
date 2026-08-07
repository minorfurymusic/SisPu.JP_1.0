import React, { useEffect, useState } from "react";
import { CheckCircle2, FileText, ClipboardList, DollarSign, Activity } from "lucide-react";
import { Secretaria, Unidade, Despesa, Lancamento, AuditoriaRegistro } from "../types";

export default function ProjectReport() {
  const [stats, setStats] = useState({
    secretariasCount: 0,
    unidadesCount: 0,
    despesasCount: 0,
    lancamentosCount: 0,
    totalValor: 0,
    totalConsumo: 0
  });

  const [audits, setAuditorias] = useState<AuditoriaRegistro[]>([]);

  useEffect(() => {
    // Fetch stats to show real municipal data summary
    Promise.all([
      fetch("/api/secretarias").then(r => r.json()).catch(() => []),
      fetch("/api/unidades").then(r => r.json()).catch(() => []),
      fetch("/api/despesas").then(r => r.json()).catch(() => []),
      fetch("/api/lancamentos").then(r => r.json()).catch(() => []),
      fetch("/api/auditoria").then(r => r.json()).catch(() => [])
    ]).then(([sec, uni, des, lanc, aud]) => {
      let totalV = 0;
      let totalC = 0;
      if (Array.isArray(lanc)) {
        lanc.forEach((l: any) => {
          totalV += parseFloat(l.valor_total || "0");
          totalC += parseFloat(l.consumo || "0");
        });
      }
      setStats({
        secretariasCount: Array.isArray(sec) ? sec.length : 0,
        unidadesCount: Array.isArray(uni) ? uni.length : 0,
        despesasCount: Array.isArray(des) ? des.length : 0,
        lancamentosCount: Array.isArray(lanc) ? lanc.length : 0,
        totalValor: totalV,
        totalConsumo: totalC
      });
      if (Array.isArray(aud)) {
        setAuditorias(aud.slice(0, 8));
      }
    });
  }, []);

  return (
    <div className="text-gray-200 space-y-8" id="report-view">
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-2xl font-sans font-bold text-white tracking-tight flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-blue-500" />
          Relatório de Auditoria e Controle Interno Geral
        </h2>
        <p className="text-xs text-gray-400 font-mono mt-1 uppercase tracking-wider">
          MUNICÍPIO DE RIO DO SUL — CONSOLIDAÇÃO DE DADOS E CONFORMIDADE ADMINISTRATIVA
        </p>
      </div>

      {/* 📊 Executive Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 flex items-center gap-3.5">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-mono block">Volume Total Faturado</span>
            <span className="text-base font-bold text-white">
              {stats.totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>
        </div>

        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 flex items-center gap-3.5">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-mono block">Consumo Consolidado</span>
            <span className="text-base font-bold text-white">
              {stats.totalConsumo.toLocaleString("pt-BR")} <span className="text-xs text-gray-400">kWh/m³</span>
            </span>
          </div>
        </div>

        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 flex items-center gap-3.5">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-mono block">Secretarias Ativas</span>
            <span className="text-base font-bold text-white">{stats.secretariasCount} cadastros</span>
          </div>
        </div>

        <div className="bg-[#141414] p-4 rounded-xl border border-white/10 flex items-center gap-3.5">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <FileText className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-mono block">Unidades Gestoras</span>
            <span className="text-base font-bold text-white">{stats.unidadesCount} registradas</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">

        {/* Audit Compliance */}
        <div className="bg-[#141414] p-5 rounded-xl border border-white/10 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Integridade de Dados e Equivalência Funcional
          </h3>
          <p className="text-xs text-gray-300 text-justify leading-relaxed">
            As rotinas de gravação administrativa de despesas, medidores e lançamentos estão operando sob conformidade estrita da Secretaria de Planejamento. Os lançamentos do terminal clássico e do portal web gravam e consultam o mesmo repositório integrado.
          </p>

          <div className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-gray-300 font-medium">Contas e Medidores</span>
              <span className="text-emerald-500 font-semibold flex items-center gap-1">Concluído</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-gray-300 font-medium">Normalização das Despesas</span>
              <span className="text-emerald-500 font-semibold flex items-center gap-1">Operacional</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-gray-300 font-medium">Controle Automático de Rastreabilidade</span>
              <span className="text-emerald-500 font-semibold flex items-center gap-1">Ativo</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-gray-300 font-medium">Auditoria Automática de Faturas</span>
              <span className="text-emerald-500 font-semibold flex items-center gap-1">Integrado</span>
            </div>
          </div>
        </div>

      </div>

      {/* Audit logs at the bottom */}
      <div className="bg-[#141414] p-5 rounded-xl border border-white/10 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          Rastreabilidade — Histórico de Operações e Alterações Recentes do Sistema
        </h3>
        
        {audits.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma alteração registrada recentemente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-gray-300">
                  <th className="py-2 px-3 font-semibold text-gray-400">DATA/HORA</th>
                  <th className="py-2 px-3 font-semibold text-gray-400">USUÁRIO</th>
                  <th className="py-2 px-3 font-semibold text-gray-400">ESTRUTURA</th>
                  <th className="py-2 px-3 font-semibold text-gray-400">OPERAÇÃO</th>
                  <th className="py-2 px-3 font-semibold text-gray-400">DESCRIÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {audits.map((a) => {
                  let desc = "Alteração de registro";
                  try {
                    const parsed = typeof a.valor_novo === "string" ? JSON.parse(a.valor_novo) : a.valor_novo;
                    if (parsed && parsed.nome) desc = `Nome: ${parsed.nome}`;
                    else if (parsed && parsed.descricao) desc = `Descrição: ${parsed.descricao}`;
                    else if (parsed && parsed.valor_total) desc = `Lançamento R$ ${parsed.valor_total}`;
                    else if (parsed && parsed.elemento) desc = `Verificação: ${parsed.elemento}`;
                  } catch (_) {}

                  return (
                    <tr key={a.id} className="text-gray-300 hover:bg-white/5">
                      <td className="py-2 px-3">{new Date(a.criado_em).toLocaleString("pt-BR")}</td>
                      <td className="py-2 px-3 text-blue-400">{a.usuario}</td>
                      <td className="py-2 px-3 uppercase text-[10px] font-semibold text-gray-400">{a.tabela}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          a.acao === "INSERT" ? "bg-emerald-500/10 text-emerald-400" :
                          a.acao === "UPDATE" ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                        }`}>
                          {a.acao}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-xs truncate text-gray-400">{desc}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
