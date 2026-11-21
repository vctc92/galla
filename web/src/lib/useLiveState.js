import { useEffect, useRef, useState } from 'react'
import { api } from './api'

/** Polls /api/state. Returns { state, fresh } where fresh is a Set of activity ids that just arrived. */
export function useLiveState(intervalMs = 1000) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [fresh, setFresh] = useState(new Set())
  const seen = useRef(null)

  useEffect(() => {
    let alive = true
    let timer
    const tick = async () => {
      try {
        const s = await api.get('/api/state')
        if (!alive) return
        const ids = new Set(s.activity.map((a) => a.id))
        if (seen.current) {
          const newIds = [...ids].filter((id) => !seen.current.has(id))
          if (newIds.length) setFresh(new Set(newIds))
        }
        seen.current = ids
        setState(s)
        setError(null)
      } catch (e) {
        if (alive) setError(e.message)
      }
      if (alive) timer = setTimeout(tick, intervalMs)
    }
    tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [intervalMs])

  return { state, error, fresh }
}

/** Re-render every second (for countdowns / "x s ago"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now() / 1000)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
