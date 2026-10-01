import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { detectarLayout, lerCasanSci8095, lerCelescColetiva } from "../src/utils/layoutReaders";
import { splitReportIntoFaturas } from "../src/utils/documentParser";

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
console.log("\nTodos os testes passaram");
