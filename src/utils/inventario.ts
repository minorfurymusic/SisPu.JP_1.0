// Inventário de unidades: cadastro complementar dos locais/setores da Prefeitura (responsáveis,
// contato, classificação, situação, matrícula CASAN e UC CELESC), vindo da planilha "Unidades".
// Não mexe nos contratos nem nas faturas: só cruza os códigos com o sistema para mostrar a ligação,
// a situação pela nossa regra (3 meses sem fatura) e o edifício.

export type CampoInventario =
  | "nome" | "secretaria" | "responsavel_1" | "responsavel_2" | "cep" | "endereco" | "email" | "telefone"
  | "departamento" | "classificacao" | "situacao" | "casan" | "celesc" | "qtde_bens" | "observacao";

// Colunas na ordem da planilha. O rótulo é o cabeçalho exportado; os apelidos são os cabeçalhos
// aceitos na importação (comparados sem acento, maiúsculas, espaços e ":").
export const COLUNAS_INVENTARIO: { campo: CampoInventario; rotulo: string; apelidos?: string[] }[] = [
  { campo: "nome", rotulo: "Nome da Unidade", apelidos: ["Unidade", "Nome"] },
  { campo: "secretaria", rotulo: "Secretaria" },
  { campo: "responsavel_1", rotulo: "Responsável 01", apelidos: ["Responsável 1", "Responsável"] },
  { campo: "responsavel_2", rotulo: "Responsável 02", apelidos: ["Responsável 2"] },
  { campo: "cep", rotulo: "CEP" },
  { campo: "endereco", rotulo: "Endereço" },
  { campo: "email", rotulo: "E-mail", apelidos: ["Email"] },
  { campo: "telefone", rotulo: "Telefone", apelidos: ["Fone"] },
  { campo: "departamento", rotulo: "Departamento" },
  { campo: "classificacao", rotulo: "Classificação" },
  { campo: "situacao", rotulo: "Situação" },
  { campo: "casan", rotulo: "CASAN Matrícula", apelidos: ["Matrícula CASAN", "CASAN"] },
  { campo: "celesc", rotulo: "CELESC UC", apelidos: ["UC CELESC", "CELESC"] },
  { campo: "qtde_bens", rotulo: "Qtde Estimada de Bens", apelidos: ["Qtde de Bens", "Bens"] },
  { campo: "observacao", rotulo: "Observação", apelidos: ["Observações", "Obs"] },
];
// Colunas que só a exportação traz (calculadas); a importação ignora, menos o ID.
export const COLUNAS_SO_EXPORTACAO = ["Situação no sistema", "Edifício", "ID"];

export type ItemInventario = { id: string; ordem?: number; criado_em?: string; atualizado_em?: string } & Partial<Record<CampoInventario, string>>;

export const normTexto = (v?: string) => String(v ?? "").toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
export const normCabecalho = (v?: string) => normTexto(v).replace(/[^A-Z0-9]/g, "");
const normEndereco = (v?: string) => normTexto(v).replace(/\bS\/?N\b|\bSN\b/g, "").replace(/\b(RUA|R|AV|AVENIDA|ESTRADA|EST|N|NO|DE|DA|DO|DOS|DAS)\b/g, " ").replace(/[^A-Z0-9]+/g, " ").trim();
const digitos = (v?: string) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");

// Campo da coluna pelo cabeçalho da planilha (null = coluna desconhecida).
export function campoDoCabecalho(cabecalho: string): CampoInventario | "id" | null {
  const h = normCabecalho(cabecalho);
  if (!h) return null;
  if (h === "ID") return "id";
  for (const c of COLUNAS_INVENTARIO) if ([c.rotulo, ...(c.apelidos || [])].some(r => normCabecalho(r) === h)) return c.campo;
  return null;
}

// Códigos de uma célula ("580992-4 / 233672-3", "12270275", "20219385"): cada pedaço com ao menos
// 5 dígitos. Texto solto ("Medidores: TF5268421…", "-") não vira código.
export function codigosDaCelula(celula?: string): string[] {
  const texto = String(celula ?? "").trim();
  if (!texto || /[A-Za-z]{3,}/.test(texto)) return [];
  return texto.split(/[\/,;]| e /).map(t => t.trim().replace(/\.0+$/, "")).filter(t => digitos(t).length >= 5);
}

// Chave de identificação de uma linha quando ela não traz ID: nome + secretaria + endereço.
export const chaveInventario = (i: Partial<Record<CampoInventario, string>>) =>
  [normTexto(i.nome), normTexto(i.secretaria), normEndereco(i.endereco)].join("|");

type Contrato = { id: string; codigo_numero: string; codigos_numero_anteriores?: string[]; despesa_id: string; unidade_id: string; ativo: boolean; nome_fatura?: string; situacao_motivo?: string };
type Unidade = { id: string; nome: string; endereco?: string };
type Edificio = { id: string; nome: string; contratos: string[] };

export type LigacaoInventario = {
  codigo: string; tipo: "AGUA" | "LUZ";
  contrato_id?: string; codigo_sistema?: string; unidade?: string; ativo?: boolean; motivo?: string;
  edificio_id?: string; edificio?: string;
};
export type ItemInventarioResumo = ItemInventario & {
  ligacoes: LigacaoInventario[];
  situacao_sistema: "Ativa" | "Inativa" | "";
  edificio_id?: string; edificio?: string; edificio_por?: "ligacao" | "endereco";
  avisos: string[];
};

export function montarIndiceContratos(contratos: Contrato[], despesas: { id: string; descricao: string }[]) {
  const agua = new Set(despesas.filter(d => /CASAN|ÁGUA|AGUA/i.test(d.descricao)).map(d => String(d.id)));
  const porCodigo = new Map<string, Contrato>();
  for (const c of contratos) for (const cod of [c.codigo_numero, ...(c.codigos_numero_anteriores || [])]) {
    const d = digitos(cod);
    if (d && !porCodigo.has(d)) porCodigo.set(d, c);
  }
  return { achar: (cod: string) => porCodigo.get(digitos(cod)), tipo: (c: Contrato): "AGUA" | "LUZ" => (agua.has(String(c.despesa_id)) ? "AGUA" : "LUZ") };
}

// Pontos de semelhança entre a linha e o contrato do sistema (nome da unidade, nome na fatura e
// endereço): palavras em comum, sem as muito comuns.
const COMUNS = new Set(["PMRS", "RUA", "DE", "DA", "DO", "DOS", "DAS", "E", "S", "N", "SN", "CENTRO", "SECRETARIA", "MUNICIPAL", "DEPTO", "SETOR", "DIVISAO"]);
const palavras = (v?: string) => new Set(normTexto(v).replace(/[^A-Z0-9]+/g, " ").split(" ").filter(p => p.length > 1 && !COMUNS.has(p)));
function semelhanca(item: ItemInventario, alvo: string) {
  const a = palavras(alvo);
  let n = 0;
  palavras(`${item.nome} ${item.endereco}`).forEach(p => { if (a.has(p)) n++; });
  return n;
}

// Mesmo código em mais de uma linha: decide a qual pertence. Com contrato no sistema, fica na linha
// mais parecida com a unidade/nome na fatura/endereço do contrato. Sem contrato, fica na linha cujo
// endereço não é de outro local que já tem ligação própria. Devolve, por linha, os códigos a tirar
// e o motivo; o que não der para decidir fica nas duas, com aviso.
export function resolverCodigosRepetidos(itens: ItemInventario[], dados: { contratos: Contrato[]; unidades: Unidade[]; despesas: { id: string; descricao: string }[] }) {
  const idx = montarIndiceContratos(dados.contratos, dados.despesas);
  const unidade = new Map(dados.unidades.map(u => [String(u.id), u]));
  const usos = new Map<string, { item: ItemInventario; campo: "casan" | "celesc"; codigo: string }[]>();
  for (const item of itens) for (const campo of ["casan", "celesc"] as const) for (const codigo of codigosDaCelula(item[campo])) {
    const d = digitos(codigo);
    if (!usos.has(d)) usos.set(d, []);
    if (!usos.get(d)!.some(u => u.item === item)) usos.get(d)!.push({ item, campo, codigo });
  }
  const remover: { item: ItemInventario; campo: "casan" | "celesc"; codigo: string; dono: ItemInventario; motivo: string }[] = [];
  const indecisos: { codigo: string; itens: ItemInventario[] }[] = [];
  // Endereços de linhas que têm ligação própria (código só delas).
  const enderecoComLigacaoPropria = (item: ItemInventario, d: string) => itens.some(o => o !== item && normEndereco(o.endereco) === normEndereco(item.endereco) &&
    ["casan", "celesc"].some(c => codigosDaCelula(o[c as "casan"]).some(k => digitos(k) !== d)));
  for (const [d, lista] of usos) {
    if (lista.length < 2) continue;
    const contrato = idx.achar(d);
    let dono: ItemInventario | undefined, motivo = "";
    if (contrato) {
      const u = unidade.get(String(contrato.unidade_id));
      const alvo = `${u?.nome || ""} ${u?.endereco || ""} ${contrato.nome_fatura || ""}`;
      const pontos = lista.map(l => ({ l, p: semelhanca(l.item, alvo) })).sort((a, b) => b.p - a.p);
      if (pontos[0].p > 0 && pontos[0].p > pontos[1].p) { dono = pontos[0].l.item; motivo = `no sistema é de "${u?.nome || contrato.nome_fatura || ""}"`; }
    } else {
      const livres = lista.filter(l => !enderecoComLigacaoPropria(l.item, d));
      if (livres.length === 1) { dono = livres[0].item; motivo = "no endereço da outra linha já há um local com ligação própria"; }
    }
    if (!dono) { indecisos.push({ codigo: lista[0].codigo, itens: lista.map(l => l.item) }); continue; }
    lista.filter(l => l.item !== dono).forEach(l => remover.push({ item: l.item, campo: l.campo, codigo: l.codigo, dono: dono!, motivo }));
  }
  return { remover, indecisos };
}

// Tira o código da célula, mantendo os outros do jeito que estavam escritos.
export function tirarCodigo(celula: string, codigo: string) {
  const d = digitos(codigo);
  const resto = String(celula || "").split("/").map(t => t.trim()).filter(t => t && digitos(t) !== d);
  return resto.join(" / ");
}

export function resumirInventario(dados: {
  itens: ItemInventario[]; contratos: Contrato[]; unidades: Unidade[]; despesas: { id: string; descricao: string }[]; edificios: Edificio[];
}): ItemInventarioResumo[] {
  const idx = montarIndiceContratos(dados.contratos, dados.despesas);
  const unidade = new Map(dados.unidades.map(u => [String(u.id), u]));
  const edificioDoContrato = new Map<string, Edificio>();
  dados.edificios.forEach(e => (e.contratos || []).forEach(c => edificioDoContrato.set(c, e)));
  const repetidos = resolverCodigosRepetidos(dados.itens, dados);

  const resumo: ItemInventarioResumo[] = dados.itens.map(item => {
    const ligacoes: LigacaoInventario[] = [];
    const avisos: string[] = [];
    for (const campo of ["casan", "celesc"] as const) for (const codigo of codigosDaCelula(item[campo])) {
      const c = idx.achar(codigo);
      const tipoPlanilha = campo === "casan" ? "AGUA" : "LUZ";
      if (!c) { ligacoes.push({ codigo, tipo: tipoPlanilha }); avisos.push(`${codigo}: não está no sistema (sem fatura importada)`); continue; }
      const tipo = idx.tipo(c);
      if (tipo !== tipoPlanilha) avisos.push(`${codigo}: está na coluna ${campo === "casan" ? "CASAN" : "CELESC"}, mas no sistema é ${tipo === "AGUA" ? "CASAN" : "CELESC"}`);
      const e = edificioDoContrato.get(c.id);
      ligacoes.push({
        codigo, tipo, contrato_id: c.id, codigo_sistema: c.codigo_numero, unidade: unidade.get(String(c.unidade_id))?.nome,
        ativo: c.ativo !== false, motivo: c.situacao_motivo, edificio_id: e?.id, edificio: e?.nome,
      });
    }
    repetidos.remover.filter(r => r.item === item).forEach(r =>
      avisos.push(`${r.codigo}: também está em "${r.dono.nome}" e deve ser de lá (${r.motivo})`));
    repetidos.indecisos.filter(r => r.itens.includes(item)).forEach(r =>
      avisos.push(`${r.codigo}: também está em ${r.itens.filter(o => o !== item).map(o => `"${o.nome}"`).join(", ")}; confira qual está certo`));
    const comContrato = ligacoes.filter(l => l.contrato_id);
    const situacao_sistema = !comContrato.length ? "" : comContrato.some(l => l.ativo) ? "Ativa" : "Inativa";
    const comEdificio = ligacoes.find(l => l.edificio_id);
    return { ...item, ligacoes, situacao_sistema, edificio_id: comEdificio?.edificio_id, edificio: comEdificio?.edificio, edificio_por: comEdificio ? "ligacao" : undefined, avisos };
  });
  // Setor sem ligação própria: herda o edifício de outra linha no mesmo endereço.
  const porEndereco = new Map<string, ItemInventarioResumo>();
  resumo.forEach(r => { const k = normEndereco(r.endereco); if (k && r.edificio_id && !porEndereco.has(k)) porEndereco.set(k, r); });
  resumo.forEach(r => {
    if (r.edificio_id) return;
    const o = porEndereco.get(normEndereco(r.endereco));
    if (o) { r.edificio_id = o.edificio_id; r.edificio = o.edificio; r.edificio_por = "endereco"; }
  });
  return resumo;
}
