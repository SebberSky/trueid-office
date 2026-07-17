/**
 * Records screen video + mixed room voice (local mic, peers, optional tab audio).
 */
export class ScreenRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: BlobPart[] = []
  private audioCtx: AudioContext | null = null
  private dest: MediaStreamAudioDestinationNode | null = null
  private sources: MediaStreamAudioSourceNode[] = []
  private mixed: MediaStream | null = null
  private mimeType = 'video/webm'

  get recording() {
    return this.recorder?.state === 'recording'
  }

  async start(videoStream: MediaStream, audioStreams: MediaStream[]) {
    if (this.recording) throw new Error('already recording')

    const videoTrack = videoStream.getVideoTracks()[0]
    if (!videoTrack || videoTrack.readyState !== 'live') {
      throw new Error('no live video track')
    }

    this.audioCtx = new AudioContext()
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()
    this.dest = this.audioCtx.createMediaStreamDestination()
    this.wireAudio(audioStreams)

    this.mixed = new MediaStream([videoTrack, ...this.dest.stream.getAudioTracks()])
    this.mimeType = pickMime()
    this.chunks = []

    const opts: MediaRecorderOptions = {
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    }
    if (this.mimeType) opts.mimeType = this.mimeType

    this.recorder = new MediaRecorder(this.mixed, opts)
    this.recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data)
    }
    this.recorder.start(1000)
  }

  /** Re-attach audio sources when peers join/leave mid-recording. */
  setAudioSources(audioStreams: MediaStream[]) {
    if (!this.recording || !this.audioCtx || !this.dest) return
    this.clearSources()
    this.wireAudio(audioStreams)
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder
      if (!rec || rec.state === 'inactive') {
        this.cleanup()
        reject(new Error('not recording'))
        return
      }
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' })
        this.cleanup()
        resolve(blob)
      }
      rec.stop()
    })
  }

  private wireAudio(audioStreams: MediaStream[]) {
    if (!this.audioCtx || !this.dest) return
    const seen = new Set<string>()
    for (const stream of audioStreams) {
      for (const track of stream.getAudioTracks()) {
        if (track.readyState !== 'live' || seen.has(track.id)) continue
        seen.add(track.id)
        try {
          const src = this.audioCtx.createMediaStreamSource(new MediaStream([track]))
          src.connect(this.dest)
          this.sources.push(src)
        } catch {
          /* track may be ended */
        }
      }
    }
  }

  private clearSources() {
    for (const src of this.sources) {
      try {
        src.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.sources = []
  }

  private cleanup() {
    this.clearSources()
    this.recorder = null
    this.chunks = []
    this.mixed = null
    void this.audioCtx?.close()
    this.audioCtx = null
    this.dest = null
  }
}

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

export function downloadRecording(blob: Blob, basename = 'trueid-office-rec') {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${basename}-${stamp}.${ext}`
  a.click()
  URL.revokeObjectURL(url)
}
