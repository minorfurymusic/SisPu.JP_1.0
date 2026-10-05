import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { detectarLayout, lerCasanSci8095, lerCelescColetiva } from "../src/utils/layoutReaders";
import { splitReportIntoFaturas, avisoItensNaoFecham } from "../src/utils/documentParser";
import { lerPlanilhaClassificacao } from "../src/utils/planilhaClassificacao";
import { categorizarItens, GRUPOS, grupoDoItem, demandaDoMes, faixaDemanda, simularDemandaIdeal, consumoMedidoDoTexto, custoDisponibilidade, grupoTensaoDoTexto } from "../src/utils/analiseCelesc";
import { compararComHistorico } from "../src/utils/variacao";

const fixture = (nome: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", nome), "utf8");
let falhas = 0;
function teste(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${nome}`);
  } catch (e: any) {
    falhas++;
    console.log(`FALHOU ${nome}\n     ${e.message}`);
  }
}

teste("CASAN SCI8095 09/2026: 108 contas, total igual ao Total Geral", () => {
  const txt = fixture("casan-sci8095-2026-09.txt");
  assert.equal(detectarLayout(txt), "CASAN_SCI8095");
  const r = lerCasanSci8095(txt);
  assert.equal(r.contas.length, 108);
  assert.equal(r.conferencia.ok, true, JSON.stringify(r.conferencia));
  assert.equal(r.conferencia.grupos[0].totalDeclarado, 93944.38);
  assert.equal(new Set(r.contas.map(c => c.matricula)).size, 108);
  const padaria = r.contas.find(c => c.matricula === "637565-0")!;
  assert.equal(padaria.usuario, "PMRS PADARIA SOCIAL");
  assert.equal(padaria.logradouro, "ROD. VER. CARLOS PROBST,S/N");
  assert.match(r.referencia, /^\d{4}-\d{2}-01$/);
});

const celesc: [string, string, { doc: string; ref: string; qtd: number; total: number }[]][] = [
  ["CELESC maio (UC no formato antigo)", "celesc-coletiva-2026-05-uc-antiga.txt", [{ doc: "105000000132", ref: "05/2026", qtd: 155, total: 175506.79 }]],
  ["CELESC junho", "celesc-coletiva-2026-06.txt", [{ doc: "626000000088", ref: "06/2026", qtd: 154, total: 158224.51 }]],
  ["CELESC agosto", "celesc-coletiva-2026-08.txt", [{ doc: "129000000255", ref: "08/2026", qtd: 149, total: 199550.48 }]],
  ["CELESC arquivo com 2 coletivas", "celesc-duas-coletivas-2026-06-07.txt", [
    { doc: "116000004389", ref: "06/2026", qtd: 1, total: 2123.65 },
    { doc: "116000004390", ref: "07/2026", qtd: 153, total: 189817.38 },
  ]],
];

for (const [nome, arquivo, esperado] of celesc) {
  teste(`${nome}: cada coletiva com quantidade e total iguais à capa`, () => {
    const txt = fixture(arquivo);
    assert.equal(detectarLayout(txt), "CELESC_COLETIVA");
    const r = lerCelescColetiva(txt);
    assert.equal(r.conferencia.ok, true, JSON.stringify(r.conferencia.grupos));
    assert.equal(r.conferencia.grupos.length, esperado.length);
    esperado.forEach((e, i) => {
      const g = r.conferencia.grupos[i];
      assert.equal(g.rotulo.endsWith(e.doc), true, g.rotulo);
      assert.equal(g.referencia, e.ref);
      assert.equal(g.qtdLida, e.qtd);
      assert.equal(Math.round(g.totalLido * 100), Math.round(e.total * 100));
      r.blocos.filter(b => b.documento === e.doc).forEach(b => {
        assert.equal(b.referencia, `${e.ref.slice(3)}-${e.ref.slice(0, 2)}-01`, `UC ${b.uc}`);
      });
    });
  });

  teste(`${nome}: leitor do app usa o valor impresso, a referência de cada coletiva e não perde UC`, () => {
    const txt = fixture(arquivo);
    const segs = splitReportIntoFaturas(txt, arquivo);
    const { blocos } = lerCelescColetiva(txt);
    assert.equal(segs.length, blocos.length);
    segs.forEach((s, i) => {
      assert.equal(s.dados_extraidos.codigo_numero, blocos[i].uc);
      assert.equal(s.dados_extraidos.mes_ano, blocos[i].referencia, `UC ${blocos[i].uc}`);
      assert.equal(Math.round(Number(s.dados_extraidos.valor_total) * 100), Math.round((blocos[i].valorImpresso || 0) * 100), `UC ${blocos[i].uc}`);
    });
    const total = segs.reduce((a, s) => a + Number(s.dados_extraidos.valor_total), 0);
    const declarado = esperado.reduce((a, e) => a + e.total, 0);
    assert.equal(Math.round(total * 100), Math.round(declarado * 100));
  });
}

teste("UC com Valor em branco gera aviso e entra como zero", () => {
  const r = lerCelescColetiva(fixture("celesc-coletiva-2026-08.txt"));
  const b = r.blocos.find(x => x.uc === "4.230.837.011-18")!;
  assert.equal(b.valorImpresso, null);
  assert.equal(r.conferencia.avisos.some(a => a.includes("4.230.837.011-18")), true);
});

teste("Texto desconhecido não é reconhecido como layout fixo", () => {
  assert.equal(detectarLayout("FATURA QUALQUER\nValor: 10,00"), null);
});

if (falhas) {
  console.log(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
teste("CELESC: itens lidos pelo formato da linha, inclusive nomes novos, e quantidade com ponto de milhar", () => {
  const segs = splitReportIntoFaturas(fixture("celesc-coletiva-2026-08.txt"), "ago.pdf");
  const d: any = segs.find(s => s.dados_extraidos.codigo_numero === "1.004.706.011-01")!.dados_extraidos;
  const nomes = d.itens_fatura.map((i: any) => i.descricao);
  for (const n of ["Benefício Tarifário Bruto GD2", "Benefício Tarifário Líquido GD", "Participação Financeira - Rio", "Cobrança TUSD FioB GD2 05 e 06", "Bandeira Amarela da Energia Injetada"]) {
    assert.ok(nomes.includes(n), `faltou o item ${n}: ${nomes.join(" | ")}`);
  }
  assert.equal(d.itens_fatura.length, 14);
  assert.equal(Math.round(d.itens_fatura.reduce((a: number, i: any) => a + i.valor, 0) * 100) / 100, 40154.22);
  // "3.166" é 3166 kWh: consumo = 683 + 3166, igual ao Apurado do medidor (3.849,000).
  assert.equal(d.consumo, 3849);
  assert.ok(d.itens_fatura.some((i: any) => i.descricao === "Consumo TE" && i.quantidade === 3166));
  // Grupo A: vírgula decimal continua decimal.
  const a: any = segs.find(s => s.dados_extraidos.codigo_numero === "1.216.665.011-03")!.dados_extraidos;
  assert.ok(a.itens_fatura.some((i: any) => i.descricao === "Consumo TE" && i.quantidade === 8219.752));
});

teste("CELESC jan–ago: em toda UC com Valor impresso a soma dos itens fecha (nenhum aviso de item)", () => {
  for (const f of ["celesc-coletiva-2026-01.txt", "celesc-coletiva-2026-02.txt", "celesc-coletiva-2026-03.txt", "celesc-coletiva-2026-04.txt",
    "celesc-coletiva-2026-05-uc-antiga.txt", "celesc-coletiva-2026-06.txt", "celesc-duas-coletivas-2026-06-07.txt", "celesc-coletiva-2026-08.txt"]) {
    const segs = splitReportIntoFaturas(fixture(f), f);
    assert.ok(segs.length >= 149, f);
    const comAviso = segs.filter(s => (s.avisos || []).some(a => a.includes("Itens da fatura somam")));
    assert.equal(comAviso.length, 0, `${f}: ${comAviso.map(s => s.dados_extraidos.codigo_numero).join(", ")}`);
  }
});

teste("CELESC: item que não foi lido gera aviso com a diferença", () => {
  assert.equal(avisoItensNaoFecham([{ valor: 100 }, { valor: -10.5 }], 89.5), null);
  assert.match(avisoItensNaoFecham([{ valor: 2587.63 }], 40154.22) || "", /diferença de R\$ 37\.566,59/);
});

teste("Relatórios: todo item CELESC de jan–ago cai num grupo e os grupos somam o Valor da UC", () => {
  for (const f of ["celesc-coletiva-2026-01.txt", "celesc-coletiva-2026-04.txt", "celesc-duas-coletivas-2026-06-07.txt", "celesc-coletiva-2026-08.txt"]) {
    for (const s of splitReportIntoFaturas(fixture(f), f)) {
      const d: any = s.dados_extraidos;
      const c = categorizarItens(d.itens_fatura);
      assert.deepEqual(c.naoClassificados, [], `${f} ${d.codigo_numero}`);
      if (d.valor_total > 0) assert.ok(Math.abs(GRUPOS.reduce((a, g) => a + c.grupos[g], 0) - d.valor_total) < 0.05, `${f} ${d.codigo_numero}`);
    }
  }
  const casos: [string, string][] = [
    ["Consumo TE", "energia"], ["Consumo Fora Ponta TUSD", "rede"], ["Energia Injetada TUSD", "solar"], ["Bandeira Amarela da Energia Injetada", "solar"],
    ["Bandeira Amarela", "bandeira"], ["Demanda", "demanda"], ["Demanda de Ultrapassagem", "ultrapassagem"], ["Diferença da Demanda Contratada", "demanda_sem_uso"],
    ["Energia Reativa Excedente", "reativo"], ["Multa", "multas_juros"], ["Crédito Juros", "multas_juros"], ["COSIP Municipal Rio do Sul", "cosip"],
    ["Tributo Retido IRPJ", "irpj_retido"], ["Participação Financeira - Rio", "infraestrutura"], ["Cobrança TUSD FioB GD2 05 e 06", "infraestrutura"],
    ["Vistoria", "infraestrutura"], ["DIC crédito", "ajustes"], ["Anulação de Compensação", "ajustes"], ["Benefício Tarifário Bruto GD2", "solar"],
  ];
  for (const [nome, grupo] of casos) assert.equal(grupoDoItem(nome), grupo, nome);
});

teste("Relatórios: demanda contratada calculada da fatura, faixas de cor e demanda sugerida", () => {
  const s = splitReportIntoFaturas(fixture("celesc-coletiva-2026-08.txt"), "ago").find(x => x.dados_extraidos.codigo_numero === "1.571.540.011-56")!;
  const dm = demandaDoMes((s.dados_extraidos as any).itens_fatura)!;
  assert.equal(dm.faturada, 65.141);
  assert.equal(dm.ultrapassagem, 30.141);
  assert.equal(dm.contratada, 35);
  assert.equal(grupoTensaoDoTexto(s.origem_conteudo), "A4");
  assert.equal(faixaDemanda(65.141, 35), "vermelho");
  assert.equal(faixaDemanda(102, 100), "laranja");
  assert.equal(faixaDemanda(95, 100), "verde");
  assert.equal(faixaDemanda(80, 100), "amarelo");
  assert.equal(faixaDemanda(50, 100), "cinza");
  // Contrata 200 kW e usa no máximo 70: reduzir. Contrata 35 e usa ~100: aumentar.
  const reduzir = simularDemandaIdeal([50, 60, 70].map(u => ({ usada: u, preco_kw: 23.7, preco_ultrapassagem_kw: 47.4 })), 200)!;
  assert.ok(reduzir.sugerida >= 66 && reduzir.sugerida <= 70, String(reduzir.sugerida));
  assert.ok(reduzir.economia > 0);
  const aumentar = simularDemandaIdeal([90, 100, 110].map(u => ({ usada: u, preco_kw: 23.7, preco_ultrapassagem_kw: 47.4 })), 35)!;
  assert.ok(aumentar.sugerida > 35 && aumentar.economia > 0);
});

teste("Relatórios: mínimo pago sem consumo (custo de disponibilidade)", () => {
  const segs = splitReportIntoFaturas(fixture("celesc-coletiva-2026-01.txt"), "jan");
  const comMinimo = segs.map(s => custoDisponibilidade((s.dados_extraidos as any).itens_fatura, consumoMedidoDoTexto(s.origem_conteudo), grupoTensaoDoTexto(s.origem_conteudo))).filter(Boolean);
  assert.ok(comMinimo.length > 5);
  assert.ok(comMinimo.every(c => c!.kwh > 0 && c!.valor > 0 && [30, 50, 100].includes(c!.minimo)));
});

teste("Alerta de variação: mesmo mês do ano anterior tem prioridade; só alerta acima de 20% e da diferença mínima", () => {
  const h = (mes: string, consumo: number, valor = consumo, dias = 30) => ({ mes, consumo, valor, dias });
  const hist = [h("2025-03", 1000), h("2026-01", 400), h("2026-02", 420)];
  // Comparado com mar/2025 (1000): 1150 é +15% → sem alerta, mesmo sendo +180% sobre jan/fev.
  const r1 = compararComHistorico(h("2026-03", 1150), hist, "CELESC");
  assert.equal(r1.referencia, "mesmo mês de 2025");
  assert.equal(r1.alerta, null);
  // Sem o ano anterior: média de jan/fev (410); 600 é +46% e +190 kWh → alta.
  const r2 = compararComHistorico(h("2026-03", 600), hist.slice(1), "CELESC");
  assert.match(r2.referencia, /média de 2 meses/);
  assert.equal(r2.alerta, "alta");
  // UC pequena: 20 → 40 kWh é +100%, mas só 20 kWh de diferença → sem alerta.
  assert.equal(compararComHistorico(h("2026-03", 40), [h("2026-01", 20), h("2026-02", 20)], "CELESC").alerta, null);
  // Normaliza pelos dias: 1100 kWh em 33 dias = 1000 por 30 dias.
  assert.equal(compararComHistorico(h("2026-03", 1100, 1100, 33), [h("2026-01", 1000), h("2026-02", 1000)], "CELESC").alerta, null);
  // Água: 10 → 25 m³ (+150%, +15 m³) → alta; consumo zerado → zerado.
  assert.equal(compararComHistorico(h("2026-03", 25), [h("2026-01", 10), h("2026-02", 10)], "CASAN").alerta, "alta");
  assert.equal(compararComHistorico(h("2026-03", 0), [h("2026-01", 10), h("2026-02", 10)], "CASAN").alerta, "zerado");
  // Sem histórico: sem referência.
  assert.equal(compararComHistorico(h("2026-03", 500), [], "CELESC").referencia, "");
});

teste("Planilha de classificação CASAN: CSV e texto colado (tab) dão as mesmas 108 matrículas e 12 secretarias", () => {
  const csv = fixture("classificacao-casan-2026-09.csv");
  const r = lerPlanilhaClassificacao(csv);
  assert.equal(r.erro, undefined);
  assert.equal(r.linhas.length, 108);
  assert.equal(new Set(r.linhas.map(l => l.matricula)).size, 108);
  assert.equal(new Set(r.linhas.map(l => l.secretaria)).size, 12);
  const padaria = r.linhas.find(l => l.matricula === "637565-0")!;
  assert.equal(padaria.unidade, "EXTENSÃO UBS LARANJEIRAS");
  assert.equal(padaria.nome_fatura, "PMRS PADARIA SOCIAL");
  assert.equal(padaria.endereco, "ROD. VER. CARLOS PROBST,S/N");
  // O Google Sheets copia em tabulação, sem aspas.
  const colado = r.linhas.map(l => [l.matricula, l.endereco, l.nome_fatura, "0", "0", "", "", l.unidade, l.secretaria].join("\t"));
  const tsv = ["Matrícula\tLocalização\tUsuário\tConsumo\tValor Total\tRegistro\tDígito\tUnidade\tSecretaria", ...colado, "TOTAL\t\t\t\t1"].join("\n");
  assert.deepEqual(lerPlanilhaClassificacao(tsv).linhas, r.linhas);
});

teste("Planilha sem a coluna Secretaria é recusada com mensagem clara", () => {
  const r = lerPlanilhaClassificacao("Matrícula;Usuário;Unidade\n637565-0;PMRS PADARIA SOCIAL;EXTENSÃO UBS LARANJEIRAS");
  assert.equal(r.linhas.length, 0);
  assert.match(r.erro || "", /Secretaria/);
});

if (falhas) {
  console.log(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log("\nTodos os testes passaram");
