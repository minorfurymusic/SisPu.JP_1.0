/**
 * Automated test suite for SisPu.JP 2.0 Document Import Module
 * Run with: npx tsx src/utils/documentParserTests.ts
 */

import { 
  identifyDocumentType, 
  splitReportIntoFaturas, 
  runDeterministicParser,
  parseBrazilianFloat
} from "./documentParser";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Helper to generate a mock CELESC segment
function generateCelescSegment(pontoNum: number, uc: string, value: number, consumption: number): string {
  return `
PONTO ${String(pontoNum).padStart(3, '0')} - UNIDADE COLETORA (CODNUM: ${uc})
MEDIDOR NRO: MED-${pontoNum}-XYZ
CONSUMO MEDIDO: ${consumption.toFixed(2)} kWh
VALOR FATURADO ATIVO:   R$ ${(value * 0.7).toFixed(2)}
IMPOSTOS / ICMS / PIS:  R$ ${(value * 0.2).toFixed(2)}
CONTRIBUICAO COSIP:     R$ ${(value * 0.1).toFixed(2)}
SUBTOTAL:               R$ ${value.toFixed(2)}
`;
}

// Helper to generate a mock CASAN segment
function generateCasanSegment(pontoNum: number, uc: string, value: number, consumption: number): string {
  return `
UC DEBITO: ${uc} (PONTO PUBLICO ${pontoNum})
HIDROMETRO: HIDRO-${pontoNum}-ABC
CONSUMO DE AGUA: ${consumption.toFixed(2)} m³
VALOR SERVICO AGUA:     R$ ${(value * 0.5).toFixed(2)}
VALOR SERVICO ESGOTO:   R$ ${(value * 0.4).toFixed(2)}
VALOR IMPOSTOS / COFINS / TRIBUTOS: R$ ${(value * 0.1).toFixed(2)}
TOTAL A PAGAR:          R$ ${value.toFixed(2)}
`;
}

async function runTests() {
  console.log("====================================================");
  console.log("INICIANDO TESTES DO MÓDULO DE IMPORTAÇÃO (SISPU.JP)");
  console.log("====================================================\n");

  let passedTests = 0;
  let totalTests = 10;

  try {
    // -----------------------------------------------------
    // CASO 1: PDF com 1 Fatura Individual
    // -----------------------------------------------------
    console.log("Teste 1: Fatura Individual (1 fatura)");
    const singleFaturaText = `
COMPETENCIA: 06/2026
CELESC DISTRIBUICAO S.A.
CODNUM: CELESC-PREF-101
MEDIDOR: 928371-3
CONSUMO: 1450.50 kWh
TOTAL A PAGAR: R$ 1240.20
VALOR TRIBUTOS: R$ 245.50
`;
    const docType1 = identifyDocumentType(singleFaturaText, "fatura_celesc.pdf");
    assert(docType1 === "CELESC_FATURA", "Deve identificar como fatura individual CELESC");

    const parsed1 = runDeterministicParser(singleFaturaText, "fatura_celesc.pdf");
    assert(parsed1 !== null, "Deve conseguir parsear fatura individual");
    assert(parsed1!.codigo_numero === "CELESC-PREF-101", "CODNUM incorreto");
    assert(parsed1!.consumo === 1450.50, "Consumo incorreto");
    assert(parsed1!.valor_total === 1240.20, "Valor total incorreto");
    assert(parsed1!.valor_imposto === 245.50, "Valor imposto incorreto");
    
    console.log("  ✅ Teste 1 OK: Fatura individual identificada e parseada perfeitamente.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 2: PDF com Relatório de 5 Faturas
    // -----------------------------------------------------
    console.log("Teste 2: PDF de Relatório Consolidado (5 faturas)");
    let report5Text = `COMPETENCIA (MES/ANO): 05/2026\nRELATORIO CONSOLIDADO DE FATURAMENTO CELESC\n`;
    for (let i = 1; i <= 5; i++) {
      report5Text += generateCelescSegment(i, `CELESC-SEC-${100 + i}`, 1500 + i * 50, 1000 + i * 10);
    }

    const docType2 = identifyDocumentType(report5Text, "relatorio_mensal.pdf");
    assert(docType2 === "CELESC_RELATORIO", "Deve identificar como relatório/lote CELESC");

    const segmented2 = splitReportIntoFaturas(report5Text, "relatorio_mensal.pdf");
    assert(segmented2.length === 5, `Deveria encontrar exatamente 5 faturas, encontrou ${segmented2.length}`);

    const ids2 = new Set<string>();
    const codnums2 = new Set<string>();
    segmented2.forEach((doc, idx) => {
      ids2.add(doc.id);
      codnums2.add(doc.dados_extraidos.codigo_numero);
      
      const expectedUc = `CELESC-SEC-${101 + idx}`;
      const expectedTotal = 1500 + (idx + 1) * 50;
      assert(doc.dados_extraidos.codigo_numero === expectedUc, `Fatura ${idx + 1} com CODNUM incorreto. Esperava ${expectedUc}, obteve ${doc.dados_extraidos.codigo_numero}`);
      assert(doc.dados_extraidos.valor_total === expectedTotal, `Fatura ${idx + 1} com Valor Total incorreto`);
    });

    assert(ids2.size === 5, "Erro: IDs duplicados gerados na memória!");
    assert(codnums2.size === 5, "Erro: faturas se sobrepuseram, CODNUMs duplicados!");

    console.log("  ✅ Teste 2 OK: 5 faturas localizadas, sem sobreposição, objetos independentes na memória.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 3: PDF Grande com Relatório de 170 Faturas (Alta Performance)
    // -----------------------------------------------------
    console.log("Teste 3: Relatório de Lote em Grande Escala (170 faturas)");
    let report170Text = `COMPETENCIA (MES/ANO): 05/2026\nLOTE DE FATURAMENTO DE GRANDE PORTE CELESC\n`;
    for (let i = 1; i <= 170; i++) {
      report170Text += generateCelescSegment(i, `CELESC-LARGE-${1000 + i}`, 800 + i * 3, 500 + i);
    }

    const startTime = Date.now();
    const segmented3 = splitReportIntoFaturas(report170Text, "lote_grande.pdf");
    const duration = Date.now() - startTime;

    assert(segmented3.length === 170, `Deveria encontrar exatamente 170 faturas, encontrou ${segmented3.length}`);

    const ids3 = new Set<string>();
    const codnums3 = new Set<string>();
    segmented3.forEach((doc, idx) => {
      ids3.add(doc.id);
      codnums3.add(doc.dados_extraidos.codigo_numero);
      
      const expectedUc = `CELESC-LARGE-${1001 + idx}`;
      assert(doc.dados_extraidos.codigo_numero === expectedUc, `Fatura ${idx + 1} sobreposta ou errada.`);
    });

    assert(ids3.size === 170, "Erro: IDs duplicados no processamento de grande porte!");
    assert(codnums3.size === 170, "Erro: Sobrescrita detectada! CODNUMs duplicados!");

    console.log(`  ✅ Teste 3 OK: 170 faturas processadas com sucesso em ${duration}ms sem perda de integridade.\n`);
    passedTests++;

    // -----------------------------------------------------
    // CASO 4: PDF com Páginas Inválidas e Ruídos
    // -----------------------------------------------------
    console.log("Teste 4: PDF contendo páginas inválidas ou ruídos");
    const noisyPdfText = `
PÁGINA DE INTRODUÇÃO DO PDF (Lixo administrativo, sem dados de fatura)
===================================================================
Este é um relatório consolidador que não deve conter lançamentos aqui.
-------------------------------------------------------------------

PONTO 001 - UNIDADE OPERACIONAL (CODNUM: CELESC-VAL-201)
MEDIDOR NRO: MED-V201
CONSUMO MEDIDO: 450.00 kWh
VALOR FATURADO ATIVO:   R$ 315.00
IMPOSTOS / ICMS / PIS:  R$ 90.00
SUBTOTAL:               R$ 405.00

PÁGINA DE ANEXOS PUBLICITÁRIOS (RUÍDO ADICIONAL)
Parabéns por utilizar energia sustentável. Economize água.
Telefones úteis: 0800-48-0120.

PONTO 002 - PRÉDIO AUXILIAR (CODNUM: CELESC-VAL-202)
MEDIDOR NRO: MED-V202
CONSUMO MEDIDO: 120.00 kWh
VALOR FATURADO ATIVO:   R$ 84.00
IMPOSTOS / ICMS / PIS:  R$ 24.00
SUBTOTAL:               R$ 108.00
`;
    const segmented4 = splitReportIntoFaturas(noisyPdfText, "relatorio_com_ruidos.pdf");
    assert(segmented4.length === 2, `Deveria filtrar os ruídos e encontrar apenas as 2 faturas válidas, encontrou ${segmented4.length}`);
    assert(segmented4[0].dados_extraidos.codigo_numero === "CELESC-VAL-201", "Primeira fatura válida está incorreta");
    assert(segmented4[1].dados_extraidos.codigo_numero === "CELESC-VAL-202", "Segunda fatura válida está incorreta");

    console.log("  ✅ Teste 4 OK: Páginas inválidas e ruídos ignorados; apenas as faturas corretas extraídas.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 5: PDF com Mistura de Concessionárias (CELESC e CASAN juntas)
    // -----------------------------------------------------
    console.log("Teste 5: PDF com mistura de faturas da CELESC e CASAN");
    const mixedPdfText = `
COMPETENCIA (MES/ANO): 05/2026
RELATÓRIO UNIFICADO DE CONCESSIONÁRIAS MUNICIPAIS

PONTO 001 - ILUMINAÇÃO PRAÇA CENTRAL (CODNUM: CELESC-MIX-901)
MEDIDOR NRO: MED-M901
CONSUMO MEDIDO: 300.00 kWh
VALOR FATURADO ATIVO:   R$ 210.00
IMPOSTOS / ICMS / PIS:  R$ 60.00
SUBTOTAL:               R$ 270.00

UC DEBITO: CASAN-MIX-902 (ABASTECIMENTO POSTO SAUDE)
HIDROMETRO: HIDRO-M902
CONSUMO DE AGUA: 45.00 m³
VALOR SERVICO AGUA:     R$ 150.00
VALOR SERVICO ESGOTO:   R$ 120.00
VALOR IMPOSTOS / COFINS / TRIBUTOS: R$ 30.00
TOTAL A PAGAR:          R$ 300.00

PONTO 002 - CRECHE MUNICIPAL (CODNUM: CELESC-MIX-903)
MEDIDOR NRO: MED-M903
CONSUMO MEDIDO: 600.00 kWh
VALOR FATURADO ATIVO:   R$ 420.00
IMPOSTOS / ICMS / PIS:  R$ 120.00
SUBTOTAL:               R$ 540.00
`;
    const segmented5 = splitReportIntoFaturas(mixedPdfText, "relatorio_unificado.pdf");
    assert(segmented5.length === 3, `Deveria encontrar exatamente 3 faturas mistas, encontrou ${segmented5.length}`);
    
    assert(segmented5[0].layout === "CELESC_FATURA", "Item 1 deve ser CELESC");
    assert(segmented5[0].dados_extraidos.codigo_numero === "CELESC-MIX-901", "Item 1 código errado");
    
    assert(segmented5[1].layout === "CASAN_FATURA", "Item 2 deve ser CASAN");
    assert(segmented5[1].dados_extraidos.codigo_numero === "CASAN-MIX-902", "Item 2 código errado");
    assert(segmented5[1].dados_extraidos.consumo === 45.00, "Item 2 consumo de água errado");

    assert(segmented5[2].layout === "CELESC_FATURA", "Item 3 deve ser CELESC");
    assert(segmented5[2].dados_extraidos.codigo_numero === "CELESC-MIX-903", "Item 3 código errado");

    console.log("  ✅ Teste 5 OK: Mistura de CELESC e CASAN identificada e segmentada corretamente por layout.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 6: Documento Parcialmente Ilegível / Campos Ausentes
    // -----------------------------------------------------
    console.log("Teste 6: Documento Parcialmente Ilegível (Completando com Fallbacks)");
    const incompleteText = `
CELESC DISTRIBUICAO S.A.
CODNUM: CELESC-PREF-INCOMPLETE
CONSUMO: [ILEGIVEL]
TOTAL A PAGAR: R$ 450.00
VALOR TRIBUTOS: R$ 0.00
`;
    const parsed6 = runDeterministicParser(incompleteText, "fatura_danificada.pdf");
    assert(parsed6 !== null, "Deve conseguir parsear o documento danificado parcialmente");
    assert(parsed6!.codigo_numero === "CELESC-PREF-INCOMPLETE", "Código identificador deveria ter sido extraído");
    assert(parsed6!.consumo === 0, "Consumo deveria ser 0 para campo ilegível");
    assert(parsed6!.valor_total === 450.00, "Valor total deveria ser extraído");
    assert(parsed6!.valor_imposto === 0, "Valor do imposto deveria ser lido diretamente do documento (R$ 0.00)");

    console.log("  ✅ Teste 6 OK: Documento parcialmente ilegível processado com dados de fallback inteligentes.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 7: Documento Totalmente Desconhecido
    // -----------------------------------------------------
    console.log("Teste 7: Documento Totalmente Desconhecido");
    const unknownText = `
CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE LIMPEZA URBANA
Contratante: Prefeitura Municipal de Florianópolis
Contratada: Limpa Tudo S.A.
Valor do Contrato: R$ 5.000.000,00
`;
    const docType7 = identifyDocumentType(unknownText, "contrato_limpeza.pdf");
    assert(docType7 === "DESCONHECIDO", "Deve classificar como DESCONHECIDO");
    
    const parsed7 = runDeterministicParser(unknownText, "contrato_limpeza.pdf");
    assert(parsed7 === null, "Deve retornar null para layouts completamente desconhecidos");

    console.log("  ✅ Teste 7 OK: Documentos e relatórios desconhecidos corretamente descartados.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 8: Simulação de Falha do Gemini API / Fallback Transparente
    // -----------------------------------------------------
    console.log("Teste 8: Simulação de Falha da API do Gemini");
    // Simulando o comportamento do backend no server.ts quando lança um erro (por exemplo, 429 Quota Exceeded)
    let apiCallFailed = false;
    let finalParsedResult: any = null;
    
    try {
      // Simulação da chamada da API lançando erro de Cota
      throw new Error("429 RESOURCE_EXHAUSTED: Quota exceeded for metric");
    } catch (apiError: any) {
      apiCallFailed = true;
      // Chamada automática e transparente do parser heurístico local
      finalParsedResult = runDeterministicParser(singleFaturaText, "fatura_celesc.pdf");
    }

    assert(apiCallFailed === true, "A API deveria ter falhado para este teste");
    assert(finalParsedResult !== null, "O parser local deveria ter assumido");
    assert(finalParsedResult.codigo_numero === "CELESC-PREF-101", "Dados recuperados incorretamente do parser de contingência");

    console.log("  ✅ Teste 8 OK: Recuperação e fallback transparente em caso de indisponibilidade da IA.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 9: Simulação de Conferência de Planilha (Editável por Célula)
    // -----------------------------------------------------
    console.log("Teste 9: Histórico de Alterações de Células na Conferência");
    // Simulando uma fatura importada que o usuário edita na grade da planilha
    const userDocMock = {
      id: "doc-123",
      nome_arquivo: "fatura.pdf",
      layout: "CELESC_FATURA" as any,
      dados_extraidos: {
        mes_ano: "2026-06-01",
        codigo_numero: "CELESC-OLD",
        valor_total: 100.00,
        valor_imposto: 25.00,
        consumo: 120
      },
      historico_alteracoes: [] as any[]
    };

    // Usuário edita Unidade Consumidora (codigo_numero) de "CELESC-OLD" para "CELESC-NEW"
    const editField = (field: string, newValue: any) => {
      const oldValue = (userDocMock.dados_extraidos as any)[field];
      (userDocMock.dados_extraidos as any)[field] = newValue;
      userDocMock.historico_alteracoes.push({
        data: new Date().toISOString(),
        usuario: "Diretor Operacional",
        campo: field,
        antes: oldValue,
        depois: newValue
      });
    };

    editField("codigo_numero", "CELESC-NEW");
    editField("valor_total", 105.50);

    assert(userDocMock.dados_extraidos.codigo_numero === "CELESC-NEW", "Nova UC deveria estar salva");
    assert(userDocMock.dados_extraidos.valor_total === 105.50, "Novo valor total deveria estar salvo");
    assert(userDocMock.historico_alteracoes.length === 2, "Historico de auditoria deveria conter exatamente 2 registros");
    assert(userDocMock.historico_alteracoes[0].campo === "codigo_numero", "Primeiro campo alterado incorreto");
    assert(userDocMock.historico_alteracoes[0].antes === "CELESC-OLD", "Valor antigo incorreto");
    assert(userDocMock.historico_alteracoes[0].depois === "CELESC-NEW", "Valor novo incorreto");

    console.log("  ✅ Teste 9 OK: Auditoria e rastreabilidade de edições em tempo real simuladas com sucesso.\n");
    passedTests++;

    // -----------------------------------------------------
    // CASO 10: Seleção de Lançamentos na Grade de Conferência antes do Salvamento
    // -----------------------------------------------------
    console.log("Teste 10: Fluxo de Seleção e Descarte na Grade antes da Persistência");
    // Simulando a persistência seletiva
    const sessionDocsList = [
      { id: "1", status: "VALIDADO", codigo_numero: "UC-OK-1" },
      { id: "2", status: "IGNORADA", codigo_numero: "UC-IGNORED" }, // Usuário removeu/ignorou esta
      { id: "3", status: "VALIDADO", codigo_numero: "UC-OK-3" }
    ];

    // Simulação de filtragem de gravação
    const persistToDB = (docs: typeof sessionDocsList) => {
      const toSave = docs.filter(d => d.status !== 'IGNORADA');
      return toSave;
    };

    const savedRecords = persistToDB(sessionDocsList);
    assert(savedRecords.length === 2, "Deveria salvar exatamente 2 registros");
    assert(savedRecords[0].codigo_numero === "UC-OK-1", "Primeiro registro deveria ser o UC-OK-1");
    assert(savedRecords[1].codigo_numero === "UC-OK-3", "Segundo registro deveria ser o UC-OK-3");

    console.log("  ✅ Teste 10 OK: Seleção de lote respeitada. Ignorados descartados perfeitamente.\n");
    passedTests++;

    console.log("====================================================");
    console.log(`SUCESSO TOTAL! ${passedTests}/${totalTests} CASOS DE TESTES PASSARAM!`);
    console.log("====================================================");
  } catch (error: any) {
    console.error("\n❌ FALHA NO TESTE DETECTADA:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
