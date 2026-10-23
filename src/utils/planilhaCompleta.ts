// Planilha completa (.xlsx): Resumo, Relatórios (condensado), Faturas, Contratos, Unidades Gestoras,
// Secretarias, Edifícios, Informações e Tipos de Conta. Recebe os dados já montados pelo servidor e
// o que a tela de Relatórios calculou (ações, alertas, oportunidades), para sair igual ao que se vê.
import type ExcelJS from "exceljs";

export type Celula = string | number | null | undefined;
export type Coluna = { titulo: string; largura?: number; formato?: "rs" | "num" | "num1" | "pct" | "texto" };
export type Tabela = { colunas: Coluna[]; linhas: Celula[][]; total?: boolean };
export type Bloco = { titulo: string; nota?: string; tabela: Tabela };
export type Aba = { nome: string; cabecalho?: string[]; tabela?: Tabela; blocos?: Bloco[] };

const FMT: Record<string, string> = { rs: '"R$" #,##0.00;[Red]-"R$" #,##0.00', num: "#,##0", num1: "#,##0.0", pct: "0.0%" };

function escreverTabela(ws: ExcelJS.Worksheet, linhaInicial: number, t: Tabela, congelar: boolean) {
  const cab = ws.getRow(linhaInicial);
  t.colunas.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3F3F8F" } };
    cel.alignment = { vertical: "middle", wrapText: true };
  });
  t.linhas.forEach((l, r) => {
    const row = ws.getRow(linhaInicial + 1 + r);
    l.forEach((v, i) => {
      const cel = row.getCell(i + 1);
      cel.value = v === undefined ? null : v;
      const f = t.colunas[i]?.formato;
      if (f && FMT[f] && typeof v === "number") cel.numFmt = FMT[f];
    });
  });
  let fim = linhaInicial + t.linhas.length;
  if (t.total && t.linhas.length) {
    const row = ws.getRow(fim + 1);
    row.getCell(1).value = "Total";
    t.colunas.forEach((c, i) => {
      if (i === 0 || !c.formato || c.formato === "texto" || c.formato === "pct") return;
      const soma = t.linhas.reduce((a, l) => a + (typeof l[i] === "number" ? (l[i] as number) : 0), 0);
      const cel = row.getCell(i + 1);
      cel.value = Math.round(soma * 100) / 100;
      if (FMT[c.formato]) cel.numFmt = FMT[c.formato];
    });
    row.font = { bold: true };
    fim++;
  }
  if (congelar) {
    ws.views = [{ state: "frozen", ySplit: linhaInicial }];
    ws.autoFilter = { from: { row: linhaInicial, column: 1 }, to: { row: linhaInicial, column: t.colunas.length } };
  }
  return fim;
}

export async function montarPlanilhaCompleta(Excel: typeof ExcelJS, abas: Aba[]): Promise<Buffer> {
  const wb = new Excel.Workbook();
  wb.creator = "SisPu.JP";
  wb.created = new Date();
  for (const a of abas) {
    const ws = wb.addWorksheet(a.nome.slice(0, 31));
    let linha = 1;
    for (const c of a.cabecalho || []) { ws.getRow(linha).getCell(1).value = c; linha++; }
    if (a.cabecalho?.length) { ws.getRow(1).font = { bold: true, size: 13 }; linha++; }
    const larguras: number[] = [];
    const medir = (t: Tabela) => t.colunas.forEach((c, i) => { larguras[i] = Math.max(larguras[i] || 10, c.largura || Math.min(40, Math.max(10, c.titulo.length + 2))); });
    if (a.tabela) { medir(a.tabela); linha = escreverTabela(ws, linha, a.tabela, !a.cabecalho?.length) + 2; }
    for (const b of a.blocos || []) {
      medir(b.tabela);
      const t = ws.getRow(linha); t.getCell(1).value = b.titulo; t.font = { bold: true, size: 12 }; linha++;
      if (b.nota) { ws.getRow(linha).getCell(1).value = b.nota; ws.getRow(linha).font = { italic: true, color: { argb: "FF666666" } }; linha++; }
      if (!b.tabela.linhas.length) { ws.getRow(linha).getCell(1).value = "Nada no período."; linha += 2; continue; }
      linha = escreverTabela(ws, linha, b.tabela, false) + 2;
    }
    larguras.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
