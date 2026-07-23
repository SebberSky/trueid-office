/**
 * Per-peer mic loudness via Web Audio AnalyserNode (RMS of time-domain samples).
 * Local mic is analysed without routing to speakers (no feedback).
 */
export class VoiceLevelMonitor {
  private ctx: AudioContext | null = null
  private nodes = new Map<
    string,
    {
      stream: MediaStream
      source: MediaStreamAudioSourceNode
      analyser: AnalyserNode
      data: Uint8Array
    }
  >()

  private ensureCtx() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    return this.ctx
  }

  /** Call from a user gesture so Autoplay / AudioContext policies unlock. */
  resume() {
    const ctx = this.ctx
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  /**
   * Keep analysers in sync with live MediaStreams.
   * Pass `null` / omit audio to drop a peer.
   */
  sync(entries: { id: string; stream: MediaStream | null | undefined }[]) {
    const keep = new Set<string>()
    for (const { id, stream } of entries) {
      if (!stream) continue
      const live = stream.getAudioTracks().filter((t) => t.readyState === 'live')
      if (live.length === 0) continue
      keep.add(id)
      const existing = this.nodes.get(id)
      const trackKey = live.map((t) => t.id).sort().join(',')
      const prevKey = existing
        ? existing.stream
            .getAudioTracks()
            .map((t) => t.id)
            .sort()
            .join(',')
        : ''
      if (existing && trackKey === prevKey) continue
      this.detach(id)
      this.attach(id, new MediaStream(live))
    }
    for (const id of [...this.nodes.keys()]) {
      if (!keep.has(id)) this.detach(id)
    }
  }

  /** Instantaneous 0..1 levels keyed by peer id. */
  sample(): Map<string, number> {
    const out = new Map<string, number>()
    for (const [id, node] of this.nodes) {
      node.analyser.getByteTimeDomainData(node.data)
      let sum = 0
      for (let i = 0; i < node.data.length; i++) {
        const v = (node.data[i]! - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / node.data.length)
      // Ignore hush / noise floor; boost conversational speech into 0..1
      const level = Math.min(1, Math.max(0, (rms - 0.018) / 0.22))
      out.set(id, level)
    }
    return out
  }

  destroy() {
    for (const id of [...this.nodes.keys()]) this.detach(id)
    void this.ctx?.close()
    this.ctx = null
  }

  private attach(id: string, stream: MediaStream) {
    const ctx = this.ensureCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.55
    source.connect(analyser)
    // Do not connect to destination — local mic must not play back.
    this.nodes.set(id, {
      stream,
      source,
      analyser,
      data: new Uint8Array(analyser.fftSize),
    })
  }

  private detach(id: string) {
    const node = this.nodes.get(id)
    if (!node) return
    try {
      node.source.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      node.analyser.disconnect()
    } catch {
      /* ignore */
    }
    this.nodes.delete(id)
  }
}
