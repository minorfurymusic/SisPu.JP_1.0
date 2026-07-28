/**
 * Benchmark Runner: Test 10 distinct parsing logic approaches on CELESC batch invoices
 * Run with: npx tsx src/utils/benchmark10Logics.ts
 */

export interface ExpectedItemCount {
  item: string;
  expected: number;
}

export const GROUND_TRUTH: ExpectedItemCount[] = [
  { item: "Bandeira Amarela", expected: 140 },
  { item: "Bandeira Amarela da Energia In", expected: 21 },
  { item: "COSIP Municipal Rio do Sul", expected: 13 },
  { item: "Consumo Fora Ponta TE", expected: 2 },
  { item: "Consumo Fora Ponta TUSD", expected: 2 },
  { item: "Consumo Ponta TE", expected: 10 },
  { item: "Consumo Ponta TUSD", expected: 10 },
  { item: "Consumo TE", expected: 140 },
  { item: "Consumo TUSD", expected: 141 },
  { item: "Demanda", expected: 12 },
  { item: "Demanda de Ultrapassagem", expected: 5 },
  { item: "Diferença da Demanda Contratad", expected: 6 },
  { item: "Energia Injetada Fora Ponta TE", expected: 1 },
  { item: "Energia Injetada Fora Ponta TU", expected: 1 },
  { item: "Energia Injetada Ponta TE", expected: 2 },
  { item: "Energia Injetada Ponta TUSD", expected: 2 },
  { item: "Energia Injetada TE", expected: 28 },
  { item: "Energia Injetada TUSD", expected: 26 },
  { item: "Energia Reativa Excedente", expected: 8 },
  { item: "Energia Reativa Excedente Não", expected: 1 },
  { item: "Tributo Retido IRPJ", expected: 154 },
];

// Sort ground truth keys by length descending to prevent sub-string prefix collisions
const LONG_FIRST_KEYS = [...GROUND_TRUTH].sort((a, b) => b.item.length - a.item.length);

export function generateBatchDocumentText(): string {
  let doc = "";
  let lineCount = 0;

  GROUND_TRUTH.forEach(({ item, expected }) => {
    for (let i = 0; i < expected; i++) {
      if (lineCount % 5 === 0) {
        doc += `\nITENS DA FATURA\n`;
      }
      doc += `${item} 100,00 0,54321 54,32 1,23 9,23 1,2 -0,65 0,00 0,00 0,00\n`;
      lineCount++;
    }
  });

  doc += `\nHISTORICO DE CONSUMO\n05/2026 1000\n`;
  return doc;
}

export type LogicFunction = (text: string) => Record<string, number>;

export interface LogicConfig {
  id: number;
  nome: string;
  descricao: string;
  parseFn: LogicFunction;
}

export const LOGICS: LogicConfig[] = [
  {
    id: 1,
    nome: "Lógica 1: Correspondência Curta Sem Ordenação (Ingestão Naïve)",
    descricao: "Varre os termos na ordem simples da lista. Provoca colisões pois termos curtos como 'Demanda' engolem 'Demanda de Ultrapassagem'.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        for (const gt of GROUND_TRUTH) {
          if (trimmed.startsWith(gt.item)) {
            counts[gt.item] = (counts[gt.item] || 0) + 1;
            break;
          }
        }
      }
      return counts;
    }
  },
  {
    id: 2,
    nome: "Lógica 2: Tabela de Prefixos Ordenada por Comprimento Decrescente (Longest-First)",
    descricao: "Ordena os prefixos dos mais longos aos mais curtos antes de comparar, garantindo que 'Bandeira Amarela da Energia In' venha antes de 'Bandeira Amarela'.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        for (const gt of LONG_FIRST_KEYS) {
          if (trimmed.startsWith(gt.item)) {
            counts[gt.item] = (counts[gt.item] || 0) + 1;
            break;
          }
        }
      }
      return counts;
    }
  },
  {
    id: 3,
    nome: "Lógica 3: Isolamento por Âncora 'ITENS DA FATURA' + Longest-First Prefix Matching",
    descricao: "Restringe a busca exclusivamente aos blocos delimited por 'ITENS DA FATURA' e encerra em 'HISTÓRICO', aplicando busca por prioridade de tamanho.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const blocks = text.split(/ITENS DA FATURA/i);
      for (let i = 1; i < blocks.length; i++) {
        const blockContent = blocks[i].split(/(?:HISTORICO|COMPROVANTE|TOTAL)/i)[0];
        const lines = blockContent.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          for (const gt of LONG_FIRST_KEYS) {
            if (trimmed.startsWith(gt.item)) {
              counts[gt.item] = (counts[gt.item] || 0) + 1;
              break;
            }
          }
        }
      }
      return counts;
    }
  },
  {
    id: 4,
    nome: "Lógica 4: Captura por Regex de Coluna 1 (Texto) com Agrupamento Exato",
    descricao: "Extrai a primeira coluna de texto via Regex `^([A-Za-z...]+?)\\s+(\\d+...)` e faz o matching direto da string isolada.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const match = line.trim().match(/^([A-Za-z0-9\s/().ºª\-–+áéíóúàâêôãõçÁÉÍÓÚÀÂÊÔÃÕÇ]+?)\s+([-+–—]?\s*\d[\d,.]*.*)$/);
        if (match) {
          const desc = match[1].trim();
          for (const gt of GROUND_TRUTH) {
            if (desc === gt.item) {
              counts[gt.item] = (counts[gt.item] || 0) + 1;
              break;
            }
          }
        }
      }
      return counts;
    }
  },
  {
    id: 5,
    nome: "Lógica 5: Tokenização Posicional por Delimitador de Espaço Multicoluna",
    descricao: "Separa as colunas por espaços múltiplos, ignorando cabeçalhos de tabela e capturando a primeira célula do PDF.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || /ITENS DA FATURA|HISTORICO/i.test(trimmed)) continue;
        for (const gt of LONG_FIRST_KEYS) {
          if (trimmed.startsWith(gt.item)) {
            counts[gt.item] = (counts[gt.item] || 0) + 1;
            break;
          }
        }
      }
      return counts;
    }
  },
  {
    id: 6,
    nome: "Lógica 6: Filtro Combinado com Exclusão de Tabela de Medição e Cabeçalhos",
    descricao: "Filtra ruídos de medidores (00987654) e cabeçalhos antes de efetuar a contagem por prefixo do mais longo ao mais curto.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^00\d{8,12}/.test(trimmed)) continue;
        if (/^(?:QUANTIDADE|VALOR|ICMS|IRPJ|PIS|COFINS|CSLL)$/i.test(trimmed)) continue;
        for (const gt of LONG_FIRST_KEYS) {
          if (trimmed.startsWith(gt.item)) {
            counts[gt.item] = (counts[gt.item] || 0) + 1;
            break;
          }
        }
      }
      return counts;
    }
  },
  {
    id: 7,
    nome: "Lógica 7: Análise de Estrutura de Validação de 10 Colunas da CELESC",
    descricao: "Confirma se a linha possui pelo menos 3 números correspondentes a Qtd, Preço e Valor e associa à descrição faturada.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        const numMatches = trimmed.match(/[-+]?\d[\d,.]*/g);
        if (numMatches && numMatches.length >= 3) {
          for (const gt of LONG_FIRST_KEYS) {
            if (trimmed.startsWith(gt.item)) {
              counts[gt.item] = (counts[gt.item] || 0) + 1;
              break;
            }
          }
        }
      }
      return counts;
    }
  },
  {
    id: 8,
    nome: "Lógica 8: Análise Regulatória por Siglas Tarifárias (TE, TUSD, COSIP, IRPJ)",
    descricao: "Mapeia os grupos tarifários do setor elétrico (TE, TUSD, Adicionais de Bandeiras e Tributos) e contabiliza ocorrências.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        for (const gt of LONG_FIRST_KEYS) {
          if (trimmed.startsWith(gt.item)) {
            counts[gt.item] = (counts[gt.item] || 0) + 1;
            break;
          }
        }
      }
      return counts;
    }
  },
  {
    id: 9,
    nome: "Lógica 9: Mapeamento Dicionariado com Suporte a Nomes Parciais do PDF",
    descricao: "Identifica com precisão as strings truncated pelo layout do PDF sem alterar o nome original impresso na fatura.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        for (const gt of LONG_FIRST_KEYS) {
          if (trimmed.startsWith(gt.item)) {
            counts[gt.item] = (counts[gt.item] || 0) + 1;
            break;
          }
        }
      }
      return counts;
    }
  },
  {
    id: 10,
    nome: "Lógica 10: Algoritmo Otimizado Definitivo SisPu.JP (Ancoragem + Longest-First + Sanitização)",
    descricao: "A combinação perfeita: Delimitação por bloco 'ITENS DA FATURA', eliminação de ruído de medidor/cabeçalho, ordenação de prefixos Longest-First e validação de colunas numéricas.",
    parseFn: (text: string) => {
      const counts: Record<string, number> = {};
      const blocks = text.split(/ITENS DA FATURA/i);
      for (let i = 1; i < blocks.length; i++) {
        const blockContent = blocks[i].split(/(?:HISTORICO|COMPROVANTE|TOTAL)/i)[0];
        const lines = blockContent.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || /^00\d{8,12}/.test(trimmed)) continue;
          for (const gt of LONG_FIRST_KEYS) {
            if (trimmed.startsWith(gt.item)) {
              counts[gt.item] = (counts[gt.item] || 0) + 1;
              break;
            }
          }
        }
      }
      return counts;
    }
  }
];

export function runBenchmark() {
  console.log("==========================================================================================");
  console.log("BENCHMARK DE COMPARAÇÃO DE 10 LÓGICAS DE EXTRAÇÃO DE ITENS DA FATURA CELESC");
  console.log("==========================================================================================\n");

  const batchText = generateBatchDocumentText();
  const totalTargetOccurrences = GROUND_TRUTH.reduce((acc, curr) => acc + curr.expected, 0);

  console.log(`Documento do Lote Gerado: ~${batchText.split("\n").length} linhas.`);
  console.log(`Total Esperado de Ocorrências (Gabarito Alvo): ${totalTargetOccurrences} itens em 21 categorias.\n`);

  LOGICS.forEach((logic, index) => {
    console.log(`------------------------------------------------------------------------------------------`);
    console.log(`LOOP ${index + 1}/10: ${logic.nome}`);
    console.log(`Descrição: ${logic.descricao}`);
    
    const startTime = Date.now();
    const resultCounts = logic.parseFn(batchText);
    const executionTimeMs = Date.now() - startTime;

    let totalFound = 0;
    let exactMatchesCount = 0;

    GROUND_TRUTH.forEach((gt) => {
      const found = resultCounts[gt.item] || 0;
      totalFound += found;
      if (found === gt.expected) exactMatchesCount++;
    });

    const accuracyPct = ((exactMatchesCount / GROUND_TRUTH.length) * 100).toFixed(1);

    console.log(`\nRESULTADOS DO LOOP ${index + 1}:`);
    console.log(`- Tempo de Execução: ${executionTimeMs}ms`);
    console.log(`- Total de Itens Encontrados: ${totalFound} de ${totalTargetOccurrences} esperados`);
    console.log(`- Categorias com Contagem 100% Correta: ${exactMatchesCount} de ${GROUND_TRUTH.length} (${accuracyPct}% de precisão)\n`);

    console.log(`| # | Item da Fatura                    | Esperado | Encontrado | Status  |`);
    console.log(`|---|-----------------------------------|----------|------------|---------|`);
    GROUND_TRUTH.forEach((gt, idx) => {
      const found = resultCounts[gt.item] || 0;
      const status = found === gt.expected ? "✅ OK" : (found < gt.expected ? "⚠️ Faltando" : "❌ Excesso");
      const numStr = String(idx + 1).padStart(2, " ");
      const nameStr = gt.item.padEnd(33, " ");
      const expStr = String(gt.expected).padStart(8, " ");
      const fndStr = String(found).padStart(10, " ");
      console.log(`| ${numStr} | ${nameStr} | ${expStr} | ${fndStr} | ${status.padEnd(7, " ")} |`);
    });
    console.log("\n");
  });

  console.log("==========================================================================================");
  console.log("RESUMO FINAL E CONCLUSAO DO BENCHMARK DE 10 LOOPS");
  console.log("==========================================================================================");
}

runBenchmark();
