/**
 * Types representing the SisPu.JP database schema and state
 */

export interface Usuario {
  id: string;
  login: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
}

export interface Secretaria {
  id: string;
  codigo_legado?: number;
  nome: string;
  sigla?: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Unidade {
  id: string;
  codigo_legado?: number;
  secretaria_id: string;
  nome: string;
  uc?: string;
  codnum?: string;
  concessionaria?: string;
  endereco?: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Despesa {
  id: string;
  codigo_legado?: number;
  descricao: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface ItemDespesa {
  id: string;
  codigo_numero: string; // CODNUM
  despesa_id: string;
  unidade_id: string;
  tipo_fone?: string;
  medidor?: string; // MEDITM
  // CODNUMs antigos que a concessionária já usou pra este mesmo contrato (ex.: recodificação de
  // UC da CELESC) — continuam reconhecidos na hora de casar uma fatura nova com este item, pra
  // não fragmentar o histórico de lançamentos em dois contratos diferentes.
  codigos_numero_anteriores?: string[];
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Lancamento {
  id: string;
  item_despesa_id: string;
  mes_ano: string; // YYYY-MM-DD
  consumo: number;
  valor_total: number;
  valor_imposto: number;
  valor_celular: number;
  valor_internet: number;
  valor_diversos: number;
  valor_linha_privada: number;
  valor_credito: number;
  data_lancamento?: string; // YYYY-MM-DD
  codigo_legado_numero?: string;
  mes_ano_legado?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface Pessoa {
  id: string;
  codigo_legado?: number;
  nome: string;
  tipo_pessoa?: string;
  cpf_cnpj?: string;
  telefone_residencial?: string;
  telefone_comercial?: string;
  telefone_celular?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface ContatoEmail {
  id: string;
  descricao: string;
  email: string;
  criado_em: string;
}

export interface LogError {
  id: string;
  origem?: string;
  mensagem: string;
  ocorrido_em?: string;
  arquivo_origem?: string;
  linha_original?: string;
  criado_em: string;
}

export interface AuditoriaRegistro {
  id: string;
  tabela: string;
  registro_pk?: string;
  acao: 'INSERT' | 'UPDATE' | 'DELETE';
  usuario: string;
  valor_antigo?: any;
  valor_novo?: any;
  criado_em: string;
}

export type DocumentLayoutType = 'CELESC_FATURA' | 'CELESC_RELATORIO' | 'CASAN_FATURA' | 'CASAN_RELATORIO';

export interface DocumentoProcessado {
  id: string;
  nome_arquivo: string;
  layout: DocumentLayoutType;
  tamanho: number;
  status: 'PENDENTE' | 'NORMALIZADO' | 'VALIDADO' | 'HOMOLOGADO' | 'IGNORADA';
  origem_conteudo: string; // Text content extracted
  dados_extraidos: {
    mes_ano: string; // YYYY-MM-DD
    consumo: number;
    valor_total: number;
    valor_imposto: number;
    valor_celular: number;
    valor_internet: number;
    valor_diversos: number;
    valor_linha_privada: number;
    valor_credito: number;
    codigo_numero?: string; // CODNUM (e.g. medidor, telefone, contrato)
    medidor?: string;
    unidade_nome?: string;
    endereco?: string;
    localizacao?: string;
    leitura_anterior?: number;
    leitura_atual?: number;
    secretaria_nome?: string;
    despesa_descricao?: string;
    
    // Extracted invoice metadata for SISPU 2.0
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
      pis?: number;         // COFINS / PIS (R$) - column 5
      icms?: number;        // ICMS (R$) - column 6
      irpj_pct?: number;    // IRPJ (%) - column 7
      irpj_val?: number;    // IRPJ (R$) - column 8
      pis_ret?: number;     // PIS (R$) retido - column 9
      cofins_ret?: number;  // COFINS (R$) retido - column 10
      csll_ret?: number;    // CSLL (R$) retido - column 11
      cofins?: number;      // Total retentions or legacy cofins
    }[];

    // Boleto details linked to invoice for CELESC (Etapa 6)
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
    
    // Detailed extraction logs for audit / trace mode
    debug_log?: {
      campo: string;
      valor: any;
      bloco: string;
      metodo: string;
      trecho_encontrado: string | null;
      confianca: number;
      pagina?: number;
    }[];
  };
  dados_normalizados?: any;
  observacoes?: string;
  logs_validacao?: string[];
  historico_alteracoes?: {
    data: string;
    usuario: string;
    campo: string;
    antes: any;
    depois: any;
  }[];
  criado_em: string;
  atualizado_em: string;
  
  // High-Fidelity traceability parameters for batch imports
  numero_pagina?: number;
  posicao_na_pagina?: number;
  total_na_pagina?: number;
  posicao_no_lote?: number;
  total_no_lote?: number;
  score?: number;
}

export interface CadastroMestreUC {
  id: string;
  uc: string; // Unidade Consumidora code (e.g. "0059215242")
  codnum: string; // Codnum reference (e.g. "CELESC-PREF-101")
  concessionaria: 'CELESC' | 'CASAN';
  secretaria: string;
  unidade_administrativa: string;
  endereco: string;
  classe: string;
  grupo_tarifario: string;
  situacao: 'Ativa' | 'Inativa';
  criado_em: string;
  atualizado_em?: string;
}
