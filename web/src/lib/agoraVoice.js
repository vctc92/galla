// Primary voice engine: Agora RTC + Conversational AI agent (ASR -> our /llm -> Murf Falcon TTS).
import AgoraRTC from 'agora-rtc-sdk-ng'
import { api } from './api'

AgoraRTC.setLogLevel(3)

export async function startAgoraSession(lang, { onLevels, onAgentJoined } = {}) {
  const s = await api.post('/agent/start', { lang })
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
  let agentLevel = 0

  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType)
    if (mediaType === 'audio') user.audioTrack.play()
  })
  client.on('user-joined', (u) => { if (u.uid === s.agentUid) onAgentJoined?.() })
  client.enableAudioVolumeIndicator()
  client.on('volume-indicator', (vols) => {
    const a = vols.find((v) => v.uid === s.agentUid)
    agentLevel = a ? a.level / 100 : 0
  })

  await client.join(s.appId, s.channel, s.token, s.uid)
  const mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true })
  await client.publish(mic)

  const meter = setInterval(() => {
    // agent audio level from the subscribed track is smoother than the indicator
    const remote = client.remoteUsers.find((u) => u.uid === s.agentUid)
    const agent = remote?.audioTrack ? remote.audioTrack.getVolumeLevel() : agentLevel
    onLevels?.({ me: mic.getVolumeLevel(), agent })
  }, 80)

  return {
    info: s,
    setMuted: (m) => mic.setEnabled(!m),
    async stop() {
      clearInterval(meter)
      mic.close()
      await client.leave().catch(() => {})
      await api.post('/agent/stop').catch(() => {})
    },
  }
}
