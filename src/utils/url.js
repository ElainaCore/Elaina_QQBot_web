export function safeExternalUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text, 'http://localhost')
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : ''
  } catch {
    return ''
  }
}

export function safeMediaUrl(value) {
  const text = String(value || '').trim()
  if (text.startsWith('/') && !text.startsWith('//')) return text
  return safeExternalUrl(text)
}

export function openExternalUrl(value) {
  const url = safeExternalUrl(value)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
