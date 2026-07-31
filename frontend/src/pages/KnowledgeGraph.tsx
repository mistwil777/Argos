import { useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2, RefreshCw, AlertTriangle, Check, Filter, Network } from 'lucide-react'
import { api } from '@/services/api'

const TYPE_COLOR: Record<string, string> = {
  org:        '#3987e5',
  product:    '#9085e9',
  technology: '#1baf7a',
  concept:    '#e8a600',
  person:     '#e66767',
}

const TYPE_LABEL: Record<string, string> = {
  org: 'Organisation', product: 'Produit', technology: 'Technologie',
  concept: 'Concept', person: 'Personne',
}

interface Node { id: number; label: string; type: string; confidence_score: number; source_count: number; hitl_validated: boolean; tension_flag: boolean; x?: number; y?: number; vx?: number; vy?: number }
interface Edge { id: number; source_node_id: number; target_node_id: number; source_label: string; target_label: string; relation_type: string; weight: number }

export default function KnowledgeGraph() {
  const [nodes, setNodes]     = useState<Node[]>([])
  const [edges, setEdges]     = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [rebuilding, setRebuilding] = useState(false)
  const [selected, setSelected] = useState<Node | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterTension, setFilterTension] = useState(false)
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)
  const nodesRef  = useRef<Node[]>([])
  const edgesRef  = useRef<Edge[]>([])
  const dragging  = useRef<{ node: Node; offsetX: number; offsetY: number } | null>(null)
  const transform = useRef({ x: 0, y: 0, scale: 1 })
  const isPanning = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nRes, eRes] = await Promise.all([api.getKgNodes(), api.getKgEdges()])
      const rawNodes: Node[] = (nRes.nodes || []).map((n: Node, i: number) => ({
        ...n,
        x: 400 + Math.cos(i * 2.4) * (150 + i * 8),
        y: 300 + Math.sin(i * 2.4) * (150 + i * 8),
        vx: 0, vy: 0,
      }))
      setNodes(rawNodes)
      setEdges(eRes.edges || [])
      nodesRef.current = rawNodes
      edgesRef.current = eRes.edges || []
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Force simulation
  useEffect(() => {
    if (!nodes.length) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]))

    function tick() {
      const ns = nodesRef.current
      const es = edgesRef.current

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[i].x! - ns[j].x!
          const dy = ns[i].y! - ns[j].y!
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 2000 / (dist * dist)
          ns[i].vx! += (dx / dist) * force
          ns[i].vy! += (dy / dist) * force
          ns[j].vx! -= (dx / dist) * force
          ns[j].vy! -= (dy / dist) * force
        }
      }
      // Attraction edges
      for (const e of es) {
        const src = nodeMap.get(e.source_node_id)
        const tgt = nodeMap.get(e.target_node_id)
        if (!src || !tgt) continue
        const dx = tgt.x! - src.x!
        const dy = tgt.y! - src.y!
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - 120) * 0.03 * e.weight
        src.vx! += (dx / dist) * force
        src.vy! += (dy / dist) * force
        tgt.vx! -= (dx / dist) * force
        tgt.vy! -= (dy / dist) * force
      }
      // Gravity to center
      for (const n of ns) {
        n.vx! += (400 - n.x!) * 0.003
        n.vy! += (300 - n.y!) * 0.003
        n.vx! *= 0.85
        n.vy! *= 0.85
        if (!dragging.current || dragging.current.node.id !== n.id) {
          n.x! += n.vx!
          n.y! += n.vy!
        }
      }

      // Draw
      const cv = canvasRef.current
      if (!cv) return
      cv.width = cv.clientWidth
      cv.height = cv.clientHeight
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.save()
      ctx.translate(transform.current.x, transform.current.y)
      ctx.scale(transform.current.scale, transform.current.scale)

      // Edges
      for (const e of es) {
        const src = nodeMap.get(e.source_node_id)
        const tgt = nodeMap.get(e.target_node_id)
        if (!src || !tgt) continue
        ctx.beginPath()
        ctx.moveTo(src.x!, src.y!)
        ctx.lineTo(tgt.x!, tgt.y!)
        ctx.strokeStyle = 'rgba(200,192,216,0.2)'
        ctx.lineWidth = Math.min(e.weight, 3)
        ctx.stroke()
        // Label relation
        const mx = (src.x! + tgt.x!) / 2
        const my = (src.y! + tgt.y!) / 2
        ctx.font = '9px monospace'
        ctx.fillStyle = 'rgba(200,192,216,0.4)'
        ctx.textAlign = 'center'
        ctx.fillText(e.relation_type, mx, my)
      }

      // Nodes
      for (const n of ns) {
        const color = TYPE_COLOR[n.type] || '#c8c0d8'
        const r = 10 + Math.min(n.source_count * 2, 16)
        ctx.beginPath()
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2)
        ctx.fillStyle = n.tension_flag ? '#e6676740' : `${color}30`
        ctx.fill()
        ctx.strokeStyle = n.tension_flag ? '#e66767' : (n.hitl_validated ? '#1baf7a' : color)
        ctx.lineWidth = n.hitl_validated ? 2.5 : 1.5
        ctx.stroke()
        // Label
        ctx.font = `${n.source_count > 3 ? 'bold ' : ''}11px sans-serif`
        ctx.fillStyle = '#c8c0d8'
        ctx.textAlign = 'center'
        ctx.fillText(n.label, n.x!, n.y! + r + 13)
        // Tension icon
        if (n.tension_flag) {
          ctx.font = '12px sans-serif'
          ctx.fillText('⚠', n.x!, n.y! - r - 4)
        }
      }

      ctx.restore()
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [nodes.length])

  // Mouse events
  function getNodeAt(ex: number, ey: number): Node | null {
    const { x, y, scale } = transform.current
    const cx = (ex - x) / scale
    const cy = (ey - y) / scale
    for (const n of nodesRef.current) {
      const r = 10 + Math.min(n.source_count * 2, 16)
      if (Math.hypot(cx - n.x!, cy - n.y!) < r) return n
    }
    return null
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const ex = e.clientX - rect.left
    const ey = e.clientY - rect.top
    const node = getNodeAt(ex, ey)
    if (node) {
      dragging.current = { node, offsetX: ex - node.x!, offsetY: ey - node.y! }
      setSelected(node)
    } else {
      isPanning.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    if (dragging.current) {
      const ex = e.clientX - rect.left
      const ey = e.clientY - rect.top
      const { scale, x, y } = transform.current
      dragging.current.node.x = (ex - x) / scale
      dragging.current.node.y = (ey - y) / scale
    } else if (isPanning.current) {
      transform.current.x += e.clientX - lastMouse.current.x
      transform.current.y += e.clientY - lastMouse.current.y
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }
  }
  function onMouseUp() { dragging.current = null; isPanning.current = false }
  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    transform.current.scale = Math.max(0.3, Math.min(3, transform.current.scale * factor))
  }

  async function rebuild() {
    setRebuilding(true); setRebuildMsg(null)
    try {
      const r = await api.rebuildKg()
      setRebuildMsg(`✓ ${r.message}`)
      await load()
    } catch (e: any) {
      setRebuildMsg(`ERR / ${e.message}`)
    } finally { setRebuilding(false) }
  }

  async function validateNode(node: Node) {
    await api.updateKgNode(node.id, { hitl_validated: !node.hitl_validated })
    nodesRef.current = nodesRef.current.map(n =>
      n.id === node.id ? { ...n, hitl_validated: !n.hitl_validated } : n
    )
    setSelected(prev => prev?.id === node.id ? { ...prev, hitl_validated: !prev.hitl_validated } : prev)
    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, hitl_validated: !n.hitl_validated } : n))
  }

  const visibleTypes = ['all', 'org', 'product', 'technology', 'concept', 'person']
  const stats = {
    total: nodes.length,
    validated: nodes.filter(n => n.hitl_validated).length,
    tension: nodes.filter(n => n.tension_flag).length,
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-bold text-[hsl(var(--text))] flex items-center gap-2">
            <Network className="w-5 h-5 text-[hsl(var(--accent))]" />
            Knowledge Graph
          </h2>
          <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-0.5">
            {stats.total} entités · {stats.validated} validées · {stats.tension} en tension
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rebuildMsg && (
            <span className={`text-[11px] font-mono ${rebuildMsg.startsWith('ERR') ? 'text-[hsl(var(--red))]' : 'text-[hsl(var(--green))]'}`}>
              {rebuildMsg}
            </span>
          )}
          <motion.button onClick={rebuild} disabled={rebuilding} whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] disabled:opacity-50 transition-all">
            {rebuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Reconstruire
          </motion.button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex-shrink-0 px-8 pb-3 flex items-center gap-3">
        <Filter className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
        <div className="flex items-center rounded border border-[hsl(var(--line))] overflow-hidden text-[10.5px] font-mono">
          {visibleTypes.map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-2 py-1 transition-colors ${filterType === t ? 'bg-[hsl(var(--bg-2))] text-[hsl(var(--text))]' : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
              {t === 'all' ? 'Tous' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <button onClick={() => setFilterTension(v => !v)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10.5px] font-mono transition-all ${filterTension ? 'border-[hsl(var(--red)/.5)] text-[hsl(var(--red))] bg-[hsl(var(--red)/.08)]' : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))]'}`}>
          <AlertTriangle className="w-3 h-3" /> En tension
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent))]" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[hsl(var(--text-3))]">
              <Network className="w-12 h-12 opacity-20" />
              <p className="text-[13px] font-mono">Graphe vide — cliquez sur "Reconstruire"</p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-grab active:cursor-grabbing"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
            />
          )}
        </div>

        {/* Panneau détail nœud sélectionné */}
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
            className="w-72 flex-shrink-0 border-l border-[hsl(var(--line))] bg-[hsl(var(--bg-1))] p-5 space-y-4 overflow-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[14px] font-bold text-[hsl(var(--text))]">{selected.label}</p>
                <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded border mt-1 inline-block"
                  style={{ color: TYPE_COLOR[selected.type], borderColor: `${TYPE_COLOR[selected.type]}40`, backgroundColor: `${TYPE_COLOR[selected.type]}15` }}>
                  {TYPE_LABEL[selected.type] || selected.type}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]">✕</button>
            </div>

            <div className="space-y-2 text-[11.5px] font-mono">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--text-3))]">Sources</span>
                <span className="text-[hsl(var(--text))]">{selected.source_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--text-3))]">Confiance</span>
                <span className="text-[hsl(var(--text))]">{Math.round(selected.confidence_score * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--text-3))]">Validé</span>
                <span className={selected.hitl_validated ? 'text-[hsl(var(--green))]' : 'text-[hsl(var(--text-3))]'}>
                  {selected.hitl_validated ? '✓ Oui' : 'Non'}
                </span>
              </div>
              {selected.tension_flag && (
                <div className="flex items-center gap-1.5 text-[hsl(var(--red))]">
                  <AlertTriangle className="w-3 h-3" /> En tension
                </div>
              )}
            </div>

            {/* Relations */}
            <div>
              <p className="text-[10px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Relations</p>
              <div className="space-y-1">
                {edges.filter(e => e.source_node_id === selected.id || e.target_node_id === selected.id)
                  .slice(0, 8).map(e => (
                  <div key={e.id} className="text-[10.5px] text-[hsl(var(--text-2))] flex items-center gap-1">
                    <span className="text-[hsl(var(--text-3))]">
                      {e.source_node_id === selected.id ? e.target_label : e.source_label}
                    </span>
                    <span className="text-[hsl(var(--text-3))] font-mono">← {e.relation_type} →</span>
                  </div>
                ))}
              </div>
            </div>

            <motion.button onClick={() => validateNode(selected)} whileTap={{ scale: 0.95 }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded border text-[11.5px] font-mono transition-all ${selected.hitl_validated ? 'border-[hsl(var(--green)/.4)] text-[hsl(var(--green))] bg-green-500/10' : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]'}`}>
              <Check className="w-3.5 h-3.5" />
              {selected.hitl_validated ? 'Validé ✓' : 'Valider ce nœud'}
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
