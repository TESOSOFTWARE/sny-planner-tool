// [MoM §3.1] Preserve source PI formats; resolve links against the caller's
// catalog, never query a database here or fuzzy-match fragments of prose.
const textOf = (value: unknown) => String(value ?? '').trim()
const exactKey = (value: string) => value.replace(/\s+/g, ' ').toUpperCase()
const aliasKey = (value: string) => exactKey(value).replace(/\s/g, '')
const withoutAnnotation = (value: string) => value.replace(/\s*\([^()]*\)$/, '').trim()

export function productionPiResolver(knownPis: readonly string[]) {
  const exact = new Map<string, Set<string>>()
  const aliases = new Map<string, Set<string>>()
  const add = (index: Map<string, Set<string>>, key: string, pi: string) => {
    const values = index.get(key) ?? new Set<string>(); values.add(pi); index.set(key, values)
  }
  for (const raw of knownPis) {
    const pi = textOf(raw)
    if (!pi) continue
    add(exact, exactKey(pi), pi)
    add(aliases, aliasKey(pi), pi)
    add(aliases, aliasKey(withoutAnnotation(pi)), pi)
  }
  return (value: unknown): string | null => {
    const text = textOf(value)
    if (!text) return null
    const matches = exact.get(exactKey(text)) ?? aliases.get(aliasKey(text)) ?? aliases.get(aliasKey(withoutAnnotation(text)))
    return matches?.size === 1 ? Array.from(matches)[0] : null
  }
}

export function productionPi(value: unknown, knownPis?: readonly string[]): string | null {
  if (knownPis) return productionPiResolver(knownPis)(value)
  const text = textOf(value), core = withoutAnnotation(text)
  // Keep unlinked references for preview, including 25KGI201, KSSNY19AR1,
  // GST 26-2 and OVS26-1(PO# NY3543). Confirm resolves against known PIs.
  const code = /^[A-Z0-9]+(?:[-./][A-Z0-9]+)*$/i.test(core)
    || /^[A-Z][A-Z0-9]*\s+\d+(?:[-./][A-Z0-9]+)*$/i.test(core)
  return code && /[A-Z]/i.test(core) && /\d/.test(core) ? text : null
}
