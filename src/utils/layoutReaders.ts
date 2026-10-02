// Leitores determinísticos (sem IA) para os layouts fixos de relatório das concessionárias.
// O texto de entrada é o mesmo que o app monta a partir do PDF: páginas separadas por "\f",
// linhas reconstruídas de cima para baixo (ver pdfExtractor.ts).

export type LayoutReconhecido = "CASAN_SCI8095" | "CELESC_COLETIVA";

export interface GrupoConferencia {
  rotulo: string;
  referencia: string;
  qtdLida: number;
  qtdDeclarada: number | null;
  totalLido: number;
  totalDeclarado: number | null;
  ok: boolean;
}

export interface ConferenciaLeitura {
  layout: LayoutReconhecido;
  ok: boolean;
  grupos: GrupoConferencia[];
  avisos: string[];
}

export function detectarLayout(text: string): LayoutReconhecido | null {
  if (/Relat[óo]rio\s*:\s*SCI8095/i.test(text) && /CONTAS QUE COMP[ÕO]EM/i.test(text)) return "CASAN_SCI8095";
  if (/RELA[ÇC][ÃA]O DE UCs DA COLETIVA/i.test(text)) return "CELESC_COLETIVA";
  return null;
}

export function valorBR(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

// "06/2026" -> "2026-06-01"
function referenciaParaData(mmYYYY: string): string {
  const m = mmYYYY.match(/(\d{2})\/(\d{4})/);
  return m ? `${m[2]}-${m[1]}-01` : "";
}

const centavos = (n: number) => Math.round(n * 100);

// ---------------------------------------------------------------------------------------------
// CASAN — "Contas que compõem fatura de cobrança centralizada" (Relatório SCI8095)
// ---------------------------------------------------------------------------------------------

export interface ContaCasan {
  matricula: string;
  localizacao: string;
  usuario: string;
  leitura_anterior: number;
  leitura_atual: number;
  consumo: number;
  valor_agua: number;
  valor_esgoto: number;
  valor_servico: number;
  valor_bonus: number;
  valor_total: number;
  logradouro: string;
  pagina: number;
}

const DINHEIRO = "(-?[\\d.]+,\\d{2})";
const LINHA_CASAN = new RegExp(
  "^(\\d{3,9}-\\d)\\s+" +
  "(\\d{3}\\.\\s*\\d{3}\\.\\s*\\d{3}\\.\\s*\\d{4}\\.\\s*\\d{2})\\s+" +
  "(.*?)\\s+(\\d{3})\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+" +
  `${DINHEIRO}\\s+${DINHEIRO}\\s+${DINHEIRO}\\s+${DINHEIRO}\\s+${DINHEIRO}$`
);

export function lerCasanSci8095(text: string): { referencia: string; contas: ContaCasan[]; conferencia: ConferenciaLeitura } {
  const contas: ContaCasan[] = [];
  const naoLidas: string[] = [];
  const paginas = text.split("\f");

  paginas.forEach((pagina, pIdx) => {
    const linhas = pagina.split("\n").map(l => l.trim());
    linhas.forEach((linha, i) => {
      const m = linha.match(LINHA_CASAN);
      if (m) {
        const proxima = linhas[i + 1] || "";
        contas.push({
          matricula: m[1],
          localizacao: m[2].replace(/\s+/g, ""),
          usuario: m[3].trim(),
          leitura_anterior: parseInt(m[5], 10),
          leitura_atual: parseInt(m[6], 10),
          consumo: parseInt(m[7], 10),
          valor_agua: valorBR(m[8]),
          valor_esgoto: valorBR(m[9]),
          valor_servico: valorBR(m[10]),
          valor_bonus: valorBR(m[11]),
          valor_total: valorBR(m[12]),
          logradouro: LINHA_CASAN.test(proxima) || /^Total/i.test(proxima) ? "" : proxima,
          pagina: pIdx + 1,
        });
      } else if (/^\d{3,9}-\d\s+\d{3}\./.test(linha)) {
        naoLidas.push(linha);
      }
    });
  });

  const ref = (text.match(/Refer[êe]ncia\s*:\s*(\d{2}\/\d{4})/i) || [])[1] || "";
  const totalGeral = text.match(/Total Geral:\s*(\d+)\s+(\d+)\s+[\d.,-]+\s+[\d.,-]+\s+[\d.,-]+\s+[\d.,-]+\s+(-?[\d.]+,\d{2})/i);
  const qtdDeclarada = totalGeral ? parseInt(totalGeral[1], 10) : null;
  const totalDeclarado = totalGeral ? valorBR(totalGeral[3]) : null;
  const totalLido = contas.reduce((a, c) => a + c.valor_total, 0);

  const avisos: string[] = [];
  if (!totalGeral) avisos.push('Linha "Total Geral" não encontrada no relatório — não foi possível conferir os totais.');
  naoLidas.forEach(l => avisos.push(`Linha de matrícula não reconhecida: ${l}`));

  const grupoOk = qtdDeclarada !== null && totalDeclarado !== null &&
    qtdDeclarada === contas.length && centavos(totalDeclarado) === centavos(totalLido);

  return {
    referencia: referenciaParaData(ref),
    contas,
    conferencia: {
      layout: "CASAN_SCI8095",
      ok: grupoOk && naoLidas.length === 0,
      grupos: [{
        rotulo: "CASAN — Cobrança Centralizada",
        referencia: ref,
        qtdLida: contas.length,
        qtdDeclarada,
        totalLido,
        totalDeclarado,
        ok: grupoOk,
      }],
      avisos,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// CELESC — Conta coletiva: capa ("Esta conta coletiva...") + "Relação de UCs da coletiva".
// Um mesmo PDF pode trazer mais de uma coletiva, cada uma com a sua referência.
// ---------------------------------------------------------------------------------------------

export interface BlocoUcCelesc {
  uc: string;
  documento: string;
  referencia: string; // "YYYY-MM-01"
  valorImpresso: number | null;
  cabecalho: string; // cabeçalho da página de relação (vencimento etc.), sem a linha de endereço do cliente
  texto: string;
  pagina: number;
}

interface ColetivaCelesc {
  documento: string;
  referencia: string; // "MM/YYYY"
  valorDeclarado: number | null;
  qtdDeclarada: number | null;
}

const VALOR_UC = /Grupo \/ Subgrupo Tens[ãa]o:.*?Valor:\s*(?:R\$\s*)?(-?[\d.]+,\d{2})?/;

export function lerCelescColetiva(text: string): { blocos: BlocoUcCelesc[]; conferencia: ConferenciaLeitura } {
  const blocos: BlocoUcCelesc[] = [];
  const coletivas = new Map<string, ColetivaCelesc>();
  let atual: BlocoUcCelesc | null = null;
  let docAtual = "";
  let refAtual = "";
  let cabecalhoAtual = "";

  const fecharBloco = () => {
    if (!atual) return;
    const v = atual.texto.match(VALOR_UC);
    atual.valorImpresso = v && v[1] ? valorBR(v[1]) : null;
    blocos.push(atual);
    atual = null;
  };

  text.split("\f").forEach((pagina, pIdx) => {
    if (/Esta conta coletiva/i.test(pagina)) {
      fecharBloco();
      const doc = (pagina.match(/^\s*\d{2}\/\d{2}\/\d{4}\s+(\d{9,})/m) || [])[1];
      const qtd = (pagina.match(/d[ée]bito de\s+(\d+)\s+contas/i) || [])[1];
      const capa = pagina.match(/(\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+R\$\s*([\d.]+,\d{2})/);
      if (doc) {
        coletivas.set(doc, {
          documento: doc,
          referencia: capa ? capa[1] : "",
          valorDeclarado: capa ? valorBR(capa[2]) : null,
          qtdDeclarada: qtd ? parseInt(qtd, 10) : null,
        });
      }
      return;
    }
    const linhas = pagina.split("\n");
    // O cabeçalho da relação só aparece na primeira página de cada coletiva; as seguintes são
    // continuação direta da lista de UCs.
    const temCabecalho = /RELA[ÇC][ÃA]O DE UCs DA COLETIVA/i.test(pagina);
    const fimCabecalho = temCabecalho ? linhas.findIndex(l => /Documento:\s*\d+\s+Valor:/.test(l)) : -1;
    const cabecalho = fimCabecalho >= 0 ? linhas.slice(0, fimCabecalho + 1) : [];
    const ref = (cabecalho.join("\n").match(/Refer[êe]ncia:\s*(\d{2}\/\d{4})/) || [])[1];
    const docLinha = cabecalho.length ? cabecalho[cabecalho.length - 1].match(/Documento:\s*(\d+)\s+Valor:\s*(?:R\$\s*)?([\d.]+,\d{2})?/) : null;
    if (docLinha) {
      if (docLinha[1] !== docAtual) fecharBloco();
      docAtual = docLinha[1];
      const c = coletivas.get(docAtual);
      if (!c) {
        coletivas.set(docAtual, { documento: docAtual, referencia: ref || "", valorDeclarado: docLinha[2] ? valorBR(docLinha[2]) : null, qtdDeclarada: null });
      } else if (c.valorDeclarado === null && docLinha[2]) {
        c.valorDeclarado = valorBR(docLinha[2]);
      }
    }
    if (ref) refAtual = ref;
    if (temCabecalho) cabecalhoAtual = cabecalho.filter(l => !/^\s*Endere[çc]o\s*:/i.test(l)).join("\n");

    for (const linha of linhas.slice(fimCabecalho + 1)) {
      const uc = linha.match(/^\s*UC:\s+(\d[\d.]*(?:-\d+)?)\b/);
      if (uc) {
        fecharBloco();
        atual = {
          uc: uc[1],
          documento: docAtual,
          referencia: referenciaParaData(refAtual),
          valorImpresso: null,
          cabecalho: cabecalhoAtual,
          texto: linha,
          pagina: pIdx + 1,
        };
      } else if (atual) {
        atual.texto += "\n" + linha;
      }
    }
  });
  fecharBloco();

  const avisos: string[] = [];
  blocos.filter(b => b.valorImpresso === null).forEach(b => {
    avisos.push(`UC ${b.uc}: campo "Valor" em branco no PDF — entra como R$ 0,00, confira.`);
  });

  const grupos: GrupoConferencia[] = [];
  for (const c of coletivas.values()) {
    const doGrupo = blocos.filter(b => b.documento === c.documento);
    const totalLido = doGrupo.reduce((a, b) => a + (b.valorImpresso || 0), 0);
    const ok = c.valorDeclarado !== null && centavos(c.valorDeclarado) === centavos(totalLido) &&
      (c.qtdDeclarada === null || c.qtdDeclarada === doGrupo.length);
    grupos.push({
      rotulo: `CELESC — Conta coletiva ${c.documento}`,
      referencia: c.referencia,
      qtdLida: doGrupo.length,
      qtdDeclarada: c.qtdDeclarada,
      totalLido,
      totalDeclarado: c.valorDeclarado,
      ok,
    });
  }
  if (grupos.length === 0) avisos.push("Nenhuma conta coletiva identificada no PDF.");

  return {
    blocos,
    conferencia: {
      layout: "CELESC_COLETIVA",
      ok: grupos.length > 0 && grupos.every(g => g.ok),
      grupos,
      avisos,
    },
  };
}
