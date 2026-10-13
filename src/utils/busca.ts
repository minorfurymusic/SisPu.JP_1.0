// Busca usada nas telas: sem acento e sem diferença de maiúsculas, por palavras (todas precisam
// aparecer, em qualquer ordem: "lar da menina" acha "LAR DAS MENINAS 1"). Palavra com números
// também é comparada só pelos dígitos, para "2850490" achar "0028504900" e "1.836.993.011-65".
export const normBusca = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const soDigitos = (v: string) => v.replace(/\D/g, "");

export function buscaBate(texto: string, busca: string) {
  const termos = normBusca(busca).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const alvo = normBusca(texto), alvoDig = soDigitos(texto);
  return termos.every(t => alvo.includes(t) || (/^[\d.\-\/]+$/.test(t) && soDigitos(t).length >= 4 && alvoDig.includes(soDigitos(t))));
}
