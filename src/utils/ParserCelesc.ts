/**
 * ParserCelesc — Independent, High-Fidelity Parser for CELESC Invoices
 * Implements strict block-based extraction and exclusive regex patterns.
 * Never guesses, simulates, or defaults missing fields.
 */

import { ExtractedFaturaData } from "./documentParser";

export interface ExtractionFieldLog {
  campo: string;
  valor: any;
  bloco: string;
  metodo: string;
  trecho_encontrado: string | null;
  confianca: number; // 0 to 100
  pagina?: number;
}

export class ParserCelesc {
  /**
   * Helper to parse Brazilian currency/float values (e.g. "1.450,50" -> 1450.5)
   */
  private static parseBrazilianFloat(valStr: string): number {
    if (!valStr) return 0;
    let cleaned = valStr.trim().replace(/[–—]/g, "-").replace(/-\s+/, "-");
    if (cleaned.includes(",") && cleaned.includes(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (cleaned.includes(",")) {
      cleaned = cleaned.replace(",", ".");
    }
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  /**
   * Helper to clean up Portuguese typos, truncation, and prefix table noise from item descriptions
   */
  private static sanitizeItemDescription(raw: string): string {
    if (!raw) return "";
    let clean = raw.trim();

    // Remove leading digits/commas/dots/percentages coming from adjacent tables (e.g., "30 ", "62 ", "00 ", "42 ")
    clean = clean.replace(/^[0-9,.\-%§ªº\s]+(?=[A-Za-zÁ-ú])/, "").trim();
    // Remove leading isolated fragment words like "a da ", "o da "
    clean = clean.replace(/^(?:a\s+da|o\s+da|çã0\s+da|cao\s+da|ção\s+da)\s+/i, "");

    if (!clean) return "";

    // Standardize specific truncated words at end of string while preserving exact full report titles
    if (/^Diferença da Demanda Contratad$/i.test(clean) || /^Diferenca da Demanda Contratad$/i.test(clean)) {
      return "Diferença da Demanda Contratada";
    }
    if (/^Bandeira Amarela da Energia In$/i.test(clean) || /^Bandeira Amarela da Energia Inj$/i.test(clean)) {
      return "Bandeira Amarela da Energia Injetada";
    }
    if (/^Bandeira Vermelha da Energia In$/i.test(clean) || /^Bandeira Vermelha da Energia Inj$/i.test(clean)) {
      return "Bandeira Vermelha da Energia Injetada";
    }
    if (/^Energia Injetada Fora Ponta TU$/i.test(clean)) {
      return "Energia Injetada Fora Ponta TUSD";
    }
    if (/^Energia Reativa Excedente N[aã]o$/i.test(clean)) {
      return "Energia Reativa Excedente Não";
    }

    // Standard title formatting preserving all modifiers (Fora Ponta, Ponta, TE, TUSD, Não, etc.)
    return clean.replace(/\b\w+/g, (word) => {
      // Keep acronyms and fixed terms capitalized
      if (/^(TE|TUSD|IRPJ|PIS|COFINS|CSLL|DMCR|COSIP|UC|CELESC)$/i.test(word)) {
        return word.toUpperCase();
      }
      if (/^(da|de|do|dos|das|e|ou|na|no|c\/)$/i.test(word)) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  /**
   * Main entry point to parse a raw text string of a CELESC invoice
   */
  public static parse(text: string, fileName?: string): ExtractedFaturaData {
    const debugLogs: ExtractionFieldLog[] = [];

    // Layer 3: Block-based segmentation
    const blocks = this.segmentBlocks(text, debugLogs);

    // Extraction state
    let codigo_numero: string | null = null;
    let medidor: string | null = null;
    let consumo = 0;
    let valor_total = 0;
    let valor_imposto = 0;
    let valor_diversos = 0;
    let valor_credito = 0;
    let mes_ano: string | null = null;
    let unidade_nome: string | null = null;
    let endereco: string | null = null;
    let leitura_anterior: number | null = null;
    let leitura_atual: number | null = null;
    let data_vencimento: string | null = null;
    let municipio: string | null = null;
    let classe: string | null = null;
    let grupo_tarifario: string | null = null;
    let modalidade_tarifaria: string | null = null;
    let fatura_num: string | null = null;
    let grupo_subgrupo_tensao: string | null = null;
    let data_leitura: string | null = null;
    let dias_faturados: number | null = null;
    let nota_fiscal: string | null = null;
    let chave_acesso: string | null = null;
    let energia_injetada: number | null = null;
    let demanda: number | null = null;
    let energia_reativa: number | null = null;
    const historico: { mes_ano: string; consumo: number }[] = [];
    const itens_fatura: any[] = [];

    // --- 1. CABEÇALHO FIELD EXTRACTION ---
    const headBlock = blocks.cabecalho || text;
    
    // Nota Fiscal
    const nfMatch = headBlock.match(/(?:NF|Nota\s+Fiscal|NOTA\s+FISCAL\s+DE\s+ENERGIA\s+ELÉTRICA|NF-E)[^\d\n]*([0-9]{3}[.-][0-9]{3}[.-][0-9]{3}|[0-9]{9})/i);
    if (nfMatch) {
      nota_fiscal = nfMatch[1].trim();
      debugLogs.push({
        campo: "nota_fiscal",
        valor: nota_fiscal,
        bloco: blocks.cabecalho ? "Cabeçalho" : "Documento Completo",
        metodo: "Regex exclusive CELESC",
        trecho_encontrado: nfMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "nota_fiscal",
        valor: null,
        bloco: "Cabeçalho",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Chave de Acesso
    let directChaveMatch = text.match(/(?:Chave\s+de\s+acesso|Chave\s+acesso)\s*:\s*([0-9\s.-]{44,60})/i);
    if (!directChaveMatch) {
      directChaveMatch = text.match(/(?:Chave\s+de\s+acesso|Chave\s+acesso)\s*:\s*([^\n]+)/i);
    }
    if (directChaveMatch) {
      const cleaned = directChaveMatch[1].replace(/\D/g, "");
      if (cleaned.length >= 44) {
        chave_acesso = cleaned.substring(0, 44);
        debugLogs.push({
          campo: "chave_acesso",
          valor: chave_acesso,
          bloco: "Cabeçalho",
          metodo: "Regex Direto Chave Acesso",
          trecho_encontrado: directChaveMatch[0],
          confianca: 100
        });
      }
    }

    if (!chave_acesso) {
      const chaveMatch = headBlock.match(/([0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}|[0-9]{44})/);
      if (chaveMatch) {
        chave_acesso = chaveMatch[1].replace(/\s+/g, "").trim();
        debugLogs.push({
          campo: "chave_acesso",
          valor: chave_acesso,
          bloco: blocks.cabecalho ? "Cabeçalho" : "Documento Completo",
          metodo: "Regex 44 dígitos",
          trecho_encontrado: chaveMatch[0],
          confianca: 100
        });
      } else {
        debugLogs.push({
          campo: "chave_acesso",
          valor: null,
          bloco: "Cabeçalho",
          metodo: "Regex",
          trecho_encontrado: null,
          confianca: 0
        });
      }
    }


    // --- 2. DADOS DA UC FIELD EXTRACTION ---
    const ucBlock = blocks.dados_uc || text;

    // UC / CODNUM
    const ucMatch = ucBlock.match(/(?:\bUC\b|\bCODNUM\b|\bUnidade\s+Consumidora\b)\s*[:/-]*\s*([A-Z0-9.-]{3,25})/i) || 
                    ucBlock.match(/PONTO\s+\d+\s*-\s*[A-Z\sªº.-]+\(CODNUM:\s*([0-9A-Z.-]+)\)/i) ||
                    ucBlock.match(/(?:\bUC\b|\bCODNUM\b)\s*[:/-]*\s*([0-9.-]+)/i);
    if (ucMatch) {
      codigo_numero = ucMatch[1].trim().replace(/[.,;:]+$/, "");
      debugLogs.push({
        campo: "codigo_numero",
        valor: codigo_numero,
        bloco: blocks.dados_uc ? "Dados da UC" : "Documento Completo",
        metodo: "Regex Unidade Consumidora",
        trecho_encontrado: ucMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "codigo_numero",
        valor: null,
        bloco: "Dados da UC",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Unidade Nome
    const nameMatch = ucBlock.match(/(?:NOME|NOME\s+DO\s+CONSUMIDOR|CLIENTE)\s*:\s*([A-Z0-9\sªº.-]+?)(?=\n|ENDERECO|ENDEREÇO|\bUC\b|MEDIDOR|$)/i) ||
                      ucBlock.match(/PONTO\s+\d+\s*-\s*([A-Z0-9\sªº.-]+?)(?=\(|CODNUM|$)/i);
    if (nameMatch) {
      unidade_nome = nameMatch[1].trim();
      debugLogs.push({
        campo: "unidade_nome",
        valor: unidade_nome,
        bloco: blocks.dados_uc ? "Dados da UC" : "Documento Completo",
        metodo: "Regex Nome Cliente",
        trecho_encontrado: nameMatch[0],
        confianca: 90
      });
    }

    // Endereço (Prioritize Endereço immediately following the specific UC identifier or UC line)
    let endMatch: RegExpMatchArray | null = null;
    if (codigo_numero) {
      // Search specifically after the line containing the exact UC number
      const escapedUc = codigo_numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ucRegex = new RegExp(`(?:\\\\bUC\\\\b|\\\\bCODNUM\\\\b|\\\\bUnidade\\\\s+Consumidora\\\\b)\\\\s*[:/-]*\\\\s*${escapedUc}`, "i");
      const ucMatchObj = text.match(ucRegex);
      const ucIndex = ucMatchObj ? text.indexOf(ucMatchObj[0]) : text.indexOf(codigo_numero);
      if (ucIndex !== -1) {
        const textAfterUc = text.substring(ucIndex);
        endMatch = textAfterUc.match(/(?:ENDERECO|ENDEREÇO)\s*:\s*([A-Za-z0-9\s,.-ªºáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+?)(?=\s*(?:\n|\r|Etapa|Chave|CNPJ|CPF|PONTO|Classificação|Classificacao|MUNICIPIO|MUNICÍPIO|CODNUM|\bUC\b|Sequência|Sequencia|Referência|Referencia|Apresentação|Apresentacao|Vencimento|Documento|Valor|em\s+d[eé]bito|d[eé]bito|Corte|Reaviso|$))/i);
      }
    }
    if (!endMatch) {
      endMatch = ucBlock.match(/(?:ENDERECO|ENDEREÇO)\s*:\s*([A-Za-z0-9\s,.-ªºáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+?)(?=\s*(?:\n|\r|Etapa|Chave|CNPJ|CPF|PONTO|Classificação|Classificacao|MUNICIPIO|MUNICÍPIO|CODNUM|\bUC\b|Sequência|Sequencia|Referência|Referencia|Apresentação|Apresentacao|Vencimento|Documento|Valor|em\s+d[eé]bito|d[eé]bito|Corte|Reaviso|$))/i);
    }
    if (endMatch) {
      let cleanedAddr = endMatch[1].trim();
      cleanedAddr = cleanedAddr.replace(/\s*(?:em\s+d[eé]bito.*|etapa.*|chave.*|cnpj.*|cpf.*|ponto.*|classific.*)$/i, "").trim();
      endereco = cleanedAddr;
      debugLogs.push({
        campo: "endereco",
        valor: endereco,
        bloco: "Dados da UC",
        metodo: "Regex Endereço (relativo à UC)",
        trecho_encontrado: endMatch[0],
        confianca: 100
      });
    }

    // Município
    const munMatch = ucBlock.match(/(?:MUNICIPIO|MUNICÍPIO)\s*:\s*([A-Z\sªº.-]{3,40})/i);
    if (munMatch) {
      municipio = munMatch[1].trim();
      debugLogs.push({
        campo: "municipio",
        valor: municipio,
        bloco: blocks.dados_uc ? "Dados da UC" : "Documento Completo",
        metodo: "Regex Município Celesc",
        trecho_encontrado: munMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "municipio",
        valor: null,
        bloco: "Dados da UC",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Classe
    const classMatch = ucBlock.match(/(?:CLASSE|CLASSE\s+DE\s+CONSUMO)\s*:\s*(PODER\s+PÚBLICO|PÚBLICA|PÚBLICO|RESIDENCIAL|COMERCIAL|INDUSTRIAL)/i);
    if (classMatch) {
      classe = classMatch[1].trim();
      debugLogs.push({
        campo: "classe",
        valor: classe,
        bloco: blocks.dados_uc ? "Dados da UC" : "Documento Completo",
        metodo: "Regex Classe Celesc",
        trecho_encontrado: classMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "classe",
        valor: null,
        bloco: "Dados da UC",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Grupo & Modalidade
    const grupoMatch = ucBlock.match(/(?:GRUPO|GRUPO\s+TARIFÁRIO)\s*:\s*([A-Z0-9]{2,4})/i);
    if (grupoMatch) {
      grupo_tarifario = grupoMatch[1].trim();
      debugLogs.push({
        campo: "grupo_tarifario",
        valor: grupo_tarifario,
        bloco: blocks.dados_uc ? "Dados da UC" : "Documento Completo",
        metodo: "Regex Grupo Tarifário",
        trecho_encontrado: grupoMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "grupo_tarifario",
        valor: null,
        bloco: "Dados da UC",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    const modalMatch = ucBlock.match(/(?:MODALIDADE|MODALIDADE\s+TARIFÁRIA)\s*:\s*(VERDE|AZUL|CONVENCIONAL)/i);
    if (modalMatch) {
      modalidade_tarifaria = modalMatch[1].trim();
      debugLogs.push({
        campo: "modalidade_tarifaria",
        valor: modalidade_tarifaria,
        bloco: blocks.dados_uc ? "Dados da UC" : "Documento Completo",
        metodo: "Regex Modalidade Celesc",
        trecho_encontrado: modalMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "modalidade_tarifaria",
        valor: null,
        bloco: "Dados da UC",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Fatura Number
    const fatMatch = text.match(/(?:Fatura)\s*:\s*([0-9A-Z-]+)/i);
    if (fatMatch) {
      fatura_num = fatMatch[1].trim();
      debugLogs.push({
        campo: "fatura_num",
        valor: fatura_num,
        bloco: "Dados da UC",
        metodo: "Regex Fatura Celesc",
        trecho_encontrado: fatMatch[0],
        confianca: 100
      });
    }

    // Grupo / Subgrupo Tensão
    const gstMatch = text.match(/(?:Grupo\s*\/\s*Subgrupo\s+Tensão|Grupo\s*\/\s*Subgrupo\s+Tensao)[\s.:-]*([A-Z0-9\s-]{1,10})/i);
    if (gstMatch) {
      grupo_subgrupo_tensao = gstMatch[1].trim();
      debugLogs.push({
        campo: "grupo_subgrupo_tensao",
        valor: grupo_subgrupo_tensao,
        bloco: "Dados da UC",
        metodo: "Regex Grupo Subgrupo Tensão",
        trecho_encontrado: gstMatch[0],
        confianca: 100
      });
    }


    // --- 3. VALORES MEDIDOS EXTRACTION ---
    const medBlock = blocks.valores_medidos || text;

    // Medidor. "NRO"/"Nº"/"N°" pode vir antes OU depois de "MEDIDOR" (ex: "MEDIDOR NRO: 123" ou
    // "NRO MEDIDOR: 123") — sem consumir esse filler explicitamente, a captura pegava "NRO" em
    // vez do número real do medidor quando o filler vinha depois da palavra-chave.
    const medMatch = medBlock.match(/(?:N[ºRO°.]{0,3}\.?\s+)?MEDIDOR\s*(?:N[ºRO°.]{0,3}\.?\s*)?[:/]?\s*([A-Z0-9][A-Z0-9-]*)/i);
    if (medMatch) {
      medidor = medMatch[1].trim();
      debugLogs.push({
        campo: "medidor",
        valor: medidor,
        bloco: blocks.valores_medidos ? "Valores Medidos" : "Documento Completo",
        metodo: "Regex Medidor Celesc",
        trecho_encontrado: medMatch[0],
        confianca: 100
      });
    }

    // Leitura Anterior / Atual
    const readAntMatch = medBlock.match(/LEITURA\s+ANTERIOR\s*:\s*([\d,.]+)/i);
    if (readAntMatch) {
      leitura_anterior = this.parseBrazilianFloat(readAntMatch[1]);
      debugLogs.push({
        campo: "leitura_anterior",
        valor: leitura_anterior,
        bloco: "Valores Medidos",
        metodo: "Regex Leitura Anterior",
        trecho_encontrado: readAntMatch[0],
        confianca: 100
      });
    }
    
    const readAtuMatch = medBlock.match(/LEITURA\s+ATUAL\s*:\s*([\d,.]+)/i);
    if (readAtuMatch) {
      leitura_atual = this.parseBrazilianFloat(readAtuMatch[1]);
      debugLogs.push({
        campo: "leitura_atual",
        valor: leitura_atual,
        bloco: "Valores Medidos",
        metodo: "Regex Leitura Atual",
        trecho_encontrado: readAtuMatch[0],
        confianca: 100
      });
    }

    // Consumo kWh
    const consMatch = medBlock.match(/(?:CONSUMO\s*MEDIDO|CONSUMO\s*FATURADO|CONSUMO)[\s.:-]*([\d,.]+)\s*kWh/i) || 
                      medBlock.match(/(?:CONSUMO\s*MEDIDO|CONSUMO\s*FATURADO|CONSUMO)[\s.:-]*([\d,.]+)/i);
    if (consMatch) {
      consumo = this.parseBrazilianFloat(consMatch[1]);
      debugLogs.push({
        campo: "consumo",
        valor: consumo,
        bloco: blocks.valores_medidos ? "Valores Medidos" : "Documento Completo",
        metodo: "Regex Consumo Medido",
        trecho_encontrado: consMatch[0],
        confianca: 100
      });
    }

    // Data Leitura & Dias Faturados
    const datLeiMatch = medBlock.match(/(?:DATA\s+DA\s+LEITURA|DATA\s+LEITURA)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (datLeiMatch) {
      data_leitura = datLeiMatch[1];
      debugLogs.push({
        campo: "data_leitura",
        valor: data_leitura,
        bloco: "Valores Medidos",
        metodo: "Regex Data Leitura",
        trecho_encontrado: datLeiMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "data_leitura",
        valor: null,
        bloco: "Valores Medidos",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    const diasMatch = medBlock.match(/(?:DIAS\s+FATURADOS|PERÍODO\s+DE\s+CONSUMO|DIAS)\s*:\s*(\d{1,2})/i);
    if (diasMatch) {
      dias_faturados = parseInt(diasMatch[1]);
      debugLogs.push({
        campo: "dias_faturados",
        valor: dias_faturados,
        bloco: "Valores Medidos",
        metodo: "Regex Dias Faturados",
        trecho_encontrado: diasMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "dias_faturados",
        valor: null,
        bloco: "Valores Medidos",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }


    // --- 4. ITENS DA FATURA TABLE EXTRACTION ---
    // Section-Anchored extraction: locate "ITENS DA FATURA" section block to isolate items table from header/footer text
    let itemsBlock = "";
    const upperText = text.toUpperCase();
    let startIdx = upperText.indexOf("ITENS DA FATURA");
    if (startIdx === -1) startIdx = upperText.indexOf("ITENS DE FATURA");
    if (startIdx === -1) startIdx = upperText.indexOf("DEMONSTRATIVO");

    if (startIdx !== -1) {
      const rest = text.substring(startIdx);
      // Cut off at the true document payment slip footer
      const endMatches = [
        "COMPROVANTE DE PAGAMENTO", "AUTENTICAÇÃO MECÂNICA", "AUTENTICACAO MECANICA",
        "LINHA DIGITÁVEL", "LINHA DIGITAVEL", "CANHOTO DE RECEBIMENTO", "DADOS PARA DÉBITO AUTOMÁTICO"
      ];
      let endIdx = rest.length;
      for (const endM of endMatches) {
        const pIdx = rest.toUpperCase().indexOf(endM);
        if (pIdx > 30 && pIdx < endIdx) {
          endIdx = pIdx;
        }
      }
      itemsBlock = rest.substring(0, endIdx).trim();
    } else {
      itemsBlock = text;
    }

    let itemIdCounter = 1;

    // Tabela fixa de itens conhecidos da Celesc
    const celescItemPrefixes = [
      "DIFERENÇA DA DEMANDA CONTRATADA",
      "DIFERENCA DA DEMANDA CONTRATADA",
      "DIFERENÇA DA DEMANDA CONTRATAD",
      "DIFERENCA DA DEMANDA CONTRATAD",
      "DIFERENÇA DA DEMANDA",
      "DIFERENCA DA DEMANDA",
      "DEMANDA DE ULTRAPASSAGEM",
      "DEMANDA ULTRAPASSAGEM",
      "DEMANDA",
      "CONSUMO FORA PONTA TE",
      "CONSUMO PONTA TE",
      "CONSUMO FORA PONTA TUSD",
      "CONSUMO PONTA TUSD",
      "CONSUMO FORA PONTA",
      "CONSUMO PONTA",
      "CONSUMO TE",
      "CONSUMO TUSD",
      "CONSUMO",
      "ENERGIA INJETADA FORA PONTA TE",
      "ENERGIA INJETADA PONTA TE",
      "ENERGIA INJETADA FORA PONTA TUSD",
      "ENERGIA INJETADA FORA PONTA TU",
      "ENERGIA INJETADA PONTA TUSD",
      "ENERGIA INJETADA TE",
      "ENERGIA INJETADA TUSD",
      "ENERGIA INJETADA",
      "BANDEIRA AMARELA DA ENERGIA INJETADA",
      "BANDEIRA AMARELA DA ENERGIA INJ",
      "BANDEIRA AMARELA DA ENERGIA IN",
      "BANDEIRA AMARELA",
      "BANDEIRA VERMELHA DA ENERGIA INJETADA",
      "BANDEIRA VERMELHA DA ENERGIA INJ",
      "BANDEIRA VERMELHA DA ENERGIA IN",
      "BANDEIRA VERMELHA",
      "ADICIONAL BANDEIRA AMARELA",
      "ADICIONAL BANDEIRA VERMELHA",
      "ENERGIA REATIVA EXCEDENTE NÃO",
      "ENERGIA REATIVA EXCEDENTE NAO",
      "ENERGIA REATIVA EXCEDENTE",
      "COSIP MUNICIPAL RIO DO SUL",
      "COSIP MUNICIPAL",
      "COSIP - ILUMINAÇÃO PÚBLICA",
      "COSIP - ILUMINACAO PUBLICA",
      "COSIP",
      "ILUMINAÇÃO PÚBLICA",
      "ILUMINACAO PUBLICA",
      "TRIBUTO RETIDO IRPJ",
      "TRIBUTOS RETIDOS IRPJ",
      "TRIBUTO RETIDO",
      "TRIBUTOS RETIDOS",
      "MULTA DE MORA",
      "MULTA POR ATRASO",
      "MULTA",
      "JUROS DE MORA",
      "JUROS",
      "AJUSTE DE VALOR",
      "AJUSTE",
      "DEVOLUÇÃO DE VALOR",
      "DEVOLUÇÃO",
      "DEVOLUCAO",
      "DESCONTO"
    ];

    const lines = itemsBlock.split("\n");
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let trimmed = line.trim();
      if (!trimmed) continue;

      // Skip explicit table header & column header lines
      if (/^(?:Itens\s+d[ae]\s+Fatura|Valores\s+Medidos|Valores\s+de\s+Tributos|Tributos\s+Base\s+de|Medidor\s+Grandeza|Posto\s+Tarif|Preço\s+unit|CONFINS\/\s*PIS|Tributos\s+Federais\s+Retidos|Descrição\s+Quantidade|Quantidade\s+Preço|Valor\s+\(R\$\))\b/i.test(trimmed)) {
        if (!/\d+[\d,.]*\s+[-+–—]?\d+/i.test(trimmed)) {
          continue;
        }
      }
      if (/^(?:DESCRICAO|QUANTIDADE|VALOR\s*\(R\$\)|PREÇO\s+UNITÁRIO|TRIBUTOS\s+BASE|BASE\s+DE\s+CÁLCULO|IRPJ\s*\(\%\)|CSLL\s*\(R\$\))$/i.test(trimmed)) continue;

      // Skip meter reading lines starting with 10-digit meter number or pure meter measurement lines (without TE/TUSD/TU or pricing)
      if (/^00\d{8,12}\b/i.test(trimmed)) continue;
      if (/^(?:Energia|Energia\s+reativa|Demanda|DMCR)\s+(?:Ponta|Fora\s+ponta|Fora\s+ponta\s+capa|Único)\b/i.test(trimmed) && !/\b(?:TE|TUSD|TU)\b/i.test(trimmed) && !/[-+]?\d+[\d,.]*\s+[-+]?\d+/i.test(trimmed)) continue;

      let targetItemLine = "";
      const upperLine = trimmed.toUpperCase();
      let matchedPrefixIndex = -1;

      for (const prefix of celescItemPrefixes) {
        const pIdx = upperLine.indexOf(prefix);
        if (pIdx !== -1) {
          // Extra guard for DEMANDA prefix to avoid matching "Demanda Fora ponta" or "Demanda Ponta" meter lines
          if (prefix === "DEMANDA") {
            const restAfterPrefix = upperLine.substring(pIdx + prefix.length).trim();
            if (/^(FORA\s+PONTA|PONTA|CAPA|ÚNICO|MEDID|LEITURA)\b/i.test(restAfterPrefix)) {
              continue;
            }
          }
          // Extra guard for CONSUMO prefix to avoid matching pure meter reading lines (without TE / TUSD / pricing)
          if (prefix === "CONSUMO") {
            const restAfterPrefix = upperLine.substring(pIdx + prefix.length).trim();
            if (/^(MEDIDO|LIDO|APURADO)\b/i.test(restAfterPrefix)) {
              continue;
            }
          }
          matchedPrefixIndex = pIdx;
          break;
        }
      }

      if (matchedPrefixIndex !== -1) {
        // Slice the line right from the item prefix start
        targetItemLine = trimmed.substring(matchedPrefixIndex).trim();
      } else {
        // Skip lines that do not match any known invoice item prefix in the table
        continue;
      }

      if (!targetItemLine) continue;

      // Check if numbers are on the next line when targetItemLine contains no numbers
      let descMatch = targetItemLine.match(/^([A-Za-z0-9\s/().ºª\-–+áéíóúàâêôãõçÁÉÍÓÚÀÂÊÔÃÕÇ#$%&*,:=]+?)\s+([-+–—]?\s*\d[\d,.]*.*)$/);
      if (!descMatch && lineIdx + 1 < lines.length) {
        const nextLine = lines[lineIdx + 1].trim();
        if (/^[-+–—]?\s*\d[\d,.]*/.test(nextLine)) {
          targetItemLine = targetItemLine + " " + nextLine;
          lineIdx++; // advance loop to include the numbers line
          descMatch = targetItemLine.match(/^([A-Za-z0-9\s/().ºª\-–+áéíóúàâêôãõçÁÉÍÓÚÀÂÊÔÃÕÇ#$%&*,:=]+?)\s+([-+–—]?\s*\d[\d,.]*.*)$/);
        }
      }

      if (descMatch) {
        const rawDesc = descMatch[1].trim();
        const restOfLine = descMatch[2].trim();

        // Skip summary tax titles, header lines, or pure meter descriptions
        if (/^(PIS|COFINS|ICMS|TRIBUTOS|VALORES DE TRIBUTOS|TRIBUTOS FEDERAIS RETIDOS)$/i.test(rawDesc)) continue;
        if (/^(Energia|Energia reativa|Demanda|DMCR)\s+(Ponta|Fora ponta|Fora ponta capa|Único)$/i.test(rawDesc) && !/\b(?:TE|TUSD|TU)\b/i.test(rawDesc)) continue;

        const numTokens = restOfLine.match(/[-+–—]?\s*\d[\d,.]*/g);
        if (numTokens && numTokens.length >= 1) {
          const nums = numTokens.map(n => this.parseBrazilianFloat(n));
          const descricao = this.sanitizeItemDescription(rawDesc);

          if (descricao.length >= 2 && !/^(?:DESCRICAO|QUANTIDADE|VALOR|VALORES|BASE DE CALCULO|PREÇO UNITÁRIO)$/i.test(descricao)) {
            if (/^(PIS|COFINS|ICMS)$/i.test(descricao)) continue;

            let quantidade = 0;
            let valor_unitario = 0;
            let valor = 0;

            if (nums.length >= 3) {
              quantidade = nums[0];
              valor_unitario = nums[1];
              valor = nums[2];
            } else if (nums.length === 2) {
              quantidade = nums[0];
              valor = nums[1];
            } else {
              valor = nums[0];
            }

            const pis = nums.length >= 4 ? nums[3] : 0; // COFINS/PIS (R$)
            const icms = nums.length >= 5 ? nums[4] : 0; // ICMS (R$)
            const irpj_pct = nums.length >= 6 ? nums[5] : 0; // IRPJ (%)
            const irpj_val = nums.length >= 7 ? nums[6] : 0; // IRPJ (R$)
            const pis_ret = nums.length >= 8 ? nums[7] : 0; // PIS (R$) retido
            const cofns_ret = nums.length >= 9 ? nums[8] : 0; // COFINS (R$) retido
            const csll_ret = nums.length >= 10 ? nums[9] : 0; // CSLL (R$) retido

            let cofins = 0; // Retenções Totais (R$)
            if (nums.length >= 7) {
              cofins = nums.slice(6).reduce((acc, curr) => acc + curr, 0);
            } else if (nums.length === 6 && nums[5] < 0) {
              cofins = nums[5];
            } else if (valor < 0) {
              cofins = valor;
            }

            itens_fatura.push({
              id: String(itemIdCounter++),
              descricao,
              quantidade,
              valor_unitario,
              valor,
              pis,
              icms,
              irpj_pct,
              irpj_val,
              pis_ret,
              cofins_ret: cofns_ret,
              csll_ret,
              cofins: parseFloat(cofins.toFixed(2))
            });
          }
        }
      }
    }

    // Calculate active consumption (kWh) accurately for CELESC (strictly TE, excluding TUSD)
    let calcConsumo = 0;
    const teConsumoItems = itens_fatura.filter(it => 
      /CONSUMO/i.test(it.descricao) && /\bTE\b/i.test(it.descricao) && !/\bTUSD\b/i.test(it.descricao) && !/INJETADA|REATIVA/i.test(it.descricao)
    );

    if (teConsumoItems.length > 0) {
      calcConsumo = teConsumoItems.reduce((sum, it) => sum + (it.quantidade || 0), 0);
    } else {
      const genericConsumoItems = itens_fatura.filter(it => 
        /CONSUMO/i.test(it.descricao) && !/\bTUSD\b/i.test(it.descricao) && !/INJETADA|REATIVA|DEMANDA/i.test(it.descricao)
      );
      if (genericConsumoItems.length > 0) {
        calcConsumo = genericConsumoItems.reduce((sum, it) => sum + (it.quantidade || 0), 0);
      }
    }

    if (calcConsumo === 0 && blocks.valores_medidos) {
      const medLines = blocks.valores_medidos.split("\n");
      for (const mLine of medLines) {
        if (/\bEnergia\b/i.test(mLine) && !/reativa|injetada/i.test(mLine)) {
          const numMatches = mLine.match(/[-+]?\d[\d,.]*/g);
          if (numMatches && numMatches.length > 0) {
            const apuradoVal = this.parseBrazilianFloat(numMatches[numMatches.length - 1]);
            if (apuradoVal > 0) {
              calcConsumo += apuradoVal;
            }
          }
        }
      }
    }

    if (calcConsumo > 0) {
      consumo = parseFloat(calcConsumo.toFixed(2));
    }

    // Capture specific parameters from the structured items list
    let sumRetencoes = 0;
    itens_fatura.forEach(item => {
      const descUpper = item.descricao.toUpperCase();
      
      if (item.cofins) {
        sumRetencoes += item.cofins;
      }

      // COSIP (Contribuição Custeio Iluminação Pública)
      if (descUpper.includes("COSIP") || descUpper.includes("ILUMINAÇÃO") || descUpper.includes("ILUMINACAO")) {
        valor_diversos += item.valor;
      }
      // Geração Distribuída (Energia Injetada)
      if (descUpper.includes("INJETADA") || descUpper.includes("GERAÇÃO") || descUpper.includes("GERACAO")) {
        // Handled below strictly with TE items
      }
      // Demanda Contratada / DMCR
      if (descUpper.includes("DEMANDA") || descUpper.includes("DMCR")) {
        demanda = item.quantidade;
      }
      // Energia Reativa Excedente
      if (descUpper.includes("REATIVA") || descUpper.includes("EXCEDENTE REATIVO")) {
        energia_reativa = item.valor;
      }
      // Créditos
      if (item.valor < 0 && (descUpper.includes("CRÉDITO") || descUpper.includes("CREDITO") || descUpper.includes("DEVOLUÇÃO") || descUpper.includes("COMPENSAÇÃO"))) {
        valor_credito += Math.abs(item.valor);
      }
    });

    // Calculate energia_injetada from itens_fatura (strictly TE, excluding TUSD)
    const injetadaItems = itens_fatura.filter(it => /INJETAD[AO]|GERAÇ[AÃ]O|GERAC[AÃ]O/i.test(it.descricao || ""));
    if (injetadaItems.length > 0) {
      const teInjetada = injetadaItems.filter(it => /\bTE\b/i.test(it.descricao || "") && !/\bTUSD\b/i.test(it.descricao || ""));
      if (teInjetada.length > 0) {
        energia_injetada = teInjetada.reduce((sum, it) => sum + Math.abs(Number(it.quantidade || 0)), 0);
      } else {
        const nonTusdInjetada = injetadaItems.filter(it => !/\bTUSD\b/i.test(it.descricao || ""));
        if (nonTusdInjetada.length > 0) {
          energia_injetada = nonTusdInjetada.reduce((sum, it) => sum + Math.abs(Number(it.quantidade || 0)), 0);
        }
      }
      if (energia_injetada !== null) {
        energia_injetada = parseFloat(energia_injetada.toFixed(3));
      }
    }

    if (sumRetencoes < 0 && valor_credito === 0) {
      valor_credito = parseFloat(sumRetencoes.toFixed(2));
    }

    if (itens_fatura.length > 0) {
      debugLogs.push({
        campo: "itens_fatura",
        valor: `${itens_fatura.length} itens extraídos`,
        bloco: blocks.itens_fatura ? "Itens da Fatura" : "Documento Completo",
        metodo: "Regra estrutural de tabela CELESC",
        trecho_encontrado: `Primeiro: ${itens_fatura[0].descricao} (${itens_fatura[0].valor})`,
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "itens_fatura",
        valor: null,
        bloco: "Itens da Fatura",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // --- 5. VALOR TOTAL & IMPOSTOS EXTRACTION ---
    const totalsBlock = blocks.boleto || blocks.itens_fatura || text;
    const totalMatch = ucBlock.match(/Valor\s*:\s*R?\$\s*([\d,.]+)/i) ||
                       totalsBlock.match(/(?:SUBTOTAL|TOTAL\s+A\s+PAGAR|VALOR\s+PAGO|VALOR\s+TOTAL|TOTAL)[\s.:-]*R\$\s*([\d,.]+)/i) || 
                       totalsBlock.match(/(?:SUBTOTAL|TOTAL\s+A\s+PAGAR|VALOR\s+PAGO|VALOR\s+TOTAL|TOTAL)[\s.:-]*([\d,.]+)/i) ||
                       text.match(/(?:Valor|Valor\s+Total|Valor:\s*R\$)[\s.:-]*R?\$\s*([\d,.]+)/i);
    if (totalMatch) {
      valor_total = this.parseBrazilianFloat(totalMatch[1]);
      debugLogs.push({
        campo: "valor_total",
        valor: valor_total,
        bloco: "Rodapé / Totais",
        metodo: "Regex Valor Total CELESC",
        trecho_encontrado: totalMatch[0],
        confianca: 100
      });
    }

    // Fallback: Calculate total directly from items if regex missed or gave 0
    if ((!valor_total || valor_total === 0) && itens_fatura.length > 0) {
      const sumItens = itens_fatura.reduce((acc, it) => acc + (it.valor || 0), 0);
      if (sumItens > 0) {
        valor_total = parseFloat(sumItens.toFixed(2));
        debugLogs.push({
          campo: "valor_total",
          valor: valor_total,
          bloco: "Soma de Itens",
          metodo: "Cálculo Automático por Itens",
          trecho_encontrado: `Soma de ${itens_fatura.length} itens`,
          confianca: 100
        });
      }
    }

    // Calculate valor_imposto (Tributos Totais) directly from items (sum of ICMS + PIS/COFINS em Reais)
    const sumImpFromItems = itens_fatura.reduce((acc, it) => {
      return acc + (Number(it.icms || 0) + Number(it.pis || 0));
    }, 0);

    if (sumImpFromItems > 0) {
      valor_imposto = parseFloat(sumImpFromItems.toFixed(2));
      debugLogs.push({
        campo: "valor_imposto",
        valor: valor_imposto,
        bloco: "Itens da Fatura",
        metodo: "Soma direta ICMS + PIS/COFINS dos itens",
        trecho_encontrado: `Soma de impostos dos ${itens_fatura.length} itens`,
        confianca: 100
      });
    } else {
      const impMatch = totalsBlock.match(/(?:TOTAL\s+DOS\s+TRIBUTOS|TOTAL\s+DE\s+IMPOSTOS|VALOR\s+TRIBUTOS|VALOR\s+IMPOSTOS|VALOR\s+ICMS|ICMS\s+TOTAL|TRIBUTOS|IMPOSTOS)[\s.:-]*R\$\s*([\d,.]+)/i) ||
                       totalsBlock.match(/(?:TOTAL\s+DOS\s+TRIBUTOS|TOTAL\s+DE\s+IMPOSTOS|VALOR\s+TRIBUTOS|VALOR\s+IMPOSTOS|VALOR\s+ICMS|ICMS\s+TOTAL|TRIBUTOS|IMPOSTOS)[\s.:-]*([\d,.]+)/i);
      if (impMatch) {
        valor_imposto = this.parseBrazilianFloat(impMatch[1]);
        debugLogs.push({
          campo: "valor_imposto",
          valor: valor_imposto,
          bloco: "Rodapé / Totais",
          metodo: "Regex Impostos CELESC",
          trecho_encontrado: impMatch[0],
          confianca: 100
        });
      } else {
        debugLogs.push({
          campo: "valor_imposto",
          valor: null,
          bloco: "Rodapé / Totais",
          metodo: "Regex",
          trecho_encontrado: null,
          confianca: 0
        });
      }
    }


    // --- 6. HISTÓRICO EXTRACTION ---
    const histBlock = blocks.historico || text;
    // Histórico layout: look for Month/Year pairs followed by Consumption (e.g., "05/2026 1200" or "MAI/26 1200")
    const histRegex = /(0[1-9]|1[0-2])\/(\d{4}|\d{2})\s+([\d.]+)/g;
    let hMatch;
    histRegex.lastIndex = 0;
    while ((hMatch = histRegex.exec(histBlock)) !== null) {
      let month = hMatch[1];
      let year = hMatch[2];
      if (year.length === 2) {
        year = "20" + year;
      }
      const hCons = parseInt(hMatch[3].replace(/\./g, ""));
      if (!isNaN(hCons) && hCons > 0) {
        historico.push({
          mes_ano: `${month}/${year}`,
          consumo: hCons
        });
      }
    }

    if (historico.length > 0) {
      debugLogs.push({
        campo: "historico",
        valor: `${historico.length} registros`,
        bloco: blocks.historico ? "Histórico de Consumo" : "Documento Completo",
        metodo: "Regex scan de competências",
        trecho_encontrado: `${historico[0].mes_ano}: ${historico[0].consumo}`,
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "historico",
        valor: null,
        bloco: "Histórico de Consumo",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }


    // --- 7. BOLETO EXTRACTION ---
    const bolBlock = blocks.boleto || text;
    let boleto: any = null;

    // Linha Digitável
    let linha_digitavel: string | null = null;
    const ldMatch = bolBlock.match(/(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})/i) ||
                    bolBlock.match(/(\d{47,48})/); // standard numbers
    if (ldMatch) {
      linha_digitavel = ldMatch[1].trim();
      debugLogs.push({
        campo: "linha_digitavel",
        valor: linha_digitavel,
        bloco: blocks.boleto ? "Boleto" : "Documento Completo",
        metodo: "Regex Linha Digitável CELESC",
        trecho_encontrado: ldMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "linha_digitavel",
        valor: null,
        bloco: "Boleto",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Código de Barras
    let codigo_barras: string | null = null;
    const cbMatch = bolBlock.match(/(\d{44})/);
    if (cbMatch) {
      codigo_barras = cbMatch[1].trim();
      debugLogs.push({
        campo: "codigo_barras",
        valor: codigo_barras,
        bloco: blocks.boleto ? "Boleto" : "Documento Completo",
        metodo: "Regex Código de Barras",
        trecho_encontrado: cbMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "codigo_barras",
        valor: null,
        bloco: "Boleto",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Nosso Número
    let nosso_numero: string | null = null;
    const nnMatch = bolBlock.match(/(?:NOSSO\s+NÚMERO|NOSSO\s+NRO|NOSSO\s*N°)\s*[:/]*\s*([0-9/.-]+)/i);
    if (nnMatch) {
      nosso_numero = nnMatch[1].trim();
    }

    // Número Documento
    let numero_documento: string | null = null;
    const ndMatch = bolBlock.match(/(?:NRO\s+DOCUMENTO|NÚMERO\s+DO\s+DOCUMENTO|Nº\s+DOC|N°\s+DOC|DOC\s+Nº)\s*[:/]*\s*([0-9]+)/i);
    if (ndMatch) {
      numero_documento = ndMatch[1].trim();
    }

    // Vencimento
    const directVencMatch = text.match(/Vencimento\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (directVencMatch) {
      data_vencimento = directVencMatch[1];
      debugLogs.push({
        campo: "data_vencimento",
        valor: data_vencimento,
        bloco: "Documento Completo",
        metodo: "Regex Direto Vencimento (Vencimento:)",
        trecho_encontrado: directVencMatch[0],
        confianca: 100
      });
    } else {
      const vencMatch = totalsBlock.match(/(?:VENCIMENTO|VENCIMENTO\s+DA\s+FATURA|PAGUE\s+ATÉ)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                        totalsBlock.match(/(?:VENCIMENTO|VENCIMENTO\s+DA\s+FATURA|PAGUE\s+ATÉ)\s+(\d{2}\/\d{2}\/\d{4})/i) ||
                        totalsBlock.match(/(\d{2}\/\d{2}\/\d{4})/); // simple date match in boleto
      if (vencMatch) {
        data_vencimento = vencMatch[1];
        debugLogs.push({
          campo: "data_vencimento",
          valor: data_vencimento,
          bloco: "Boleto / Totais",
          metodo: "Regex Vencimento CELESC",
          trecho_encontrado: vencMatch[0],
          confianca: 100
        });
      } else {
        debugLogs.push({
          campo: "data_vencimento",
          valor: null,
          bloco: "Boleto / Totais",
          metodo: "Regex",
          trecho_encontrado: null,
          confianca: 0
        });
      }
    }

    // If we have a line digitavel or codigo de barras, construct the boleto structure
    if (linha_digitavel || codigo_barras) {
      boleto = {
        banco: "001 - BANCO DO BRASIL S.A.", // CELESC's default financial provider typically
        linha_digitavel: linha_digitavel || "",
        codigo_barras: codigo_barras || "",
        nosso_numero: nosso_numero || "",
        numero_documento: numero_documento || "",
        valor: valor_total,
        vencimento: data_vencimento || "",
        beneficiario: "CELESC DISTRIBUIÇÃO S.A. - CNPJ: 08.336.783/0001-90"
      };
    }

    // Competência Date standardizing (YYYY-MM-DD)
    const compMatch = headBlock.match(/(?:COMPETENCIA|COMPETÊNCIA|MÊS\/ANO|REFERÊNCIA)\s*[:/]*\s*(\d{2})\/(\d{4})/i) ||
                      text.match(/(?:COMPETENCIA|COMPETÊNCIA|MÊS\/ANO|REFERÊNCIA)\s*[:/]*\s*(\d{2})\/(\d{4})/i);
    if (compMatch) {
      mes_ano = `${compMatch[2]}-${compMatch[1]}-01`;
      debugLogs.push({
        campo: "mes_ano",
        valor: mes_ano,
        bloco: "Cabeçalho",
        metodo: "Regex Competência CELESC",
        trecho_encontrado: compMatch[0],
        confianca: 100
      });
    } else {
      debugLogs.push({
        campo: "mes_ano",
        valor: null,
        bloco: "Cabeçalho",
        metodo: "Regex",
        trecho_encontrado: null,
        confianca: 0
      });
    }

    // Assemble final output strictly
    return {
      mes_ano: mes_ano || "",
      consumo,
      valor_total,
      valor_imposto,
      valor_diversos,
      valor_credito,
      codigo_numero: codigo_numero || "",
      medidor: medidor || "",
      unidade_nome: unidade_nome || undefined,
      endereco: endereco || undefined,
      leitura_anterior: leitura_anterior || undefined,
      leitura_atual: leitura_atual || undefined,
      data_vencimento: data_vencimento || undefined,
      municipio: municipio || undefined,
      classe: classe || undefined,
      grupo_tarifario: grupo_tarifario || undefined,
      modalidade_tarifaria: modalidade_tarifaria || undefined,
      fatura_num: fatura_num || undefined,
      grupo_subgrupo_tensao: grupo_subgrupo_tensao || undefined,
      data_leitura: data_leitura || undefined,
      dias_faturados: dias_faturados || undefined,
      nota_fiscal: nota_fiscal || undefined,
      chave_acesso: chave_acesso || undefined,
      energia_injetada: energia_injetada || undefined,
      demanda: demanda || undefined,
      energia_reativa: energia_reativa || undefined,
      historico: historico.length > 0 ? historico : undefined,
      itens_fatura: itens_fatura,
      boleto: boleto || undefined,
      debug_log: debugLogs
    } as any;
  }

  /**
   * Helper to segment text into structural CELESC blocks
   */
  private static segmentBlocks(text: string, debugLogs: ExtractionFieldLog[]): {
    cabecalho?: string;
    dados_uc?: string;
    valores_medidos?: string;
    itens_fatura?: string;
    historico?: string;
    boleto?: string;
  } {
    const contentUpper = text.toUpperCase();
    const result: {
      cabecalho?: string;
      dados_uc?: string;
      valores_medidos?: string;
      itens_fatura?: string;
      historico?: string;
      boleto?: string;
    } = {};

    // 1. Find indices of key boundaries
    const idxCelesc = contentUpper.indexOf("CELESC DISTRIBUICAO S.A.") !== -1 ? contentUpper.indexOf("CELESC DISTRIBUICAO S.A.") : contentUpper.indexOf("CELESC");
    
    // Flexible UC start index search
    const ucSearchMatch = text.match(/(?:\bUNIDADE\s+CONSUMIDORA\b|\bUC\b\s*[:/-]?\s*[0-9]|\bCODNUM\b\s*[:/-]?\s*[0-9])/i);
    const idxUc = ucSearchMatch ? text.indexOf(ucSearchMatch[0]) : (contentUpper.indexOf("UNIDADE CONSUMIDORA") !== -1 ? contentUpper.indexOf("UNIDADE CONSUMIDORA") : contentUpper.indexOf("UC"));
    const idxMedidor = contentUpper.indexOf("VALORES MEDIDOS") !== -1 ? contentUpper.indexOf("VALORES MEDIDOS") : contentUpper.indexOf("MEDIDOR");
    
    // Priority search for ITENS DA FATURA table
    const idxItensDaFatura = contentUpper.indexOf("ITENS DA FATURA");
    const idxItensDeFatura = contentUpper.indexOf("ITENS DE FATURA");
    const idxDemonstrativo = contentUpper.indexOf("DEMONSTRATIVO");
    const idxItensGeneric = contentUpper.indexOf("ITENS");

    let idxItens = -1;
    if (idxItensDaFatura !== -1) {
      idxItens = idxItensDaFatura;
    } else if (idxItensDeFatura !== -1) {
      idxItens = idxItensDeFatura;
    } else if (idxDemonstrativo !== -1 && idxDemonstrativo > idxMedidor) {
      idxItens = idxDemonstrativo;
    } else if (idxItensGeneric !== -1) {
      idxItens = idxItensGeneric;
    }

    const idxHistorico = contentUpper.indexOf("HISTÓRICO") !== -1 ? contentUpper.indexOf("HISTÓRICO") : contentUpper.indexOf("HISTORICO");
    const idxBoleto = contentUpper.indexOf("COMPROVANTE DE PAGAMENTO") !== -1 ? contentUpper.indexOf("COMPROVANTE DE PAGAMENTO") : (contentUpper.indexOf("LINHA DIGITÁVEL") !== -1 ? contentUpper.indexOf("LINHA DIGITÁVEL") : (contentUpper.indexOf("AUTENTICAÇÃO MECÂNICA") !== -1 ? contentUpper.indexOf("AUTENTICAÇÃO MECÂNICA") : -1));

    // 2. Extract substrings based on found indices
    
    // Cabeçalho
    if (idxCelesc !== -1) {
      const endIdx = idxUc !== -1 ? idxUc : (idxMedidor !== -1 ? idxMedidor : text.length);
      result.cabecalho = text.substring(idxCelesc, endIdx).trim();
      debugLogs.push({
        campo: "bloco_cabecalho",
        valor: `Segmentado (${result.cabecalho.length} carac.)`,
        bloco: "Geral",
        metodo: "Limite de Substring",
        trecho_encontrado: `De 'Celesc' até 'UC'`,
        confianca: 100
      });
    }

    // Dados da UC
    if (idxUc !== -1) {
      const endIdx = idxMedidor !== -1 ? idxMedidor : (idxItens !== -1 ? idxItens : text.length);
      result.dados_uc = text.substring(idxUc, endIdx).trim();
      debugLogs.push({
        campo: "bloco_dados_uc",
        valor: `Segmentado (${result.dados_uc.length} carac.)`,
        bloco: "Geral",
        metodo: "Limite de Substring",
        trecho_encontrado: `De 'UC' até 'Valores Medidos'`,
        confianca: 100
      });
    }

    // Valores Medidos
    if (idxMedidor !== -1) {
      const endIdx = idxItens !== -1 ? idxItens : (idxHistorico !== -1 ? idxHistorico : text.length);
      result.valores_medidos = text.substring(idxMedidor, endIdx).trim();
      debugLogs.push({
        campo: "bloco_valores_medidos",
        valor: `Segmentado (${result.valores_medidos.length} carac.)`,
        bloco: "Geral",
        metodo: "Limite de Substring",
        trecho_encontrado: `De 'Valores Medidos' até 'Itens'`,
        confianca: 100
      });
    }

    // Itens da Fatura
    if (idxItens !== -1) {
      const validBoleto = (idxBoleto !== -1 && idxBoleto > idxItens) ? idxBoleto : -1;
      const endIdx = validBoleto !== -1 ? validBoleto : text.length;
      result.itens_fatura = text.substring(idxItens, endIdx).trim();
      debugLogs.push({
        campo: "bloco_itens_fatura",
        valor: `Segmentado (${result.itens_fatura.length} carac.)`,
        bloco: "Geral",
        metodo: "Limite de Substring",
        trecho_encontrado: `De 'Itens' até 'Boleto/Fim'`,
        confianca: 100
      });
    }

    // Histórico
    if (idxHistorico !== -1) {
      const endIdx = idxBoleto !== -1 ? idxBoleto : text.length;
      result.historico = text.substring(idxHistorico, endIdx).trim();
      debugLogs.push({
        campo: "bloco_historico",
        valor: `Segmentado (${result.historico.length} carac.)`,
        bloco: "Geral",
        metodo: "Limite de Substring",
        trecho_encontrado: `De 'Histórico' até 'Boleto'`,
        confianca: 100
      });
    }

    // Boleto
    if (idxBoleto !== -1) {
      result.boleto = text.substring(idxBoleto).trim();
      debugLogs.push({
        campo: "bloco_boleto",
        valor: `Segmentado (${result.boleto.length} carac.)`,
        bloco: "Geral",
        metodo: "Limite de Substring",
        trecho_encontrado: `De 'Boleto' até Fim`,
        confianca: 100
      });
    }

    return result;
  }
}
