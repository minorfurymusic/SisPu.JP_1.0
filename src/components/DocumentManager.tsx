import React, { useState, useEffect } from "react";
import { 
  FileText, Upload, CheckCircle2, AlertTriangle, Play, Save, 
  History, Check, RefreshCw, FileCode, Landmark, Eye, EyeOff,
  ZoomIn, ZoomOut, RotateCw, RotateCcw, ChevronLeft, ChevronRight,
  Maximize2, Trash2, Edit2, Columns, Settings, Sliders, Info, FileImage, Clipboard,
  Search, Plus, Copy, AlertCircle, CheckCircle, Calendar
} from "lucide-react";
import { DocumentoProcessado, DocumentLayoutType, CadastroMestreUC } from "../types";
import { 
  identifyDocumentType, 
  splitReportIntoFaturas, 
  runDeterministicParser,
  extrairTodasUCsCelesc,
  segmentarCelescPorUCs
} from "../utils/documentParser";
import { extractTextFromPdfFile, convertTextToPaginas } from "../utils/pdfExtractor";

export function computeEnergiaInjetada(itens: any[]): number {
  if (!itens || !Array.isArray(itens)) return 0;
  const injetadaItems = itens.filter(it => /INJETAD[AO]|GERAÇ[AÃ]O|GERAC[AÃ]O/i.test(it.descricao || ""));
  if (injetadaItems.length === 0) return 0;

  const teInjetada = injetadaItems.filter(it => /\bTE\b/i.test(it.descricao));
  if (teInjetada.length > 0) {
    return teInjetada.reduce((sum, it) => sum + Math.abs(Number(it.quantidade || 0)), 0);
  }
  const tusdInjetada = injetadaItems.filter(it => /\bTUSD\b/i.test(it.descricao));
  if (tusdInjetada.length > 0) {
    return tusdInjetada.reduce((sum, it) => sum + Math.abs(Number(it.quantidade || 0)), 0);
  }

  const seen = new Set<string>();
  let total = 0;
  for (const it of injetadaItems) {
    const qty = Math.abs(Number(it.quantidade || 0));
    const descClean = (it.descricao || "").toLowerCase().replace(/\b(te|tusd)\b/gi, "").trim();
    const key = `${descClean}_${qty.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      total += qty;
    }
  }
  return total;
}

export const DEFAULT_MASTER_UCS: CadastroMestreUC[] = [
  {
    id: "UC-01",
    uc: "CELESC-PREF-101",
    codnum: "CELESC-PREF-101",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Administração",
    unidade_administrativa: "Prédio da Prefeitura Principal",
    endereco: "Praça dos Três Poderes, 100",
    classe: "Poder Público",
    grupo_tarifario: "B3",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-02",
    uc: "CELESC-SEC-101",
    codnum: "CELESC-SEC-101",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Educação",
    unidade_administrativa: "Escola Básica Municipal Getúlio Vargas",
    endereco: "Rua das Flores, 450",
    classe: "Poder Público",
    grupo_tarifario: "B3",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-03",
    uc: "CELESC-SEC-102",
    codnum: "CELESC-SEC-102",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Saúde",
    unidade_administrativa: "Unidade de Pronto Atendimento (UPA) 24h",
    endereco: "Avenida Marechal Deodoro, 1200",
    classe: "Poder Público",
    grupo_tarifario: "A4",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-04",
    uc: "CELESC-SEC-103",
    codnum: "CELESC-SEC-103",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Infraestrutura",
    unidade_administrativa: "Garagem Municipal e Oficina",
    endereco: "Rua Industrial, 75",
    classe: "Poder Público",
    grupo_tarifario: "B3",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-05",
    uc: "CELESC-SEC-104",
    codnum: "CELESC-SEC-104",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Assistência Social",
    unidade_administrativa: "CRAS Central",
    endereco: "Rua XV de Novembro, 300",
    classe: "Poder Público",
    grupo_tarifario: "B3",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-06",
    uc: "CELESC-SEC-105",
    codnum: "CELESC-SEC-105",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Cultura, Esporte e Turismo",
    unidade_administrativa: "Ginásio de Esportes Municipal",
    endereco: "Avenida Beira Rio, S/N",
    classe: "Poder Público",
    grupo_tarifario: "A4",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-07",
    uc: "0059215242",
    codnum: "0059215242",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Planejamento",
    unidade_administrativa: "Anexo Administrativo II",
    endereco: "Rua Saldanha Marinho, 88",
    classe: "Poder Público",
    grupo_tarifario: "B3",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-08",
    uc: "0045538486",
    codnum: "0045538486",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Desenvolvimento Urbano",
    unidade_administrativa: "Diretoria de Habitação",
    endereco: "Rua do Bosque, 12",
    classe: "Poder Público",
    grupo_tarifario: "B3",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "UC-09",
    uc: "CELESC-VAL-201",
    codnum: "CELESC-VAL-201",
    concessionaria: "CELESC",
    secretaria: "Secretaria de Agricultura",
    unidade_administrativa: "Vila Germânica Eventos",
    endereco: "Parque de Exposições, Bloco A",
    classe: "Poder Público",
    grupo_tarifario: "B3",
    situacao: "Ativa",
    criado_em: "2026-01-01T00:00:00.000Z"
  }
];

// High-fidelity templates of invoices for realistic and robust mock-up processing
const MOCK_SAMPLES = {
  CELESC_FATURA: {
    nome: "fatura_celesc_individual_vargem_062026.txt",
    layout: "CELESC_FATURA" as DocumentLayoutType,
    tamanho: 4230,
    paginas: 1,
    conteudo: `========================================================================
CELESC DISTRIBUICAO S.A. - CNPJ 08.336.783/0001-90
AV. ITAMARATI, 160 - FLORIANOPOLIS - SC
========================================================================
FATURA DE ENERGIA ELETRICA - SERIE C
DATA DE EMISSAO: 10/06/2026
PAGINA: 1 DE 1

DADOS DO CLIENTE E UNIDADE CONSUMIDORA:
NOME: PREFEITURA MUNICIPAL - SEDE
ENDERECO: PRACA DOS TRES PODERES, 100 - CENTRO
CODNUM / UC: CELESC-PREF-101
NRO DO MEDIDOR: 928371-3

COMPETENCIA DE REFERENCIA: 06/2026
VENCIMENTO: 25/06/2026

------------------------------------------------------------------------
DEMONSTRATIVO DE CONSUMO E VALORES:
LEITURA ANTERIOR: 24900 kWh (09/05/2026)
LEITURA ATUAL:    26250 kWh (09/06/2026)
CONSUMO MEDIDO:   1350 kWh

VALOR DO CONSUMO ATIVO:                R$ 1.260,38
VALOR TRIBUTOS (ICMS 25%):             R$ 315,10
COSIP (CONTR. ILUM. PUBLICA):          R$ 105,02
DIVERSOS / BANDEIRA TARIFARIA:         R$ 0,00
CREDITOS / AJUSTES:                    R$ 0,00

------------------------------------------------------------------------
TOTAL A PAGAR:                         R$ 1.680,50
========================================================================
AUTENTICACAO FISCAL: 2831.9A82.1F33.DE94.2206.BA90
========================================================================`
  },
  CASAN_FATURA: {
    nome: "fatura_casan_posto_saude_062026.txt",
    layout: "CASAN_FATURA" as DocumentLayoutType,
    tamanho: 3890,
    paginas: 1,
    conteudo: `========================================================================
CASAN - CIA CATARINENSE DE AGUAS E SANEAMENTO - CNPJ 82.508.433/0001-17
RUA EMILIO BLUM, 83 - FLORIANOPOLIS - SC
========================================================================
DOCUMENTO DE FATURAMENTO DE AGUA E ESGOTO
DATA DA LEITURA: 13/06/2026
PAGINA: 1 DE 1

DADOS DA CONEXAO:
CONCESSIONARIO: MUNICIPIO DE SISPU
UNIDADE: POSTO DE SAUDE CENTRAL - SECRETARIA DE SAUDE
CODNUM / UC: CASAN-POSTO-401
NRO DO HIDROMETRO (MEDIDOR): 11294-08

COMPETENCIA DE REFERENCIA: 06/2026

------------------------------------------------------------------------
DEMONSTRATIVO DE LEITURA E CONSUMO:
LEITURA HIDROMETRO ANTERIOR: 3810 m3
LEITURA HIDROMETRO ATUAL:    3852 m3
CONSUMO TOTAL MEDIDO:        42 m3

TARIFAS:
TARIFA DE AGUA (MINIMA + CONSUMO):     R$ 310,20
TARIFA DE ESGOTO (100% DA AGUA):       R$ 310,20
DIVERSOS / OUTRAS TAXAS:               R$ 0,00
DESCONTOS E CREDITOS:                  R$ 0,00

------------------------------------------------------------------------
TOTAL A PAGAR:                         R$ 620,40
========================================================================`
  },
  CELESC_RELATORIO: {
    nome: "relatorio_celesc_coletivo_lote_maio2026.txt",
    layout: "CELESC_RELATORIO" as DocumentLayoutType,
    tamanho: 5120,
    paginas: 5,
    conteudo: `========================================================================
CELESC DISTRIBUICAO S.A. - RELATORIO DE COMPROVACAO DE DEBITOS
CONTRATO DE FATURAMENTO COLETIVO PUBLICO NRO 2026-991A
========================================================================
UNIDADE GESTORA: PREFEITURA MUNICIPAL - SECRETARIA DE ADMINISTRACAO
COMPETENCIA (MES/ANO): 05/2026
PAGINAS DO RELATORIO: 1 de 170

RESUMO DA FATURA DETALHADA POR PONTO DE ENTREGA:

PONTO 001 - SEDE PREFEITURA (CODNUM: CELESC-PREF-101)
MEDIDOR NRO: 928371-3
CONSUMO MEDIDO: 1240.50 kWh
VALOR FATURADO ATIVO:   R$ 1.155,15
IMPOSTOS / ICMS / PIS:  R$ 288,80
CONTRIBUICAO COSIP:     R$ 96,25
SUBTOTAL:               R$ 1.540,20

PONTO 002 - ANEXO ADMINISTRATIVO I (CODNUM: CELESC-ANEXO-102)
MEDIDOR NRO: 512498-6
CONSUMO MEDIDO: 890.00 kWh
VALOR FATURADO ATIVO:   R$ 820.00
IMPOSTOS / ICMS / PIS:  R$ 205.00
CONTRIBUICAO COSIP:     R$ 75.00
SUBTOTAL:               R$ 1.100.00

PONTO 003 - ESCOLA CASTELO BRANCO (CODNUM: CELESC-ESCOLA-301)
MEDIDOR NRO: 512498-6
CONSUMO MEDIDO: 2450.00 kWh
VALOR FATURADO ATIVO:   R$ 2.100.00
IMPOSTOS / ICMS / PIS:  R$ 525.00
CONTRIBUICAO COSIP:     R$ 120.00
SUBTOTAL:               R$ 2.745.00

PONTO 004 - POSTO DE SAÚDE CENTRAL (CODNUM: CASAN-POSTO-401)
MEDIDOR NRO: 334411-9
CONSUMO MEDIDO: 1540.00 kWh
VALOR FATURADO ATIVO:   R$ 1.350.00
IMPOSTOS / ICMS / PIS:  R$ 337.50
CONTRIBUICAO COSIP:     R$ 90.00
SUBTOTAL:               R$ 1.777.50

PONTO 005 - GARAGEM MUNICIPAL (CODNUM: CELESC-PREF-101)
MEDIDOR NRO: 998877-2
CONSUMO MEDIDO: 620.00 kWh
VALOR FATURADO ATIVO:   R$ 540.00
IMPOSTOS / ICMS / PIS:  R$ 135.00
CONTRIBUICAO COSIP:     R$ 45.00
SUBTOTAL:               R$ 720.00

------------------------------------------------------------------------
VALOR TOTAL DO LOTE RESUMIDO:          R$ 7.882,70
========================================================================`
  },
  CASAN_RELATORIO: {
    nome: "relatorio_casan_coletivo_lote_junho2026.txt",
    layout: "CASAN_RELATORIO" as DocumentLayoutType,
    tamanho: 4850,
    paginas: 3,
    conteudo: `========================================================================
CASAN - COMPILADO COLETIVO DE FATURAMENTO PUBLICO
CONTRATO COLETIVO: SC-9918-SISPU
========================================================================
COMPETENCIA: 06/2026
VENCIMENTO: 28/06/2026
PAGINAS DO RELATORIO: 1 de 85

REGISTRO DE CONSUMOS CONSOLIDADOS POR HIDROMETRO:

UC DEBITO: CASAN-PREF-101 (SEDE PREFEITURA MUNICIPAL)
MEDIDOR NRO: 34918-02
CONSUMO DE AGUA: 60 m3
VALOR AGUA:   R$ 440,00
VALOR ESGOTO: R$ 440,00
VALOR IMPOSTOS / COFINS / TRIBUTOS: R$ 220,80
VALOR CREDITOS: R$ 0,00
SUBTOTAL: R$ 1.100,80

UC DEBITO: CASAN-POSTO-401 (POSTO DE SAUDE CENTRAL)
MEDIDOR NRO: 11294-08
CONSUMO DE AGUA: 42 m3
VALOR AGUA:   R$ 310,20
VALOR ESGOTO: R$ 310,20
VALOR IMPOSTOS / COFINS / TRIBUTOS: R$ 124,08
VALOR CREDITOS: R$ 0,00
SUBTOTAL: R$ 620,40

UC DEBITO: CASAN-POSTO-401 (POSTO DE SAUDE CENTRAL)
MEDIDOR NRO: 77889-11
CONSUMO DE AGUA: 28 m3
VALOR AGUA:   R$ 190,00
VALOR ESGOTO: R$ 190,00
VALOR IMPOSTOS / COFINS / TRIBUTOS: R$ 76,00
VALOR CREDITOS: R$ 0,00
SUBTOTAL: R$ 380,00

------------------------------------------------------------------------
VALOR TOTAL DO LOTE CASAN:             R$ 2.101,20
========================================================================`
  }
};

function evalConsistencias(doc: DocumentoProcessado): string[] {
  const alerts: string[] = [];
  const ext = doc.dados_extraidos as any;
  const itens = (ext.itens_fatura || []) as any[];
  
  // 1. Energia Reativa encontrada
  const temReativa = itens.some(it => String(it.descricao).toLowerCase().includes("reativa"));
  if (temReativa) {
    alerts.push("⚠️ Alerta: Energia Reativa excedente detectada.");
  }
  
  // 2. Demanda ultrapassada
  const temUltrapassagem = itens.some(it => String(it.descricao).toLowerCase().includes("ultrapassagem") || String(it.descricao).toLowerCase().includes("dmcr"));
  if (temUltrapassagem) {
    alerts.push("⚠️ Alerta: Demanda de potência contratada ultrapassada.");
  }
  
  // 3. Consumo zerado
  if (ext.consumo === 0) {
    alerts.push("⚠️ Alerta: Consumo financeiro zerado no período.");
  }
  
  // 4. Valor incompatível (if sum of items differs from valor_total)
  const sumItens = itens.reduce((acc, it) => acc + (parseFloat(String(it.valor)) || 0), 0);
  if (Math.abs(sumItens - ext.valor_total) > 0.10) {
    alerts.push(`❌ Alerta: Valor total (R$ ${ext.valor_total.toFixed(2)}) diverge da soma dos itens da fatura (R$ ${sumItens.toFixed(2)}).`);
  }
  
  // 5. UC não cadastrada (mock simulation)
  if (!ext.codigo_numero || (ext.codigo_numero.includes("PREF-101") && doc.layout.includes("CASAN"))) {
    alerts.push("⚠️ Alerta: Unidade Consumidora não pré-cadastrada no SISPU.");
  }
  
  // 6. Competência divergente
  if (ext.mes_ano && !String(ext.mes_ano).includes("2026")) {
    alerts.push("⚠️ Alerta: Competência de faturamento divergente do ano corrente.");
  }
  
  // 7. Leitura ausente
  if (ext.leitura_anterior === undefined || ext.leitura_atual === undefined || (ext.leitura_anterior === 0 && ext.leitura_atual === 0)) {
    alerts.push("⚠️ Alerta: Leituras do medidor (Anterior/Atual) ausentes ou zeradas.");
  }

  // Fallback to logs_validacao if none
  if (alerts.length === 0 && doc.logs_validacao) {
    return doc.logs_validacao;
  }
  
  return alerts;
}

interface DocumentManagerProps {
  onDocumentProcessed?: () => void;
  currentUser?: string;
  initialMode?: "PDF" | "IMAGE" | "REPORT" | "MANUAL";
}

export default function DocumentManager({ onDocumentProcessed, currentUser = "admin", initialMode = "PDF" }: DocumentManagerProps) {
  const [activeImportMode, setActiveImportMode] = useState<"PDF" | "IMAGE" | "REPORT" | "MANUAL" | "CADASTRO">(initialMode as any);
  const [dragActive, setDragActive] = useState(false);
  const [customText, setCustomText] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Pipeline-queue states for asynchronously processing multi-document/large reports
  const [processingQueue, setProcessingQueue] = useState<boolean>(false);
  const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0, phase: "" });
  const [sessionDocs, setSessionDocs] = useState<DocumentoProcessado[]>([]);

  // Batch Competência state & Manual entry form states requested by user
  const [batchCompetencia, setBatchCompetencia] = useState<string>("06/2026");
  const [manualUc, setManualUc] = useState("");
  const [manualCompetencia, setManualCompetencia] = useState("06/2026");
  const [manualConsumo, setManualConsumo] = useState("");
  const [manualValorTotal, setManualValorTotal] = useState("");
  const [manualImposto, setManualImposto] = useState("");

  const parseCompetenciaToIso = (input: string): string => {
    const clean = input.trim();
    if (!clean) return "2026-06-01";
    if (clean.includes("/")) {
      const parts = clean.split("/");
      if (parts.length === 2) {
        let m = parts[0].padStart(2, '0');
        let y = parts[1];
        if (y.length === 2) y = "20" + y;
        return `${y}-${m}-01`;
      }
    }
    if (clean.includes("-")) {
      const parts = clean.split("-");
      if (parts.length === 2) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-01`;
      }
      if (parts.length === 3) {
        return clean;
      }
    }
    return "2026-06-01";
  };

  const applyBatchCompetencia = () => {
    if (sessionDocs.length === 0) {
      setMessage({ type: 'warning', text: "Nenhum lote carregado para aplicar o Mês Competência." });
      return;
    }
    const isoDate = parseCompetenciaToIso(batchCompetencia);
    const parts = isoDate.split("-");
    const formattedDisplay = `${parts[1]}/${parts[0]}`;

    setSessionDocs(prev => prev.map(doc => ({
      ...doc,
      dados_extraidos: {
        ...doc.dados_extraidos,
        mes_ano: isoDate
      }
    })));

    setMessage({
      type: 'success',
      text: `Mês Competência "${formattedDisplay}" (${isoDate}) aplicado com sucesso a todos os ${sessionDocs.length} lançamentos do lote.`
    });
  };

  const handleSaveManualLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUc || !manualCompetencia || !manualValorTotal) {
      setMessage({ type: "error", text: "Preencha a UC/CODNUM, Mês Competência e Valor Total." });
      return;
    }

    setLoading(true);
    try {
      const isoDate = parseCompetenciaToIso(manualCompetencia);
      
      const res = await fetch("/api/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_arquivo: `Lançamento Manual - ${manualUc} (${manualCompetencia})`,
          layout: manualUc.includes("CASAN") ? "CASAN_FATURA" : "CELESC_FATURA",
          tamanho: 0,
          origem_conteudo: "DIGITACAO_MANUAL",
          dados_extraidos: {
            codigo_numero: manualUc,
            mes_ano: isoDate,
            consumo: parseFloat(manualConsumo || "0"),
            valor_total: parseFloat(manualValorTotal || "0"),
            valor_imposto: parseFloat(manualImposto || "0"),
            valor_celular: 0,
            valor_internet: 0,
            valor_diversos: 0,
            valor_linha_privada: 0,
            valor_credito: 0
          }
        })
      });

      if (res.ok) {
        const dbDoc = await res.json();
        const homolRes = await fetch(`/api/documentos/${dbDoc.id}/homologar`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-user": currentUser
          }
        });

        if (homolRes.ok) {
          setMessage({
            type: "success",
            text: `Lançamento manual para UC "${manualUc}" competência ${manualCompetencia} salvo e classificado por mês com sucesso!`
          });
          setManualUc("");
          setManualConsumo("");
          setManualValorTotal("");
          setManualImposto("");
          if (onDocumentProcessed) onDocumentProcessed();
        } else {
          const err = await homolRes.json();
          setMessage({ type: "error", text: `Erro ao homologar lançamento: ${err.error || err.message}` });
        }
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: `Erro ao criar documento: ${err.error || err.message}` });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: `Erro de gravação manual: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Master Registry of UCs (Etapa 1)
  const [masterUcs, setMasterUcs] = useState<CadastroMestreUC[]>(() => {
    const saved = localStorage.getItem("sispu_cadastro_mestre_ucs");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return DEFAULT_MASTER_UCS;
  });

  const saveMasterUcs = (newUcs: CadastroMestreUC[]) => {
    setMasterUcs(newUcs);
    localStorage.setItem("sispu_cadastro_mestre_ucs", JSON.stringify(newUcs));
  };

  // State to hold comparison data (Etapa 3)
  const [lastComparison, setLastComparison] = useState<{
    found: string[];
    newUcs: string[];
    missing: string[];
  } | null>(null);

  // Technical logs and pre-conference summary states (Etapas 7, 10)
  const [technicalLogs, setTechnicalLogs] = useState<string[]>([]);
  const [showSummaryScreen, setShowSummaryScreen] = useState<boolean>(false);
  const [loteSummary, setLoteSummary] = useState<{
    nomeArquivo: string;
    totalPaginas: number;
    totalFaturas: number;
    validas: number;
    duplicadas: number;
    invalidas: number;
  } | null>(null);

  // Form states for creating a new Master UC (Etapa 1)
  const [showAddUcForm, setShowAddUcForm] = useState(false);
  const [newUcData, setNewUcData] = useState({
    uc: "",
    codnum: "",
    concessionaria: "CELESC" as 'CELESC' | 'CASAN',
    secretaria: "",
    unidade_administrativa: "",
    endereco: "",
    classe: "Público / Governamental",
    grupo_tarifario: "B3",
    situacao: "Ativa" as 'Ativa' | 'Inativa'
  });
  const [ucSearchQuery, setUcSearchQuery] = useState("");

  const handleAddUc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUcData.uc || !newUcData.codnum) {
      alert("Por favor, preencha a UC e o CODNUM.");
      return;
    }
    
    // Check if already exists
    if (masterUcs.some(u => u.uc === newUcData.uc)) {
      alert("Esta UC já está cadastrada no Cadastro Mestre.");
      return;
    }

    const created: CadastroMestreUC = {
      id: `UC-${Date.now()}`,
      ...newUcData,
      criado_em: new Date().toISOString()
    };

    saveMasterUcs([...masterUcs, created]);
    setShowAddUcForm(false);
    setNewUcData({
      uc: "",
      codnum: "",
      concessionaria: "CELESC",
      secretaria: "",
      unidade_administrativa: "",
      endereco: "",
      classe: "Público / Governamental",
      grupo_tarifario: "B3",
      situacao: "Ativa"
    });
    setMessage({ type: 'success', text: `Unidade Consumidora ${created.uc} cadastrada com sucesso no cadastro permanente.` });
  };

  const handleToggleUcStatus = (id: string) => {
    const updated = masterUcs.map(u => {
      if (u.id === id) {
        return { ...u, situacao: (u.situacao === 'Ativa' ? 'Inativa' : 'Ativa') as 'Ativa' | 'Inativa' };
      }
      return u;
    });
    saveMasterUcs(updated);
  };

  const handleDeleteUc = (id: string, code: string) => {
    if (confirm(`Tem certeza que deseja excluir a UC ${code} do cadastro permanente?`)) {
      const filtered = masterUcs.filter(u => u.id !== id);
      saveMasterUcs(filtered);
    }
  };

  const addLog = (msg: string) => {
    setTechnicalLogs(prev => [...prev, `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`]);
  };
  
  // Conference table and modal states
  const [activeDoc, setActiveDoc] = useState<DocumentoProcessado | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // PDF Viewer controls state
  const [pdfZoom, setPdfZoom] = useState<number>(100);
  const [pdfRotation, setPdfRotation] = useState<number>(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1);
  const [pdfSearchQuery, setPdfSearchQuery] = useState<string>("");

  // Helper to dynamically highlight search query matches in the PDF paper render
  const highlightText = (content: string | number | undefined) => {
    if (content === undefined || content === null) return "";
    const str = String(content);
    if (!pdfSearchQuery.trim()) return str;
    const cleanQuery = pdfSearchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const parts = str.split(new RegExp(`(${cleanQuery})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === pdfSearchQuery.toLowerCase() ? (
            <mark key={i} className="bg-yellow-300 text-slate-900 rounded font-bold px-0.5 animate-pulse">{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Manual fallback inputs (for manual parsing step)
  const [concessionaireDetected, setConcessionaireDetected] = useState<string>("Desconhecida");
  const [isBatchDetected, setIsBatchDetected] = useState<boolean>(false);

  // Handle Drag Events for drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Process manual or uploaded files
  const processFile = async (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setTechnicalLogs([]);
    addLog(`Iniciando importação do arquivo: ${file.name}`);
    
    // Auto-identify document type and single vs batch status
    const nameLower = file.name.toLowerCase();
    const isPdf = nameLower.endsWith(".pdf") || file.type === "application/pdf";
    let isCelesc = nameLower.includes("celesc");
    let isCasan = nameLower.includes("casan");
    let isBatch = nameLower.includes("relatorio") || nameLower.includes("coletivo") || nameLower.includes("lote");

    setConcessionaireDetected(isCelesc ? "CELESC" : isCasan ? "CASAN" : "Desconhecida");
    setIsBatchDetected(isBatch);

    if (isPdf) {
      addLog(`Tipo de arquivo identificado: PDF (Real Reader Engine)`);
      addLog(`Carregando biblioteca PDF.js para extração segura de texto...`);
      try {
        setProcessingQueue(true);
        setQueueProgress({ current: 0, total: 100, phase: "Carregando motor PDF..." });
        
        // Extract text page by page (Etapa 2)
        const pages = await extractTextFromPdfFile(file, (curr, tot) => {
          setQueueProgress({ current: Math.round((curr / tot) * 100), total: 100, phase: `Extraindo texto da página ${curr} de ${tot}...` });
          addLog(`Página ${curr} de ${tot} extraída com sucesso.`);
        });
        
        addLog(`Extração do PDF concluída com sucesso. Total de páginas extraídas: ${pages.length}`);
        
        // Join pages with form feed marker to preserve page separation
        const joinedText = pages.map(p => p.textoLimpo).join("\f");
        setCustomText(joinedText);
        setLoading(false);
        setProcessingQueue(false);
        
        setMessage({ 
          type: 'success', 
          text: `PDF "${file.name}" carregado com sucesso (${pages.length} páginas). Processando faturas...` 
        });
        
        // Start pipeline with pages count
        startPipeline(joinedText, file.name, pages.length);
      } catch (err: any) {
        addLog(`❌ Erro crítico na leitura do PDF: ${err.message}`);
        setLoading(false);
        setProcessingQueue(false);
        setMessage({ 
          type: 'error', 
          text: `Erro crítico na leitura do PDF: ${err.message}. Certifique-se de que o arquivo não está corrompido.` 
        });
      }
    } else {
      addLog(`Tipo de arquivo identificado: Texto Plano / Gabarito de Simulação`);
      addLog(`Utilizando leitor de texto do navegador...`);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string || "";
        setCustomText(text);
        addLog(`Leitura de arquivo concluída. Tamanho: ${text.length} bytes.`);
        setLoading(false);
        
        setMessage({ 
          type: 'success', 
          text: `Arquivo "${file.name}" carregado. Processamento iniciado automaticamente.` 
        });
        
        // Count approximate pages or split
        const pageCount = text.includes("\f") ? text.split("\f").length : 1;
        startPipeline(text, file.name, pageCount);
      };
      reader.readAsText(file);
    }
  };

  const loadSample = (key: keyof typeof MOCK_SAMPLES) => {
    const sample = MOCK_SAMPLES[key];
    setFileName(sample.nome);
    setCustomText(sample.conteudo);
    
    let isCelesc = sample.nome.includes("celesc");
    let isCasan = sample.nome.includes("casan");
    let isBatch = sample.nome.includes("coletivo") || sample.nome.includes("relatorio");

    setConcessionaireDetected(isCelesc ? "CELESC" : isCasan ? "CASAN" : "Desconhecida");
    setIsBatchDetected(isBatch);

    setMessage({ 
      type: 'success', 
      text: `Demonstração "${sample.nome}" carregada com sucesso! Concessionária: ${isCelesc ? 'CELESC' : 'CASAN'} | Formato: ${isBatch ? 'Relatório em Lote' : 'Individual'}` 
    });

    // Start pipeline instantly on load
    startPipeline(sample.conteudo, sample.nome);
  };

  // Main Pipeline with Queue/Batching processing and Progress UI (Etapa 7, 10)
  const startPipeline = async (textOverride?: string, fileOverride?: string, pagesCount: number = 1) => {
    const textToProcess = textOverride !== undefined ? textOverride : customText;
    const nameToProcess = fileOverride !== undefined ? fileOverride : fileName;

    if (!textToProcess) {
      setMessage({ type: 'error', text: "Por favor, selecione ou digite o conteúdo de um documento." });
      return;
    }

    setProcessingQueue(true);
    setSessionDocs([]);
    setMessage(null);
    setShowSummaryScreen(false);
    setLoteSummary(null);

    addLog(`Iniciando pipeline de processamento sintático...`);
    addLog(`Análise inicial de layout com base no texto...`);

    const docType = identifyDocumentType(textToProcess, nameToProcess);
    const isReport = docType === "CELESC_RELATORIO" || docType === "CASAN_RELATORIO" || textToProcess.includes("\f");

    // Set layout/concessionaire state
    const concessionaire = docType.includes("CELESC") ? "CELESC" : docType.includes("CASAN") ? "CASAN" : "Desconhecida";
    setConcessionaireDetected(concessionaire);

    addLog(`Concessionária inferida: ${concessionaire} | Tipo de arquivo: ${isReport ? 'Relatório/Lote' : 'Fatura Individual'}`);

    if (!isReport) {
      addLog(`Processando fatura individual determinística...`);
      setQueueProgress({ current: 0, total: 1, phase: `Analisando fatura individual...` });
      
      setTimeout(async () => {
        try {
          let parsed = runDeterministicParser(textToProcess, nameToProcess);
          if (!parsed) {
            addLog(`Parser local falhou. Tentando fallback inteligente via API...`);
            const fallbackRes = await fetch("/api/documentos/parse", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                texto_fatura: textToProcess,
                layout: concessionaire === "CELESC" ? "CELESC_FATURA" : "CASAN_FATURA",
                nome_arquivo: nameToProcess
              })
            });
            if (fallbackRes.ok) {
              parsed = await fallbackRes.json();
              addLog(`Parser inteligente via API concluiu com sucesso.`);
            } else {
              throw new Error("Falha no parser inteligente.");
            }
          } else {
            addLog(`Parser local determinístico concluído com sucesso.`);
          }

          const logs: string[] = [];
          if (!parsed.valor_total || parsed.valor_total <= 0) {
            logs.push("❌ Valor total é nulo ou inconsistente.");
          }

          const newDoc: DocumentoProcessado = {
            id: `DOC-IND-${Date.now()}-1`,
            nome_arquivo: nameToProcess,
            layout: concessionaire === "CELESC" ? "CELESC_FATURA" : "CASAN_FATURA",
            tamanho: textToProcess.length,
            status: logs.some(l => l.includes('❌')) ? 'NORMALIZADO' : 'VALIDADO',
            origem_conteudo: textToProcess,
            dados_extraidos: {
              mes_ano: parsed.mes_ano || "2026-06-01",
              consumo: parsed.consumo || 0,
              valor_total: parsed.valor_total || 0,
              valor_imposto: parsed.valor_imposto || 0,
              valor_celular: 0,
              valor_internet: 0,
              valor_diversos: parsed.valor_diversos || 0,
              valor_linha_privada: 0,
              valor_credito: parsed.valor_credito || 0,
              codigo_numero: parsed.codigo_numero || "DESCONHECIDO",
              medidor: parsed.medidor || "N/A"
            },
            logs_validacao: logs,
            historico_alteracoes: [],
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            numero_pagina: 1,
            posicao_na_pagina: 1,
            total_na_pagina: 1,
            posicao_no_lote: 1,
            total_no_lote: 1,
            score: 100
          };

          setSessionDocs([newDoc]);
          setQueueProgress({ current: 1, total: 1, phase: "Concluído!" });
          setMessage({ type: 'success', text: "Fatura individual identificada e processada com sucesso!" });
          addLog(`Lançamento individual gerado. UC/Matrícula: ${newDoc.dados_extraidos.codigo_numero}`);

          // Auto-open conference modal for individual invoice
          setActiveDoc({ ...newDoc });
          setPdfCurrentPage(1);
          setPdfSearchQuery("");
          setIsModalOpen(true);
        } catch (err: any) {
          addLog(`❌ Erro no processamento individual: ${err.message}`);
          setMessage({ type: 'error', text: `Erro durante processamento: ${err.message}` });
        } finally {
          setProcessingQueue(false);
        }
      }, 500);

      return;
    }

    // --- BATCH PROCESSING FROM REPORT ---
    addLog(`Iniciando segmentação de páginas do relatório em lote...`);
    const segmentedFaturas = splitReportIntoFaturas(textToProcess, nameToProcess);
    const totalSegments = segmentedFaturas.length;

    let missingUcsList: string[] = [];
    if (concessionaire === "CELESC") {
      const foundUcs = extrairTodasUCsCelesc(textToProcess);
      const registeredActiveUcs = masterUcs.filter(u => u.situacao === 'Ativa').map(u => u.uc);
      const foundSet = new Set(foundUcs);
      const registeredActiveSet = new Set(registeredActiveUcs);

      const foundRegistered = foundUcs.filter(uc => registeredActiveSet.has(uc));
      const newUcs = foundUcs.filter(uc => !registeredActiveSet.has(uc));
      const missingUcs = registeredActiveUcs.filter(uc => !foundSet.has(uc));
      missingUcsList = missingUcs;

      setLastComparison({
        found: foundRegistered,
        newUcs,
        missing: missingUcs
      });

      addLog(`[Comparação Mestre] Concluída. Cadastradas encontradas: ${foundRegistered.length} | Novas: ${newUcs.length} | Ausentes/Alerta: ${missingUcs.length}`);
    } else {
      setLastComparison(null);
    }

    addLog(`Segmentação concluída. Localizadas: ${totalSegments} faturas em todo o lote.`);

    if (totalSegments === 0) {
      addLog(`❌ Erro: Nenhuma fatura/ponto pôde ser localizado nos dados segmentados.`);
      setProcessingQueue(false);
      setMessage({ type: 'error', text: "Nenhuma fatura pôde ser localizada no relatório." });
      return;
    }

    setQueueProgress({ current: 0, total: totalSegments, phase: `Relatório identificado. Localizadas: ${totalSegments} faturas.` });

    const docObjects: DocumentoProcessado[] = [];
    let currentIndex = 0;

    const processNextChunk = () => {
      // Process 5 faturas at a time
      const chunkSize = Math.min(5, totalSegments - currentIndex);

      for (let k = 0; k < chunkSize; k++) {
        const idx = currentIndex + k;
        const seg = segmentedFaturas[idx];

        const logs: string[] = [];
        if (!seg.dados_extraidos.valor_total || seg.dados_extraidos.valor_total <= 0) {
          logs.push("❌ Valor total é nulo ou inconsistente.");
        }
        if (!seg.dados_extraidos.consumo || seg.dados_extraidos.consumo <= 0) {
          logs.push("⚠️ Consumo de medição zerado ou ausente.");
        }

        const newDoc: DocumentoProcessado = {
          id: `DOC-LOTE-${Date.now()}-${idx + 1}`,
          nome_arquivo: seg.nome_arquivo,
          layout: seg.layout,
          tamanho: seg.tamanho,
          status: logs.some(l => l.includes('❌')) ? 'NORMALIZADO' : 'VALIDADO',
          origem_conteudo: seg.origem_conteudo,
          dados_extraidos: {
            ...seg.dados_extraidos,
            valor_celular: 0,
            valor_internet: 0,
            valor_diversos: seg.dados_extraidos.valor_diversos || 0,
            valor_linha_privada: 0,
            valor_credito: seg.dados_extraidos.valor_credito || 0
          },
          logs_validacao: logs,
          historico_alteracoes: [],
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
          numero_pagina: seg.numero_pagina || 1,
          posicao_na_pagina: seg.posicao_na_pagina || 1,
          total_na_pagina: seg.total_na_pagina || 1,
          posicao_no_lote: seg.posicao_no_lote || (idx + 1),
          total_no_lote: seg.total_no_lote || totalSegments,
          score: seg.score || 100
        };

        if (seg.scoreLogs && seg.scoreLogs.length > 0) {
          addLog(`[Fatura ${idx + 1}] Classificação Score: ${seg.score}/100. Detalhes: ${seg.scoreLogs[seg.scoreLogs.length - 1]}`);
        }

        docObjects.push(newDoc);
      }

      currentIndex += chunkSize;
      setQueueProgress({
        current: currentIndex,
        total: totalSegments,
        phase: `Processando faturas: ${currentIndex} de ${totalSegments}...`
      });

      if (currentIndex < totalSegments) {
        setTimeout(processNextChunk, 35);
      } else {
        // Complete batch (Etapa 7 & 8)
        addLog(`Todas as faturas foram normalizadas e estruturadas em memória.`);

        // Append simulated documents for missing UCs (Etapa 3)
        if (concessionaire === "CELESC" && missingUcsList.length > 0) {
          addLog(`Criando alertas para ${missingUcsList.length} UCs ausentes...`);
          missingUcsList.forEach((uc, mIdx) => {
            const matchedMaster = masterUcs.find(u => u.uc === uc);
            const simulatedDoc: DocumentoProcessado = {
              id: `DOC-AUSENTE-${uc}-${Date.now()}`,
              nome_arquivo: `${nameToProcess} (ALERTA: UC ${uc} AUSENTE)`,
              layout: "CELESC_FATURA",
              tamanho: 0,
              status: "IGNORADA", // Styled as warning, no financial launch created, saved is disabled or bypassed
              origem_conteudo: "",
              dados_extraidos: {
                mes_ano: docObjects[0]?.dados_extraidos.mes_ano || "2026-06-01", 
                consumo: 0,
                valor_total: 0,
                valor_imposto: 0,
                valor_diversos: 0,
                valor_credito: 0,
                codigo_numero: uc,
                medidor: "N/A",
                unidade_nome: matchedMaster ? matchedMaster.unidade_administrativa : "N/A",
                endereco: matchedMaster ? matchedMaster.endereco : "N/A",
                classe: matchedMaster ? matchedMaster.classe : "N/A",
                grupo_tarifario: matchedMaster ? matchedMaster.grupo_tarifario : "N/A",
                isAusente: true // Custom flag
              } as any,
              logs_validacao: [`🔴 Alerta: Esta UC está cadastrada e ativa no cadastro mestre, mas NÃO apareceu neste relatório!`],
              historico_alteracoes: [],
              criado_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString(),
              numero_pagina: 999,
              posicao_na_pagina: mIdx + 1,
              total_na_pagina: missingUcsList.length,
              posicao_no_lote: totalSegments + mIdx + 1,
              total_no_lote: totalSegments + missingUcsList.length,
              score: 100
            };
            docObjects.push(simulatedDoc);
          });
        }

        addLog(`Iniciando validação de consistência e descarte de duplicidades...`);

        // Check for duplicate UC in the same month inside current batch
        const seen = new Set<string>();
        let validas = 0;
        let duplicadas = 0;
        let invalidas = 0;

        docObjects.forEach((doc, dIdx) => {
          const key = `${doc.dados_extraidos.codigo_numero}-${doc.dados_extraidos.mes_ano}`;
          const hasError = doc.logs_validacao?.some(l => l.includes('❌'));
          const isAusente = (doc.dados_extraidos as any).isAusente;

          if (isAusente) {
            // Missing UCs do not count as valid or invalid financial launches
            return;
          }

          if (hasError) {
            invalidas++;
            addLog(`[Inconsistência] Lançamento ${dIdx + 1} possui erros críticos de preenchimento.`);
          } else if (seen.has(key)) {
            duplicadas++;
            doc.status = 'NORMALIZADO';
            if (!doc.logs_validacao) doc.logs_validacao = [];
            doc.logs_validacao.push("❌ Fatura duplicada detectada para UC/Matrícula no mesmo período.");
            addLog(`[Duplicidade] Lançamento ${dIdx + 1} (UC/Matrícula ${doc.dados_extraidos.codigo_numero}) já existe na fila.`);
          } else {
            validas++;
            seen.add(key);
          }
        });

        const summaryData = {
          nomeArquivo: nameToProcess,
          totalPaginas: pagesCount,
          totalFaturas: totalSegments,
          validas,
          duplicadas,
          invalidas
        };

        setLoteSummary(summaryData);
        setSessionDocs(docObjects);
        setProcessingQueue(false);
        setShowSummaryScreen(true); // Open the pre-conference summary screen first!

        addLog(`Engine de Importação concluída.`);
        addLog(`Páginas do relatório lidas: ${pagesCount}`);
        addLog(`Total faturas extraídas: ${totalSegments}`);
        addLog(`Válidas: ${validas} | Duplicadas: ${duplicadas} | Inconsistentes: ${invalidas}`);
        addLog(`Pronto para a conferência visual.`);
      }
    };

    // Begin processing
    setTimeout(processNextChunk, 200);
  };

  // Open Document in Modal for double-click or edit action
  const handleDocEdit = (doc: DocumentoProcessado) => {
    const docToEdit = { ...doc };
    const itens = docToEdit.dados_extraidos.itens_fatura || [];

    if (itens.length > 0) {
      let totalImposto = 0;
      let totalRetencoes = 0;

      itens.forEach(it => {
        const icmsVal = Number(it.icms || 0);
        const pisVal = Number(it.pis || 0);
        
        const irpjVal = Number(it.irpj_val || 0);
        const pisRet = Number(it.pis_ret || 0);
        const cofinsRet = Number(it.cofins_ret || 0);
        const csllRet = Number(it.csll_ret || 0);
        const legacyRet = Number(it.cofins || 0);
        const itemVal = Number(it.valor || 0);

        const retVal = (irpjVal || pisRet || cofinsRet || csllRet) 
          ? (irpjVal + pisRet + cofinsRet + csllRet) 
          : legacyRet;

        totalImposto += (icmsVal + pisVal);
        if (retVal !== 0) {
          totalRetencoes += retVal;
        } else if (itemVal < 0) {
          totalRetencoes += itemVal;
        }
      });

      if (totalImposto > 0) {
        docToEdit.dados_extraidos.valor_imposto = parseFloat(totalImposto.toFixed(2));
      }
      if (docToEdit.dados_extraidos.valor_credito === undefined || docToEdit.dados_extraidos.valor_credito === 0) {
        docToEdit.dados_extraidos.valor_credito = parseFloat(totalRetencoes.toFixed(2));
      }
    }

    setActiveDoc(docToEdit);
    setPdfCurrentPage(1);
    setIsModalOpen(true);
  };

  // Handle cell edit inside double-clicked Modal
  const handleFieldChange = (field: string, val: any) => {
    if (!activeDoc) return;
    const isNumber = ['consumo', 'valor_total', 'valor_imposto', 'valor_celular', 'valor_internet', 'valor_diversos', 'valor_linha_privada', 'valor_credito', 'leitura_anterior', 'leitura_atual', 'dias_faturados'].includes(field);
    const updatedValue = isNumber ? parseFloat(val || 0) : val;

    const oldVal = (activeDoc.dados_extraidos as any)[field];
    if (oldVal === updatedValue) return;

    const history = activeDoc.historico_alteracoes || [];
    history.push({
      data: new Date().toISOString(),
      usuario: currentUser,
      campo: field,
      antes: oldVal !== undefined ? String(oldVal) : "Nulo",
      depois: String(updatedValue)
    });

    const updatedExtracted = {
      ...activeDoc.dados_extraidos,
      [field]: updatedValue
    };

    // Re-validate instantly
    const logs: string[] = [];
    if (updatedExtracted.valor_total <= 0) {
      logs.push("❌ Valor total é nulo ou inconsistente.");
    }
    if (updatedExtracted.consumo <= 0) {
      logs.push("⚠️ Consumo de medição zerado ou ausente.");
    }

    setActiveDoc({
      ...activeDoc,
      dados_extraidos: updatedExtracted,
      status: logs.some(l => l.includes('❌')) ? 'NORMALIZADO' : 'VALIDADO',
      logs_validacao: logs,
      historico_alteracoes: history,
      atualizado_em: new Date().toISOString()
    });
  };

  // Recalculates document totals based on activeDoc items list changes (Block 2 & 3 & 4 rule implementation)
  const recalculateDocTotals = (updatedItens: any[]) => {
    if (!activeDoc) return;

    let totalValue = 0;
    let totalImposto = 0;
    let totalRetencoes = 0;

    updatedItens.forEach(it => {
      const val = Number(it.valor || 0);
      const icmsVal = Number(it.icms || 0);
      const pisVal = Number(it.pis || 0);

      const irpjVal = Number(it.irpj_val || 0);
      const pisRet = Number(it.pis_ret || 0);
      const cofinsRet = Number(it.cofins_ret || 0);
      const csllRet = Number(it.csll_ret || 0);
      const legacyRet = Number(it.cofins || 0);

      const retVal = (irpjVal || pisRet || cofinsRet || csllRet) 
        ? (irpjVal + pisRet + cofinsRet + csllRet) 
        : legacyRet;

      totalValue += val;
      totalImposto += (icmsVal + pisVal);
      if (retVal !== 0) {
        totalRetencoes += retVal;
      } else if (val < 0) {
        totalRetencoes += val;
      }
    });

    // Consumo calculation based on items & rules
    const isCelesc = activeDoc.layout.includes("CELESC");
    let calculatedConsumo = 0;

    if (isCelesc) {
      const teItems = updatedItens.filter(it => 
        /CONSUMO/i.test(it.descricao) && /\bTE\b/i.test(it.descricao) && !/INJETADA|REATIVA/i.test(it.descricao)
      );
      if (teItems.length > 0) {
        calculatedConsumo = teItems.reduce((sum, it) => sum + Number(it.quantidade || 0), 0);
      } else {
        const tusdItems = updatedItens.filter(it => 
          /CONSUMO/i.test(it.descricao) && /\bTUSD\b/i.test(it.descricao) && !/INJETADA|REATIVA/i.test(it.descricao)
        );
        if (tusdItems.length > 0) {
          calculatedConsumo = tusdItems.reduce((sum, it) => sum + Number(it.quantidade || 0), 0);
        } else {
          const genericCons = updatedItens.filter(it => 
            /CONSUMO/i.test(it.descricao) && !/INJETADA|REATIVA|DEMANDA/i.test(it.descricao)
          );
          calculatedConsumo = genericCons.reduce((sum, it) => sum + Number(it.quantidade || 0), 0);
        }
      }
    } else {
      // CASAN
      const consumoAgua = updatedItens.find(it => it.descricao.toLowerCase().includes("água") || it.descricao.toLowerCase().includes("agua"))?.quantidade || 0;
      calculatedConsumo = consumoAgua;
    }

    const calculatedInjetada = computeEnergiaInjetada(updatedItens);

    const logs: string[] = [];
    if (totalValue <= 0) {
      logs.push("❌ Valor total é nulo ou inconsistente.");
    }
    if (calculatedConsumo <= 0) {
      logs.push("⚠️ Consumo de medição zerado ou ausente.");
    }

    // Dynamic checks
    const hasReativa = updatedItens.some(it => it.descricao.toLowerCase().includes("reativa"));
    if (hasReativa) {
      logs.push("⚠️ Alerta: Energia Reativa excedente encontrada na fatura.");
    }

    const hasUltrapassagem = updatedItens.some(it => it.descricao.toLowerCase().includes("ultrapassagem") || it.descricao.toLowerCase().includes("dmcr"));
    if (hasUltrapassagem) {
      logs.push("⚠️ Alerta: Demanda ultrapassada detectada (multa operacional).");
    }

    if (calculatedConsumo === 0) {
      logs.push("⚠️ Alerta: Consumo financeiro zerado no período.");
    }

    setActiveDoc(prev => {
      if (!prev) return null;
      return {
        ...prev,
        dados_extraidos: {
          ...prev.dados_extraidos,
          itens_fatura: updatedItens,
          consumo: parseFloat(calculatedConsumo.toFixed(3)),
          energia_injetada: parseFloat(calculatedInjetada.toFixed(3)),
          valor_total: prev.dados_extraidos.valor_total,
          valor_imposto: parseFloat(totalImposto.toFixed(2)),
          valor_credito: parseFloat(totalRetencoes.toFixed(2))
        },
        logs_validacao: logs,
        status: logs.some(l => l.includes('❌')) ? 'NORMALIZADO' : 'VALIDADO'
      };
    });
  };

  const handleItemFieldChange = (itemId: string, field: string, val: any) => {
    if (!activeDoc) return;
    const currentItens = activeDoc.dados_extraidos.itens_fatura || [];
    const isNumber = ['quantidade', 'valor_unitario', 'valor', 'icms', 'pis', 'irpj_pct', 'irpj_val', 'pis_ret', 'cofins_ret', 'csll_ret', 'cofins'].includes(field);
    const updatedVal = isNumber ? (val === '' ? 0 : parseFloat(val)) : val;

    const updatedItens = currentItens.map(it => {
      if (it.id === itemId) {
        const updated = { ...it, [field]: updatedVal };
        if (field === 'quantidade' || field === 'valor_unitario') {
          const qty = parseFloat(field === 'quantidade' ? val : it.quantidade) || 0;
          const unit = parseFloat(field === 'valor_unitario' ? val : it.valor_unitario) || 0;
          updated.valor = parseFloat((qty * unit).toFixed(2));
        }
        return updated;
      }
      return it;
    });

    recalculateDocTotals(updatedItens);
  };

  const handleAddItem = () => {
    if (!activeDoc) return;
    const currentItens = activeDoc.dados_extraidos.itens_fatura || [];
    const newItem = {
      id: String(Date.now()),
      descricao: "Novo Item de Fatura",
      quantidade: 1,
      valor_unitario: 0.00,
      valor: 0.00,
      pis: 0.00,
      icms: 0.00,
      irpj_pct: 0,
      irpj_val: 0.00,
      pis_ret: 0.00,
      cofins_ret: 0.00,
      csll_ret: 0.00,
      cofins: 0.00
    };
    recalculateDocTotals([...currentItens, newItem]);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activeDoc) return;
    const currentItens = activeDoc.dados_extraidos.itens_fatura || [];
    const updatedItens = currentItens.filter(it => it.id !== itemId);
    recalculateDocTotals(updatedItens);
  };

  // Save specific doc edits back to session array
  const saveActiveDocEdits = () => {
    if (!activeDoc) return;
    setSessionDocs(prev => prev.map(d => d.id === activeDoc.id ? activeDoc : d));
    setIsModalOpen(false);
    setMessage({ type: 'success', text: `Alterações salvas na conferência para o documento "${activeDoc.nome_arquivo}".` });
  };

  // Delete document from local session batch list
  const handleDeleteDoc = (id: string, name: string) => {
    setSessionDocs(prev => prev.filter(d => d.id !== id));
    setMessage({ type: 'warning', text: `Lançamento "${name}" removido do lote de conferência.` });
  };

  // Toggle Ignored status
  const handleToggleIgnoreDoc = (id: string) => {
    setSessionDocs(prev => prev.map(d => {
      if (d.id === id) {
        const newStatus = d.status === 'IGNORADA' ? 'VALIDADO' : 'IGNORADA';
        return { ...d, status: newStatus };
      }
      return d;
    }));
  };

  // Approve / Toggle document validation status manually
  const handleApproveDoc = (id: string) => {
    setSessionDocs(prev => prev.map(d => {
      if (d.id === id) {
        const nextStatus = d.status === 'VALIDADO' ? 'NORMALIZADO' : 'VALIDADO';
        return { ...d, status: nextStatus };
      }
      return d;
    }));
  };

  // Final Persist to standard DB with logs_validacao, triggers, dashboard sync
  const handleFinalSave = async () => {
    const docsToSave = sessionDocs.filter(d => d.status !== 'IGNORADA');
    if (docsToSave.length === 0) {
      setMessage({ type: 'error', text: "Nenhum lançamento válido (não ignorado) na fila para salvar." });
      return;
    }

    setLoading(true);
    let successCount = 0;
    let failedCount = 0;

    try {
      for (const doc of docsToSave) {
        // Enviar os dados de cada fatura do lote para homologar no backend de forma transparente
        const res = await fetch("/api/documentos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome_arquivo: doc.nome_arquivo,
            layout: doc.layout,
            tamanho: doc.tamanho,
            origem_conteudo: doc.origem_conteudo,
            dados_extraidos: doc.dados_extraidos
          })
        });

        if (res.ok) {
          const dbDoc = await res.json();
          // Homologar imediatamente para lançar na tabela central de lançamentos e gerar auditoria
          const homolRes = await fetch(`/api/documentos/${dbDoc.id}/homologar`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-user": currentUser
            }
          });
          if (homolRes.ok) {
            successCount++;
          } else {
            failedCount++;
          }
        } else {
          failedCount++;
        }
      }

      setSessionDocs([]);
      setCustomText("");
      setFileName("");
      
      if (onDocumentProcessed) onDocumentProcessed();

      if (failedCount === 0) {
        setMessage({ 
          type: 'success', 
          text: `Sucesso! Todos os ${successCount} lançamentos do lote foram homologados na tabela central com auditoria e atualizados no painel geral.` 
        });
      } else {
        setMessage({ 
          type: 'warning', 
          text: `Lançamentos processados: ${successCount} com sucesso. ${failedCount} falhas devido a duplicidades de competência.` 
        });
      }

    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro de gravação final: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#141414] rounded-lg border border-white/10 overflow-hidden font-sans text-gray-200">
      
      {/* Visual Header */}
      <div className="bg-[#0c0c0c] px-4 py-3 border-b border-white/10 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="h-5 w-5 text-indigo-400" />
          <h3 className="font-bold text-sm tracking-wide text-gray-100 uppercase">Módulo de Importação Inteligente e Conferência</h3>
        </div>
        <div className="flex gap-1.5 text-xs flex-wrap">
          {(["PDF", "IMAGE", "REPORT", "MANUAL", "CADASTRO"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => {
                setActiveImportMode(mode);
                setMessage(null);
              }}
              className={`px-3 py-1.5 rounded-md font-semibold border transition ${
                activeImportMode === mode 
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-lg" 
                  : "bg-black/30 border-white/10 hover:bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {mode === "PDF" ? "📄 Importar PDF" : 
               mode === "IMAGE" ? "🖼️ Importar Imagem" : 
               mode === "REPORT" ? "📊 Importar Relatório" : 
               mode === "MANUAL" ? "⌨️ Digitação Manual" : 
               "🗂️ Cadastro Mestre UCs"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-5">
        
        {/* Status Message */}
        {message && (
          <div className={`p-4 rounded-lg flex items-start gap-3 border text-xs leading-relaxed ${
            message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
            message.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
            'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* --- CADASTRO MESTRE UC VIEW (Etapa 1) --- */}
        {activeImportMode === "CADASTRO" && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2 bg-[#1b1b1b] p-4 rounded-xl border border-white/5">
              <div>
                <h4 className="text-sm font-bold text-gray-100 flex items-center gap-1.5 font-mono">
                  <Landmark className="h-4 w-4 text-indigo-400" /> CADASTRO MESTRE DE UNIDADES CONSUMIDORAS (UCs)
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Cadastro permanente que serve de referência oficial para auditoria e conferência de faturas.
                </p>
              </div>
              <button
                onClick={() => setShowAddUcForm(!showAddUcForm)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition"
              >
                {showAddUcForm ? "Fechar" : <><Plus className="h-3.5 w-3.5" /> Adicionar UC</>}
              </button>
            </div>

            {/* Add Form */}
            {showAddUcForm && (
              <form onSubmit={handleAddUc} className="bg-black/30 border border-white/10 rounded-xl p-5 space-y-4">
                <h5 className="text-xs font-bold text-indigo-400 uppercase tracking-wide font-mono">Nova Unidade Consumidora</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-400 mb-1">Unidade Consumidora (UC) *</label>
                    <input
                      type="text"
                      value={newUcData.uc}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, uc: e.target.value }))}
                      placeholder="Ex: 0059215242"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">CODNUM (Código do Contrato) *</label>
                    <input
                      type="text"
                      value={newUcData.codnum}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, codnum: e.target.value }))}
                      placeholder="Ex: CELESC-PREF-101"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Concessionária</label>
                    <select
                      value={newUcData.concessionaria}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, concessionaria: e.target.value as any }))}
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="CELESC">CELESC</option>
                      <option value="CASAN">CASAN</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Secretaria Responsável</label>
                    <input
                      type="text"
                      value={newUcData.secretaria}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, secretaria: e.target.value }))}
                      placeholder="Ex: Secretaria de Educação"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Unidade Administrativa</label>
                    <input
                      type="text"
                      value={newUcData.unidade_administrativa}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, unidade_administrativa: e.target.value }))}
                      placeholder="Ex: Escola Básica Getúlio Vargas"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Endereço Completo</label>
                    <input
                      type="text"
                      value={newUcData.endereco}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, endereco: e.target.value }))}
                      placeholder="Ex: Rua das Flores, 450"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Classe de Consumo</label>
                    <input
                      type="text"
                      value={newUcData.classe}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, classe: e.target.value }))}
                      placeholder="Ex: Comercial ou Poder Público"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Grupo Tarifário</label>
                    <input
                      type="text"
                      value={newUcData.grupo_tarifario}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, grupo_tarifario: e.target.value }))}
                      placeholder="Ex: B3 ou A4"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Situação Inicial</label>
                    <select
                      value={newUcData.situacao}
                      onChange={(e) => setNewUcData(prev => ({ ...prev, situacao: e.target.value as any }))}
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Ativa">Ativa</option>
                      <option value="Inativa">Inativa</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 text-xs pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUcForm(false)}
                    className="bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded transition font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded transition font-semibold"
                  >
                    Salvar UC no Cadastro Mestre
                  </button>
                </div>
              </form>
            )}

            {/* Filter and Search Bar */}
            <div className="flex items-center gap-2 bg-[#1c1c1c] px-3 py-2 rounded-lg border border-white/5">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Pesquisar por UC, CODNUM, Secretaria ou Unidade Administrativa..."
                value={ucSearchQuery}
                onChange={(e) => setUcSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none w-full"
              />
            </div>

            {/* UCs Table List */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-[#1c1c1c]">
              <table className="w-full text-xs text-left text-gray-300 border-collapse">
                <thead className="bg-black/40 text-gray-400 uppercase tracking-wider text-[10px] border-b border-white/10 font-bold font-mono">
                  <tr>
                    <th className="px-4 py-3">UC</th>
                    <th className="px-4 py-3">CODNUM</th>
                    <th className="px-4 py-3">Concessionária</th>
                    <th className="px-4 py-3">Secretaria / Unidade Administrativa</th>
                    <th className="px-4 py-3">Endereço</th>
                    <th className="px-4 py-3">Classe/Tarifa</th>
                    <th className="px-4 py-3 text-center">Situação</th>
                    <th className="px-4 py-3 text-center w-24">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {masterUcs
                    .filter(u => {
                      const query = ucSearchQuery.toLowerCase();
                      return u.uc.toLowerCase().includes(query) ||
                             u.codnum.toLowerCase().includes(query) ||
                             u.secretaria.toLowerCase().includes(query) ||
                             u.unidade_administrativa.toLowerCase().includes(query) ||
                             u.endereco.toLowerCase().includes(query);
                    })
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-white/5 transition">
                        <td className="px-4 py-3 font-bold text-gray-100">{item.uc}</td>
                        <td className="px-4 py-3 text-indigo-400 font-semibold">{item.codnum}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${
                            item.concessionaria === "CELESC" ? "bg-amber-500/10 text-amber-400 border border-amber-500/10" : "bg-blue-500/10 text-blue-400 border border-blue-500/10"
                          }`}>
                            {item.concessionaria}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-sans text-[11px] font-semibold text-gray-200">{item.unidade_administrativa || "N/A"}</div>
                          <div className="font-sans text-[10px] text-gray-500">{item.secretaria || "N/A"}</div>
                        </td>
                        <td className="px-4 py-3 font-sans text-gray-400 text-[11px] max-w-xs truncate" title={item.endereco}>{item.endereco || "N/A"}</td>
                        <td className="px-4 py-3 text-[10px] text-gray-400">
                          <div>Classe: {item.classe}</div>
                          <div>Grupo: {item.grupo_tarifario}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleToggleUcStatus(item.id)}
                            className={`px-2 py-0.5 rounded-full font-bold text-[9px] transition ${
                              item.situacao === "Ativa" 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 hover:bg-emerald-500/25" 
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/10 hover:bg-rose-500/25"
                            }`}
                          >
                            {item.situacao}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleDeleteUc(item.id, item.uc)}
                              className="bg-white/5 hover:bg-rose-600/20 hover:text-rose-400 text-gray-400 p-1.5 rounded border border-white/5 transition"
                              title="Excluir UC do Cadastro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {masterUcs.filter(u => {
                    const query = ucSearchQuery.toLowerCase();
                    return u.uc.toLowerCase().includes(query) ||
                           u.codnum.toLowerCase().includes(query) ||
                           u.secretaria.toLowerCase().includes(query) ||
                           u.unidade_administrativa.toLowerCase().includes(query) ||
                           u.endereco.toLowerCase().includes(query);
                  }).length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        Nenhuma Unidade Consumidora (UC) encontrada com esta busca.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- STEP 1: LOAD SOURCE FILES --- */}
        {sessionDocs.length === 0 && !processingQueue && activeImportMode !== "MANUAL" && activeImportMode !== "CADASTRO" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* Drag & Drop Container */}
            <div className="lg:col-span-2">
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition min-h-[220px] ${
                  dragActive ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/15 bg-black/20 hover:border-white/30 hover:bg-black/30'
                }`}
              >
                <input 
                  type="file" 
                  id="file-import-input" 
                  className="hidden" 
                  accept={activeImportMode === "PDF" ? ".pdf" : activeImportMode === "IMAGE" ? "image/*" : ".txt,.csv,.htm"}
                  onChange={handleFileInput}
                />
                <label htmlFor="file-import-input" className="cursor-pointer flex flex-col items-center gap-3">
                  <div className="p-3.5 bg-indigo-600/10 text-indigo-400 rounded-full border border-indigo-500/10">
                    {activeImportMode === "PDF" ? <FileText className="h-8 w-8" /> : activeImportMode === "IMAGE" ? <FileImage className="h-8 w-8" /> : <Clipboard className="h-8 w-8" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white">Arraste ou selecione seu arquivo para reconhecimento</p>
                    <p className="text-[10px] text-gray-400 uppercase font-mono">
                      Formato aceito: {activeImportMode === "PDF" ? "PDF Vetorial / Digitalizado" : activeImportMode === "IMAGE" ? "Fatura em PNG, JPG ou Escaneada" : "Relatório Coletivo TXT / Lote"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Quick Testing templates panel */}
            <div className="bg-[#1c1c1c] p-4 rounded-xl border border-white/10 space-y-3.5 flex flex-col justify-between">
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-indigo-400" />
                  Gabaritos de Simulação Oficial
                </h4>
                <p className="text-[10px] text-gray-400">Clique para carregar faturas teste com fidelidade fiscal do SisPu.JP:</p>
              </div>

              <div className="flex flex-col gap-2">
                {activeImportMode === "PDF" && (
                  <>
                    <button onClick={() => loadSample("CELESC_FATURA")} className="w-full text-left bg-black/40 hover:bg-black/60 p-2.5 rounded border border-white/5 hover:border-white/20 transition flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-gray-300">Fatura Individual CELESC</span>
                      <span className="text-[9px] font-mono bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-bold">PDF</span>
                    </button>
                    <button onClick={() => loadSample("CASAN_FATURA")} className="w-full text-left bg-black/40 hover:bg-black/60 p-2.5 rounded border border-white/5 hover:border-white/20 transition flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-gray-300">Fatura Individual CASAN</span>
                      <span className="text-[9px] font-mono bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-bold">PDF</span>
                    </button>
                  </>
                )}
                {activeImportMode === "IMAGE" && (
                  <>
                    <button onClick={() => loadSample("CELESC_FATURA")} className="w-full text-left bg-black/40 hover:bg-black/60 p-2.5 rounded border border-white/5 hover:border-white/20 transition flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-gray-300">Escaneado CELESC (OCR)</span>
                      <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold">PNG</span>
                    </button>
                    <button onClick={() => loadSample("CASAN_FATURA")} className="w-full text-left bg-black/40 hover:bg-black/60 p-2.5 rounded border border-white/5 hover:border-white/20 transition flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-gray-300">Escaneado CASAN (OCR)</span>
                      <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold">JPG</span>
                    </button>
                  </>
                )}
                {activeImportMode === "REPORT" && (
                  <>
                    <button onClick={() => loadSample("CELESC_RELATORIO")} className="w-full text-left bg-black/40 hover:bg-black/60 p-2.5 rounded border border-white/5 hover:border-white/20 transition flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-gray-300">Lote Faturamento Coletivo CELESC</span>
                      <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold">LOTE (5x)</span>
                    </button>
                    <button onClick={() => loadSample("CASAN_RELATORIO")} className="w-full text-left bg-black/40 hover:bg-black/60 p-2.5 rounded border border-white/5 hover:border-white/20 transition flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-gray-300">Compilado Coletivo CASAN</span>
                      <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold">LOTE (3x)</span>
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        )}



        {/* --- QUEUE PROCESSING PROGRESS BAR --- */}
        {processingQueue && (
          <div className="bg-black/40 rounded-xl p-8 border border-white/10 text-center space-y-4">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">{queueProgress.phase}</h4>
                <p className="text-xs text-gray-400">Análise sintática em andamento. Executando fila de lote de faturas.</p>
              </div>
            </div>

            <div className="max-w-md mx-auto space-y-2">
              <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(queueProgress.current / queueProgress.total) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-mono font-bold uppercase tracking-wide">
                <span>Páginas Processadas</span>
                <span>{queueProgress.current} de {queueProgress.total}</span>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 2: PRE-CONFERENCE SUMMARY SCREEN (LOTE SUMMARY) (Etapas 7, 8, 10) --- */}
        {showSummaryScreen && loteSummary && (
          <div className="space-y-5 animate-in fade-in-50 duration-300">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 flex-wrap gap-2">
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wider text-gray-100 flex items-center gap-1.5 font-mono">
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  Painel de Importação de Lotes
                </h4>
                <p className="text-[10px] text-gray-400">Verifique os metadados consolidados de auditoria do lote antes de iniciar a validação manual.</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-gray-300 font-mono whitespace-nowrap">Mês Competência:</span>
                  <input
                    type="text"
                    value={batchCompetencia}
                    onChange={(e) => setBatchCompetencia(e.target.value)}
                    placeholder="06/2026"
                    className="w-20 bg-white/10 border border-white/15 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 text-center font-bold"
                    title="Informe o mês/ano de competência (ex: 06/2026)"
                  />
                  <button
                    onClick={applyBatchCompetencia}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1 rounded transition shadow border border-indigo-400/30"
                    title="Aplicar este mês de competência para todas as faturas do lote"
                  >
                    Aplicar
                  </button>
                </div>

                <button
                  onClick={() => {
                    setSessionDocs([]);
                    setCustomText("");
                    setFileName("");
                    setLoteSummary(null);
                    setShowSummaryScreen(false);
                    setMessage(null);
                  }}
                  className="bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold px-4 py-2 rounded-md transition border border-white/5"
                >
                  Descartar Lote
                </button>
                <button
                  onClick={() => setShowSummaryScreen(false)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-6 py-2 rounded-md shadow-lg flex items-center gap-1.5 transition"
                >
                  <Eye className="h-4 w-4" /> Abrir Grade de Conferência ({loteSummary.totalFaturas})
                </button>
              </div>
            </div>

            {/* Master UC Comparison Panel (Etapa 3) */}
            {lastComparison && (
              <div className="bg-[#181818] rounded-xl border border-white/10 p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <Landmark className="h-4 w-4 text-indigo-400 font-mono animate-pulse" />
                  <h5 className="text-xs font-bold text-gray-100 uppercase tracking-wide font-mono">Confronto com Cadastro Mestre de Unidades Consumidoras (Etapa 3)</h5>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Cadastradas e Encontradas */}
                  <div className="bg-black/20 border border-emerald-500/10 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold text-emerald-400 font-mono uppercase">
                      <span>Cadastradas Encontradas</span>
                      <span className="bg-emerald-500/10 px-2 py-0.5 rounded font-bold">{lastComparison.found.length}</span>
                    </div>
                    <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                      {lastComparison.found.map(uc => {
                        const m = masterUcs.find(u => u.uc === uc);
                        return (
                          <div key={uc} className="bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded px-2 py-1 text-[11px] flex justify-between font-mono">
                            <span className="text-gray-200 font-bold">{uc}</span>
                            <span className="text-gray-400 text-[10px] truncate max-w-[120px] font-sans" title={m?.unidade_administrativa}>{m?.unidade_administrativa}</span>
                          </div>
                        );
                      })}
                      {lastComparison.found.length === 0 && (
                        <div className="text-[10px] text-gray-500 italic py-2">Nenhuma UC cadastrada foi localizada.</div>
                      )}
                    </div>
                  </div>

                  {/* Novas (Não Cadastradas) */}
                  <div className="bg-black/20 border border-amber-500/10 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold text-amber-400 font-mono uppercase">
                      <span>Novas (Não Cadastradas)</span>
                      <span className="bg-amber-500/10 px-2 py-0.5 rounded font-bold">{lastComparison.newUcs.length}</span>
                    </div>
                    <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                      {lastComparison.newUcs.map(uc => (
                        <div key={uc} className="bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 rounded px-2 py-1 text-[11px] flex justify-between font-mono">
                          <span className="text-amber-300 font-bold">{uc}</span>
                          <span className="text-[9px] text-amber-500 font-bold uppercase">⚠️ Fora do Mestre</span>
                        </div>
                      ))}
                      {lastComparison.newUcs.length === 0 && (
                        <div className="text-[10px] text-gray-500 italic py-2">Nenhuma nova UC detectada.</div>
                      )}
                    </div>
                  </div>

                  {/* Ausentes / Alerta */}
                  <div className="bg-black/20 border border-rose-500/10 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold text-rose-400 font-mono uppercase">
                      <span>Ausentes (Alerta de Falha)</span>
                      <span className="bg-rose-500/10 px-2 py-0.5 rounded font-bold">{lastComparison.missing.length}</span>
                    </div>
                    <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                      {lastComparison.missing.map(uc => {
                        const m = masterUcs.find(u => u.uc === uc);
                        return (
                          <div key={uc} className="bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded px-2 py-1 text-[11px] flex justify-between font-mono">
                            <span className="text-rose-400 font-bold">{uc}</span>
                            <span className="text-rose-500 text-[9px] font-sans truncate max-w-[120px]" title={m?.unidade_administrativa || "Ausente"}>{m?.unidade_administrativa || "Ativa não enviada"}</span>
                          </div>
                        );
                      })}
                      {lastComparison.missing.length === 0 && (
                        <div className="text-[10px] text-gray-500 italic py-2">Excelente! Nenhuma UC ativa ficou de fora.</div>
                      )}
                    </div>
                  </div>
                </div>

                {lastComparison.missing.length > 0 && (
                  <div className="bg-rose-950/20 border border-rose-500/20 rounded-lg p-3 text-[11px] text-rose-300 leading-relaxed font-sans flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>Atenção Servidor Público:</strong> Foram identificadas <strong>{lastComparison.missing.length} Unidades Consumidoras ativas</strong> no cadastro mestre que não constam neste arquivo de faturamento. Conforme as regras da concessionária, estes pontos ausentes foram sinalizados como <strong>ALERTA/IGNORADOS</strong> na grade de conferência e nenhum lançamento financeiro será gerado para eles.
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Statistical Cards (Etapa 7) */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-[#1c1c1c] rounded-xl border border-white/10 p-4 space-y-3">
                  <span className="text-[10px] text-indigo-400 uppercase font-mono font-bold tracking-wider">Metadados Consolidados</span>
                  <div className="divide-y divide-white/5 text-xs">
                    <div className="flex justify-between py-2 text-gray-400">
                      <span>Arquivo</span>
                      <strong className="text-gray-200 font-mono text-right truncate max-w-[180px]">{loteSummary.nomeArquivo}</strong>
                    </div>
                    <div className="flex justify-between py-2 text-gray-400">
                      <span>Total de Páginas</span>
                      <strong className="text-gray-200 font-mono">{loteSummary.totalPaginas}</strong>
                    </div>
                    <div className="flex justify-between py-2 text-gray-400">
                      <span>Total de UCs Encontradas</span>
                      <strong className="text-gray-200 font-mono">{loteSummary.totalFaturas}</strong>
                    </div>
                  </div>
                </div>

                {/* Classification Scoring (Etapa 6 & 8) */}
                <div className="bg-[#1c1c1c] rounded-xl border border-white/10 p-4 space-y-3">
                  <span className="text-[10px] text-emerald-400 uppercase font-mono font-bold tracking-wider">Análise de Qualidade do Lote</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                      <span className="text-[9px] text-emerald-300 block font-mono font-bold">VÁLIDAS</span>
                      <span className="text-xl font-bold font-mono text-emerald-400">{loteSummary.validas}</span>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                      <span className="text-[9px] text-amber-300 block font-mono font-bold">DUPLICADAS</span>
                      <span className="text-xl font-bold font-mono text-amber-400">{loteSummary.duplicadas}</span>
                    </div>
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                      <span className="text-[9px] text-rose-300 block font-mono font-bold">ERROS</span>
                      <span className="text-xl font-bold font-mono text-rose-400">{loteSummary.invalidas}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Console de Auditoria / Technical Logs (Etapa 10) */}
              <div className="lg:col-span-2 bg-[#0c0c0c] border border-white/10 rounded-xl p-4 flex flex-col h-[280px]">
                <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
                  <span className="text-[10px] text-indigo-400 uppercase font-mono font-bold tracking-wider flex items-center gap-1.5">
                    <FileCode className="h-4 w-4 animate-pulse" />
                    Console de Auditoria e Logs Técnicos (Engine Importação)
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono">SISPU.JP Engine 2.0</span>
                </div>
                <div className="flex-1 overflow-y-auto font-mono text-[10px] text-emerald-400 leading-relaxed space-y-1 pr-2 scrollbar-thin">
                  {technicalLogs.map((log, idx) => (
                    <div key={idx} className="hover:bg-white/5 py-0.5 rounded px-1">
                      {log}
                    </div>
                  ))}
                  {technicalLogs.length === 0 && (
                    <div className="text-gray-500 italic text-center pt-8">Sem logs técnicos gerados para esta sessão.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 2: CONFERENCE SCREEN (GRID-BASED VIEW) --- */}
        {sessionDocs.length > 0 && !showSummaryScreen && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wider text-gray-100 flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  Grade de Conferência do Lote Importado
                </h4>
                <p className="text-[10px] text-gray-400">Dê um duplo clique em qualquer linha para abrir a conferência detalhada e o visualizador.</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                {loteSummary && (
                  <button
                    onClick={() => setShowSummaryScreen(true)}
                    className="bg-white/5 hover:bg-white/10 text-indigo-400 text-xs font-semibold px-4 py-2 rounded-md transition border border-white/10 flex items-center gap-1"
                  >
                    📊 Ver Resumo do Lote
                  </button>
                )}

                {/* Mês Competência Control requested by user */}
                <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-gray-300 font-mono whitespace-nowrap">Mês Competência:</span>
                  <input
                    type="text"
                    value={batchCompetencia}
                    onChange={(e) => setBatchCompetencia(e.target.value)}
                    placeholder="06/2026"
                    className="w-20 bg-white/10 border border-white/15 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 text-center font-bold"
                    title="Informe o mês/ano de competência (ex: 06/2026)"
                  />
                  <button
                    onClick={applyBatchCompetencia}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1 rounded transition shadow border border-indigo-400/30"
                    title="Aplicar este mês de competência para todas as faturas do lote"
                  >
                    Aplicar
                  </button>
                </div>

                <button
                  onClick={() => {
                    setSessionDocs([]);
                    setCustomText("");
                    setFileName("");
                    setLoteSummary(null);
                    setShowSummaryScreen(false);
                    setMessage(null);
                  }}
                  className="bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold px-4 py-2 rounded-md transition border border-white/5"
                >
                  Descartar Lote
                </button>
                <button
                  onClick={handleFinalSave}
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-6 py-2 rounded-md shadow-lg flex items-center gap-1.5 transition"
                >
                  <Save className="h-4 w-4" /> {loading ? "Salvando..." : `Salvar Lançamentos (${sessionDocs.length})`}
                </button>
              </div>
            </div>

            <div className="border border-white/10 rounded-xl overflow-hidden bg-[#1c1c1c]">
              <table className="w-full text-xs text-left text-gray-300 border-collapse">
                <thead className="bg-black/40 text-gray-400 uppercase tracking-wider text-[10px] border-b border-white/10 font-bold font-mono">
                  <tr>
                    <th className="px-4 py-3">Pág/ID</th>
                    <th className="px-4 py-3">Concessionária</th>
                    <th className="px-4 py-3">Contrato CODNUM</th>
                    <th className="px-4 py-3 text-right">Consumo</th>
                    <th className="px-4 py-3 text-right">Valor Total</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center w-24">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sessionDocs.map((doc, index) => {
                    const pageNum = index + 1;
                    const isAusente = (doc.dados_extraidos as any).isAusente;
                    const isIgnored = doc.status === "IGNORADA" && !isAusente;
                    return (
                      <tr 
                        key={doc.id} 
                        onDoubleClick={() => !isAusente && handleDocEdit(doc)}
                        className={`transition select-none group ${
                          isAusente 
                            ? "bg-rose-950/25 hover:bg-rose-950/40 text-rose-300 border-l-2 border-l-rose-500" 
                            : isIgnored 
                              ? "opacity-35 line-through text-gray-500 hover:bg-white/5 cursor-pointer" 
                              : "hover:bg-white/5 cursor-pointer text-gray-200"
                        }`}
                        title={isAusente ? "UC Ausente no relatório - Sem Lançamento Financeiro" : "Duplo clique para conferir"}
                      >
                        <td className="px-4 py-3 font-mono font-semibold">
                          {isAusente ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0 animate-bounce" /> ALERTA
                            </span>
                          ) : (
                            <span className="text-gray-400">Pág. {pageNum}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${
                            doc.layout.includes("CELESC") ? "bg-amber-500/10 text-amber-400 border border-amber-500/10" : "bg-blue-500/10 text-blue-400 border border-blue-500/10"
                          }`}>
                            {doc.layout.includes("CELESC") ? "CELESC" : "CASAN"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold">{doc.dados_extraidos.codigo_numero}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {isAusente ? (
                            <span className="text-rose-400/70 text-[10px]">AUSENTE</span>
                          ) : (
                            <>{doc.dados_extraidos.consumo.toFixed(1)} {doc.layout.includes("CELESC") ? "kWh" : "m³"}</>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {isAusente ? (
                            <span className="text-rose-400/70 text-[10px]">R$ 0,00</span>
                          ) : (
                            <span className="text-indigo-400">R$ {doc.dados_extraidos.valor_total.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                            isAusente ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                            doc.status === "VALIDADO" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" :
                            doc.status === "IGNORADA" ? "bg-gray-500/20 text-gray-400 border border-gray-500/20" :
                            "bg-amber-500/10 text-amber-400 border border-amber-500/10"
                          }`}>
                            {isAusente ? "AUSENTE" : doc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {isAusente ? (
                              <span className="text-[10px] text-rose-400/60 font-sans italic" title="Nenhum lançamento financeiro gerado para esta UC">Ignorada</span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleDocEdit(doc)}
                                  className="bg-white/5 hover:bg-indigo-600/20 hover:text-indigo-400 text-gray-400 p-1.5 rounded border border-white/5 transition"
                                  title="Conferir e Editar"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                
                                <button
                                  onClick={() => handleApproveDoc(doc.id)}
                                  className={`p-1.5 rounded border transition ${
                                    doc.status === 'VALIDADO'
                                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
                                      : "bg-white/5 hover:bg-emerald-600/20 hover:text-emerald-400 text-gray-400 border-white/5"
                                  }`}
                                  title={doc.status === 'VALIDADO' ? "Clique para desmarcar validação" : "Clique para marcar como Validado"}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  onClick={() => handleToggleIgnoreDoc(doc.id)}
                                  className={`p-1.5 rounded border transition ${
                                    doc.status === 'IGNORADA'
                                      ? "bg-amber-500/20 text-amber-400 border-amber-500/20 hover:bg-amber-500/30"
                                      : "bg-white/5 hover:bg-amber-600/20 hover:text-amber-400 text-gray-400 border-white/5"
                                  }`}
                                  title={doc.status === 'IGNORADA' ? "Restaurar Lançamento" : "Ignorar Lançamento"}
                                >
                                  {doc.status === 'IGNORADA' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                </button>

                                <button
                                  onClick={() => handleDeleteDoc(doc.id, doc.nome_arquivo)}
                                  className="bg-white/5 hover:bg-rose-600/20 hover:text-rose-400 text-gray-400 p-1.5 rounded border border-white/5 transition"
                                  title="Excluir Lançamento"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- MANUAL FORM ENTRY OPTION --- */}
        {activeImportMode === "MANUAL" && (
          <div className="bg-[#1c1c1c] p-5 rounded-xl border border-white/10 space-y-4">
            <h4 className="font-bold text-xs uppercase tracking-wider text-gray-300 font-mono">Digitação Direta Administrativa (Manual)</h4>
            <form onSubmit={handleSaveManualLancamento} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans text-gray-300">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-400">Código UC / CODNUM *:</label>
                <input
                  type="text"
                  placeholder="Ex: CELESC-PREF-101"
                  value={manualUc}
                  onChange={(e) => setManualUc(e.target.value)}
                  className="bg-black rounded p-2 border border-white/15 outline-none font-mono text-white focus:border-indigo-500"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-400">Mês de Competência *:</label>
                <input
                  type="text"
                  placeholder="Ex: 06/2026"
                  value={manualCompetencia}
                  onChange={(e) => setManualCompetencia(e.target.value)}
                  className="bg-black rounded p-2 border border-white/15 outline-none font-mono text-white focus:border-indigo-500"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-400">Consumo (kWh ou m³):</label>
                <input
                  type="number"
                  placeholder="0"
                  value={manualConsumo}
                  onChange={(e) => setManualConsumo(e.target.value)}
                  className="bg-black rounded p-2 border border-white/15 outline-none font-mono text-white focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-400">Valor Total (R$) *:</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={manualValorTotal}
                  onChange={(e) => setManualValorTotal(e.target.value)}
                  className="bg-black rounded p-2 border border-white/15 outline-none font-mono font-bold text-indigo-400 focus:border-indigo-500"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-400">Impostos / ICMS (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={manualImposto}
                  onChange={(e) => setManualImposto(e.target.value)}
                  className="bg-black rounded p-2 border border-white/15 outline-none font-mono text-white focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-1.5 justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded transition shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Save className="h-4 w-4" /> {loading ? "Salvando..." : "Salvar Lançamento Manual"}
                </button>
              </div>
            </form>
          </div>
        )}

      </div>

      {/* --- CONFERENCE MODAL CONTAINING PDF VIEWER & EDITABLE SPREADSHEET --- */}
      {isModalOpen && activeDoc && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f0f] border border-white/15 rounded-xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Title Bar */}
            <div className="bg-[#0a0a0a] px-5 py-3.5 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileCode className="h-4.5 w-4.5 text-indigo-400" />
                <h4 className="font-bold text-sm uppercase tracking-wide text-gray-200">
                  Conferência do Lançamento: {activeDoc.nome_arquivo}
                </h4>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition font-bold text-sm px-2 py-1 rounded hover:bg-white/5"
              >
                ✕ Fechar
              </button>
            </div>

            {/* EDITABLE CELL SHEET & WARNINGS */}
            <div className="bg-[#141414] p-5 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
                
                <div className="space-y-4">
                  {/* High-Fidelity Position Metadata (Etapa 9) */}
                  <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg text-xs space-y-2">
                    <span className="font-bold text-indigo-300 flex items-center gap-1.5 font-mono uppercase text-[9px]">
                      <Info className="h-3.5 w-3.5 text-indigo-400" />
                      Rastreabilidade de Importação (FaturaImportada)
                    </span>
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-gray-300">
                      <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                        <span className="text-gray-500 block text-[8px] uppercase">Pág. PDF</span>
                        <span className="text-gray-200 font-bold text-xs">{(activeDoc as any).numero_pagina || 1}</span>
                      </div>
                      <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                        <span className="text-gray-500 block text-[8px] uppercase">Pos. Página</span>
                        <span className="text-gray-200 font-bold text-xs">
                          {(activeDoc as any).posicao_na_pagina || 1} <span className="text-[9px] text-gray-500">/ {(activeDoc as any).total_na_pagina || 1}</span>
                        </span>
                      </div>
                      <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                        <span className="text-gray-500 block text-[8px] uppercase">Pos. Lote</span>
                        <span className="text-gray-200 font-bold text-xs">
                          {(activeDoc as any).posicao_no_lote || 1} <span className="text-[9px] text-gray-500">/ {(activeDoc as any).total_no_lote || 1}</span>
                        </span>
                      </div>
                    </div>
                    {(activeDoc as any).score !== undefined && (
                      <div className="flex justify-between items-center text-[10px] bg-black/20 p-1.5 rounded border border-white/5 font-mono text-gray-400">
                        <span>Score Confiança:</span>
                        <span className="font-bold text-emerald-400">{(activeDoc as any).score}/100</span>
                      </div>
                    )}
                  </div>

                  {/* BLOCO 1 — IDENTIFICAÇÃO DA FATURA */}
                  <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                      Bloco 1 — Identificação da Fatura
                    </span>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      {/* ROW 1 */}
                      {/* Col 1: UC */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Unidade Consumidora / CODNUM</label>
                        <input
                          type="text"
                          value={activeDoc.dados_extraidos.codigo_numero || ""}
                          onChange={(e) => handleFieldChange("codigo_numero", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono font-bold outline-none transition"
                        />
                      </div>
                      {/* Col 2: Município (Literally above Fatura in Row 2) */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Município</label>
                        <input
                          type="text"
                          value={(activeDoc.dados_extraidos as any).municipio || "Florianópolis"}
                          onChange={(e) => handleFieldChange("municipio", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-semibold outline-none transition"
                        />
                      </div>
                      {/* Col 3: Concessionária & Tipo do Documento */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Concessionária</label>
                        <input
                          type="text"
                          disabled
                          value={activeDoc.layout.includes("CELESC") ? "CELESC" : "CASAN"}
                          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 font-bold text-amber-400 outline-none cursor-not-allowed text-[11px]"
                        />
                      </div>

                      {/* ROW 2 */}
                      {/* Col 1: Endereço (Literally below UC) */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Endereço</label>
                        <input
                          type="text"
                          value={activeDoc.dados_extraidos.endereco || ""}
                          onChange={(e) => handleFieldChange("endereco", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white outline-none transition"
                        />
                      </div>
                      {/* Col 2: Fatura (Classe renamed to Fatura, literally below Município) */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Fatura</label>
                        <input
                          type="text"
                          value={(activeDoc.dados_extraidos as any).fatura_num || (activeDoc.dados_extraidos as any).classe || "202605-089870669"}
                          onChange={(e) => handleFieldChange("fatura_num", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono outline-none transition"
                        />
                      </div>
                      {/* Col 3: Chave de Acesso (On the same line as Endereço but at the extreme right) */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Chave de Acesso</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={(activeDoc.dados_extraidos as any).chave_acesso || ""}
                            onChange={(e) => handleFieldChange("chave_acesso", e.target.value)}
                            className="flex-1 bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2 py-1 text-white font-mono text-[9px] outline-none transition"
                          />
                          <button
                            onClick={() => {
                              const key = (activeDoc.dados_extraidos as any).chave_acesso || "";
                              navigator.clipboard.writeText(key);
                              setCopiedKey(true);
                              setTimeout(() => setCopiedKey(false), 2000);
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-mono font-bold flex items-center shrink-0 transition ${
                              copiedKey ? "bg-emerald-600 text-white" : "bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30"
                            }`}
                          >
                            {copiedKey ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>

                      {/* ROW 3 */}
                      {/* Col 1: Grupo / Subgrupo Tensão */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Grupo / Subgrupo Tensão</label>
                        <input
                          type="text"
                          value={(activeDoc.dados_extraidos as any).grupo_subgrupo_tensao || (activeDoc.dados_extraidos as any).grupo_tarifario || "A - A4"}
                          onChange={(e) => handleFieldChange("grupo_subgrupo_tensao", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white outline-none transition"
                        />
                      </div>
                      {/* Col 2: Competência de Referência */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Competência de Referência</label>
                        <input
                          type="date"
                          value={activeDoc.dados_extraidos.mes_ano ? activeDoc.dados_extraidos.mes_ano.substring(0, 10) : "2026-05-01"}
                          onChange={(e) => handleFieldChange("mes_ano", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono outline-none transition"
                        />
                      </div>
                      {/* Col 3: Nota Fiscal (NF) (Literally below Chave de Acesso) */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Nota Fiscal (NF)</label>
                        <input
                          type="text"
                          value={(activeDoc.dados_extraidos as any).nota_fiscal || "NF 089870669"}
                          onChange={(e) => handleFieldChange("nota_fiscal", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono outline-none transition"
                        />
                      </div>

                      {/* ROW 4 */}
                      {/* Col 1: Data Leitura & Dias Faturados */}
                      <div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-gray-500 text-[8px] uppercase font-mono block">Data Leitura</label>
                            <input
                              type="text"
                              value={(activeDoc.dados_extraidos as any).data_leitura || "30/04/2026"}
                              onChange={(e) => handleFieldChange("data_leitura", e.target.value)}
                              className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2 py-1.5 text-white text-center font-mono outline-none transition text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="text-gray-500 text-[8px] uppercase font-mono block">Dias Faturados</label>
                            <input
                              type="number"
                              value={(activeDoc.dados_extraidos as any).dias_faturados || 30}
                              onChange={(e) => handleFieldChange("dias_faturados", e.target.value)}
                              className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2 py-1.5 text-white text-center font-mono outline-none transition text-[11px]"
                            />
                          </div>
                        </div>
                      </div>
                      {/* Col 2: Data de Vencimento */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Data de Vencimento</label>
                        <input
                          type="text"
                          value={activeDoc.dados_extraidos.data_vencimento || "05/05/2026"}
                          onChange={(e) => handleFieldChange("data_vencimento", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono font-bold outline-none transition"
                        />
                      </div>
                      {/* Col 3: Valor (Literally below Nota Fiscal) */}
                      <div>
                        <label className="text-gray-500 text-[10px] uppercase font-mono">Valor Total da Fatura (R$)</label>
                        <input
                          type="number"
                          value={activeDoc.dados_extraidos.valor_total ?? 0}
                          onChange={(e) => handleFieldChange("valor_total", e.target.value)}
                          className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded px-2.5 py-1.5 text-white font-mono font-bold outline-none transition"
                        />
                      </div>
                    </div>
                  </div>

                  {/* BLOCO 2 — ITENS DA FATURA */}
                  <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                        Bloco 2 — Itens da Fatura (Auditáveis)
                      </span>
                      <button
                        onClick={handleAddItem}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1 rounded flex items-center gap-1 transition"
                      >
                        <Plus className="h-3 w-3" /> Adicionar Item
                      </button>
                    </div>
                    
                    <div className="overflow-x-auto max-h-80 border border-white/10 rounded-lg bg-[#111111] shadow-inner">
                      <table className="w-full text-left text-[10px] border-collapse min-w-[840px]">
                        <thead className="bg-[#1c1c1c] text-gray-200 font-mono text-[9px] font-bold border-b border-white/10 uppercase tracking-tight">
                          <tr>
                            <th rowSpan={2} className="px-1.5 py-1 w-[15%] text-left align-middle border-r border-white/10">Itens da Fatura</th>
                            <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10">Quantidade</th>
                            <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10 leading-tight">Preço unitário<br/><span className="text-[8px] text-gray-400 font-normal lowercase">c/ tributos</span></th>
                            <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10">Valor</th>
                            <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10 leading-tight">COFINS/<br/>PIS</th>
                            <th rowSpan={2} className="px-1 py-1 text-right align-middle border-r border-white/10">ICMS</th>
                            <th colSpan={5} className="px-1 py-0.5 text-center border-b border-white/10 bg-white/5 text-amber-300 font-bold tracking-normal">Tributos Federais Retidos</th>
                            <th rowSpan={2} className="w-6 p-0 text-center align-middle"></th>
                          </tr>
                          <tr className="bg-white/[0.02]">
                            <th className="px-1 py-1 text-center border-r border-white/10 text-[8px] font-normal text-gray-300">IRPJ (%)</th>
                            <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">IRPJ</th>
                            <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">PIS</th>
                            <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">COFINS</th>
                            <th className="px-1 py-1 text-right border-r border-white/10 text-[8px] font-normal text-gray-300">CSLL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-black/20">
                          {(() => {
                            const validItens = activeDoc.dados_extraidos.itens_fatura || [];

                            if (validItens.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={12} className="text-center py-4 text-gray-500 italic">
                                    Nenhum item adicionado. Clique em "Adicionar Item" acima.
                                  </td>
                                </tr>
                              );
                            }

                            return validItens.map((item: any) => (
                              <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                {/* 1. Descrição */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="text"
                                    value={item.descricao || ""}
                                    onChange={(e) => handleItemFieldChange(item.id, "descricao", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-gray-200 outline-none text-[10px] truncate"
                                    title={item.descricao}
                                  />
                                </td>
                                {/* 2. Quantidade */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={typeof item.quantidade === 'number' ? Number(item.quantidade.toFixed(3)) : (item.quantidade ?? 0)}
                                    onChange={(e) => handleItemFieldChange(item.id, "quantidade", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                  />
                                </td>
                                {/* 3. Preço unitário c/ tributos */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.valor_unitario ?? 0}
                                    onChange={(e) => handleItemFieldChange(item.id, "valor_unitario", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                  />
                                </td>
                                {/* 4. Valor */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={typeof item.valor === 'number' ? Number(item.valor.toFixed(2)) : (item.valor ?? 0)}
                                    onChange={(e) => handleItemFieldChange(item.id, "valor", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-indigo-300 font-semibold outline-none text-[10px]"
                                  />
                                </td>
                                {/* 5. COFINS/PIS */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={typeof item.pis === 'number' ? Number(item.pis.toFixed(2)) : (item.pis ?? 0)}
                                    onChange={(e) => handleItemFieldChange(item.id, "pis", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                    title="COFINS/PIS"
                                  />
                                </td>
                                {/* 6. ICMS */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={typeof item.icms === 'number' ? Number(item.icms.toFixed(2)) : (item.icms ?? 0)}
                                    onChange={(e) => handleItemFieldChange(item.id, "icms", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                    title="ICMS"
                                  />
                                </td>
                                {/* 7. IRPJ (%) */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.irpj_pct ?? 0}
                                    onChange={(e) => handleItemFieldChange(item.id, "irpj_pct", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-center font-mono text-gray-400 outline-none text-[10px]"
                                    title="IRPJ (%)"
                                  />
                                </td>
                                {/* 8. IRPJ */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={typeof item.irpj_val === 'number' ? Number(item.irpj_val.toFixed(2)) : (item.irpj_val ?? (item.cofins ?? 0))}
                                    onChange={(e) => handleItemFieldChange(item.id, "irpj_val", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-amber-300 outline-none text-[10px]"
                                    title="IRPJ Retido"
                                  />
                                </td>
                                {/* 9. PIS */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={typeof item.pis_ret === 'number' ? Number(item.pis_ret.toFixed(2)) : (item.pis_ret ?? 0)}
                                    onChange={(e) => handleItemFieldChange(item.id, "pis_ret", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                    title="PIS Retido"
                                  />
                                </td>
                                {/* 10. COFINS */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={typeof item.cofins_ret === 'number' ? Number(item.cofins_ret.toFixed(2)) : (item.cofins_ret ?? 0)}
                                    onChange={(e) => handleItemFieldChange(item.id, "cofins_ret", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                    title="COFINS Retido"
                                  />
                                </td>
                                {/* 11. CSLL */}
                                <td className="p-0.5 border-r border-white/5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={typeof item.csll_ret === 'number' ? Number(item.csll_ret.toFixed(2)) : (item.csll_ret ?? 0)}
                                    onChange={(e) => handleItemFieldChange(item.id, "csll_ret", e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:bg-black/60 focus:border-indigo-500 rounded px-1 py-0.5 text-right font-mono text-gray-300 outline-none text-[10px]"
                                    title="CSLL Retido"
                                  />
                                </td>
                                {/* Action cell */}
                                <td className="p-0.5 text-center">
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="text-gray-500 hover:text-rose-400 p-1 transition"
                                    title="Excluir item"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* BLOCO 3 — VALORES TOTAIS */}
                  <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                      Bloco 3 — Valores Totais Extraídos
                    </span>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                        <span className="text-gray-500 text-[9px] uppercase block font-mono">Valor Total</span>
                        <span className="text-xs font-bold font-mono text-indigo-400 block truncate">
                          R$ {(activeDoc.dados_extraidos.valor_total ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                        <span className="text-gray-500 text-[9px] uppercase block font-mono">Energia Injetada</span>
                        <span className="text-xs font-bold font-mono text-emerald-400 block truncate">
                          {(() => {
                            const inj = activeDoc.dados_extraidos.energia_injetada ?? computeEnergiaInjetada(activeDoc.dados_extraidos.itens_fatura || []);
                            return `${inj.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kWh`;
                          })()}
                        </span>
                      </div>
                      <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                        <span className="text-gray-500 text-[9px] uppercase block font-mono">Tributos Totais</span>
                        <span className="text-xs font-bold font-mono text-amber-500 block truncate">
                          R$ {(activeDoc.dados_extraidos.valor_imposto ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                        <span className="text-gray-500 text-[9px] uppercase block font-mono">Tributos Retidos / Créditos</span>
                        <span className={`text-xs font-bold font-mono block truncate ${
                          (activeDoc.dados_extraidos.valor_credito ?? 0) < 0 ? "text-amber-400" : "text-emerald-400"
                        }`}>
                          R$ {(activeDoc.dados_extraidos.valor_credito ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-[#1c1c1c] border border-white/5 rounded-lg p-2.5 text-center">
                        <span className="text-gray-500 text-[9px] uppercase block font-mono">Valor Líquido</span>
                        <span className="text-xs font-extrabold font-mono text-white block truncate">
                          R$ {(activeDoc.dados_extraidos.valor_total ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Consumo Calculado Info Panel */}
                    <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-lg p-2.5 flex justify-between items-center">
                      <span className="text-[10px] text-indigo-300 font-medium font-mono uppercase">Consumo de Auditoria Financeira:</span>
                      <span className="text-xs font-extrabold text-indigo-400 font-mono">
                        {(activeDoc.dados_extraidos.consumo ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {activeDoc.layout.includes("CELESC") ? "kWh" : "m³"}
                      </span>
                    </div>
                  </div>

                  {/* BLOCO 4 — CONSISTÊNCIAS */}
                  {(() => {
                    const alerts = evalConsistencias(activeDoc);
                    return (
                      <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-400 font-bold block">
                          Bloco 4 — Consistências da Fatura
                        </span>
                        {alerts.length > 0 ? (
                          <div className="space-y-1.5">
                            {alerts.map((alert, aIdx) => {
                              const isError = alert.startsWith("❌");
                              return (
                                <div
                                  key={aIdx}
                                  className={`p-2.5 rounded text-[10px] leading-relaxed flex items-center gap-2 border ${
                                    isError
                                      ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                                      : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                                  }`}
                                >
                                  {isError ? (
                                    <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                  )}
                                  <span>{alert}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded text-[10px] flex items-center gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span>Fatura em conformidade total. Nenhuma inconsistência detectada.</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Inner edit audit log inside Modal */}
                  {activeDoc.historico_alteracoes && activeDoc.historico_alteracoes.length > 0 && (
                    <div className="bg-black/40 border border-white/10 p-3 rounded-lg text-xs space-y-1.5">
                      <span className="font-bold text-gray-300 flex items-center gap-1 font-mono text-[10px] uppercase">
                        <History className="h-3.5 w-3.5 text-indigo-400" />
                        Histórico de Auditoria da Sessão
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {activeDoc.historico_alteracoes.map((item, hIdx) => (
                          <div key={hIdx} className="text-[10px] text-gray-400 border-b border-white/5 pb-1 last:border-0 flex justify-between">
                            <span>
                              Célula <strong className="text-gray-200 font-mono">{item.campo}</strong>: {item.antes} ➜ {item.depois}
                            </span>
                            <span className="text-[9px] text-gray-500 font-mono">por {item.usuario}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 border-t border-white/10 pt-4 mt-4">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold px-4 py-2 rounded-md transition"
                  >
                    Descartar Edição
                  </button>
                  <button 
                    onClick={saveActiveDocEdits}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2 rounded-md shadow-lg flex items-center gap-1 transition"
                  >
                    <Check className="h-4 w-4" /> Aplicar e Validar Lançamento
                  </button>
                </div>

              </div>

          </div>
        </div>
      )}

    </div>
  );
}
