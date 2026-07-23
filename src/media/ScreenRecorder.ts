/**
 * Records screen video + mixed room voice (local mic, peers, optional tab audio).
 *
 * Video is recorded from a *clone* of the live share track so MediaRecorder.stop()
 * does not end the on-screen share (which would make the next take 0 bytes).
 */
export class ScreenRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: BlobPart[] = []
  private audioCtx: AudioContext | null = null
  private dest: MediaStreamAudioDestinationNode | null = null
  private sources: MediaStreamAudioSourceNode[] = []
  private mixed: MediaStream | null = null
  /** Cloned share track owned by this recorder — stop only this on cleanup. */
  private videoClone: MediaStreamTrack | null = null
  private mimeType = 'video/webm'

  get recording() {
    return this.recorder?.state === 'recording'
  }

  async start(videoStream: MediaStream, audioStreams: MediaStream[]) {
    if (this.recording) throw new Error('already recording')
    this.cleanup()

    const videoTrack = videoStream.getVideoTracks()[0]
    if (!videoTrack || videoTrack.readyState !== 'live') {
      throw new Error('no live video track')
    }

    this.videoClone = videoTrack.clone()
    if (this.videoClone.readyState !== 'live') {
      this.videoClone.stop()
      this.videoClone = null
      throw new Error('could not clone video track')
    }

    this.audioCtx = new AudioContext()
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()
    this.dest = this.audioCtx.createMediaStreamDestination()
    this.wireAudio(audioStreams)

    this.mixed = new MediaStream([this.videoClone, ...this.dest.stream.getAudioTracks()])
    this.mimeType = pickMime()
    this.chunks = []

    const opts: MediaRecorderOptions = {
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    }
    if (this.mimeType) opts.mimeType = this.mimeType

    this.recorder = new MediaRecorder(this.mixed, opts)
    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data)
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

      const finish = () => {
        const type = this.mimeType || 'video/webm'
        const parts = this.chunks.slice()
        this.cleanup()
        resolve(new Blob(parts, { type }))
      }

      rec.onstop = finish
      rec.onerror = () => {
        this.cleanup()
        reject(new Error('recorder error'))
      }

      try {
        // Flush the final chunk before stop (some browsers omit it otherwise).
        if (rec.state === 'recording') rec.requestData()
      } catch {
        /* ignore */
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
    if (this.recorder) {
      this.recorder.ondataavailable = null
      this.recorder.onstop = null
      this.recorder.onerror = null
      if (this.recorder.state !== 'inactive') {
        try {
          this.recorder.stop()
        } catch {
          /* ignore */
        }
      }
    }
    this.recorder = null
    this.chunks = []
    this.mixed = null
    if (this.videoClone) {
      try {
        this.videoClone.stop()
      } catch {
        /* ignore */
      }
      this.videoClone = null
    }
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
  if (!blob || blob.size <= 0) {
    console.warn('[ScreenRecorder] empty blob — skip download')
    return
  }
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${basename}-${stamp}.${ext}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the browser has a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
