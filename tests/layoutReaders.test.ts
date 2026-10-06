import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { detectarLayout, lerCasanSci8095, lerCelescColetiva } from "../src/utils/layoutReaders";
import { splitReportIntoFaturas, avisoItensNaoFecham } from "../src/utils/documentParser";
import { lerPlanilhaClassificacao } from "../src/utils/planilhaClassificacao";
import { categorizarItens, GRUPOS, grupoDoItem, demandaDoMes, faixaDemanda, simularDemandaIdeal, consumoMedidoDoTexto, custoDisponibilidade, grupoTensaoDoTexto } from "../src/utils/analiseCelesc";
import { compararComHistorico } from "../src/utils/variacao";
import { calcularSituacao } from "../src/utils/situacao";
import { agregarContratos, precoMedioB, candidatosSolar, candidatosCapacitor, candidatosBOptante, mercadoLivre, PREMISSAS } from "../src/utils/oportunidades";
import { lerCelescAgrupadora } from "../src/utils/leitorCelescAgrupadora";

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

teste("Itens migrados do sistema antigo da CELESC entram em ajustes", () => {
  for (const d of ["Pag. Duplicidade - Migrado", "Item Migrado", "Dev. Cred. Fatura Cancelada"]) assert.equal(grupoDoItem(d), "ajustes");
});

teste("Oportunidades: B optante, capacitor, solar e mercado livre com os números de Dom Bosco 820", () => {
  const G = (o: Partial<Record<string, number>>) => Object.fromEntries(GRUPOS.map(g => [g, 0])) as any as Record<string, number> & typeof o;
  const meses = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`);
  // Dom Bosco 820 (A4) em 12 meses, dividido igualmente por mês.
  const dom = meses.map(mes => ({ contrato_id: "dom", unidade_id: "u1", unidade_nome: "MUNICIPIO DE RIO DO SUL", unidade_endereco: "DOM BOSCO 820", codigo: "1.616.994.011-54",
    concessionaria: "CELESC" as const, mes, consumo: 14165 / 12, energia_injetada: 0, grupo_tensao: "A4", demanda: { faturada: 41 },
    grupos: { ...G({}), energia: 5105 / 12, rede: (9427 - 5105) / 12, demanda: 3953 / 12, ultrapassagem: 1314 / 12, demanda_sem_uso: 4269 / 12, reativo: 734 / 12 } as any }));
  // Uma UC B3 sem geração define o preço médio do grupo B: R$ 0,8901/kWh.
  const b3 = meses.map(mes => ({ ...dom[0], contrato_id: "b3", unidade_id: "u2", codigo: "B3", mes, grupo_tensao: "B3", consumo: 10000 / 12,
    grupos: { ...G({}), energia: 4500 / 12, rede: 4401 / 12, bandeira: 0 } as any }));
  const cs = agregarContratos([...dom, ...b3]);
  assert.equal(cs.length, 2);
  const preco = precoMedioB(cs);
  assert.equal(Math.round(preco * 10000), 8901);
  const b = candidatosBOptante(cs, preco);
  assert.equal(b.length, 1);
  assert.equal(Math.round(b[0].custo_a), 19697);
  assert.equal(Math.round(b[0].economia), 7089);
  // Reativo de R$ 734/ano: para se pagar em 2 anos o serviço pode custar até R$ 1.468 — temporizador, não banco novo.
  const cap = candidatosCapacitor(cs);
  assert.equal(cap[0].limite_investimento, 1468);
  assert.equal(cap[0].solucao, "temporizador");
  assert.ok(cap[0].vale);
  // Solar na B3: gera 10.000 − 1.200 kWh; 7,3 kWp; economia = 8.800 × 0,8901 × 0,85.
  const sol = candidatosSolar(cs).find(c => c.contrato_id === "b3")!;
  assert.equal(sol.gerar_kwh, 8800);
  assert.equal(sol.kwp, 7.3);
  assert.equal(Math.round(sol.economia), Math.round(8800 * 0.8901 * PREMISSAS.solar_aproveitamento));
  // UC que já usou 112 kW não cabe em transformador de 112,5 kVA: fora do B optante.
  assert.equal(candidatosBOptante(agregarContratos([...dom.map(l => ({ ...l, demanda: { faturada: 112 } })), ...b3]), preco).length, 0);
  // Nem a que usa pouco mas tem 200 kW contratados (a instalação é grande).
  assert.equal(candidatosBOptante(agregarContratos([...dom.map(l => ({ ...l, demanda: { faturada: 60, contratada: 200 } })), ...b3]), preco).length, 0);
  // Solar limitada à microgeração (75 kWp): uma UC de 200 mil kWh/ano não ganha usina de 167 kWp.
  const grande = candidatosSolar(agregarContratos(b3.map(l => ({ ...l, consumo: 200000 / 12, grupos: { ...l.grupos, energia: 4500 * 20 / 12, rede: 4401 * 20 / 12 } }))))[0];
  assert.equal(grande.kwp, 75);
  assert.ok(grande.limitada);
  // Mercado livre: só o grupo A; base = energia + bandeira.
  const ml = mercadoLivre(cs)!;
  assert.equal(ml.ucs, 1);
  assert.equal(Math.round(ml.base), 5105);
  // Com menos de 6 meses de faturas o contrato não entra (não dá para levar a 12 meses).
  assert.equal(agregarContratos(dom.slice(0, 5)).length, 0);
});

teste("Situação: 3 meses sem fatura desativa; fatura nova ou reativação manual reativa; desativação manual fica", () => {
  const c = (id: string, despesa_id: string, unidade_id: string, extra: any = {}) => ({ id, despesa_id, unidade_id, ativo: true, ...extra });
  const l = (item_despesa_id: string, ...meses: string[]) => meses.map(m => ({ item_despesa_id, mes_ano: `${m}-01` }));
  const contratos = [
    c("ref", "2", "u0"),                                  // define o último mês da CASAN: 2026-09
    c("a", "2", "u1"),                                    // última 2026-06 → 3 meses → inativa
    c("b", "2", "u2"),                                    // última 2026-07 → 2 meses → continua
    c("x", "1", "u3"),                                    // CELESC: último mês da CELESC é 2026-08
    c("m", "2", "u4", { ativo: false, situacao_motivo: "Desativado manualmente" }),
    c("r", "2", "u5", { reativado_mes: "2026-08" }),      // reativada à mão em ago/2026
    c("n", "2", "u6"),                                    // nunca faturou: não mexe
    c("refE", "1", "u7"),                                 // define o último mês da CELESC: 2026-08
  ];
  const lanc = [...l("ref", "2026-09"), ...l("a", "2026-05", "2026-06"), ...l("b", "2026-07"), ...l("x", "2026-05"), ...l("m", "2026-09"), ...l("r", "2025-01"), ...l("refE", "2026-08")];
  const unidades = ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"].map(id => ({ id, ativo: true }));
  const r = calcularSituacao(contratos, unidades, lanc);
  const mud = Object.fromEntries(r.contratos.map(m => [m.id, m]));
  assert.equal(mud.a.ativo, false);
  assert.match(mud.a.situacao_motivo!, /Sem fatura desde 06\/2026/);
  assert.equal(mud.b, undefined);
  // A CELESC conta pelo último mês da CELESC (ago/2026): mai/2026 → 3 meses → inativa.
  assert.equal(mud.x.ativo, false);
  assert.equal(mud.m, undefined);
  assert.equal(mud.r, undefined);   // reativada em ago: só 1 mês até set
  assert.equal(mud.n, undefined);
  assert.deepEqual(r.unidades.map(u => [u.id, u.ativo]).sort(), [["u1", false], ["u3", false]]);
  // Chegou fatura nova: volta a ativa sozinha, com a unidade.
  const contratos2 = contratos.map(k => (k.id === "a" ? { ...k, ativo: false, situacao_motivo: mud.a.situacao_motivo } : k));
  const unidades2 = unidades.map(u => (u.id === "u1" ? { ...u, ativo: false, situacao_motivo: mud.a.situacao_motivo } : u));
  const r2 = calcularSituacao(contratos2, unidades2, [...lanc, ...l("a", "2026-09")]);
  assert.deepEqual(r2.contratos.find(m => m.id === "a"), { id: "a", ativo: true, situacao_motivo: null, ultimo_mes: "2026-09" });
  assert.deepEqual(r2.unidades.find(u => u.id === "u1"), { id: "u1", ativo: true, situacao_motivo: null });
});

teste("Alerta de variação: compara com o mês anterior E com o mesmo mês do ano anterior", () => {
  const h = (mes: string, consumo: number, valor = consumo, dias = 30) => ({ mes, consumo, valor, dias });
  const hist = [h("2025-03", 1000), h("2026-01", 400), h("2026-02", 420)];
  // 1150 em mar/2026: +15% sobre mar/2025 (sem alerta no ano), mas +174% sobre fev (salto no mês).
  const r1 = compararComHistorico(h("2026-03", 1150), hist, "CELESC");
  assert.equal(r1.anual!.referencia, "mesmo mês de 2025");
  assert.equal(r1.anual!.alerta, null);
  assert.equal(r1.mensal!.referencia, "mês anterior (02/2026)");
  assert.equal(r1.mensal!.alerta, "alta");
  assert.equal(r1.alerta, "alta");
  assert.match(r1.motivo, /Salto no mês/);
  // Outubro com R$ 200 num ano e R$ 1.200 no seguinte, já alto em setembro: o alerta é o anual.
  const r2 = compararComHistorico(h("2026-10", 300, 1200), [h("2025-10", 300, 200), h("2026-09", 300, 1150)], "CELESC");
  assert.equal(r2.mensal!.alerta, null);
  assert.equal(r2.anual!.alerta, "valor");
  assert.equal(r2.referencia, "mesmo mês de 2025");
  assert.match(r2.motivo, /sem o consumo/);
  // Mês anterior faltando: usa o último com fatura (até 3 meses antes).
  assert.equal(compararComHistorico(h("2026-03", 600), [h("2026-01", 410)], "CELESC").mensal!.referencia, "último mês com fatura (01/2026)");
  // Água saindo do zero (0 → 256 m³): é aumento de consumo, não "valor subiu".
  const r3 = compararComHistorico(h("2026-09", 256, 4591), [h("2025-09", 0, 43), h("2026-08", 144, 2550)], "CASAN");
  assert.equal(r3.anual!.alerta, "alta");
  assert.equal(r3.anual!.var_consumo, null);
  assert.equal(r3.mensal!.alerta, "alta");
  assert.match(r3.motivo, /vazamento/);
  // UC pequena: 20 → 40 kWh é +100%, mas só 20 kWh de diferença → sem alerta.
  assert.equal(compararComHistorico(h("2026-03", 40), [h("2026-02", 20)], "CELESC").alerta, null);
  // Normaliza pelos dias: 1100 kWh em 33 dias = 1000 por 30 dias.
  assert.equal(compararComHistorico(h("2026-03", 1100, 1100, 33), [h("2026-02", 1000)], "CELESC").alerta, null);
  // Água: 10 → 25 m³ (+150%, +15 m³) → alta; consumo zerado → zerado.
  assert.equal(compararComHistorico(h("2026-03", 25), [h("2026-02", 10)], "CASAN").alerta, "alta");
  assert.equal(compararComHistorico(h("2026-03", 0), [h("2026-02", 10)], "CASAN").alerta, "zerado");
  // Sem histórico: sem referência.
  const r4 = compararComHistorico(h("2026-03", 500), [], "CELESC");
  assert.equal(r4.referencia, "");
  assert.equal(r4.mensal, null);
  assert.equal(r4.anual, null);
});

teste("CASAN: linha sem leitura anterior e total com o último dígito cortado", () => {
  const txt = [
    "Referência: 05/2024",
    " 2021925-3   656. 895. 080. 0500. 01 PMRS CE RUTH SCHROEDER OHF   001   002447   000079   1.155,50   0,00   -55,46    0,00 1.100,04 ",
    " BC. JOSE JOAO DIAS,114 ",
    " 1696634-1   656. 896. 022. 0570. 01 PREFEITURA MUNICIPAL DE RIO DO SUL   001   000205   000213   000008   81,23   0,00   -3,90    0,00 77,33 ",
    " R. RUY BARBOSA,SN ",
    " Total Geral:   2   000087   1.236,73   0,00   -59,36   0,00 1.177,3",
  ].join("\n");
  const r = lerCasanSci8095(txt);
  assert.equal(r.contas.length, 2);
  assert.equal(r.contas[0].consumo, 79);
  assert.equal(r.contas[0].leitura_atual, 2447);
  assert.equal(r.contas[1].leitura_anterior, 205);
  assert.equal(r.conferencia.ok, true, JSON.stringify(r.conferencia));
});

teste("CELESC layout antigo (agrupadora 01/2024): 148 UCs, total da capa, sinal dos créditos e TE/TUSD separados", () => {
  const txt = fixture("celesc-agrupadora-2024-01.txt");
  assert.equal(detectarLayout(txt), "CELESC_AGRUPADORA");
  const r = lerCelescAgrupadora(txt);
  assert.equal(r.blocos.length, 148);
  assert.equal(r.conferencia.ok, true, JSON.stringify(r.conferencia.grupos) + r.conferencia.avisos.join(" | "));
  // Cada UC: itens (com os créditos no sinal certo) − IRPJ retido = Valor impresso.
  for (const b of r.blocos) assert.ok(Math.abs(b.itens.reduce((a, i) => a + i.valor, 0) - (b.valor || 0)) < 0.015, b.uc);
  const verdao = r.blocos.find(b => b.uc === "0025509315")!;
  assert.equal(verdao.valor, 20749.12);
  assert.equal(verdao.grupo, "A4");
  assert.ok(verdao.itens.some(i => i.descricao === "Consumo Fora Ponta TUSD" && i.quantidade === 24135));
  const praca = r.blocos.find(b => b.uc === "0028501714")!; // custo de disponibilidade + devolução sem sinal no PDF
  assert.ok(praca.itens.some(i => /Devol/.test(i.descricao) && i.valor === -3.63));
  const segs = splitReportIntoFaturas(txt, "jan2024.pdf");
  assert.equal(segs.length, 148);
  assert.equal(segs[0].dados_extraidos.mes_ano, "2024-01-01");
  for (const s of segs) assert.deepEqual(categorizarItens((s.dados_extraidos as any).itens_fatura).naoClassificados, [], s.dados_extraidos.codigo_numero);
});

teste("CELESC layout antigo: \"DEMANDA ISENTA ICMS\" é a demanda contratada sem uso (contratada = usada + isenta)", () => {
  const { blocos } = lerCelescAgrupadora(fixture("celesc-agrupadora-2024-01.txt"));
  const dem = (uc: string) => demandaDoMes(blocos.find(b => b.uc === uc)!.itens as any)!;
  // Praça Isabel: DEMANDA 17 + DEMANDA ISENTA ICMS 18 = 35 kW contratados.
  assert.deepEqual([dem("0025232470").faturada, dem("0025232470").sem_uso, dem("0025232470").contratada], [17, 18, 35]);
  // Centro de Eventos: 52 + 148 = 200 kW.
  assert.equal(dem("0027966314").contratada, 200);
  assert.ok(blocos.every(b => !b.itens.some(i => /ISENTA/i.test(i.descricao))));
  // O servidor relê cada fatura antiga a partir do texto do seu bloco: tem que dar o mesmo resultado.
  for (const b of blocos) assert.deepEqual(lerCelescAgrupadora(b.texto).blocos[0].itens, b.itens);
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
