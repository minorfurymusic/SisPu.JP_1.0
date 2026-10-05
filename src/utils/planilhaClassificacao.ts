// Lê a planilha de classificação (matrícula -> nome da unidade no sistema, nome na fatura,
// secretaria). Aceita CSV (vírgula ou ponto e vírgula) ou o texto colado do Google Sheets/Excel
// (tabulação). As colunas são achadas pelo nome do cabeçalho, não pela posição.

export interface LinhaClassificacao {
  matricula: string;
  nome_fatura: string;
  unidade: string;
  secretaria: string;
  endereco: string;
}

export function normalizarTexto(v: string): string {
  return (v || "").toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
}

function separarLinhas(texto: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === "") aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

export function lerPlanilhaClassificacao(texto: string): { linhas: LinhaClassificacao[]; erro?: string } {
  const primeira = texto.split(/\r?\n/).find(l => l.trim()) || "";
  const sep = primeira.includes("\t") ? "\t" : (primeira.split(";").length > primeira.split(",").length ? ";" : ",");
  const tabela = separarLinhas(texto.replace(/^﻿/, ""), sep);
  const iCab = tabela.findIndex(l => l.some(c => normalizarTexto(c) === "MATRICULA"));
  if (iCab === -1) return { linhas: [], erro: 'Cabeçalho com a coluna "Matrícula" não encontrado.' };
  const cab = tabela[iCab].map(normalizarTexto);
  const col = (...nomes: string[]) => cab.findIndex(c => nomes.includes(c));
  const iMat = col("MATRICULA"), iUsu = col("USUARIO", "NOME NA FATURA"), iUni = col("UNIDADE", "NOME NO SISTEMA"),
    iSec = col("SECRETARIA"), iEnd = col("LOCALIZACAO", "ENDERECO", "LOGRADOURO");
  const faltando = [["Usuário", iUsu], ["Unidade", iUni], ["Secretaria", iSec]].filter(([, i]) => i === -1).map(([n]) => n);
  if (faltando.length) return { linhas: [], erro: `Coluna(s) não encontrada(s): ${faltando.join(", ")}.` };

  const linhas = tabela.slice(iCab + 1)
    .map(l => ({
      matricula: (l[iMat] || "").trim().toUpperCase(),
      nome_fatura: (l[iUsu] || "").trim().toUpperCase(),
      unidade: (l[iUni] || "").trim().toUpperCase(),
      secretaria: (l[iSec] || "").trim().toUpperCase(),
      endereco: iEnd === -1 ? "" : (l[iEnd] || "").trim().toUpperCase(),
    }))
    .filter(l => l.matricula && /\d/.test(l.matricula) && normalizarTexto(l.matricula) !== "TOTAL");
  return { linhas };
}
