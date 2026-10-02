export const TEXT_STORY_BACKGROUNDS: [string, string][] = [
  ['#4F5EF0', '#9AA6FF'],
  ['#FB4B4B', '#4F5EF0'],
  ['#121317', '#4B4E59'],
  ['#3F4AD1', '#FF6B6B'],
  ['#0B0C0E', '#4F5EF0'],
]

const WIDTH = 1080
const HEIGHT = 1920

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/**
 * Renders a text-only story into a 1080x1920 PNG so it can be stored through
 * the exact same stories/storage pipeline as photo and video stories (same
 * bucket policies, validation and expiry) instead of needing a separate type.
 * Text is drawn with fillText, never injected as HTML.
 */
export function renderTextStory(text: string, backgroundIndex = 0): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('Canvas is not supported in this browser'))

    const [from, to] = TEXT_STORY_BACKGROUNDS[backgroundIndex % TEXT_STORY_BACKGROUNDS.length]
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
    gradient.addColorStop(0, from)
    gradient.addColorStop(1, to)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    const content = text.trim().slice(0, 280)
    let size = 112
    const family = 'Outfit, Inter, system-ui, sans-serif'
    let lines: string[] = []
    for (; size >= 52; size -= 6) {
      ctx.font = `700 ${size}px ${family}`
      lines = wrapLines(ctx, content, WIDTH - 200)
      if (lines.length * size * 1.25 <= HEIGHT - 520) break
    }

    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineHeight = size * 1.25
    const startY = HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2
    lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, startY + i * lineHeight))

    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], `${crypto.randomUUID()}-text-story.png`, { type: 'image/png' })) : reject(new Error('Could not render story'))),
      'image/png'
    )
  })
}
