// Regras de tarifa que a análise por IA recebe junto com os números. Só regras (como se cobra);
// os PREÇOS não ficam aqui: saem das próprias faturas importadas, então seguem os reajustes da
// CELESC e da CASAN sozinhos. Fonte: estudo economia.md (REN ANEEL 1.000/2021 e faturas de
// Rio do Sul). Quando a ANEEL, a CELESC ou a CASAN mudarem uma regra, atualizar este texto e a data.
export const REGRAS_ATUALIZADAS_EM = "2026-10";

export const REGRAS_TARIFARIAS = `
ENERGIA (CELESC)
- Grupo A (alta tensão, subgrupos A4 etc.): paga energia (kWh) e demanda (kW). Paga-se sempre o MAIOR entre a demanda medida e a contratada.
- Demanda medida acima de 105% da contratada: o excedente é "ultrapassagem", cobrada em dobro (REN ANEEL 1.000/2021). Abaixo da contratada: paga a contratada inteira ("demanda sem uso").
- Mudar a demanda contratada: aumento vale no ciclo seguinte; redução costuma exigir aviso de 180 dias e só uma vez por ano (confirmar no contrato com a CELESC).
- Grupo B (baixa tensão): paga só energia. Se consumir menos que o mínimo, paga o "custo de disponibilidade": 30 kWh (monofásico), 50 kWh (bifásico) ou 100 kWh (trifásico) por mês, por relógio.
- Cada relógio (UC) é cobrado separado: dois relógios no mesmo prédio pagam dois mínimos (grupo B) ou duas demandas contratadas (grupo A). Juntar relógios soma as cargas: num relógio só, a demanda necessária costuma ser MENOR que a soma das duas, porque os picos raramente acontecem na mesma hora; a soma das demandas medidas é o teto (conservador).
- Juntar relógios do grupo B pode exigir ligação trifásica maior ou passar o prédio para o grupo A (com demanda contratada): isso muda a tarifa e precisa de projeto elétrico e pedido à CELESC.
- "B optante": UC do grupo A com transformador de até 112,5 kVA pode pedir para ser faturada como grupo B (sem demanda); compensa quando a demanda paga é alta em relação ao consumo.
- Reajustes anuais da CELESC em 22 de agosto (2026: +10,82% em média; alta tensão +14,16%).
- Bandeiras tarifárias somam ao preço da energia em meses de geração cara.

ÁGUA E ESGOTO (CASAN)
- Cada matrícula (ligação) paga no mínimo a tarifa mínima de 10 m³ por mês, mesmo sem consumo; acima disso paga por m³ (em 2026, cerca de R$ 19,14/m³ de água e o dobro onde há esgoto).
- Duas matrículas no mesmo prédio pagam duas tarifas mínimas. Unificar exige obra hidráulica (ligar as redes internas, retirar um hidrômetro) e pedido de cancelamento da matrícula à CASAN.
- Subida forte e sem motivo do consumo quase sempre é vazamento; com o conserto comprovado, a CASAN pode revisar a conta pela média.
- Consumo zerado por meses seguidos pode ser hidrômetro parado: a CASAN pode cobrar depois pela média.

AO RECOMENDAR UNIFICAR LIGAÇÕES
- Economia por ano = o que deixa de ser cobrado nas ligações extras (mínimos, demanda contratada a mais), usando os valores do JSON.
- Não invente custo de obra. Diga quanto a obra poderia custar no máximo para se pagar em 2 anos (economia anual × 2) e que é preciso orçamento.
`.trim();
