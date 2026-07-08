/** Minuscolo, senza accenti, punteggiatura -> spazi. Per ricerche tolleranti. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // toglie i segni diacritici (accenti)
    .replace(/[^a-z0-9]+/g, ' ')       // punteggiatura/trattini -> spazio
    .trim()
}

/**
 * true se ogni parola della query compare in una qualsiasi delle parti
 * (nome, squadra...). Ignora accenti e punteggiatura; query vuota = match.
 */
export function matchesQuery(parts: string[], q: string): boolean {
  const hay = normalizeText(parts.join(' '))
  const tokens = normalizeText(q).split(' ').filter(Boolean)
  return tokens.every(t => hay.includes(t))
}
