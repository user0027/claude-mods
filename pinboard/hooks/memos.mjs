export const MAX_MEMO = 4
export const TEXT_LIMIT = 400

export function sanitize(list) {
  if (!Array.isArray(list)) return []
  let kept = list.filter((item) => item && typeof item.text === 'string')
  while (kept.length > MAX_MEMO) kept = withoutOldest(kept)
  return kept
}

export function evictIndex(list) {
  const doneAt = list.findIndex((item) => item.done)
  return doneAt >= 0 ? doneAt : 0
}

export function withoutOldest(list) {
  const out = evictIndex(list)
  return list.filter((_, index) => index !== out)
}

export function numbered(list) {
  return [...list.filter((item) => !item.done), ...list.filter((item) => item.done)]
}

export function shorten(text, limit) {
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

export function memoText(input) {
  let text = String(input || '').trim()
  let important = false
  while (text.startsWith('!')) {
    important = true
    text = text.slice(1).trim()
  }
  return text ? { text: shorten(text, TEXT_LIMIT), important } : null
}
