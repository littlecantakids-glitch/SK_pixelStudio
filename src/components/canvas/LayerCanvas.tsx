import { useEffect, useRef } from 'react'
import type { OpenDocument } from '../../types'
import { RenderEngine } from '../../engine/renderEngine'

/**
 * 화면용 레이어 합성 캔버스. 실제 렌더는 RenderEngine 이 전담한다.
 * (Tool 은 Layer 를 수정하고 invalidate 만 유발 — 여기서는 doc/version 변경이 곧 invalidate)
 * 확대/이동/회전은 카메라(transform)가 담당하므로 이 캔버스는 Document 픽셀 크기 그대로다.
 */
export function LayerCanvas({
  doc,
  version = 0,
  maskSolo = false,
  maskOverlay = false,
  smartDocs = [],
}: {
  doc: OpenDocument
  version?: number
  maskSolo?: boolean
  maskOverlay?: boolean
  /** Smart Object 렌더용 SmartDocument 목록 (조회자 + 무효화 신호원) */
  smartDocs?: OpenDocument[]
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<RenderEngine | null>(null)

  useEffect(() => {
    if (ref.current && !engineRef.current) {
      engineRef.current = new RenderEngine(ref.current)
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  // SmartDocument 조회자 주입 — documentId 로 최신 SmartDocument 를 찾는다
  const smartMap = new Map(smartDocs.map((d) => [d.id, d]))
  engineRef.current?.setSmartResolver((id) => smartMap.get(id))
  // 참조하는 SmartDocument 의 version 이 바뀌면 부모도 다시 그린다
  const smartSig = smartDocs.map((d) => `${d.id}:${d.version ?? 0}`).join('|')

  // 브러시/마스크 페인트 프리뷰는 같은 캔버스를 제자리에서 갱신하므로
  // version 이 바뀌면 레이어 캐시를 비워 강제로 다시 그린다.
  useEffect(() => {
    engineRef.current?.clearCache()
  }, [version])

  // 레이어 지오메트리/가시성/마스크 서명 — 변경 시 invalidate
  const sig = doc.layers
    .map(
      (l) =>
        `${l.id}:${l.visible}:${l.opacity}:${l.fill}:${l.blendMode}:${l.x},${l.y},${l.width},${l.height}:${l.rotation}:${l.mask ? 'm' : ''}${l.maskEnabled}:${l.maskDensity}:${l.maskFeather}` +
        (l.smartFilters?.length
          ? `:sf${l.smartFilters.map((f) => `${f.id}${f.enabled ? 1 : 0}${f.opacity}${f.blendMode}${Object.values(f.parameters).join(',')}`).join(';')}`
          : ''),
    )
    .join('|')

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setScene(doc)
    engine.setMaskView({ solo: maskSolo, overlay: maskOverlay })
    engine.invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, doc.id, doc.width, doc.height, sig, version, maskSolo, maskOverlay, smartSig])

  return <canvas className="canvas__image" ref={ref} />
}
