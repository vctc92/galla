// Fallback voice engine (PRD §20): browser speech recognition -> /api/chat -> Murf TTS via /api/tts.
// Works in Chrome (Android/desktop). Falls back to speechSynthesis if Murf is not configured.
import { api } from './api'
import { LANGS } from './format'

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const browserVoiceSupported = !!SR

export async function speak(text, lang, onLevel) {
  try {
    const blob = await api.post('/api/tts', { text, lang })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    let ctx, analyser, raf
    try {
      ctx = new AudioContext()
      const src = ctx.createMediaElementSource(audio)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser); analyser.connect(ctx.destination)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        analyser.getByteFrequencyData(data)
        onLevel?.(data.reduce((a, b) => a + b, 0) / data.length / 128)
        raf = requestAnimationFrame(loop)
      }
      loop()
    } catch {}
    await audio.play()
    await new Promise((res) => { audio.onended = res; audio.onerror = res })
    cancelAnimationFrame(raf); onLevel?.(0); ctx?.close(); URL.revokeObjectURL(url)
  } catch {
    // Murf not configured -> device voice
    await new Promise((res) => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = LANGS[lang]?.bcp47 || 'hi-IN'
      u.onend = res; u.onerror = res
      onLevel?.(0.5)
      speechSynthesis.speak(u)
    })
    onLevel?.(0)
  }
}

export function startBrowserSession(lang, { onTranscript, onReply, onPhase, onLevels }) {
  let active = true
  let rec
  const sessionId = 'browser-' + Math.random().toString(36).slice(2)

  const listen = () => {
    if (!active) return
    rec = new SR()
    rec.lang = LANGS[lang].bcp47
    rec.interimResults = true
    rec.continuous = false
    let finalText = ''
    onPhase?.('listening')
    rec.onresult = (e) => {
      const t = [...e.results].map((r) => r[0].transcript).join(' ')
      onTranscript?.(t)
      onLevels?.({ me: 0.6, agent: 0 })
      if (e.results[e.results.length - 1].isFinal) finalText = t
    }
    rec.onend = async () => {
      onLevels?.({ me: 0, agent: 0 })
      if (!active) return
      if (!finalText.trim()) return listen()
      onPhase?.('thinking')
      try {
        const r = await api.post('/api/chat', { message: finalText, lang, session_id: sessionId })
        onReply?.(r)
        onPhase?.('speaking')
        await speak(r.reply, lang, (l) => onLevels?.({ me: 0, agent: l }))
      } catch (e) {
        onReply?.({ reply: e.message, error: true })
      }
      listen()
    }
    rec.onerror = () => {}
    rec.start()
  }
  listen()
  return { stop() { active = false; try { rec?.abort() } catch {} } }
}
