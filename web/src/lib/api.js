// Tiny fetch wrapper. All backend calls go through here.
async function req(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) {
    let detail = r.statusText
    try { detail = (await r.json()).detail || detail } catch {}
    throw new Error(detail)
  }
  const type = r.headers.get('content-type') || ''
  return type.includes('json') ? r.json() : r.blob()
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b ?? {}),
}
