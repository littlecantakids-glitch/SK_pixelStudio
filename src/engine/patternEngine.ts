// Pattern Engine — Photoshop Pattern Preset 구조.
// Paint Bucket / (향후) Pattern Stamp / Layer Style / Fill Layer 가 공유한다.
// 현재는 절차적 기본 Pattern 타일만 제공하며, 이미지 기반 Preset 으로 확장 가능하다.

export type PatternPreset = {
  id: string
  name: string
  /** 반복 타일 (ctx.createPattern 용) */
  tile: HTMLCanvasElement
}

function makeTile(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  draw(ctx, size)
  return c
}

function buildPresets(): PatternPreset[] {
  return [
    {
      id: 'pat-checker',
      name: '체커보드',
      tile: makeTile(16, (ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        ctx.fillStyle = '#9a9a9a'
        ctx.fillRect(0, 0, s / 2, s / 2)
        ctx.fillRect(s / 2, s / 2, s / 2, s / 2)
      }),
    },
    {
      id: 'pat-dots',
      name: '점',
      tile: makeTile(12, (ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        ctx.fillStyle = '#3a3a3a'
        ctx.beginPath()
        ctx.arc(s / 2, s / 2, s / 5, 0, Math.PI * 2)
        ctx.fill()
      }),
    },
    {
      id: 'pat-stripe',
      name: '대각선 줄무늬',
      tile: makeTile(12, (ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        ctx.strokeStyle = '#4a4a4a'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(-s / 2, s * 1.5)
        ctx.lineTo(s * 1.5, -s / 2)
        ctx.moveTo(-s / 2, s / 2)
        ctx.lineTo(s / 2, -s / 2)
        ctx.moveTo(s / 2, s * 1.5)
        ctx.lineTo(s * 1.5, s / 2)
        ctx.stroke()
      }),
    },
    {
      id: 'pat-grid',
      name: '격자',
      tile: makeTile(14, (ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        ctx.strokeStyle = '#5a5a5a'
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, 0.5, s, s)
      }),
    },
    {
      id: 'pat-noise',
      name: '노이즈',
      tile: makeTile(32, (ctx, s) => {
        const img = ctx.createImageData(s, s)
        // 결정적 의사난수 (타일이 세션마다 달라지지 않도록)
        let seed = 12345
        const rnd = () => {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff
          return seed / 0x7fffffff
        }
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 150 + Math.round(rnd() * 105)
          img.data[i] = v
          img.data[i + 1] = v
          img.data[i + 2] = v
          img.data[i + 3] = 255
        }
        ctx.putImageData(img, 0, 0)
      }),
    },
  ]
}

let presets: PatternPreset[] | null = null

/** 기본 Pattern Preset 목록 (lazy 생성) */
export function getPatternPresets(): PatternPreset[] {
  if (!presets) presets = buildPresets()
  return presets
}

export function getPattern(id: string): PatternPreset | undefined {
  return getPatternPresets().find((p) => p.id === id)
}
