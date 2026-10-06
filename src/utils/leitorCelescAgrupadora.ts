// Leitor da "Relação de Faturas Agrupadoras/Agrupadas" (CFERAGP0) — layout antigo da CELESC,
// usado até abril/2024. Uma UC por bloco ("Empresa: ... Referência: 01-2024", "UC: 8305170",
// "Valor: 354,60"), com os itens em "Valores Faturados". Diferenças em relação ao layout novo:
// - consumo traz o preço da TE e da TUSD na mesma linha (o item é separado em TE e TUSD aqui);
// - créditos e devoluções vêm SEM sinal: o sinal de cada um é o que fecha com o Valor da UC;
// - o IRPJ retido não é item — vem na tabela de tributos e é descontado do total.
import { ConferenciaLeitura, valorBR } from "./layoutReaders";

export interface ItemAgrupadora {
  id: string; descricao: string; quantidade: number; valor_unitario: number; valor: number;
  pis?: number; icms?: number;
}
export interface BlocoAgrupadora {
  uc: string;             // com zeros à esquerda, 10 dígitos (como nas faturas atuais)
  referencia: string;     // "2024-01-01"
  valor: number | null;
  itens: ItemAgrupadora[];
  consumo: number;
  injetada: number;
  endereco: string;
  grupo: string;          // "A4", "B3"...
  dias: number;
  medidor: string;
  texto: string;
  avisos: string[];
}

const NUM = /^-?\d[\d.]*(?:,\d+)?$/;
const espacos = (s: string) => s.replace(/\s+/g, " ").trim();
const r2 = (v: number) => Math.round(v * 100) / 100;
const titulo = (s: string) => espacos(s).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  .replace(/\b(Te|Tusd|Icms|Cosip|Irpj)\b/g, m => m.toUpperCase());

// Itens que nunca são crédito; os demais itens sem quantidade têm o sinal decidido pelo total.
const SEMPRE_POSITIVO = /COSIP|DESLIGA|RELIGA|DISJUNTOR|ILUMIN/i;
const SEMPRE_NEGATIVO = /INJETAD/i;

function nomeDoItem(desc: string): string {
  const d = espacos(desc).toUpperCase();
  if (/^DEMANDA\s+ULTRAP/.test(d)) return `Demanda de Ultrapassagem ${espacos(desc).replace(/^DEMANDA\s+ULTRAP\.?\s*/i, "")}`.trim();
  if (/^DEMANDA\s+FORA\s+PONTA/.test(d)) return "Demanda Fora Ponta";
  if (/^DEMANDA\s+PONTA/.test(d)) return "Demanda Ponta";
  if (/^DEMANDA/.test(d)) return "Demanda";
  if (/^ENERGIA\s+REAT/.test(d)) return `Energia Reativa Excedente${/\bFP\b|FORA/.test(d) ? " Fora Ponta" : /\bP\b|PONTA/.test(d) ? " Ponta" : ""}`;
  if (/INJETAD/.test(d)) return "Energia Injetada";
  if (/^COSIP/.test(d)) return "COSIP Municipal";
  return titulo(desc);
}

export function lerCelescAgrupadora(text: string): { blocos: BlocoAgrupadora[]; conferencia: ConferenciaLeitura } {
  const cabecalho = text.match(/Refer[êe]ncia:\s*(\d{2})-(\d{4})\s+Vencto:.*?Valor:\s*([\d.]+,\d{2})/);
  const qtdDeclarada = Number((text.match(/Total de Faturas Agrupadas\s+na\s+Agrupadora:\s*(\d+)/i) || [])[1]) || null;
  // Tira cabeçalhos e rodapés de página, que cortam blocos no meio.
  const linhas = text.split(/\f|\n/).filter(l => !/Usu[áa]rio:\s+\w+\s+Posi[çc][ãa]o|Emitido pela|CFERAGP0|^\s*Cliente:\s|^\s*Endere[çc]o:\s+\d{4}\s+-|Vencto:\s+\d{2}-\w{3}-\d{4}|Total de (Faturas|Documentos) Agrupad/i.test(l));

  // Cada "Empresa: ... Referência:" abre um livro com várias UCs; cada UC começa na linha "Nome:".
  const brutos: { ref: string; linhas: string[] }[] = [];
  let refAtual = "";
  for (const l of linhas) {
    const livro = l.match(/^\s*Empresa:\s+\d+\s+-\s+CELESC.*Refer[êe]ncia:\s*(\d{2})-(\d{4})/);
    if (livro) { refAtual = `${livro[2]}-${livro[1]}-01`; continue; }
    if (/^\s*Nome:\s/.test(l)) { brutos.push({ ref: refAtual, linhas: [l] }); continue; }
    if (brutos.length) brutos[brutos.length - 1].linhas.push(l);
  }

  const TRIB = /^\s*(ICMS|COFINS|PIS(?:\/PASEP)?|TRIBUTO\s+A\s+RETER\s+\w+|EST\.\s+TRIBUTO\s+A\s+RETER\s+\w+)\s+(-?[\d.]+,\d+)\s+([\d.,]+)%\s+(-?[\d.]+,\d+)\s*(.*)$/i;
  const blocos: BlocoAgrupadora[] = brutos.map(b => {
    const texto = b.linhas.join("\n");
    const uc = (texto.match(/UC:\s+(\d+)/) || [])[1] || "";
    const valorM = texto.match(/Recolhimento:.*?Valor:\s*(-?[\d.]+,\d{2})/) || texto.match(/Hash.*Valor:\s*(-?[\d.]+,\d{2})/);
    const valor = valorM ? valorBR(valorM[1]) : null;
    const end = espacos((texto.match(/Endere[çc]o:\s*(.*?)\s+Bairro:/) || [])[1] || "");
    const compl = espacos((texto.match(/Complemento:\s*(.*?)\s+Fatura:/) || [])[1] || "");
    const classe = texto.match(/\s([AB])-(\d\w*)\s+\w{2}-[A-Z]+\s+\d{2}\/\d{2}\/\d{4}\s+(\d+)/);
    const medidor = (texto.match(/^\s*CON\s+RG-(\d+)/m) || [])[1] || "";

    let icms = 0, pisCofins = 0, retido = 0;
    const itens: { desc: string; nums: number[] }[] = [];
    for (const l of b.linhas) {
      if (/^\s*(Empresa:|Nome:|UC:|Classe|Hash|Tributos\s|Esp\.|_{5}|\d{2}-[A-Z])/.test(l) || /^\s*[A-Z][A-Z0-9]{2}\s+([A-Z]{2}-|-\s)/.test(l) || /^\s*\d{2}-PODER|^\s*0\d-/.test(l)) continue;
      let resto = l;
      const t = l.match(TRIB);
      if (t) {
        const nome = t[1].toUpperCase(), v = valorBR(t[4]);
        if (nome === "ICMS") icms += v;
        else if (/^PIS|^COFINS/.test(nome)) pisCofins += v;
        else if (/^EST\./.test(nome)) retido -= v;
        else retido += v;
        resto = t[5];
      }
      const toks = espacos(resto).split(" ").filter(Boolean);
      if (!toks.length || !/[A-Za-z]/.test(resto)) continue;
      let k = toks.length;
      while (k > 0 && NUM.test(toks[k - 1])) k--;
      if (k === toks.length || k === 0) continue;
      itens.push({ desc: toks.slice(0, k).join(" "), nums: toks.slice(k).map(valorBR) });
    }

    // Sinal dos créditos: o que faz a soma dos itens − IRPJ retido fechar com o Valor da UC.
    const valorDe = (x: { nums: number[] }) => x.nums[x.nums.length - 1];
    // Itens sem preço unitário (créditos, devoluções, ajustes — às vezes com um número no meio do
    // texto, como "DEV SDO CTA ANT VIOL META 2 16,97") são os que podem ser negativos.
    const ambiguos = itens.map((x, i) => i).filter(i => itens[i].nums.length <= 2 && !SEMPRE_POSITIVO.test(itens[i].desc) && !SEMPRE_NEGATIVO.test(itens[i].desc));
    const sinal = itens.map(x => (SEMPRE_NEGATIVO.test(x.desc) ? -1 : 1));
    const avisos: string[] = [];
    const total = () => itens.reduce((a, x, i) => a + sinal[i] * valorDe(x), 0) - retido;
    if (valor !== null && ambiguos.length && ambiguos.length <= 10) {
      let achou = false;
      for (let m = 0; m < 1 << ambiguos.length && !achou; m++) {
        ambiguos.forEach((i, j) => (sinal[i] = m & (1 << j) ? -1 : 1));
        if (Math.abs(total() - valor) < 0.015) achou = true;
      }
      if (!achou) ambiguos.forEach(i => (sinal[i] = /DEV|CRED|COMP|DIF/i.test(itens[i].desc) ? -1 : 1));
    }
    if (valor !== null && Math.abs(total() - valor) >= 0.015) avisos.push(`⚠️ Itens somam R$ ${total().toFixed(2)}, mas o Valor da UC é R$ ${valor.toFixed(2)}.`);
    if (valor === null) avisos.push(`⚠️ Valor da UC não encontrado no PDF.`);

    const out: ItemAgrupadora[] = [];
    let consumo = 0, custoDisp = 0, injetada = 0;
    for (const [i, x] of itens.entries()) {
      const s = sinal[i], v = valorDe(x), d = espacos(x.desc).toUpperCase();
      const add = (descricao: string, quantidade: number, unit: number, valorItem: number) =>
        out.push({ id: String(out.length + 1), descricao, quantidade, valor_unitario: unit, valor: r2(s * valorItem) });
      if (x.nums.length === 4 && /^(CONSUMO|CUSTO\s+DISP)/.test(d)) {
        // Consumo: quantidade, preço TE, preço TUSD, valor — separa a energia (TE) do uso da rede (TUSD).
        const [q, pTE, pTUSD] = x.nums;
        const base = /^CUSTO/.test(d) ? "Custo Disp Sistema" : `Consumo${/FORA\s+PONTA/.test(d) ? " Fora Ponta" : /PONTA/.test(d) ? " Ponta" : ""}`;
        const te = r2(q * pTE);
        add(`${base} TE`, q, pTE, te);
        add(`${base} TUSD`, q, pTUSD, r2(v - te));
        if (/^CUSTO/.test(d)) custoDisp += q; else consumo += q;
      } else {
        const q = x.nums.length >= 2 ? x.nums[0] : 0, unit = x.nums.length >= 3 ? x.nums[1] : 0;
        add(nomeDoItem(x.desc), q, unit, v);
        if (/INJETAD/.test(d)) injetada += q;
      }
    }
    out.push({ id: String(out.length + 1), descricao: "Tributo Retido IRPJ", quantidade: 0, valor_unitario: 0, valor: r2(-retido), icms: r2(icms), pis: r2(pisCofins) });

    return {
      uc: uc.padStart(10, "0"), referencia: b.ref, valor, itens: out, consumo: consumo || custoDisp, injetada,
      endereco: espacos([end.replace(/,\s*$/, ""), compl].filter(Boolean).join(" ")), grupo: classe ? `${classe[1]}${classe[2]}` : "",
      dias: classe ? Number(classe[3]) : 0, medidor, texto, avisos,
    };
  }).filter(b => b.uc !== "0000000000");

  const totalLido = blocos.reduce((a, b) => a + (b.valor || 0), 0);
  const totalDeclarado = cabecalho ? valorBR(cabecalho[3]) : null;
  const ok = totalDeclarado !== null && Math.round(totalDeclarado * 100) === Math.round(totalLido * 100) && (qtdDeclarada === null || qtdDeclarada === blocos.length);
  return {
    blocos,
    conferencia: {
      layout: "CELESC_AGRUPADORA" as any,
      ok: ok && blocos.every(b => !b.avisos.length),
      grupos: [{ rotulo: "CELESC — Relação de Faturas Agrupadoras", referencia: cabecalho ? `${cabecalho[1]}/${cabecalho[2]}` : "", qtdLida: blocos.length, qtdDeclarada, totalLido, totalDeclarado, ok }],
      avisos: blocos.flatMap(b => b.avisos.map(a => `UC ${b.uc}: ${a.replace(/^⚠️\s*/, "")}`)),
    },
  };
}
