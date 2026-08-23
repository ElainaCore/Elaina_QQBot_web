let ws = null
let sse = null
const listeners = new Map()
let reconnectTimer = null
let wsFailCount = 0

const RECONNECT_DELAY = 3000
const MAX_WS_FAILS = 2

export function connect() {
  wsFailCount >= MAX_WS_FAILS ? connectSSE() : connectWS()
}

export function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; ws.close(); ws = null }
  if (sse) { sse.onopen = sse.onmessage = sse.onerror = null; sse.close(); sse = null }
}

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(handler)
}

export function off(event, handler) {
  const handlers = listeners.get(event)
  if (!handlers) return
  handlers.delete(handler)
  if (!handlers.size) listeners.delete(event)
}

function connectWS() {
  if (ws && ws.readyState <= 1) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${proto}://${location.host}/ws/panel`

  ws = new WebSocket(url)
  ws.onopen = () => { emit('open'); clearReconnect() }
  ws.onmessage = (e) => { wsFailCount = 0; handleMessage(e.data) }
  ws.onclose = () => { wsFailCount++; emit('close'); scheduleReconnect() }
  ws.onerror = () => { ws.close() }
}

function connectSSE() {
  if (sse && sse.readyState <= 1) return
  const url = `${location.origin}/api/sse/panel`

  sse = new EventSource(url)
  sse.onopen = () => { emit('open'); clearReconnect() }
  sse.onmessage = (e) => { handleMessage(e.data) }
  sse.onerror = () => { sse.close(); sse = null; emit('close'); scheduleReconnect() }
}

function handleMessage(raw) {
  try {
    const msg = JSON.parse(raw)
    emit(msg.type, msg.data)
  } catch {}
}

function emit(event, data) {
  for (const h of [...(listeners.get(event) || [])]) {
    try { h(data) } catch {}
  }
}

function clearReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, RECONNECT_DELAY)
  }
}
