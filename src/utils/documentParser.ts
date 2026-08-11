/**
 * Document Parser and Segmenter for SisPu.JP 2.0
 * Handles single faturas and consolidated multi-invoice reports (batch PDFs)
 */

import { DocumentoPagina, convertTextToPaginas } from "./pdfExtractor";
import { ParserCelesc } from "./ParserCelesc";
import { ParserCasan } from "./ParserCasan";

export type DocumentLayoutType = 'CELESC_FATURA' | 'CELESC_RELATORIO' | 'CASAN_FATURA' | 'CASAN_RELATORIO' | 'DESCONHECIDO';

export interface ExtractedFaturaData {
  mes_ano: string;
  consumo: number;
  valor_total: number;
  valor_imposto: number;
  valor_diversos?: number;
  valor_credito?: number;
  codigo_numero: string;
  medidor: string;
  // Extra detailed fields required for high-fidelity conference
  unidade_nome?: string;
  endereco?: string;
  leitura_anterior?: number;
  leitura_atual?: number;
  data_vencimento?: string;
  tarifa_unitaria?: number;
  confianca?: number;
  baixa_confianca?: boolean;
  motivo_baixa_confianca?: string;
  
  municipio?: string;
  classe?: string;
  grupo_tarifario?: string;
  modalidade_tarifaria?: string;
  fatura_num?: string;
  grupo_subgrupo_tensao?: string;
  data_leitura?: string;
  dias_faturados?: number;
  nota_fiscal?: string;
  chave_acesso?: string;
  energia_injetada?: number;
  demanda?: number;
  energia_reativa?: number;
  historico?: { mes_ano: string; consumo: number }[];
  itens_fatura?: {
    id: string;
    descricao: string;
    quantidade: number;
    valor_unitario: number;
    valor: number;
    pis?: number;
    icms?: number;
    irpj_pct?: number;
    irpj_val?: number;
    pis_ret?: number;
    cofins_ret?: number;
    csll_ret?: number;
    cofins?: number;
  }[];
  boleto?: {
    banco: string;
    linha_digitavel: string;
    codigo_barras: string;
    nosso_numero: string;
    numero_documento: string;
    valor: number;
    vencimento: string;
    beneficiario: string;
  };
}

export interface SegmentedFatura {
  id: string;
  nome_arquivo: string;
  layout: 'CELESC_FATURA' | 'CASAN_FATURA';
  tamanho: number;
  origem_conteudo: string;
  dados_extraidos: ExtractedFaturaData;
  // Extra metadata for Etapa 9
  numero_pagina?: number;
  posicao_na_pagina?: number;
  total_na_pagina?: number;
  posicao_no_lote?: number;
  total_no_lote?: number;
  score?: number;
  scoreLogs?: string[];
}

/**
 * Intelligent helper to parse numbers in either Brazilian format (1.450,50) or standard format (1450.50)
 */
export const parseBrazilianFloat = (valStr: string): number => {
  let cleaned = valStr.trim();
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Both comma and dot. Dot is thousands, comma is decimal.
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    // Only comma. Comma is decimal.
    cleaned = cleaned.replace(",", ".");
  } else {
    // No comma. Dot is already decimal (if present). No thousands separator.
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
};

export interface ClassificationResult {
  layout: 'CELESC_FATURA' | 'CASAN_FATURA' | 'DESCONHECIDO';
  scoreCelesc: number;
  scoreCasan: number;
  logs: string[];
}

/**
 * Advanced Score-based classifier to eliminate keyword-only classification errors (Etapa 6)
 */
export const classifyTextWithScore = (text: string): ClassificationResult => {
  const contentUpper = text.toUpperCase();
  let scoreCelesc = 0;
  let scoreCasan = 0;
  const logs: string[] = [];

  // CELESC Scoring
  if (contentUpper.includes("CELESC")) {
    scoreCelesc += 40;
    logs.push("Celesc: palavra 'CELESC' encontrada (+40)");
  }
  if (contentUpper.includes("UC") || contentUpper.includes("UNIDADE CONSUMIDORA") || contentUpper.includes("CODNUM")) {
    scoreCelesc += 20;
    logs.push("Celesc: 'UC', 'CODNUM' ou 'Unidade Consumidora' encontrada (+20)");
  }
  if (contentUpper.includes("PONTO")) {
    scoreCelesc += 20;
    logs.push("Celesc: 'PONTO' encontrado (+20)");
  }
  if (contentUpper.includes("ENERGIA") || contentUpper.includes("KWH") || contentUpper.includes("ELETRICA") || contentUpper.includes("ELÉTRICA")) {
    scoreCelesc += 20;
    logs.push("Celesc: termos de energia/kWh encontrados (+20)");
  }

  // CASAN Scoring
  if (
    contentUpper.includes("CASAN") ||
    contentUpper.includes("COMPANHIA CATARINENSE") ||
    contentUpper.includes("CATARINENSE DE AGUAS") ||
    contentUpper.includes("CATARINENSE DE ÁGUAS") ||
    contentUpper.includes("SISTEMA COMERCIAL INTEGRADO") ||
    contentUpper.includes("SCI8095")
  ) {
    scoreCasan += 40;
    logs.push("Casan: 'CASAN' ou 'Companhia Catarinense de Águas e Saneamento' / 'SCI' encontrada (+40)");
  }
  if (contentUpper.includes("MATRICULA") || contentUpper.includes("MATRÍCULA") || contentUpper.includes("LIGAÇÃO") || contentUpper.includes("LIGACAO")) {
    scoreCasan += 20;
    logs.push("Casan: 'Matrícula' ou 'Ligação' encontrada (+20)");
  }
  if (contentUpper.includes("AGUA") || contentUpper.includes("ÁGUA") || contentUpper.includes("CONTAS QUE COMPÕEM") || contentUpper.includes("CONTAS QUE COMPOEM")) {
    scoreCasan += 20;
    logs.push("Casan: 'Água' ou 'Contas que compõem' encontrada (+20)");
  }
  if (contentUpper.includes("ESGOTO") || contentUpper.includes("SANEAMENTO")) {
    scoreCasan += 20;
    logs.push("Casan: 'Esgoto' ou 'Saneamento' encontrado (+20)");
  }

  let layout: 'CELESC_FATURA' | 'CASAN_FATURA' | 'DESCONHECIDO' = 'DESCONHECIDO';
  if (scoreCelesc >= 40 || scoreCasan >= 40) {
    if (scoreCelesc > scoreCasan) {
      layout = 'CELESC_FATURA';
    } else {
      layout = 'CASAN_FATURA';
    }
  }

  logs.push(`Resumo Classificação: Score CELESC = ${scoreCelesc}, Score CASAN = ${scoreCasan}. Decidido: ${layout}`);
  return { layout, scoreCelesc, scoreCasan, logs };
};

/**
 * Automatically identify document type based on text content and filename
 * BEFORE any OCR or IA discovery, utilizing structural patterns.
 */
export const identifyDocumentType = (text: string, fileName: string): DocumentLayoutType => {
  const contentUpper = text.toUpperCase();
  const nameUpper = fileName.toUpperCase();

  const hasCelesc = contentUpper.includes("CELESC") || nameUpper.includes("CELESC");
  const hasCasan = contentUpper.includes("CASAN") || nameUpper.includes("CASAN") ||
                   contentUpper.includes("COMPANHIA CATARINENSE") ||
                   contentUpper.includes("CATARINENSE DE AGUAS") || contentUpper.includes("CATARINENSE DE ÁGUAS") ||
                   contentUpper.includes("SISTEMA COMERCIAL INTEGRADO") || contentUpper.includes("SCI8095") ||
                   contentUpper.includes("CONTAS QUE COMPÕEM") || contentUpper.includes("CONTAS QUE COMPOEM") ||
                   contentUpper.includes("COBRANÇA CENTRALIZADA") || contentUpper.includes("COBRANCA CENTRALIZADA");

  // A report/consolidated PDF typically contains multiple sections/points or references batch billing
  const pontoCount = (contentUpper.match(/PONTO\s+\d+|PONTO/g) || []).length;
  const ucDebitoCount = (contentUpper.match(/UC\s+DEBITO:|UC\s+DÉBITO:/g) || []).length;
  const matriculaCount = (contentUpper.match(/MATRICULA|MATRÍCULA/g) || []).length;
  const ucCount = (contentUpper.match(/(?:\bUC\b|\bUnidade\s+Consumidora\b|\bCODNUM\b)\s*[:\s-]*\s*[0-9]/gi) || []).length;

  const isBatch = pontoCount > 1 || ucDebitoCount > 1 || matriculaCount > 1 || ucCount > 1 ||
                  contentUpper.includes("RELATORIO") || contentUpper.includes("RELATÓRIO") || 
                  contentUpper.includes("COLETIV") || contentUpper.includes("LOTE") ||
                  contentUpper.includes("CONTAS QUE COMPÕEM") || contentUpper.includes("CONTAS QUE COMPOEM") ||
                  contentUpper.includes("COBRANÇA CENTRALIZADA") || contentUpper.includes("COBRANCA CENTRALIZADA") ||
                  nameUpper.includes("RELATORIO") || nameUpper.includes("RELATÓRIO") || 
                  nameUpper.includes("COLETIV") || nameUpper.includes("LOTE");

  if (hasCelesc && hasCasan) {
    // In case of double reference, prioritize by filename
    if (nameUpper.includes("CASAN")) return isBatch ? "CASAN_RELATORIO" : "CASAN_FATURA";
    if (nameUpper.includes("CELESC")) return isBatch ? "CELESC_RELATORIO" : "CELESC_FATURA";
    return "DESCONHECIDO"; // Fallback to segment-by-segment/page-by-page
  }

  if (hasCelesc) {
    return isBatch ? "CELESC_RELATORIO" : "CELESC_FATURA";
  }
  if (hasCasan) {
    return isBatch ? "CASAN_RELATORIO" : "CASAN_FATURA";
  }

  // Fallback to structural discovery if filename doesn't help
  if (pontoCount > 1 || ucDebitoCount > 1) {
    return "CELESC_RELATORIO";
  }
  if (matriculaCount > 1) {
    return "CASAN_RELATORIO";
  }

  return "DESCONHECIDO";
};

/**
 * Segmentador CELESC
 * Localiza automaticamente todas as ocorrências do marcador "UC:" ou "Unidade Consumidora" ou "PONTO"
 */
export const segmentarCelesc = (text: string): { index: number; marker: string }[] => {
  const matches: { index: number; marker: string }[] = [];
  const regex = /(?:UC:|Unidade\s+Consumidora|PONTO\s*\d+|PONTO)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, marker: match[0] });
  }

  // Filter overlapping or very close matches (within 100 characters)
  const filtered: { index: number; marker: string }[] = [];
  for (const m of matches) {
    if (filtered.length === 0 || m.index - filtered[filtered.length - 1].index > 100) {
      filtered.push(m);
    }
  }
  return filtered;
};

/**
 * Segmentador CASAN
 * Localiza automaticamente todas as ocorrências do marcador "Matrícula" ou "Matricula" ou "UC DEBITO:"
 */
export const segmentarCasan = (text: string): { index: number; marker: string }[] => {
  const matches: { index: number; marker: string }[] = [];
  const regex = /(?:Matrícula|Matricula|Número\s+da\s+Matrícula|UC\s+DEBITO:|UC\s+DÉBITO:)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, marker: match[0] });
  }

  // Filter overlapping or very close matches (within 100 characters)
  const filtered: { index: number; marker: string }[] = [];
  for (const m of matches) {
    if (filtered.length === 0 || m.index - filtered[filtered.length - 1].index > 100) {
      filtered.push(m);
    }
  }
  return filtered;
};

/**
 * Parses a single Celesc segment text using ParserCelesc
 */
export const parseCelescSegment = (segmentText: string, defaultDate: string): ExtractedFaturaData => {
  const parsed = ParserCelesc.parse(segmentText);
  if (!parsed.mes_ano && defaultDate) {
    parsed.mes_ano = defaultDate;
  }
  return parsed;
};

/**
 * Parses a single Casan segment text using ParserCasan
 */
export const parseCasanSegment = (segmentText: string, defaultDate: string): ExtractedFaturaData => {
  const parsed = ParserCasan.parse(segmentText);
  if (!parsed.mes_ano && defaultDate) {
    parsed.mes_ano = defaultDate;
  }
  return parsed;
};

/**
 * Fallback local deterministic parser for individual faturas
 */
export const runDeterministicParser = (text: string, fileName: string): ExtractedFaturaData | null => {
  const docType = identifyDocumentType(text, fileName);
  if (docType === "DESCONHECIDO") return null;

  let defaultDate = "2026-06-01";
  const generalCompMatch = text.match(/COMPETENCIA[^:]*:\s*(\d{2})\/(\d{4})/i) ||
                           text.match(/COMPETÊNCIA[^:]*:\s*(\d{2})\/(\d{4})/i);
  if (generalCompMatch) {
    defaultDate = `${generalCompMatch[2]}-${generalCompMatch[1]}-01`;
  }

  if (docType.includes("CELESC")) {
    return parseCelescSegment(text, defaultDate);
  } else {
    return parseCasanSegment(text, defaultDate);
  }
};

export const extrairTodasUCsCelesc = (text: string): string[] => {
  const ucs: string[] = [];
  
  // Regexes to capture UCs / CODNUMs strictly (supporting formatted UCs like 1.004.748.011-07 and plain digits like 0012341210)
  const patterns = [
    /(?:\bUC\b|\bUnidade\s+Consumidora\b|\bCODNUM\b)\s*[:\s-]*\s*([0-9][0-9.-]{2,20}[0-9A-Z]|[0-9]{3,15})/gi,
    /CODNUM\s*\/\s*UC\s*:\s*([0-9][0-9.-]{2,20}[0-9A-Z]|[0-9]{3,15})/gi
  ];

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const ucVal = match[1].trim().replace(/[.,;:]+$/, "");
      if (ucVal && ucVal.length >= 3 && !/^(MEDIDOR|CONSUMO|SUBTOTAL|TOTAL|IMPOSTOS|COMPETENCIA|COMPETÊNCIA|VENCIMENTO|PONTO|PAGAR|R\$)$/i.test(ucVal)) {
        if (!ucs.includes(ucVal)) {
          ucs.push(ucVal);
        }
      }
    }
  }

  const parenPattern = /\(CODNUM:\s*([0-9A-Z.-]+)\)/gi;
  let parenMatch;
  while ((parenMatch = parenPattern.exec(text)) !== null) {
    const ucVal = parenMatch[1].trim().replace(/[.,;:]+$/, "");
    if (ucVal && !ucs.includes(ucVal)) {
      ucs.push(ucVal);
    }
  }

  return ucs;
};

export const segmentarCelescPorUCs = (text: string, ucs: string[]): { uc: string; blockText: string }[] => {
  if (ucs.length === 0) return [];

  const ucPositions: { uc: string; index: number }[] = [];
  
  let lastIndex = 0;
  for (const uc of ucs) {
    let idx = text.indexOf(uc, lastIndex);
    if (idx === -1) {
      idx = text.indexOf(uc);
    }
    
    if (idx !== -1) {
      let startIdx = idx;
      const prefixText = text.substring(Math.max(0, idx - 60), idx);
      const markerMatch = prefixText.match(/(?:UC|Unidade\s+Consumidora|CODNUM|PONTO\s*\d+)\s*[:/]*\s*$/i) ||
                          prefixText.match(/PONTO\s*\d+\s*-\s*[A-Z0-9\sªº.-]+?$/i);
      if (markerMatch) {
        startIdx = idx - (prefixText.length - prefixText.lastIndexOf(markerMatch[0]));
      }
      
      ucPositions.push({ uc, index: startIdx });
      lastIndex = idx + uc.length;
    } else {
      ucPositions.push({ uc, index: text.length });
    }
  }

  ucPositions.sort((a, b) => a.index - b.index);

  const rawGlobalHeader = text.substring(0, ucPositions[0].index).trim();
  // Remove client-level address from global header to prevent collision with specific UC addresses
  const globalHeader = rawGlobalHeader
    .split("\n")
    .filter(line => !/^\s*(?:ENDERECO|ENDEREÇO)\s*:/i.test(line))
    .join("\n");

  const segments: { uc: string; blockText: string }[] = [];

  for (let i = 0; i < ucPositions.length; i++) {
    const start = ucPositions[i].index;
    const end = i + 1 < ucPositions.length ? ucPositions[i + 1].index : text.length;
    const body = text.substring(start, end).trim();
    const blockText = (globalHeader ? globalHeader + "\n" : "") + body;
    segments.push({
      uc: ucPositions[i].uc,
      blockText
    });
  }

  return segments;
};

/**
 * Splits a batch PDF / report text content into segmented individual invoice data structures
 * Implements page-by-page segmentation with scoring as requested in Etapas 3, 5, and 6.
 */
export const splitReportIntoFaturas = (text: string, fileName: string): SegmentedFatura[] => {
  const docType = identifyDocumentType(text, fileName);
  
  if (docType === "CELESC_RELATORIO") {
    // New sequential architecture for CELESC reports (Etapa 2, 4, 5)
    // 1. Structural scan to find all UCs
    const foundUcs = extrairTodasUCsCelesc(text);
    
    // 2. Segment text by UC boundaries
    const ucSegments = segmentarCelescPorUCs(text, foundUcs);
    
    const segmentedList: SegmentedFatura[] = [];
    const totalInLote = ucSegments.length;
    
    ucSegments.forEach((seg, idx) => {
      let defaultDate = "2026-06-01";
      const generalCompMatch = seg.blockText.match(/COMPETENCIA\s*[^:\n]*:\s*(\d{2})\/(\d{4})/i) || 
                               seg.blockText.match(/COMPETENCIA:\s*(\d{2})\/(\d{4})/i) ||
                               seg.blockText.match(/COMPETÊNCIA:\s*(\d{2})\/(\d{4})/i);
      if (generalCompMatch) {
        defaultDate = `${generalCompMatch[2]}-${generalCompMatch[1]}-01`;
      }
      
      const parsed = parseCelescSegment(seg.blockText, defaultDate);
      // Ensure the extracted CODNUM corresponds exactly to the delimiter UC
      parsed.codigo_numero = seg.uc;
      
      const numLabel = `UC ${seg.uc}`;
      
      segmentedList.push({
        id: `DOC-SEG-CELESC_FATURA-${Date.now()}-${idx + 1}`,
        nome_arquivo: `${fileName} (${numLabel})`,
        layout: "CELESC_FATURA",
        tamanho: seg.blockText.length,
        origem_conteudo: seg.blockText,
        dados_extraidos: parsed,
        numero_pagina: Math.floor(idx / 2) + 1, // Simulated page layout grouping
        posicao_na_pagina: (idx % 2) + 1,
        total_na_pagina: 2,
        posicao_no_lote: idx + 1,
        total_no_lote: totalInLote,
        score: 100,
        scoreLogs: ["Regra Determinística por UC"]
      });
    });
    
    return segmentedList;
  }

  const contentUpper = text.toUpperCase();
  const nameUpper = fileName.toUpperCase();
  const isBatchText = contentUpper.includes("RELATORIO") || contentUpper.includes("RELATÓRIO") || 
                      contentUpper.includes("COLETIVO") || contentUpper.includes("LOTE") ||
                      nameUpper.includes("RELATORIO") || nameUpper.includes("RELATÓRIO") || 
                      nameUpper.includes("COLETIVO") || nameUpper.includes("LOTE") ||
                      (contentUpper.match(/PONTO\s+\d+|PONTO/g) || []).length > 1 || 
                      (contentUpper.match(/UC\s+DEBITO:|UC\s+DÉBITO:/g) || []).length > 1 ||
                      (contentUpper.match(/MATRICULA|MATRÍCULA/g) || []).length > 1;

  if (docType === "CELESC_FATURA" || docType === "CASAN_FATURA" || (docType === "DESCONHECIDO" && !isBatchText)) {
    // Single fatura or fallback
    const parsed = runDeterministicParser(text, fileName);
    if (!parsed) return [];
    
    const classification = classifyTextWithScore(text);
    return [{
      id: `DOC-IND-${Date.now()}-1`,
      nome_arquivo: fileName,
      layout: classification.layout !== 'DESCONHECIDO' 
        ? classification.layout 
        : (docType.includes("CASAN") ? "CASAN_FATURA" : "CELESC_FATURA"),
      tamanho: text.length,
      origem_conteudo: text,
      dados_extraidos: parsed,
      numero_pagina: 1,
      posicao_na_pagina: 1,
      total_na_pagina: 1,
      posicao_no_lote: 1,
      total_no_lote: 1,
      score: Math.max(classification.scoreCelesc, classification.scoreCasan),
      scoreLogs: classification.logs
    }];
  }

  // Convert raw text to pages using our new helper
  const paginas = convertTextToPaginas(text);
  const segmentedList: SegmentedFatura[] = [];
  
  // Group segments first to calculate lote counts
  const tempSegments: {
    pageNumber: number;
    blockIndex: number;
    totalOnPage: number;
    text: string;
    layout: 'CELESC_FATURA' | 'CASAN_FATURA';
    score: number;
    scoreLogs: string[];
  }[] = [];

  for (const pagina of paginas) {
    const pageText = pagina.textoLimpo;
    const pageNum = pagina.numeroPagina;

    // Classify the page content to have a fallback
    const classification = classifyTextWithScore(pageText);

    const markers: { index: number; marker: string }[] = [];

    // UC, Unidade Consumidora, or PONTO (Celesc)
    const celescRegex = /(?:UC:|Unidade\s+Consumidora|PONTO\s*\d+|PONTO)/gi;
    let match;
    while ((match = celescRegex.exec(pageText)) !== null) {
      markers.push({ index: match.index, marker: match[0] });
    }

    // Matrícula, MATRICULA, Matrícula da Ligação, Número da Matrícula (Casan)
    const casanRegex = /(?:Matrícula|Matricula|Matrícula\s+da\s+Ligação|Número\s+da\s+Matrícula|UC\s+DEBITO:|UC\s+DÉBITO:)/gi;
    while ((match = casanRegex.exec(pageText)) !== null) {
      markers.push({ index: match.index, marker: match[0] });
    }

    // Sort markers by index
    markers.sort((a, b) => a.index - b.index);

    // Filter close matches to prevent overlapping segments
    const filteredMarkers: { index: number; marker: string }[] = [];
    for (const m of markers) {
      if (filteredMarkers.length === 0 || m.index - filteredMarkers[filteredMarkers.length - 1].index > 100) {
        filteredMarkers.push(m);
      }
    }

    if (filteredMarkers.length === 0) {
      // Fallback: entire page is one block
      const finalLayout = classification.layout !== 'DESCONHECIDO' 
        ? classification.layout 
        : (pageText.toUpperCase().includes("CASAN") ? 'CASAN_FATURA' : 'CELESC_FATURA');
      tempSegments.push({
        pageNumber: pageNum,
        blockIndex: 1,
        totalOnPage: 1,
        text: pageText,
        layout: finalLayout as 'CELESC_FATURA' | 'CASAN_FATURA',
        score: finalLayout === 'CELESC_FATURA' ? classification.scoreCelesc : classification.scoreCasan,
        scoreLogs: classification.logs
      });
    } else {
      const totalOnPage = filteredMarkers.length;
      for (let i = 0; i < filteredMarkers.length; i++) {
        const start = filteredMarkers[i].index;
        const end = i + 1 < filteredMarkers.length ? filteredMarkers[i + 1].index : pageText.length;
        
        // We include page headers (0 to first marker index) to keep competence and metadata info
        const header = pageText.substring(0, filteredMarkers[0].index).trim();
        const body = pageText.substring(start, end).trim();
        const content = (header ? header + "\n" : "") + body;

        const blockClassification = classifyTextWithScore(content);
        const finalLayout = blockClassification.layout !== 'DESCONHECIDO'
          ? blockClassification.layout
          : (content.toUpperCase().includes("CASAN") ? 'CASAN_FATURA' : 'CELESC_FATURA');

        tempSegments.push({
          pageNumber: pageNum,
          blockIndex: i + 1,
          totalOnPage: totalOnPage,
          text: content,
          layout: finalLayout as 'CELESC_FATURA' | 'CASAN_FATURA',
          score: finalLayout === 'CELESC_FATURA' ? blockClassification.scoreCelesc : blockClassification.scoreCasan,
          scoreLogs: blockClassification.logs
        });
      }
    }
  }

  // Now, parse each segmented block separately (Etapa 5)
  const totalInLote = tempSegments.length;
  tempSegments.forEach((seg, idx) => {
    let defaultDate = "2026-06-01";
    const generalCompMatch = seg.text.match(/COMPETENCIA\s*[^:\n]*:\s*(\d{2})\/(\d{4})/i) || 
                             seg.text.match(/COMPETENCIA:\s*(\d{2})\/(\d{4})/i) ||
                             seg.text.match(/COMPETÊNCIA:\s*(\d{2})\/(\d{4})/i);
    if (generalCompMatch) {
      defaultDate = `${generalCompMatch[2]}-${generalCompMatch[1]}-01`;
    }

    let parsed: ExtractedFaturaData;
    if (seg.layout === 'CELESC_FATURA') {
      parsed = parseCelescSegment(seg.text, defaultDate);
    } else {
      parsed = parseCasanSegment(seg.text, defaultDate);
    }

    const keyLabel = seg.layout === 'CELESC_FATURA' ? 'UC' : 'Matrícula';
    const numLabel = parsed.codigo_numero ? `${keyLabel} ${parsed.codigo_numero}` : `Fatura ${idx + 1}`;

    segmentedList.push({
      id: `DOC-SEG-${seg.layout}-${Date.now()}-${idx + 1}`,
      nome_arquivo: `${fileName} (${numLabel})`,
      layout: seg.layout,
      tamanho: seg.text.length,
      origem_conteudo: seg.text,
      dados_extraidos: parsed,
      numero_pagina: seg.pageNumber,
      posicao_na_pagina: seg.blockIndex,
      total_na_pagina: seg.totalOnPage,
      posicao_no_lote: idx + 1,
      total_no_lote: totalInLote,
      score: seg.score,
      scoreLogs: seg.scoreLogs
    });
  });

  return segmentedList;
};
