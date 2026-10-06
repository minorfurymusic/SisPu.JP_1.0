# Estudo de economia — Água (CASAN) e Energia (CELESC)
**Prefeitura Municipal de Rio do Sul/SC · SisPu.JP 2.0 · outubro de 2026**

> Todos os números deste estudo saem das faturas importadas no SisPu.JP e podem ser conferidos no
> próprio sistema (Relatórios → abas Perdas, Demanda, Tributos, Alertas, Energia solar).
>
> **Períodos analisados:**
> - Principal: últimos 12 meses fechados, **set/2025 a ago/2026**.
> - Histórico: desde jan/2024.
>
> Cada valor calculado foi conferido contra o total impresso no PDF da concessionária. Cada
> recomendação traz três coisas:
> - **a prova**: por que se paga aquele valor, com a conta refeita item a item;
> - **a base legal ou regulatória**;
> - **a conta da economia**, com as premissas declaradas.

---

## 0. Resumo para decisão

| Item | Valor em 12 meses (set/25–ago/26) |
|---|---:|
| Energia (CELESC): 155 unidades consumidoras | **R$ 2.136.711,58** |
| Água e esgoto (CASAN): 112 matrículas | **R$ 1.135.894,34** |
| **Total** | **R$ 3.272.605,92** |
| Perdas evitáveis já identificadas na energia (ultrapassagem + demanda sem uso + reativo + multas) | R$ 117.374 |
| Excesso de água em picos de consumo (provável vazamento), 60 ocorrências | ≈ R$ 123.600 |
| Aumento contratado para o próximo ano: revisão CELESC de 22/08/2026, +10,82% médio (alta tensão +14,16%) | ≈ +R$ 231.000/ano no mesmo consumo |

**Economia possível (por ano):**

| # | Medida | Conservadora | Máxima | Prazo | Esforço |
|---|---|---:|---:|---|---|
| 1 | Ajustar a demanda contratada de 6 UCs de alta tensão | R$ 56.000 | R$ 67.000 | 3–6 meses | baixo (pedido à CELESC) |
| 2 | Levar as 12 UCs do grupo A ao mercado livre (comercializador varejista) | R$ 64.000 | R$ 106.000 | 6–12 meses | médio (licitação) |
| 3 | Faturar 2 UCs pequenas do grupo A como grupo B ("B optante") | R$ 9.900 | R$ 9.900 | 2–4 meses | baixo, se o transformador permitir |
| 4 | Água: tratar vazamento no mês em que aparece (alerta mensal + revisão da fatura) | R$ 60.000 | R$ 124.000 | imediato | baixo |
| 5 | Água: uso eficiente nos 15 maiores consumidores (5% a 10% do volume) | R$ 57.000 | R$ 114.000 | 6–12 meses | médio |
| 6 | Encerrar ligações paradas (energia e água) | R$ 7.000 | R$ 14.700 | 1–3 meses | baixo |
| 7 | Corrigir fator de potência (reativo) em 2 UCs | R$ 1.700 | R$ 2.200 | 3 meses | baixo |
| | **Total** | **≈ R$ 256.000** | **≈ R$ 438.000** | | |

- O total equivale a **7,8% a 13,4%** do gasto anual com água e energia. Na prática, ele compensa o reajuste da CELESC de agosto/2026.
- Fora da conta acima (valores únicos, a recuperar):
  - pagamentos em duplicidade e faturas divergentes a conferir (seção 4.6);
  - R$ 37.093 de "Participação Financeira" a validar (seção 4.9).

**As 5 ações para começar já:**
1. Pedir à CELESC a nova demanda contratada:
   - Centro de Eventos: 200 → 100 kW;
   - Praça Isabel: 35 → 100 kW;
   - CAIC: 34 → 74 kW;
   - Posto Verdão: 80 → 131 kW;
   - Das Madeiras 3000: 91 → 52 kW;
   - UPA: 50 → 46 kW.

   Aumentos valem de imediato. Reduções seguem o aviso do contrato.
2. Mandar vistoria de vazamento, hoje:
   - Complexo do Estádio (233724-0, 888556-7 e Cancha de Bocha 850410-5);
   - Escola Modelo Ella Kurth (2021937-7);
   - CE Anibal de Barba (2021938-5).
3. Verificar a **Policlínica (919792-3)**. O consumo caiu de ~900 m³/mês para **0 m³** desde jan/2026: ou o medidor parou (risco de cobrança retroativa), ou a unidade mudou.
4. Abrir o processo de **mercado livre** para o grupo A:
   - estudo de carga, termo de referência e licitação de comercializador varejista;
   - aviso à CELESC.
5. Usar todo mês o relatório de **Alertas** do sistema, que compara com o mês anterior e com o mesmo mês do ano anterior. Cada alerta tem responsável e prazo.

---

## 1. Base de dados e método

- **Fonte**: as faturas oficiais importadas no sistema.
  - **CELESC**:
    - conta coletiva "Relação de UCs da Coletiva" (2024–2026);
    - "Relação de Faturas Agrupadoras" (layout antigo, até abr/2024).
  - **CASAN**: relatório SCI8095, "Contas que compõem fatura de cobrança centralizada".
- **Conferência**:
  - cada arquivo só entra se a soma das contas lidas bater com o total impresso na capa e se a quantidade de contas bater com a declarada;
  - em cada fatura CELESC, a soma dos itens tem que dar o valor da UC.
- **Itens**: o sistema separa cada item da fatura CELESC em grupos:
  - energia (TE) e rede (TUSD);
  - demanda, ultrapassagem, demanda sem uso e reativo;
  - bandeira, COSIP, infraestrutura, solar, ajustes, IR retido.
- **Água**: o relatório da CASAN traz por matrícula:
  - leituras e consumo (m³);
  - valor da água e do esgoto;
  - "valor serviço" e bônus.
- **Limites do estudo**:
  - faltam no sistema os meses da CASAN fev–abr/2024 e jul/2025 (sem pasta) e ago/2025 (arquivo ilegível);
  - faltam na CELESC mar/2024 e algumas "segundas vias" individuais;
  - nada disso afeta a janela principal set/2025–ago/2026, que está completa nas duas concessionárias.
- **Sites oficiais bloqueados**: aneel.gov.br, celesc.com.br, casan.com.br, aresc.sc.gov.br e planalto.gov.br não puderam ser acessados do ambiente em que o estudo foi feito.
  - As normas estão citadas pelo número e confirmadas em fontes secundárias (lista na seção 9).
  - **Antes de um pedido formal, confira o texto vigente no site oficial.**
  - As contas, porém, não dependem disso: foram refeitas com os preços impressos nas próprias faturas.

---

## 2. Para onde vai o dinheiro

### 2.1 Energia (CELESC), set/2025–ago/2026

| Componente | R$ | O que é |
|---|---:|---|
| Energia (TE) | 1.017.494 | Preço da energia em si (tarifa de energia) |
| Uso da rede (TUSD) | 993.725 | Transporte pela rede da distribuidora |
| Demanda | 139.681 | Potência (kW) usada nas UCs de alta tensão |
| **Demanda sem uso** | **64.358** | Potência contratada e **não usada**: perda |
| **Ultrapassagem** | **50.298** | Potência usada **acima** do contrato, cobrada em dobro: perda |
| Bandeiras | 66.634 | Acréscimo tarifário das bandeiras amarela/vermelha |
| COSIP | 46.373 | Contribuição de iluminação pública, em 13 UCs |
| Infraestrutura | 37.652 | Quase toda numa única "Participação Financeira" (R$ 37.093) |
| Reativo | 2.248 | Energia reativa excedente (fator de potência baixo), em 13 UCs |
| Multas e juros | 470 | Atraso |
| Crédito solar | −231.835 | Energia injetada por 26 UCs com geração |
| IR retido | −34.493 | IR que a Prefeitura retém e não paga à CELESC (fica com o Município) |
| Ajustes | −15.674 | Créditos, devoluções, compensações |
| **Total** | **2.136.711,58** | |

- O **ICMS** (17%) está embutido nos preços: R$ 364.126.
- O **PIS/COFINS** também está embutido.
- O **custo de disponibilidade** (o mínimo cobrado quando a UC quase não consome) somou R$ 13.146 em 52 UCs. Ele está dentro de energia e rede.

**Gasto por ano:**

| Ano | Gasto | Meses |
|---|---:|---|
| 2024 | R$ 1.653.915 | 11 meses (falta março) |
| 2025 | R$ 1.921.712 | 12 meses |
| 2026 | R$ 1.527.155 | 8 meses (jan–ago) |

### 2.2 Água e esgoto (CASAN), set/2025–ago/2026

| Componente | R$ |
|---|---:|
| Água | 1.124.077,80 |
| Esgoto (só 3 matrículas pagam) | 67.606,00 |
| "Valor Serviço" (−4,8%: IR retido, ver 5.3) | −55.789,46 |
| **Total** | **1.135.894,34** |

- Volume: **62.497 m³**, em 112 matrículas.
- Preço médio: **R$ 18,18 por m³**.

---

## 3. Energia — por que se paga cada valor (provas)

### 3.1 Uma fatura refeita item a item: Praça Isabel (UC 1.571.540.011-56), agosto/2026

Grupo A4, modalidade horária verde, **demanda contratada de 35 kW**. Valor da fatura: **R$ 3.413,70**.

| Item | Quantidade | Preço unitário (R$) | Conta | Valor (R$) |
|---|---:|---:|---|---:|
| Demanda | 65,141 kW | 23,6956 | 65,141 × 23,6956 | 1.543,55 |
| **Demanda de Ultrapassagem** | 30,141 kW | 47,39091 | 30,141 × 47,39091 | **1.428,40** |
| Consumo Fora Ponta TE | 831,185 kWh | 0,39457 | | 327,96 |
| Consumo Ponta TE | 40,947 kWh | 0,63351 | | 25,94 |
| Consumo Fora Ponta TUSD | 831,185 kWh | 0,18909 | | 157,17 |
| Consumo Ponta TUSD | 40,947 kWh | 1,40085 | | 57,36 |
| Bandeira Amarela | 872,132 kWh | 0,0247 | | 21,54 |
| Energia Reativa Excedente | 3,629 kWh | 0,42166 | | 1,53 |
| Tributo Retido IRPJ | | | 1,2% da energia + 4,8% da demanda | −149,75 |
| **Total** | | | | **3.413,70** |

**O que a fatura prova:**
- **Contratada.** Faturada 65,141 − ultrapassagem 30,141 = **35 kW**. A fatura não imprime a contratada, mas ela sai da conta.
- **Ultrapassagem custa o dobro.** O preço é 47,39091 = 2 × 23,6956.
  - A REN ANEEL 1.000/2021 manda cobrar em dobro o que passar mais de 5% da contratada.
  - Em agosto, a UC usou 65 kW com contrato de 35: só a ultrapassagem custou R$ 1.428,40.
- **Contrato de 100 kW.** Naquele mês a demanda teria sido 100 × 23,6956 = R$ 2.369,56, sem ultrapassagem. O total de demanda cairia de R$ 2.971,95 para R$ 2.369,56: **R$ 602 a menos só em agosto**.
- **Como conferir.** Sistema → Relatórios → Demanda → Praça Isabel → itens da fatura de ago/2026, ou o PDF da coletiva de agosto/2026.

### 3.2 Impostos dentro do preço e a demanda sem uso (Súmula 391 do STJ)

**Item "Demanda" da fatura acima:**
- ICMS R$ 262,40 de R$ 1.543,55 = **17,0%**.
- PIS/COFINS R$ 102,75 = 6,66%.
- Preço sem impostos: 23,6956 × (1 − 0,17 − 0,0666) ≈ **R$ 18,09/kW**. É esse número que se compara com a tabela da ANEEL (Resolução Homologatória da revisão tarifária CELESC 2026, A4 verde, TUSD demanda).

**A Súmula 391 do STJ já é aplicada pela CELESC às faturas da Prefeitura.** Pela súmula, *"o ICMS incide sobre o valor da tarifa de energia elétrica correspondente à demanda de potência efetivamente utilizada"*.
- **Layout novo** (Centro de Eventos, ago/2026):
  - "Demanda" 70,602 kW a R$ 23,69565, com ICMS de R$ 284,40;
  - "Diferença da Demanda Contratada" 129,398 kW a **R$ 19,66731, ICMS = 0**;
  - 19,66731 ÷ 23,69565 = **0,830**, ou seja, o preço sem os 17% de ICMS.
- **Layout antigo** (jan/2024):
  - "DEMANDA 17 kW × 24,1792";
  - "DEMANDA ISENTA ICMS 18 kW × 20,0695" (20,0695 ÷ 24,1792 = 0,830).
- **Conclusão: não há ICMS a recuperar sobre a demanda não usada.** O dinheiro perdido é a própria demanda sem uso, que se resolve com o ajuste da seção 4.1.
- Correção feita no sistema: a linha "DEMANDA ISENTA ICMS" do layout antigo era lida como demanda usada e passou a ser lida como demanda sem uso. A demanda contratada de 2024 agora sai certa (ex.: Centro de Eventos 52 + 148 = 200 kW).

### 3.3 IR retido na fonte (Tema 1.130 do STF)

- **CELESC:**
  - cada item traz a alíquota de retenção: **1,2% sobre energia** (fornecimento) e **4,8% sobre demanda** (tratada como serviço);
  - em 12 meses a Prefeitura reteve **R$ 34.493**, que ficam com o Município e não vão à CELESC;
  - base: STF, RE 1.293.453, **Tema 1.130**, que garante ao Município o IR retido nos pagamentos que faz, pelas regras da Receita Federal (IN RFB 1.234/2012, depois IN RFB 2.145/2023).
- **CASAN:** a coluna "Valor Serviço" é **−4,8%** do valor de água + esgoto em 2.918 das 3.058 contas lidas. É a mesma retenção de IR: R$ 55.789 em 12 meses.
- **Achado — UC sem retenção:** em 12 meses, **1 UC não teve nenhuma retenção**: **1.565.118.011-49 (Mafalda Lingner Porto)**, com R$ 31.130/ano.
  - Pela taxa efetiva das demais (1,6%), são ~R$ 500/ano que deixaram de ficar com o Município.
  - Conferir se essa UC está em outro CNPJ (fundo, autarquia) ou se é falha de cadastro.

### 3.4 Reajustes da CELESC

| Vigência | Evento | Efeito médio | Alta tensão | Baixa tensão |
|---|---|---:|---:|---:|
| 22/08/2025 | Reajuste anual | +13,53% | +15,80% | +12,41% |
| 22/08/2026 | Revisão tarifária periódica | +10,82% | +14,16% | +9,26% |

- Com o mesmo consumo, o gasto de energia de 2026–2027 sobe cerca de **R$ 231 mil/ano** (2.136.711 × 10,82%).
- As UCs do grupo A (alta tensão) sobem mais: +14,16%.

---

## 4. Energia — como economizar

### 4.1 Ajustar a demanda contratada (alta tensão) — R$ 56 a 67 mil/ano

**Regra:**
- paga-se sempre o **maior** valor entre a demanda medida e a contratada;
- se a medida passar **5%** da contratada, o excedente é cobrado **em dobro** (REN 1.000/2021).

**Simulação:** com a demanda medida mês a mês nos últimos 12 meses e o preço de cada fatura, simulamos o custo para várias contratadas.

| UC | Local | Contratada hoje | Uso medido (mín–mediana–máx) | Custo 12m hoje | Proposta | Custo 12m proposto | Economia | Ultrapassagens na proposta |
|---|---|---:|---|---:|---:|---:|---:|---:|
| 1.788.984.011-25 | Centro de Eventos Hermann Purnhagen | 200 kW | 23 – 65 – 193 | 52.561 | **100 kW** | 29.323 | **23.238** | 1 (set/25, evento) |
| 1.571.540.011-56 | Praça Isabel | 35 kW | 14 – 82 – 112 | 37.794 | **100 kW** | 27.225 | **10.569** | 1 |
| 1.004.748.011-07 | Das Madeiras 3000 | 91 kW | 22 – 38 – 51 | 16.653 | **52 kW** | 9.516 | **7.137** | 0 |
| 1.056.230.011-34 | CAIC | 34 kW | 23 – 58 – 81 | 27.762 | **74 kW** | 20.059 | **7.703** | 1 |
| 1.598.029.011-07 | Posto de Saúde Verdão | 80 kW | 61 – 113 – 195 | 45.662 | **131 kW** | 39.196 | **6.466** | 3 |
| 3.180.517.011-23 | UPA (Lote 20) | 50 kW | 23 – 38 – 46 | 13.140 | **46 kW** | 12.101 | **1.039** | 0 |
| | **Soma** | | | | | | **56.152** | |

**Versão máxima (≈ R$ 67 mil):** aceita mais meses de ultrapassagem, porque a ultrapassagem eventual sai mais barata que pagar potência parada o ano todo. Mudanças em relação à tabela:
- Centro de Eventos em 68 kW (economia de R$ 29.545, 2 ultrapassagens);
- Praça Isabel em 90 kW;
- Das Madeiras 3000 em 39 kW;
- UPA em 41 kW;
- Elevado em 30 kW;
- Wenceslau Borini em 30 kW;
- Ginásio Praça Isabel em 37 kW;
- Escola Modelo em 37 kW.

**Contratadas que estão boas:**
- Adm 25 de Julho, 85 kW: o ajuste daria só R$ 425;
- Elevado, 40 kW;
- Dom Bosco 820, 30 kW (é o mínimo).

**Como fazer:**
- **Aumentos** (Praça Isabel, CAIC, Posto Verdão): pedir já. Cada mês com contrato baixo custa ultrapassagem em dobro.
- **Reduções** (Centro de Eventos, Das Madeiras 3000, UPA): o contrato de uso do sistema de distribuição costuma exigir **aviso de 180 dias** e no máximo **uma redução a cada 12 meses**. Confirme no contrato de cada UC e protocole já, para que a redução valha no início de 2027.
- **Antes de fechar o número**: perguntar a cada secretaria se vem equipamento novo (ar-condicionado, ampliação). Uma ampliação justifica contratar mais, não menos.
- **No sistema**: a aba Demanda mostra, para cada UC, a faixa de uso mês a mês e a sugestão. Repetir a análise a cada 12 meses.

### 4.2 Mercado livre de energia para o grupo A — R$ 64 a 106 mil/ano

**O que diz a norma:**
- A **Portaria MME 50/2022** abriu o mercado livre a **todo o grupo A** (média e alta tensão) a partir de **1º/01/2024**.
- Consumidores abaixo de 500 kW compram por um **comercializador varejista**, que os representa na CCEE.

**O que muda:**
- No mercado livre a Prefeitura deixa de comprar a **energia** (TE) da CELESC e compra de um fornecedor escolhido em licitação.
- A **rede** (TUSD) e a demanda continuam sendo pagas à CELESC.
- **Bandeiras tarifárias não se aplicam** à energia comprada no mercado livre.

**Base da conta (12 UCs do grupo A, set/2025–ago/2026):**

| Item | Valor |
|---|---:|
| Consumo | 1.009.226 kWh |
| Gasto total | R$ 936.164 |
| Energia (TE), a parte que muda de fornecedor | R$ 399.988 |
| Bandeiras, que deixam de existir | R$ 25.897 |
| **Base substituível** | **R$ 425.885/ano** |

**Economia:** desconto de 15% (conservador) a 25% sobre essa base = **R$ 64 mil a R$ 106 mil/ano**. O desconto exato só a licitação dirá. Do que se economiza, descontam-se:
- a taxa do varejista, normalmente embutida no preço;
- eventual adequação do medidor (sistema de medição para faturamento) exigida pela CELESC.

**Riscos e cuidados:**
- contrato de 3 a 5 anos com preço e volume definidos (flexibilidade de volume de ±X%);
- aviso de desligamento do mercado cativo conforme o contrato com a CELESC;
- é preciso **licitação** (Lei 14.133/2021).

**Como fazer:**
1. Levantar a carga das 12 UCs. O sistema já tem o histórico mensal em kWh por posto.
2. Pedir cotações a 3+ varejistas (estimativa de preço).
3. Licitar.
4. Avisar a CELESC.

**Candidatas mais fortes** (maior consumo):

| UC | kWh/ano |
|---|---:|
| Posto Verdão | 256.960 |
| Adm 25 de Julho | 155.213 |
| UPA | 108.192 |
| Centro de Eventos | 102.208 |
| Elevado | 95.875 |
| CAIC | 92.089 |

### 4.3 Faturar pequenas UCs do grupo A como grupo B ("B optante") — R$ 9,9 mil/ano

- **Regra:** a REN 1.000/2021 (art. 292) permite à UC do grupo A ser faturada pela tarifa do grupo B quando a **potência dos transformadores não passa de 112,5 kVA**, entre outros casos. Sem demanda contratada, a UC deixa de pagar demanda, sobra e ultrapassagem.
- **Comparação:** quanto a UC paga hoje contra o que pagaria pela tarifa média do grupo B da própria Prefeitura (energia + rede + bandeira = **R$ 0,8901/kWh**, 106 UCs B sem geração, 12 meses).

| UC | kWh/ano | Hoje (energia + rede + demanda + sobra + ultrapassagem + reativo) | Como B (kWh × 0,8901) | Economia |
|---|---:|---:|---:|---:|
| 1.616.994.011-54 Dom Bosco 820 | 14.165 | R$ 19.697 | R$ 12.608 | **R$ 7.089** |
| 4.165.914.011-94 Pref. Wenceslau Borini | 6.191 | R$ 8.353 | R$ 5.511 | **R$ 2.842** |

- **Condição:** confirmar a potência do transformador (vistoria ou cadastro CELESC).
- **Geração solar:** Dom Bosco 820 tem geração solar. A opção pelo grupo B com geração na própria UC é permitida (Lei 14.300/2022).
- **Grandes UCs:** nas UCs do grupo A de maior consumo a tarifa A4 é mais barata (R$ 0,64 a R$ 0,80/kWh contra R$ 0,89). Para elas, o B optante **não** compensa.

### 4.4 Ligações paradas — R$ 7 a 14,7 mil/ano (energia + água)

**Energia:** 11 UCs ficaram **6 meses ou mais com consumo zero** e pagaram **R$ 11.611** em 12 meses. Pagaram o custo de disponibilidade: o mínimo de 30, 50 ou 100 kWh, conforme a ligação mono, bi ou trifásica (REN 1.000/2021).

| UC | Endereço | Meses zerados / meses | Pago em 12m |
|---|---|---|---:|
| 1.004.868.011-49 | Da Eternidade | 6 / 11 | R$ 4.920 |
| 1.834.057.011-17 | Voluntários da Pátria 190 | 11 / 12 | R$ 1.082 |
| 1.791.319.011-80 | Tupi, Parque Ecológico Farol | 12 / 12 | R$ 1.082 |
| 1.833.368.011-44 | Pe. Pedro Francisco Heisel 13 | 6 / 12 | R$ 1.081 |
| 4.016.828.011-02 | Tupi S/N | 11 / 11 | R$ 982 |
| 4.016.845.011-02 | Tupi S/N | 9 / 9 | R$ 798 |
| 2.503.470.011-00 | Bomfim, Casa Familiar Rural | 10 / 12 | R$ 512 |
| 3.096.781.011-90 | Blumenau, semáforo | 12 / 12 | R$ 324 |
| 3.494.854.011-40 | Itaipu | 12 / 12 | R$ 324 |
| 1.004.839.011-99 | João Ledra, Cemitério | 9 / 12 | R$ 322 |
| 1.833.838.011-60 | Demétrio Fachini, iluminação pública | 12 / 12 | R$ 184 |

**Água:** matrículas com 10+ meses em 0 m³ pagam só a tarifa fixa (R$ 46,34/mês = ~R$ 520/ano cada):
- Estádio 888556-7 (até mai/2026);
- CE Pedro dos Santos 2021869-9;
- ESF Santa Clara 1439655-6;
- Praça Loteamento Gabriel 1704670-0;
- Portal de Informações 1494101-5;
- Telemetria 805161-5;
- CEI Titio Karan 157149-4.

**O que fazer:**
- Para cada uma, a secretaria responsável confirma se a ligação ainda é necessária.
- Se não for, pedir o **encerramento contratual**: na energia acaba o custo de disponibilidade, na água a tarifa fixa.
- Semáforos e iluminação pública zerados merecem vistoria: pode ser medidor parado com consumo real.

### 4.5 Energia reativa (fator de potência) — R$ 1,7 a 2,2 mil/ano

- **Regra:** o grupo A paga energia reativa excedente quando o fator de potência fica abaixo de **0,92** (REN 1.000/2021, apurado hora a hora).
- **Quem pagou:** R$ 2.248 em 12 meses, quase tudo em duas UCs:
  - **Escola Modelo** (2.711.752.011-68): R$ 985;
  - **Dom Bosco 820** (1.616.994.011-54): R$ 734.
- **Ação:** pedir a um eletricista a verificação ou instalação de banco de capacitores nessas duas UCs. É barato e se paga em 1 a 3 anos.

### 4.6 Cobranças em duplicidade e faturas divergentes (valores a recuperar)

1. **Créditos "Pag. Duplicidade - Migrado"** em duas UCs de iluminação pública:
   - UCs: 0050642828 (Fernando Silva) e 0055687072 (Blumenau 1, Trevo Novo).
   - Recebidos de dez/2024 a mai/2025, de R$ 520 a R$ 690 por mês.
   - Isso prova que **houve pagamento em duplicidade** antes, que a CELESC devolve aos poucos.
   - **Ação:** pedir à CELESC o extrato do saldo e conferir se o total devolvido é igual ao total pago a mais.
2. **Faturas com dois valores diferentes para o mesmo mês** (arquivos "fatura desagrupada", "divergência de pagamento" e "anexar ao e-mail"):

   | UC | Mês | Valor no arquivo | Valor já lançado |
   |---|---|---:|---:|
   | CEI Moacir Antonio Tonon (0053566960) | 10/2025 | R$ 290,80 | R$ 122,72 |
   | | 11/2025 | R$ 2.456,53 | R$ 94,48 |
   | | 12/2025 | R$ 2.410,75 | R$ 2.359,79 |
   | Escola Modelo (0045538486) | 02/2025 | R$ 253,65 | R$ 2.982,49 |
   | | 03/2025 | R$ 2.404,76 | R$ 3.409,57 |
   | | 04/2025 | R$ 913,72 | R$ 656,14 |
   | CE Anibal de Barba (0012269676) | 12/2024 | R$ 716,14 | R$ 74,13 |
   | Pref. Luiz Adelar Soldatelli (0028501269) | 06/2024 | R$ 21,80 | R$ 49,39 |
   | | 07/2024 | R$ 22,60 | R$ 51,23 |

   - A **multa de R$ 383,35** do CEI Moacir (único caso relevante de multa em 12 meses) está ligada a essa sequência.
   - **Ação:** a Fazenda cruza com os pagamentos efetivos. O que foi pago duas vezes deve ser devolvido.
   - **Base legal:** o Código de Defesa do Consumidor (Lei 8.078/1990, art. 42, parágrafo único) prevê devolução **em dobro** do que foi cobrado indevidamente, salvo engano justificável. A REN 1.000/2021 tem regra própria de devolução.
3. **No sistema:** a fatura em duplicidade fica separada para decisão. A CELESC às vezes cobra 2 ou mais faturas do mesmo mês.

### 4.7 Energia solar e a Lei 14.300/2022

- **Hoje:** 26 UCs injetam energia e geraram **R$ 231.835 de crédito** em 12 meses. É a maior "economia" já existente.
- **Fio B (Lei 14.300/2022):** para sistemas ligados a partir de 07/01/2023, a parte "fio B" da tarifa deixa de ser compensada aos poucos:

  | Ano | 2023 | 2024 | 2025 | 2026 | 2027 | 2028 |
  |---|---:|---:|---:|---:|---:|---:|
  | Fio B que deixa de ser compensado | 15% | 30% | 45% | **60%** | 75% | 90% |

  Sistemas homologados **antes** de 07/01/2023 mantêm a compensação integral até 2045.
- **Ação 1:** registrar no sistema a data de homologação de cada usina, para saber quais têm direito adquirido.
- **Ação 2:** novas usinas só valem a pena onde o consumo é **diurno e alto** (escolas, Adm 25 de Julho, Posto Verdão), para usar a energia na hora e depender menos da compensação.
- **Grupo A:** o crédito compensa energia, **não** demanda. Antes de pôr usina numa UC do grupo A, ajustar a demanda (4.1).

### 4.8 COSIP cobrada de prédios municipais — R$ 46.373/ano (13 UCs)

- **O que é:** a Contribuição para Custeio da Iluminação Pública (CF, art. 149-A) é um tributo **municipal** cobrado na fatura da CELESC.
- **O problema:** quando cai sobre prédios da própria Prefeitura, o Município paga a si mesmo, por intermédio da CELESC.
- **O que verificar:** se a lei municipal da COSIP de Rio do Sul isenta os imóveis do Município.
  - Se isentar, pedir à CELESC que pare de cobrar nessas 13 UCs.
  - Se não isentar, avaliar alterar a lei.
- **Atenção:** não é economia "do Município" inteira, porque a receita volta ao fundo de iluminação. O ganho é tirar o valor da despesa das secretarias e de eventual tarifa de arrecadação da CELESC.

### 4.9 "Participação Financeira" de R$ 37.093

- **Onde:** entrou na fatura de ago/2026 da UC 1.004.706.011-01 (EB Anibal de Barba).
- **O que é:** obra de rede (provavelmente para ligar a usina solar da escola).
- **Ação:** conferir se houve orçamento de conexão aprovado e assinado, se o valor bate com o orçamento e se a obra foi feita.
- **Base:** pela REN 1.000/2021, a participação do consumidor numa obra depende de orçamento prévio da distribuidora.

### 4.10 Bandeiras tarifárias — R$ 66.634/ano

- No mercado cativo, as bandeiras não podem ser evitadas.
- Há três caminhos:
  - reduzir consumo nos meses de bandeira vermelha (ar-condicionado e iluminação);
  - geração solar;
  - mercado livre (4.2), que elimina bandeiras para o grupo A.

---

## 5. Água — por que se paga cada valor (provas)

### 5.1 A tarifa da CASAN, tirada das próprias contas

A tarifa da categoria **pública** (economia única) foi reconstruída a partir das contas. Ela fecha **ao centavo** com todas as contas conferidas.

| Vigência (nas contas) | Tarifa fixa (0 m³) | 1 a 10 m³ (por m³) | Acima de 10 m³ (por m³) |
|---|---:|---:|---:|
| até mai/2024 | R$ 37,31 | R$ 5,49 | R$ 15,41 |
| jun/2024 – fev/2025 | R$ 43,31 | R$ 6,37 | R$ 17,89 |
| mar/2025 – nov/2025 | R$ 45,72 | R$ 6,72 | R$ 18,88 |
| dez/2025 – mar/2026 | R$ 43,80 | R$ 6,44 | R$ 18,09 |
| **abr/2026 em diante** | **R$ 46,34** | **R$ 6,81** | **R$ 19,14** |

Quem passa de 10 m³ paga **R$ 19,14 por m³** a mais. É aí que vazamento e desperdício custam caro.

**Provas (contas refeitas):**
- **Policlínica (919792-3), jul/2024**, 787 m³:
  - conta: 43,31 + 10 × 6,37 + 777 × 17,89 = **R$ 14.007,54**;
  - impresso: R$ 14.007,54 ✔.
- **CE Anibal de Barba (2021938-5), set/2026**, 147 m³:
  - água: 46,34 + 10 × 6,81 + 137 × 19,14 = **R$ 2.736,62** ✔;
  - esgoto igual à água: R$ 2.736,62 ✔;
  - retenção: −4,8% de 5.473,24 = −262,72;
  - total **R$ 5.210,52** ✔.

**Cada mudança de preço bate com um ato oficial:**

| Mudança | Variação | Ato |
|---|---:|---|
| 43,31 → 45,72 (mar/2025) | +5,56% | **Resolução ARESC nº 321/2025** (IPCA de abr/2023 a set/2024), vigente a partir de 1º/03/2025 |
| 45,72 → 43,80 (dez/2025) | −4,2% | **Redução de 4,2%** anunciada pelo Governo do Estado em 22/10/2025 para os 195 municípios da CASAN |
| 43,80 → 46,34 (abr/2026) | +5,80% | **Resolução ARESC nº 389, de 13/02/2026** (IPCA de out/2024 a dez/2025), vigente 30 dias após a publicação |
| 37,31 → 43,31 (jun/2024) | +16,1% | Ato ainda não localizado. Conferir no site da ARESC qual resolução autorizou esse reajuste |

### 5.2 Esgoto

- Só **3 matrículas** pagam esgoto, sempre igual a **100% do valor da água**: R$ 67.606 em 12 meses.
  - CE Anibal de Barba: R$ 46.184;
  - Prédio Sec. Assistência Social: R$ 11.198;
  - CE Canta Galo: R$ 10.223.
- Nessas três, cada m³ acima de 10 custa **R$ 38,28** (R$ 19,14 de água + R$ 19,14 de esgoto). A Anibal de Barba paga, em média, **R$ 35 por m³**, o dobro do resto.
- **Ação:** confirmar com a CASAN que as três estão de fato ligadas à rede de esgoto. Se não estiverem, a cobrança é indevida.
- **Ação:** nessas escolas, toda economia de água vale em dobro. Priorizar torneiras com temporizador, conserto de descargas e reaproveitamento de chuva.

### 5.3 "Valor Serviço" = IR retido

- A coluna "Valor Serviço" do relatório SCI8095 é **−4,8%** do valor de água + esgoto em 2.918 de 3.058 contas. É a retenção de IR (Tema 1.130, item 3.3).
- **Quando o valor é positivo**, é serviço de verdade (ligação, religação, conserto). Exemplo: Estádio 888556-7 em jun/2026, R$ 647,15.
  - **Ação:** conferir cada serviço cobrado.

---

## 6. Água — como economizar

### 6.1 Vazamentos: o maior desperdício — R$ 60 a 124 mil/ano

**Caso real: CE Anibal de Barba (2021938-5)**

| Mês | Consumo | Valor (água + esgoto) |
|---|---:|---:|
| Normal em 2024 | 25 a 75 m³/mês | R$ 700 a 2.400/mês |
| fev/2025 | **596 m³** | R$ 20.164 |
| mar/2025 | **1.072 m³** | R$ 38.391 |
| abr/2025 | **1.167 m³** | R$ 41.806 |

- Só nesses 3 meses o excesso passou de **R$ 95 mil**.
- **Desde fev/2026 o consumo dobrou de novo:** 240 a 304 m³/mês contra ~130 a 160 no fim de 2025. **Vistoriar agora.**

**Picos nos últimos 12 meses:** consumo acima do dobro da mediana da matrícula e +30 m³.
- **60 ocorrências**, excesso estimado em **R$ 123.600**.
- Estimativa: m³ a mais × R$ 19,14 × 2 onde há esgoto × 0,952 de retenção.

Os maiores picos de set/2025 a set/2026:

| Mês | Matrícula | Local | Consumo (m³) | Mediana (m³) | Excesso (R$) |
|---|---|---|---:|---:|---:|
| 05/2026 | 2021937-7 | Escola Modelo Ella Kurth | 506 | 100 | 7.398 |
| 06/2026 | 2021938-5 | CE Anibal de Barba | 304 | 147 | 5.721 |
| 03/2026 | 2021938-5 | CE Anibal de Barba | 301 | 147 | 5.612 |
| 06/2026 | 2021937-7 | Escola Modelo Ella Kurth | 375 | 100 | 5.011 |
| 04/2026 | 2021937-7 | Escola Modelo Ella Kurth | 362 | 100 | 4.774 |
| 09/2026 | 888556-7 | Estádio Municipal | 256 | 0 | 4.665 |
| 06/2026 | 233724-0 | Estádio Municipal | 332 | 113 | 3.990 |
| 03/2026 | 1965634-3 | Prefeitura (matrícula 1965634-3) | 220 | 9 | 3.845 |
| 09/2026 | 233724-0 | Estádio Municipal | 322 | 113 | 3.808 |
| 12/2025 | 586369-4 | Ginásio Municipal | 220 | 38 | 3.316 |
| 09/2025 | 233725-8 | Ginásio Municipal | 223 | 45 | 3.243 |
| 02/2026 | 2065051-5 | Prefeitura (matrícula 2065051-5) | 176 | 1 | 3.189 |
| 08/2026 | 233724-0 | Estádio Municipal | 288 | 113 | 3.189 |
| 01/2026 | 228597-5 | Pavilhão 01 Hermann | 258 | 84 | 3.171 |
| 10/2025 | 233725-8 | Ginásio Municipal | 210 | 45 | 3.007 |

O **complexo do Estádio** (233724-0, 888556-7 e Cancha de Bocha 850410-5, na R. Prç. Isabel) está subindo desde jun/2026:
- 888556-7 saiu de **0** para 144 e depois 256 m³;
- 233724-0 passou de ~113 para ~300 m³.

Pode ser vazamento ou irrigação nova do gramado. **Vistoriar.**

**Como recuperar parte do valor (revisão da fatura):**
- As condições gerais de prestação dos serviços de água e esgoto em SC são da ARESC (Resolução ARESC nº 046/2016 e alterações; confirmar o texto vigente).
- A regra prevê revisão da conta quando o consumo alto vem de **vazamento oculto** na instalação interna, desde que o usuário **comprove o conserto**.
- Na prática do setor, a revisão cobra a água pela **média dos últimos 6 meses** e limita o esgoto à média.
- **Procedimento:**
  1. Alerta no sistema (mês seguinte à leitura).
  2. Vistoria em até 5 dias.
  3. Conserto, com nota fiscal e fotos.
  4. Pedido de revisão à CASAN com os comprovantes.
  5. Acompanhar o crédito na conta seguinte.
- **Como isso entra no sistema:** desde esta versão, o relatório de **Alertas** compara cada conta com o **mês anterior** (um salto de um mês para o outro é o sinal típico de vazamento) e com o **mesmo mês do ano anterior** (mudança de uso, cobrança nova). O mesmo aviso aparece na conferência da importação.
- **Premissa da economia:**
  - conservadora: metade do excesso, pegando o vazamento no 1º mês em vez de deixá-lo correr 2 a 3 meses;
  - máxima: o excesso inteiro.

### 6.2 Policlínica (919792-3): de 900 m³ para zero

| Período | Consumo | Custo |
|---|---:|---|
| 2024 e 2025 | 800 a 1.100 m³/mês | ~R$ 16 a 18 mil/mês |
| dez/2025 | 461 m³ | |
| jan/2026 em diante | **0 m³** | só a tarifa fixa |

Ou a unidade mudou de endereço ou de fonte de água, ou **o medidor parou**.
- **Se o medidor parou:** a CASAN pode cobrar depois o consumo não medido, pela média. O risco é de ~R$ 150 mil acumulados em 2026. Avisar a CASAN e pedir troca do medidor, para não acumular passivo.
- **Se a unidade mudou:** encerrar a matrícula e verificar onde o consumo foi parar.

### 6.3 Os 15 maiores consumidores de água (12 meses)

| Matrícula | Local | m³/mês | R$ 12m | R$/m³ |
|---|---|---:|---:|---:|
| 2021932-6 | CE Prefeito Luiz Adelar | 463 | 98.455 | 17,73 |
| 2021938-5 | CE Anibal de Barba (com esgoto) | 209 | 87.933 | 35,02 |
| 1820125-3 | UPA | 288 | 60.758 | 17,59 |
| 888822-1 | Cemitério Municipal | 287 | 60.473 | 17,59 |
| 919792-3 | Policlínica de Referência | 270 | 57.894 | 17,89 |
| 821982-6 | Pavilhão 02 Hermann | 207 | 43.565 | 17,50 |
| 2075897-9 | Prefeitura | 159 | 39.013 | 20,48 |
| 233724-0 | Estádio Municipal | 169 | 35.507 | 17,51 |
| 2021937-7 | Escola Modelo Ella Kurth | 164 | 34.589 | 17,59 |
| 580992-4 | Prédio Central | 125 | 25.917 | 17,31 |
| 2021924-5 | CE Prefeito Danilo Lourival | 123 | 25.696 | 17,36 |
| 2021884-2 | CE Cinderela | 106 | 21.774 | 17,16 |
| 356784-2 | Prédio Sec. Assistência Social (com esgoto) | 54 | 21.319 | 33,10 |
| 1908860-4 | CEI Moacir Antonio Tonon | 100 | 20.447 | 17,10 |
| 233709-6 | EB Alfredo J. Krieck | 98 | 20.137 | 17,18 |

Esses 15 somam **R$ 653 mil**, 57% da conta de água.

**Ações:**
- **Cemitério (287 m³/mês = 9,6 m³ por dia):** volume alto para limpeza e rega. Vistoriar vazamento e torneiras abertas; avaliar cisterna de chuva.
- **Estádio e pavilhões:** rega de gramado e limpeza com **água de chuva**. Cada m³ de chuva usado no lugar da rede economiza R$ 19,14. O Estádio sozinho (233724-0) usa ~169 m³/mês: metade com cisterna = **~R$ 19 mil/ano**.
- **Escolas** (CE Luiz Adelar, Escola Modelo, CE Danilo, CE Cinderela): torneiras com fechamento automático, descargas reguladas, controle de bebedouros e vistoria trimestral do hidrômetro com a escola fechada (consumo com tudo fechado = vazamento).
- **Meta:** 5% de redução no volume total = 3.125 m³ × R$ 18,18 = **R$ 56.800/ano**. 10% = **R$ 113.600/ano**.

### 6.4 Matrícula com várias economias

- **Praça Emembergo Pellizzetti (1328869-5)** está cadastrada com **4 economias**, o que muda o cálculo (tarifa fixa e faixas por economia).
- Com o consumo atual, isso a deixa até mais barata (82 m³: R$ 1.261,64 com 4 economias contra ~R$ 1.492 com 1). Ainda assim, convém confirmar se o cadastro é real.

---

## 7. Plano de ação

| Prazo | Ação | Responsável sugerido | Economia/ano |
|---|---|---|---:|
| **Já** | Vistoria de vazamento: Estádio (3 matrículas), Escola Modelo, Anibal de Barba | Obras / Manutenção | até R$ 60 mil |
| **Já** | Policlínica: avisar a CASAN do consumo zerado e pedir verificação do medidor | Saúde / Planejamento | evita passivo |
| **Já** | Pedir aumento de demanda: Praça Isabel (100), CAIC (74), Posto Verdão (131) | Planejamento → CELESC | R$ 24,7 mil |
| 30 dias | Protocolar redução de demanda: Centro de Eventos (100), Das Madeiras 3000 (52), UPA (46) | Planejamento → CELESC | R$ 31,4 mil |
| 30 dias | Fazenda cruza as faturas divergentes e duplicadas (4.6) com os pagamentos | Fazenda | a apurar |
| 30 dias | Conferir a Participação Financeira de R$ 37.093 e a UC sem IR retido | Fazenda / Planejamento | R$ 37 mil (único) + R$ 500/ano |
| 60 dias | Vistoriar transformador de Dom Bosco 820 e Wenceslau Borini; pedir B optante | Obras → CELESC | R$ 9,9 mil |
| 60 dias | Encerrar ligações sem uso (lista 4.4) | Secretarias | R$ 7 a 14,7 mil |
| 90 dias | Capacitores na Escola Modelo e Dom Bosco 820 | Obras | R$ 1,7 mil |
| 90 dias | COSIP sobre prédios municipais: parecer jurídico | Procuradoria | (R$ 46 mil de despesa) |
| 90 dias | Confirmar ligação de esgoto das 3 matrículas que pagam esgoto | Planejamento → CASAN | a apurar |
| 6–12 meses | Mercado livre para o grupo A: estudo, licitação e migração | Planejamento / Licitações | R$ 64 a 106 mil |
| 6–12 meses | Programa de uso eficiente de água nas escolas e cisternas no Estádio e Cemitério | Educação / Obras | R$ 57 a 114 mil |
| Todo mês | Revisar a aba Alertas: mês anterior e mesmo mês do ano anterior | Planejamento | (sustenta tudo acima) |

---

## 8. O que o sistema já faz e o que foi corrigido para este estudo

- **Alertas em duas comparações:**
  - com o mês anterior: salto de um mês para o outro, possível vazamento;
  - com o mesmo mês do ano anterior: mudança de uso, cobrança nova ou tarifa.
  - Cada alerta mostra as duas comparações lado a lado e o motivo provável.
  - Consumo que sai do zero agora aparece como "Consumo subiu", não mais como "Valor subiu".
- **Perdas no painel:** ultrapassagem, demanda sem uso, reativo e multas aparecem no gráfico anual e no relatório.
- **Demanda:** para cada UC do grupo A, faixa de uso mês a mês e sugestão de contratada.
- **Correção do layout antigo da CELESC (até abr/2024):** "DEMANDA ISENTA ICMS" passou a ser lida como demanda sem uso. A demanda contratada de 2024 estava dobrada em algumas UCs.
- **Itens "Pag. Duplicidade - Migrado" e "Item Migrado"** agora entram em "ajustes", não em "outros".
- **Pendência de cadastro:** 113 contratos CELESC antigos (código de 10 dígitos) duplicam UCs que já existem com o código novo. Eles guardam só jan–abr/2024. Precisam ser fundidos ao contrato novo para que o histórico de cada UC fique num lugar só ("quem manda é a matrícula").

---

## 9. Fontes

**Normas e decisões** (confira o texto vigente no site oficial antes de pedidos formais):
- ANEEL — Resolução Normativa nº 1.000/2021, regras de prestação do serviço de distribuição:
  - demanda, ultrapassagem, reativo (fator de potência 0,92), custo de disponibilidade;
  - opção de faturamento pelo grupo B (art. 292);
  - texto: https://www.legisweb.com.br/legislacao/?id=490988 · resumo: https://www.osetoreletrico.com.br/?p=42765
- MME — Portaria nº 50/2022, abertura do mercado livre ao grupo A desde 01/01/2024:
  - https://canalsolar.com.br/en/mme-publica-portaria-de-abertura-do-mercado-livre-para-consumidores-do-grupo-a
  - https://www.osetoreletrico.com.br/?p=48239
  - https://www.osetoreletrico.com.br/?p=159362
- STJ — Súmula 391, ICMS só sobre a demanda efetivamente utilizada:
  - https://stj.jus.br/publicacaoinstitucional/index.php/sumstj/article/download/5455/5579
  - https://www.conjur.com.br/2009-out-07/novas-sumulas-stj-consolidam-jurisprudencia-tributaria//?print=1
- STF — RE 1.293.453, Tema 1.130, IR retido pelos Municípios:
  - https://planaltina.go.gov.br/wp-content/uploads/2026/03/RETENCAO-AMPLA-IMPOSTO-DE-RENDA-CONTRATOS.pdf
  - https://www.cruzeiro.sp.gov.br/wp-content/uploads/2023/08/Decreto-135-2023-Regulam-IN-2145-23-Retencoes-do-IR.pdf
- Lei 14.300/2022, marco da geração distribuída e escalonamento do fio B:
  - https://canalsolar.com.br/consumidores-60-do-fio-b-2026/
  - https://canalsolar.com.br/tarifacao-fio-b-lei-14-300/
- B optante: https://canalsolar.com.br/consumidores-do-grupo-a-faturados-como-grupo-b/ · https://brasilenergia.com.br/energia/as-novas-regras-de-faturamento-para-consumidores-b-optante-uma-visao-juridica-das-resolucoes-aneel-e-a-lei-14-300
- Código de Defesa do Consumidor, Lei 8.078/1990, art. 42, parágrafo único: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- ARESC — Resolução nº 389/2026, reajuste CASAN de 5,80%: https://www.legisweb.com.br/legislacao/?id=490808
- ARESC — Resolução nº 321/2025, reajuste CASAN de 5,56%: https://www.legisweb.com.br/legislacao/?id=472607
- ARESC — Resolução nº 046/2016, condições gerais de água e esgoto, revisão por vazamento oculto. Confirmar o texto vigente em aresc.sc.gov.br.

**Tarifas e reajustes:**
- CELESC 2025 (+13,53%):
  - https://cenarioenergia.com.br/2025/08/19/aneel-aprova-novos-reajustes-tarifarios-da-celesc-e-indices-entram-em-vigor-nesta-sexta-feira/
  - https://acionista.com.br/reajuste-tarifario-da-celesc-o-que-esperar-agora/
- CELESC 2026 (revisão, +10,82%):
  - https://cenarioenergia.com.br/2026/08/19/aneel-aprova-revisao-tarifaria-da-celesc-com-efeito-medio-de-1082-em-santa-catarina/
  - https://timesbrasil.com.br/empresas-e-negocios/energia/aneel-aprova-reajuste-de-1082-na-celesc-alta-sera-de-926-para-baixa-tensao/
- CASAN, redução de 4,2% (out/2025): https://seucreditodigital.com.br/tarifa-agua-2026-reducao-afeta-conta/
- CASAN, reajustes anuais: https://condominiosc.com.br/radar/5825-casan-reajusta-tarifa-anual

**Dados do Município:**
- Faturas CELESC e CASAN importadas no SisPu.JP 2.0, conferidas contra os totais impressos.
- Tabelas, simulações e listas deste estudo podem ser refeitas no sistema: Relatórios, com o período set/2025–ago/2026.
