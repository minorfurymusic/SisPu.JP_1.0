import { useEffect, useState } from "react";

// Outros nomes de cada contrato e unidade gestora, para a busca: o nome na aba Informações
// (ex.: "Lar da Menina") e o edifício. Uma busca só por versão dos dados, dividida entre as telas.
export type Apelidos = { contratos: Record<string, string>; unidades: Record<string, string> };
const VAZIO: Apelidos = { contratos: {}, unidades: {} };
let cache: { versao: unknown; promessa: Promise<Apelidos> } | null = null;

export function useApelidos(versao?: unknown): Apelidos {
  const [apelidos, setApelidos] = useState<Apelidos>(VAZIO);
  useEffect(() => {
    if (!cache || cache.versao !== versao) {
      cache = { versao, promessa: fetch("/api/busca/apelidos").then(r => (r.ok ? r.json() : VAZIO)).catch(() => VAZIO) };
    }
    let vivo = true;
    cache.promessa.then(a => { if (vivo) setApelidos(a); });
    return () => { vivo = false; };
  }, [versao]);
  return apelidos;
}
