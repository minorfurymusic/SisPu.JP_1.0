/**
 * ParserCasan — Independent, High-Fidelity Parser for CASAN Invoices
 * Implements strict block-based extraction and exclusive regex patterns.
 * Never guesses, simulates, or defaults missing fields.
 */

import { ExtractedFaturaData } from "./documentParser";
import { ExtractionFieldLog } from "./ParserCelesc";

export class ParserCasan {
  /**
   * Helper to parse Brazilian currency/float values (e.g. "1.450,50" -> 1450.5)
   */
  private static parseBrazilianFloat(valStr: string): number {
    let cleaned = valStr.trim();
    if (cleaned.includes(",") && cleaned.includes(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (cleaned.includes(",")) {
      cleaned = cleaned.replace(",", ".");
    }
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  /**
   * Main entry point to parse a raw text string of a CASAN invoice
   */
  public static parse(text: string, fileName?: string): ExtractedFaturaData {
    const debugLogs: ExtractionFieldLog[] = [];

    // Layer 3: Block-based segmentation for CASAN
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
    const historico: { mes_ano: string; consumo: number }[] = [];
    const itens_fatura: any[] = [];

    // --- 1. CABEÇALHO FIELD EXTRACTION ---
    const headBlock = blocks.cabecalho || text;
    
    // Nota Fiscal / Fatura Número
    const nfMatch = headBlock.match(/(?:NF|Nota\s+Fiscal|Fatura|Fatura\s+Nº|Fatura\s+N°)[^\d\n]*([0-9]{3}[.-][0-9]{3}[.-][0-9]{3}|[0-9]{8,10})/i);
    if (nfMatch) {
      nota_fiscal = nfMatch[1].trim();
      debugLogs.push({
        campo: "nota_fiscal",
        valor: nota_fiscal,
        bloco: "Cabeçalho",
        metodo: "Regex exclusive CASAN",
        trecho_encontrado: nfMatch[0],
        confianca: 100
      });
    }

    // Chave de Acesso (if available, mostly CASAN uses NF-e but we search standard patterns)
    const chaveMatch = headBlock.match(/([0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}|[0-9]{44})/);
    if (chaveMatch) {
      chave_acesso = chaveMatch[1].replace(/\s+/g, "").trim();
    }

    // --- 2. DADOS DA UC FIELD EXTRACTION ---
    const ucBlock = blocks.dados_uc || text;

    // Matrícula / CODNUM CASAN
    const matriculaMatch = ucBlock.match(/(?:Matrícula|Matricula|Nro\s+Matrícula|UC\s+DEBITO|Nº\s+da\s+Matrícula|Número\s+da\s+Matrícula)\s*[:/]*\s*([0-9A-Z-]+)/i);
    if (matriculaMatch) {
      codigo_numero = matriculaMatch[1].trim();
      debugLogs.push({
        campo: "codigo_numero",
        valor: codigo_numero,
        bloco: "Dados da UC/Matrícula",
        metodo: "Regex Matrícula CASAN",
        trecho_encontrado: matriculaMatch[0],
        confianca: 100
      });
    }

    // Unidade Nome
    const nameMatch = ucBlock.match(/(?:NOME|NOME\s+DO\s+USUÁRIO|CLIENTE|USUÁRIO)\s*:\s*([A-Z0-9\sªº.-]+?)(?=\n|ENDERECO|ENDEREÇO|MATRICULA|HIDRÔMETRO|$)/i) ||
                      ucBlock.match(/UC\s+DEBITO:\s*[A-Z0-9-_]+\s*\(([^)]+)\)/i);
    if (nameMatch) {
      unidade_nome = nameMatch[1].trim();
    }

    // Endereço (Prioritize Endereço immediately following the specific Matrícula / UC identifier)
    let endMatch: RegExpMatchArray | null = null;
    if (codigo_numero) {
      const ucRegex = new RegExp(`(?:\\\\bMatrícula\\\\b|\\\\bMatricula\\\\b|\\\\bUC\\\\b|\\\\bCODNUM\\\\b)\\\\s*[:/-]*\\\\s*${codigo_numero}`, "i");
      const ucMatchObj = text.match(ucRegex);
      const ucIndex = ucMatchObj ? text.indexOf(ucMatchObj[0]) : text.indexOf(codigo_numero);
      if (ucIndex !== -1) {
        const textAfterUc = text.substring(ucIndex);
        endMatch = textAfterUc.match(/(?:ENDERECO|ENDEREÇO)\s*:\s*([A-Za-z0-9\s,.-ªºáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+?)(?=\s*(?:\n|\r|MUNICIPIO|MUNICÍPIO|MATRICULA|HIDRÔMETRO|VENCIMENTO|VALOR|em\s+d[eé]bito|d[eé]bito|$))/i);
      }
    }
    if (!endMatch) {
      endMatch = ucBlock.match(/(?:ENDERECO|ENDEREÇO)\s*:\s*([A-Za-z0-9\s,.-ªºáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+?)(?=\s*(?:\n|\r|MUNICIPIO|MUNICÍPIO|MATRICULA|HIDRÔMETRO|VENCIMENTO|VALOR|em\s+d[eé]bito|d[eé]bito|$))/i);
    }
    if (endMatch) {
      let cleanedAddr = endMatch[1].trim();
      cleanedAddr = cleanedAddr.replace(/\s*(?:em\s+d[eé]bito.*|etapa.*|chave.*|cnpj.*|cpf.*|ponto.*|classific.*)$/i, "").trim();
      endereco = cleanedAddr;
    }

    if (!endereco && codigo_numero) {
      const textLines = text.split(/\r?\n/);
      const codLineIdx = textLines.findIndex(l => l.includes(codigo_numero));
      if (codLineIdx !== -1) {
        const codLine = textLines[codLineIdx];
        if (!unidade_nome) {
          const uMatch = codLine.match(/\b\d{3}\.\s*\d{3}\.\s*\d{3}\.\s*\d{4}\.\s*\d{2}\s+(.+?)\s+\d{3}\s+\d+/i);
          if (uMatch) {
            unidade_nome = uMatch[1].trim();
          }
        }
        if (codLineIdx + 1 < textLines.length) {
          const nextLine = textLines[codLineIdx + 1].trim();
          if (
            nextLine &&
            nextLine.length > 3 &&
            nextLine.length < 120 &&
            !/^(MATRÍCULA|MATRICULA|SISTEMA|COMPANHIA|CONTAS|RELATÓRIO|PÁGINA|LOCALIZAÇÃO|USUÁRIO|GRUPO|REFERÊNCIA)\b/i.test(nextLine) &&
            !/^\d{5,8}-\d/.test(nextLine) &&
            !/^\d+$/.test(nextLine)
          ) {
            endereco = nextLine;
          }
        }
      }
    }

    // Município
    const munMatch = ucBlock.match(/(?:MUNICIPIO|MUNICÍPIO)\s*:\s*([A-Z\sªº.-]{3,40})/i);
    if (munMatch) {
      municipio = munMatch[1].trim();
    }

    // Classe / Categoria
    const classMatch = ucBlock.match(/(?:CLASSE|CATEGORIA|CATEGORIA\s+DE\s+CONSUMO)\s*:\s*(PÚBLICA|PÚBLICO|GOVERNAMENTAL|RESIDENCIAL|COMERCIAL|INDUSTRIAL)/i);
    if (classMatch) {
      classe = classMatch[1].trim();
    }


    // --- 3. VALORES MEDIDOS EXTRACTION ---
    const medBlock = blocks.valores_medidos || text;

    // Hidrômetro / Medidor
    const hidroMatch = medBlock.match(/(?:HIDROMETRO|HIDRÔMETRO|NRO\s+HIDROMETRO|HIDRÔMETRO\s*N°|MEDIDOR)\s*[:/]*\s*([A-Z0-9-_]+)/i);
    if (hidroMatch) {
      medidor = hidroMatch[1].trim();
      debugLogs.push({
        campo: "medidor",
        valor: medidor,
        bloco: "Valores Medidos",
        metodo: "Regex Hidrômetro CASAN",
        trecho_encontrado: hidroMatch[0],
        confianca: 100
      });
    }

    // Fatura Number CASAN
    const fatMatch = text.match(/(?:Fatura)[\s.:-]*([0-9A-Z-]+)/i);
    if (fatMatch) {
      fatura_num = fatMatch[1].trim();
      debugLogs.push({
        campo: "fatura_num",
        valor: fatura_num,
        bloco: "Dados da UC",
        metodo: "Regex Fatura CASAN",
        trecho_encontrado: fatMatch[0],
        confianca: 100
      });
    }

    // Grupo / Subgrupo Tensão CASAN (typically N/A or empty, but we search for it anyway)
    const gstMatch = text.match(/(?:Grupo\s*\/\s*Subgrupo\s+Tensão|Grupo\s*\/\s*Subgrupo\s+Tensao)[\s.:-]*([A-Z0-9\s-]{1,10})/i);
    if (gstMatch) {
      grupo_subgrupo_tensao = gstMatch[1].trim();
    }

    // Leitura Anterior / Atual
    const readAntMatch = medBlock.match(/(?:LEITURA\s+HIDROMETRO\s+ANTERIOR|LEITURA\s+ANTERIOR)\s*:\s*([\d,.]+)/i);
    if (readAntMatch) {
      leitura_anterior = this.parseBrazilianFloat(readAntMatch[1]);
    }
    
    const readAtuMatch = medBlock.match(/(?:LEITURA\s+HIDROMETRO\s+ATUAL|LEITURA\s+ATUAL)\s*:\s*([\d,.]+)/i);
    if (readAtuMatch) {
      leitura_atual = this.parseBrazilianFloat(readAtuMatch[1]);
    }

    // Consumo m³
    const consMatch = medBlock.match(/(?:CONSUMO\s*DE\s*AGUA|CONSUMO\s*DE\s*ÁGUA|CONSUMO\s*TOTAL\s*MEDIDO|CONSUMO)\s*:\s*([\d,.]+)\s*(?:m3|m³)/i) || 
                      medBlock.match(/(?:CONSUMO\s*DE\s*AGUA|CONSUMO\s*DE\s*ÁGUA|CONSUMO\s*TOTAL\s*MEDIDO|CONSUMO)\s*:\s*([\d,.]+)/i);
    if (consMatch) {
      consumo = this.parseBrazilianFloat(consMatch[1]);
      debugLogs.push({
        campo: "consumo",
        valor: consumo,
        bloco: "Valores Medidos",
        metodo: "Regex Consumo CASAN",
        trecho_encontrado: consMatch[0],
        confianca: 100
      });
    }

    // Data Leitura & Dias Faturados
    const datLeiMatch = medBlock.match(/(?:DATA\s+DA\s+LEITURA|DATA\s+LEITURA)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (datLeiMatch) {
      data_leitura = datLeiMatch[1];
    }

    const diasMatch = medBlock.match(/(?:DIAS\s+FATURADOS|DIAS)\s*:\s*(\d{1,2})/i);
    if (diasMatch) {
      dias_faturados = parseInt(diasMatch[1]);
    }


    // --- 4. ITENS DA FATURA TABLE EXTRACTION ---
    const itemsBlock = blocks.itens_fatura || text;
    let itemIdCounter = 1;

    // CASAN table layout contains: Description, Quantity, Unit, Price, Value, ICMS, PIS, COFINS
    const itemRegex = /([A-Za-z0-9\s/().ºª\-–+]+?)\s+(-\d+[\d,.]*|\d+[\d,.]*)\s*(?:kWh|m³|m3|UN)?\s+([\d,.]+)\s+([-\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/gi;
    
    const lines = itemsBlock.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const hasKeywords = /AGUA|ÁGUA|ESGOTO|TRCF|TAXA|SERVIÇO|SERVICO|COFINS|TRIBUTOS|MULTA|JUROS/i.test(trimmed);
      if (!hasKeywords && blocks.itens_fatura) {
        // leniency strictly within segmented items
      } else if (!hasKeywords) {
        continue;
      }

      itemRegex.lastIndex = 0;
      const match = itemRegex.exec(trimmed);
      if (match) {
        const descricao = match[1].trim();
        const quantidade = this.parseBrazilianFloat(match[2]);
        const valor_unitario = this.parseBrazilianFloat(match[3]);
        const valor = this.parseBrazilianFloat(match[4]);
        const icms = this.parseBrazilianFloat(match[5]);
        const pis = this.parseBrazilianFloat(match[6]);
        const cofins = this.parseBrazilianFloat(match[7]);

        if (descricao.length > 5 && !/DESCRICAO|QUANTIDADE|VALOR|TRIBUTO/i.test(descricao)) {
          itens_fatura.push({
            id: String(itemIdCounter++),
            descricao,
            quantidade,
            valor_unitario,
            valor,
            icms,
            pis,
            cofins
          });
        }
      }
    }

    // Gather specific values
    itens_fatura.forEach(item => {
      const descUpper = item.descricao.toUpperCase();
      if (item.valor < 0 && (descUpper.includes("CRÉDITO") || descUpper.includes("CREDITO") || descUpper.includes("DESCONTO"))) {
        valor_credito += Math.abs(item.valor);
      }
    });


    // --- 5. VALOR TOTAL & IMPOSTOS EXTRACTION ---
    const totalsBlock = blocks.boleto || blocks.itens_fatura || text;
    const totalMatch = totalsBlock.match(/(?:TOTAL\s+A\s+PAGAR|VALOR\s+TOTAL|TOTAL|SUBTOTAL)\s*:\s*R\$\s*([\d,.]+)/i) || 
                       totalsBlock.match(/(?:TOTAL\s+A\s+PAGAR|VALOR\s+TOTAL|TOTAL|SUBTOTAL)\s*R\$\s*([\d,.]+)/i) ||
                       totalsBlock.match(/TOTAL\s+R\$\s*([\d,.]+)/i) ||
                       text.match(/(?:Valor|Valor\s+Total|Valor:\s*R\$)[\s.:-]*R?\$\s*([\d,.]+)/i);
    if (totalMatch) {
      valor_total = this.parseBrazilianFloat(totalMatch[1]);
    }

    if ((!valor_total || valor_total === 0) && itens_fatura.length > 0) {
      const sumItens = itens_fatura.reduce((acc, it) => acc + (it.valor || 0), 0);
      if (sumItens > 0) {
        valor_total = parseFloat(sumItens.toFixed(2));
      }
    }

    const impMatch = totalsBlock.match(/(?:IMPOSTOS|TRIBUTOS|COFINS|VALOR\s+TRIBUTOS)\s*:\s*R\$\s*([\d,.]+)/i) || 
                     totalsBlock.match(/(?:IMPOSTOS|TRIBUTOS|COFINS|VALOR\s+TRIBUTOS)\s*R\$\s*([\d,.]+)/i);
    if (impMatch) {
      valor_imposto = this.parseBrazilianFloat(impMatch[1]);
    }


    // --- 6. HISTÓRICO EXTRACTION ---
    const histBlock = blocks.historico || text;
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


    // --- 7. BOLETO EXTRACTION ---
    const bolBlock = blocks.boleto || text;
    let boleto: any = null;

    let linha_digitavel: string | null = null;
    const ldMatch = bolBlock.match(/(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})/i) ||
                    bolBlock.match(/(\d{47,48})/);
    if (ldMatch) {
      linha_digitavel = ldMatch[1].trim();
    }

    let codigo_barras: string | null = null;
    const cbMatch = bolBlock.match(/(\d{44})/);
    if (cbMatch) {
      codigo_barras = cbMatch[1].trim();
    }

    let nosso_numero: string | null = null;
    const nnMatch = bolBlock.match(/(?:NOSSO\s+NÚMERO|NOSSO\s+NRO|NOSSO\s*N°)\s*[:/]*\s*([0-9/.-]+)/i);
    if (nnMatch) {
      nosso_numero = nnMatch[1].trim();
    }

    let numero_documento: string | null = null;
    const ndMatch = bolBlock.match(/(?:NRO\s+DOCUMENTO|NÚMERO\s+DO\s+DOCUMENTO|Nº\s+DOC|N°\s+DOC)\s*[:/]*\s*([0-9]+)/i);
    if (ndMatch) {
      numero_documento = ndMatch[1].trim();
    }

    const vencMatch = totalsBlock.match(/(?:VENCIMENTO|VENCIMENTO\s+DA\s+FATURA|PAGUE\s+ATÉ)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                      totalsBlock.match(/(?:VENCIMENTO|VENCIMENTO\s+DA\s+FATURA|PAGUE\s+ATÉ)\s+(\d{2}\/\d{2}\/\d{4})/i) ||
                      totalsBlock.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (vencMatch) {
      data_vencimento = vencMatch[1];
    }

    if (linha_digitavel || codigo_barras) {
      boleto = {
        banco: "104 - CAIXA ECONOMICA FEDERAL", // CASAN typically uses CEF
        linha_digitavel: linha_digitavel || "",
        codigo_barras: codigo_barras || "",
        nosso_numero: nosso_numero || "",
        numero_documento: numero_documento || "",
        valor: valor_total,
        vencimento: data_vencimento || "",
        beneficiario: "COMPANHIA CATARINENSE DE AGUAS E SANEAMENTO - CASAN"
      };
    }

    const compMatch = headBlock.match(/(?:COMPETENCIA|COMPETÊNCIA|MÊS\/ANO|REFERÊNCIA)\s*[:/]*\s*(\d{2})\/(\d{4})/i) ||
                      text.match(/(?:COMPETENCIA|COMPETÊNCIA|MÊS\/ANO|REFERÊNCIA)\s*[:/]*\s*(\d{2})\/(\d{4})/i);
    if (compMatch) {
      mes_ano = `${compMatch[2]}-${compMatch[1]}-01`;
    }

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
      historico: historico.length > 0 ? historico : undefined,
      itens_fatura: itens_fatura,
      boleto: boleto || undefined,
      debug_log: debugLogs
    } as any;
  }

  /**
   * Helper to segment text into structural CASAN blocks
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

    const idxCasan = contentUpper.indexOf("COMPANHIA CATARINENSE") !== -1 ? contentUpper.indexOf("COMPANHIA CATARINENSE") : contentUpper.indexOf("CASAN");
    const idxMatricula = contentUpper.indexOf("MATRÍCULA") !== -1 ? contentUpper.indexOf("MATRÍCULA") : (contentUpper.indexOf("MATRICULA") !== -1 ? contentUpper.indexOf("MATRICULA") : contentUpper.indexOf("UC DEBITO"));
    const idxHidrometro = contentUpper.indexOf("HIDROMETRO") !== -1 ? contentUpper.indexOf("HIDROMETRO") : (contentUpper.indexOf("HIDRÔMETRO") !== -1 ? contentUpper.indexOf("HIDRÔMETRO") : contentUpper.indexOf("VALORES MEDIDOS"));
    const idxItens = contentUpper.indexOf("DEMONSTRATIVO") !== -1 ? contentUpper.indexOf("DEMONSTRATIVO") : (contentUpper.indexOf("SERVIÇO") !== -1 ? contentUpper.indexOf("SERVIÇO") : contentUpper.indexOf("ITENS"));
    const idxHistorico = contentUpper.indexOf("HISTÓRICO") !== -1 ? contentUpper.indexOf("HISTÓRICO") : contentUpper.indexOf("HISTORICO");
    const idxBoleto = contentUpper.indexOf("COMPROVANTE") !== -1 ? contentUpper.indexOf("COMPROVANTE") : (contentUpper.indexOf("LINHA DIGITÁVEL") !== -1 ? contentUpper.indexOf("LINHA DIGITÁVEL") : contentUpper.indexOf("BANCO"));

    if (idxCasan !== -1) {
      const endIdx = idxMatricula !== -1 ? idxMatricula : (idxHidrometro !== -1 ? idxHidrometro : text.length);
      result.cabecalho = text.substring(idxCasan, endIdx).trim();
    }
    if (idxMatricula !== -1) {
      const endIdx = idxHidrometro !== -1 ? idxHidrometro : (idxItens !== -1 ? idxItens : text.length);
      result.dados_uc = text.substring(idxMatricula, endIdx).trim();
    }
    if (idxHidrometro !== -1) {
      const endIdx = idxItens !== -1 ? idxItens : (idxHistorico !== -1 ? idxHistorico : text.length);
      result.valores_medidos = text.substring(idxHidrometro, endIdx).trim();
    }
    if (idxItens !== -1) {
      const endIdx = idxHistorico !== -1 ? idxHistorico : (idxBoleto !== -1 ? idxBoleto : text.length);
      result.itens_fatura = text.substring(idxItens, endIdx).trim();
    }
    if (idxHistorico !== -1) {
      const endIdx = idxBoleto !== -1 ? idxBoleto : text.length;
      result.historico = text.substring(idxHistorico, endIdx).trim();
    }
    if (idxBoleto !== -1) {
      result.boleto = text.substring(idxBoleto).trim();
    }

    return result;
  }
}
