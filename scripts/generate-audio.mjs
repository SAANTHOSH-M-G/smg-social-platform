// Generates the starter royalty-free music library (public/audio/*.wav).
//
// Every sample is synthesised from scratch here (oscillators + envelopes), so
// the output is original work released under CC0 - no third-party or
// copyrighted audio is bundled. Run once: `npm run generate:audio`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const SECONDS = 12
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio')
mkdirSync(out, { recursive: true })

const note = (midi) => 440 * 2 ** ((midi - 69) / 12)
const osc = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  tri: (p) => 4 * Math.abs(p - Math.floor(p + 0.5)) - 1,
  saw: (p) => 2 * (p - Math.floor(p + 0.5)),
  square: (p) => (p % 1 < 0.5 ? 1 : -1),
}

// bpm, chord roots (midi) per bar, chord quality, lead wave, arpeggio, drums
const TRACKS = [
  { file: 'sunrise-loop', bpm: 96, roots: [60, 65, 67, 64], minor: false, wave: 'tri', arp: [0, 4, 7, 12], drums: 'soft' },
  { file: 'neon-drive', bpm: 118, roots: [57, 53, 60, 55], minor: true, wave: 'saw', arp: [0, 7, 12, 7], drums: 'four' },
  { file: 'lofi-window', bpm: 78, roots: [62, 67, 60, 65], minor: true, wave: 'sine', arp: [0, 3, 7, 10], drums: 'lofi' },
  { file: 'calm-waters', bpm: 64, roots: [57, 62, 64, 60], minor: false, wave: 'sine', arp: [0, 7, 12, 16], drums: 'none' },
  { file: 'street-pulse', bpm: 104, roots: [55, 55, 58, 53], minor: true, wave: 'square', arp: [0, 0, 12, 7], drums: 'four' },
  { file: 'golden-hour', bpm: 88, roots: [65, 60, 62, 67], minor: false, wave: 'tri', arp: [0, 4, 7, 4], drums: 'soft' },
]

function render(t) {
  const beat = 60 / t.bpm
  const barLen = beat * 4
  // snap total length to a whole number of bars so the file loops cleanly
  const bars = Math.max(1, Math.round(SECONDS / barLen))
  const total = Math.round(bars * barLen * RATE)
  const buf = new Float32Array(total)
  let seed = 1234
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1

  for (let n = 0; n < total; n++) {
    const time = n / RATE
    const bar = Math.floor(time / barLen)
    const root = t.roots[bar % t.roots.length]
    const third = t.minor ? 3 : 4
    let s = 0

    // pad: root/third/fifth, slow swell per bar
    const barPos = (time % barLen) / barLen
    const swell = Math.min(1, barPos * 6) * (1 - 0.35 * barPos)
    for (const iv of [0, third, 7]) s += osc.sine(note(root - 12 + iv) * time) * 0.11 * swell

    // bass on the beat
    const beatPos = (time % beat) / beat
    s += osc.sine(note(root - 24) * time) * 0.2 * Math.exp(-beatPos * 3)

    // arpeggio on eighth notes
    const step = Math.floor(time / (beat / 2))
    const stepPos = (time % (beat / 2)) / (beat / 2)
    const pitch = root + 12 + t.arp[step % t.arp.length] + (t.minor && t.arp[step % 4] === 4 ? -1 : 0)
    s += osc[t.wave](note(pitch) * time) * 0.12 * Math.exp(-stepPos * 4)

    // drums
    if (t.drums !== 'none') {
      const kickOn = t.drums === 'four' ? true : Math.floor(time / beat) % 2 === 0
      if (kickOn) s += Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-beatPos * 25)) * beatPos * beat) * 0.35 * Math.exp(-beatPos * 7)
      const hatPos = (time % (beat / 2)) / (beat / 2)
      if (step % 2 === 1 || t.drums === 'four') s += rand() * 0.05 * Math.exp(-hatPos * 18) * (t.drums === 'lofi' ? 0.7 : 1)
      if (t.drums !== 'soft' && Math.floor(time / beat) % 2 === 1) s += rand() * 0.12 * Math.exp(-beatPos * 14)
    }
    buf[n] = s
  }

  // gentle limiter + short edge fades
  let peak = 0
  for (let n = 0; n < total; n++) peak = Math.max(peak, Math.abs(buf[n]))
  const gain = peak > 0 ? 0.85 / peak : 1
  const fade = Math.floor(RATE * 0.01)
  const pcm = Buffer.alloc(total * 2)
  for (let n = 0; n < total; n++) {
    const edge = Math.min(1, n / fade, (total - 1 - n) / fade)
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[n] * gain * edge)) * 32767), n * 2)
  }
  return pcm
}

function wav(pcm) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(RATE, 24)
  h.writeUInt32LE(RATE * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

for (const t of TRACKS) {
  const pcm = render(t)
  writeFileSync(join(out, `${t.file}.wav`), wav(pcm))
  console.log(`${t.file}.wav  ${(pcm.length / RATE / 2).toFixed(1)}s  ${(pcm.length / 1024).toFixed(0)} KB`)
}
