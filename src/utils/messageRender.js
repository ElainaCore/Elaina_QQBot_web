import { safeExternalUrl, safeMediaUrl } from './url'

const MEDIA_RE = /\[(图片|语音|视频|文件|媒体|media)](\S+)/
const IMG_URL_RE = /(?:<[^>]*>)*<(https?:\/\/[^>]*(?:multimedia\.nt\.qq\.com\.cn|qqbot\.ugcimg\.cn|gchat\.qpic\.cn)[^>]*)>/
const MD_IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/
const COSTLY_DOMAINS = ['myqcloud.com', 'aliyuncs.com', 'cos.ap-']

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function keyboardHtml(raw) {
  try {
    const rows = JSON.parse(raw)?.content?.rows || []
    const svg = 'width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"'
    const icons = {
      0: '<svg ' + svg + '><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      1: '<svg ' + svg + '><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
      2: '<svg ' + svg + '><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    }
    const content = rows.map(row => {
      const buttons = (row.buttons || []).map(button => {
        const render = button.render_data || {}
        const action = button.action || {}
        const actionType = Number.isInteger(Number(action.type)) ? Number(action.type) : 2
        const classes = ['kb-btn', 'kb-t' + actionType]
        if (render.style === 1) classes.push('kb-primary')
        const tip = [action.data, action.enter ? '回车发送' : ''].filter(Boolean).join(' · ')
        const title = tip ? ' title="' + escapeHtml(tip) + '"' : ''
        return '<span class="' + classes.join(' ') + '"' + title + '>' + (icons[actionType] || icons[2]) + escapeHtml(render.label || '?') + '</span>'
      })
      return '<div class="kb-row">' + buttons.join('') + '</div>'
    }).join('')
    return content ? '<div class="kb-wrap">' + content + '</div>' : ''
  } catch {
    return ''
  }
}

export function renderContent(content) {
  if (!content) return ''
  let text = String(content)
  let keyboard = ''
  const index = text.indexOf('\n[keyboard] ')
  if (index !== -1) {
    keyboard = keyboardHtml(text.slice(index + 12))
    text = text.slice(0, index)
  }
  let html = escapeHtml(text)
  html = html.replace(/\x60\x60\x60([\s\S]*?)\x60\x60\x60/g, '<pre class="md-code-block">$1</pre>')
  html = html.replace(/\x60([^\x60]+)\x60/g, '<code class="md-code">$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  html = html.replace(/\*(.+?)\*/g, '<i>$1</i>')
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>')
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '')
  html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_, label, rawUrl) => {
    const url = safeExternalUrl(rawUrl.replaceAll('&amp;', '&'))
    return url ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="md-link">' + label + '</a>' : label
  })
  return html.replace(/\n/g, '<br>') + keyboard
}

export function parseMedia(content) {
  if (!content) return null
  const match = content.match(MEDIA_RE)
  if (match) {
    const src = safeMediaUrl(match[2])
    return src ? { type: match[1], src, text: content.replace(match[0], '').trim() } : null
  }
  const image = content.match(IMG_URL_RE)
  if (image) {
    const src = safeMediaUrl(image[1])
    return src ? { type: '图片', src, text: content.replace(image[0], '').trim() } : null
  }
  const markdown = content.match(MD_IMG_RE)
  if (markdown) {
    const src = safeMediaUrl(markdown[1])
    return src ? { type: '图片', src, text: content.replace(markdown[0], '').trim() } : null
  }
  return null
}

export function parseSegments(message) {
  if (!message.raw_message || typeof message.raw_message !== 'string' || message.raw_message[0] !== '{') return null
  let segments
  try {
    segments = JSON.parse(message.raw_message).message
  } catch {
    return null
  }
  if (!Array.isArray(segments) || !segments.length) return null
  const result = []
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue
    const data = segment.data || {}
    if (segment.type === 'text' && String(data.text ?? '')) result.push({ kind: 'text', text: String(data.text) })
    else if (segment.type === 'at') result.push({ kind: 'at', qq: String(data.qq ?? ''), name: String(data.name || '') })
    else if (['image', 'record', 'video'].includes(segment.type)) {
      const src = safeMediaUrl(data.url || data.file)
      if (src) result.push({ kind: segment.type === 'record' ? 'audio' : segment.type, src })
      else result.push({ kind: 'tag', text: '[' + segment.type + ']' })
    } else if (segment.type === 'face') result.push({ kind: 'tag', text: '[表情]' })
    else if (segment.type !== 'reply') result.push({ kind: 'tag', text: '[' + segment.type + ']' })
  }
  return result.length ? result : null
}

export function atLabel(segment) {
  return segment.qq === 'all' ? '@全体成员' : '@' + (segment.name || segment.qq)
}

export function isCostlyUrl(value) {
  const url = safeMediaUrl(value)
  return !!url && COSTLY_DOMAINS.some(domain => url.includes(domain))
}
