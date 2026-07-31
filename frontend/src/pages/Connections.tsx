import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Copy, Download, Plug, Code2, MessageSquare, ChevronDown, ExternalLink, HelpCircle } from 'lucide-react'
import { api } from '@/services/api'
import TourOverlay from '@/components/tour/TourOverlay'
import type { TourStep } from '@/components/tour/TourOverlay'

const MCP_URL = `${window.location.origin}/mcp`

const VSCODE_SETTINGS = JSON.stringify({
  mcpServers: {
    argos: { type: 'http', url: MCP_URL }
  }
}, null, 2)

const CLAUDE_DESKTOP_CONFIG = JSON.stringify({
  mcpServers: {
    argos: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-http-client', MCP_URL] }
  }
}, null, 2)

const CLAUDE_MD_TEMPLATE = `## Argos — Base de veille technologique

Consulte Argos (tool \`argos_ask\`) quand la demande implique :
- un choix d'outil ou de librairie
- une architecture ou un pattern de conception
- la génération d'un CDC, PRD, ou document technique
- les meilleures pratiques ou tendances récentes

Ne consulte pas Argos pour : corrections syntaxiques, refactoring mécanique, renommages.`

// Étapes du guide guidé VSCode + Claude Code
const VSCODE_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="vscode-tile"]',
    title: 'Choisissez votre environnement',
    description: 'Cliquez sur "VSCode + Claude Code" pour déplier les instructions de connexion.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="vscode-step-1"]',
    title: 'Étape 1 — Fichier de configuration',
    description: 'Créez le dossier `.claude/` à la racine de votre projet, puis copiez ce contenu dans `settings.json`.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="vscode-copy-settings"]',
    title: 'Copiez la configuration',
    description: 'Cliquez sur "Copier" pour mettre le JSON dans votre presse-papier, puis collez-le dans le fichier.',
    position: 'top',
  },
  {
    targetSelector: '[data-tour="vscode-step-2"]',
    title: 'Étape 2 — Fichier CLAUDE.md',
    description: 'Copiez ce contenu dans un fichier `CLAUDE.md` à la racine. Il indique à Claude Code quand interroger Argos.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="vscode-copy-claudemd"]',
    title: 'Copiez le CLAUDE.md',
    description: 'Cliquez sur "Copier" pour le presse-papier, puis créez le fichier CLAUDE.md à la racine de votre projet.',
    position: 'top',
  },
  {
    targetSelector: '[data-tour="vscode-step-3"]',
    title: 'Étape 3 — Redémarrer VSCode',
    description: 'Fermez et rouvrez VSCode (ou Cmd+Shift+P → "Reload Window"). Argos apparaît dans les outils MCP disponibles.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="mcp-url"]',
    title: 'Vérification',
    description: 'Le serveur MCP est disponible à cette URL. Claude Code s\'y connecte automatiquement au démarrage.',
    position: 'top',
  },
]

interface Target {
  id: string
  name: string
  subtitle: string
  icon: any
  steps: { title: string; content: string; code?: string; codeLabel?: string; action?: string }[]
}

const TARGETS: Target[] = [
  {
    id: 'vscode',
    name: 'VSCode + Claude Code',
    subtitle: 'Extension Claude Code (claude.ai/code)',
    icon: Code2,
    steps: [
      {
        title: 'Créer le fichier de configuration',
        content: 'À la racine de votre projet, créez le dossier `.claude/` puis le fichier `settings.json` avec ce contenu :',
        code: VSCODE_SETTINGS,
        codeLabel: '.claude/settings.json',
        action: 'copy-vscode',
      },
      {
        title: 'Ajouter le fichier CLAUDE.md',
        content: 'Créez un fichier `CLAUDE.md` à la racine du projet. Il indique à Claude Code quand interroger Argos :',
        code: CLAUDE_MD_TEMPLATE,
        codeLabel: 'CLAUDE.md',
        action: 'copy-claudemd',
      },
      {
        title: 'Redémarrer Claude Code',
        content: 'Fermez et rouvrez VSCode, ou rechargez la fenêtre (Cmd+Shift+P → "Reload Window"). Le serveur Argos apparaîtra dans la liste des outils MCP disponibles.',
      },
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    subtitle: 'IDE IA — cursor.com',
    icon: Code2,
    steps: [
      {
        title: 'Ouvrir les réglages MCP',
        content: 'Dans Cursor : Cmd+Shift+P → "Open MCP Settings" (ou Settings → MCP). Ajoutez cette configuration :',
        code: VSCODE_SETTINGS,
        codeLabel: 'Cursor MCP Settings',
        action: 'copy-vscode',
      },
      {
        title: 'Ajouter le fichier CLAUDE.md',
        content: 'Créez un fichier `.cursorrules` ou `CLAUDE.md` à la racine du projet pour guider Cursor sur quand consulter Argos :',
        code: CLAUDE_MD_TEMPLATE,
        codeLabel: '.cursorrules',
        action: 'copy-claudemd',
      },
    ],
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    subtitle: 'Application desktop Claude',
    icon: MessageSquare,
    steps: [
      {
        title: 'Ouvrir la configuration',
        content: 'Ouvrez le fichier de configuration Claude Desktop :\n• macOS : ~/Library/Application Support/Claude/claude_desktop_config.json\n• Windows : %APPDATA%/Claude/claude_desktop_config.json',
      },
      {
        title: 'Ajouter la configuration Argos',
        content: 'Ajoutez (ou fusionnez) ce bloc dans le fichier JSON :',
        code: CLAUDE_DESKTOP_CONFIG,
        codeLabel: 'claude_desktop_config.json',
        action: 'copy-desktop',
      },
      {
        title: 'Redémarrer Claude Desktop',
        content: 'Quittez complètement Claude Desktop et relancez-le. Argos apparaîtra dans les outils disponibles lors de vos conversations.',
      },
    ],
  },
  {
    id: 'llm-export',
    name: 'ChatGPT / Gemini / autre',
    subtitle: 'Export du contexte en texte',
    icon: ExternalLink,
    steps: [
      {
        title: 'Exporter le contexte Argos',
        content: 'Ces LLM ne supportent pas MCP nativement. Utilisez le bouton ci-dessous pour générer un bloc de texte contenant les dernières connaissances indexées par Argos. Collez-le au début de votre conversation.',
        action: 'export-context',
      },
    ],
  },
]

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <motion.button onClick={copy} whileTap={{ scale: 0.95 }}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10.5px] font-mono transition-all ${
        copied
          ? 'bg-[hsl(var(--green)/.15)] border border-[hsl(var(--green)/.4)] text-[hsl(var(--green))]'
          : 'bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))]'
      }`}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copié !' : (label || 'Copier')}
    </motion.button>
  )
}

export default function Connections() {
  const [openTarget, setOpenTarget] = useState<string | null>('vscode')
  const [exporting, setExporting]   = useState(false)
  const [exportText, setExportText] = useState<string | null>(null)
  const [tourActive, setTourActive] = useState(false)

  function startVscodeTour() {
    setOpenTarget('vscode')
    setTimeout(() => setTourActive(true), 150)
  }

  async function exportContext() {
    setExporting(true)
    setExportText(null)
    try {
      const [briefing, nodes] = await Promise.all([
        api.getTodayBriefing().catch(() => null),
        api.getKgNodes().catch(() => ({ nodes: [] })),
      ])

      let md = `# Contexte de veille Argos — ${new Date().toLocaleDateString('fr-FR')}\n\n`

      if (briefing?.content) {
        md += `## Briefing du jour\n\n${briefing.content}\n\n`
      }

      const kgNodes = nodes?.nodes || []
      if (kgNodes.length > 0) {
        md += `## Entités clés surveillées\n\n`
        for (const n of kgNodes.slice(0, 20)) {
          md += `- **${n.label}** (${n.type}) — cité dans ${n.source_count} article(s)\n`
        }
      }

      md += `\n---\n*Généré par Argos — ${window.location.origin}*\n`
      setExportText(md)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-4">
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-1">
          Connectez Argos à votre environnement de développement ou LLM favori.
        </p>
        <motion.button onClick={startVscodeTour} whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--accent-line))] text-[11.5px] font-mono text-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))] hover:opacity-80 transition-opacity">
          <HelpCircle className="w-3.5 h-3.5" /> Guide pas à pas
        </motion.button>
      </div>

      {TARGETS.map(target => {
        const Icon = target.icon
        const isOpen = openTarget === target.id
        return (
          <motion.div key={target.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="panel overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />

            {/* Header cliquable */}
            <button
              data-tour={target.id === 'vscode' ? 'vscode-tile' : undefined}
              onClick={() => setOpenTarget(isOpen ? null : target.id)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] hover:bg-[hsl(var(--bg-3))] transition-colors text-left"
            >
              <Icon className="w-4 h-4 text-[hsl(var(--accent))] flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[13.5px] font-bold text-[hsl(var(--text))] leading-none">{target.name}</p>
                <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] mt-0.5">{target.subtitle}</p>
              </div>
              <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
                <ChevronDown className="w-4 h-4 text-[hsl(var(--text-3))]" />
              </motion.div>
            </button>

            {/* Étapes */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
                >
                  <div className="p-4 space-y-5">
                    {target.steps.map((step, i) => (
                      <div key={i}
                        data-tour={target.id === 'vscode' ? `vscode-step-${i + 1}` : undefined}
                        className="flex gap-3">
                        {/* Numéro d'étape */}
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] flex items-center justify-center">
                          <span className="text-[10px] font-bold text-[hsl(var(--accent))]">{i + 1}</span>
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className="text-[13px] font-semibold text-[hsl(var(--text))]">{step.title}</p>
                          <p className="text-[11.5px] text-[hsl(var(--text-2))] whitespace-pre-line leading-relaxed">
                            {step.content}
                          </p>

                          {step.code && (
                            <div className="rounded border border-[hsl(var(--line))] overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-1.5 bg-[hsl(var(--bg-3))] border-b border-[hsl(var(--line))]">
                                <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{step.codeLabel}</span>
                                <span data-tour={
                                  target.id === 'vscode' && step.action === 'copy-vscode' ? 'vscode-copy-settings' :
                                  target.id === 'vscode' && step.action === 'copy-claudemd' ? 'vscode-copy-claudemd' :
                                  undefined
                                }>
                                  <CopyButton text={step.code} />
                                </span>
                              </div>
                              <pre className="p-3 text-[11px] font-mono text-[hsl(var(--text-2))] overflow-x-auto leading-relaxed bg-[hsl(var(--bg))]">
                                {step.code}
                              </pre>
                            </div>
                          )}

                          {step.action === 'export-context' && (
                            <div className="space-y-3">
                              <motion.button onClick={exportContext} disabled={exporting} whileTap={{ scale: 0.97 }}
                                className="flex items-center gap-2 px-4 py-2 rounded bg-[hsl(var(--accent))] text-white text-[12px] font-bold
                                           hover:opacity-90 disabled:opacity-50 transition-opacity">
                                <Download className="w-4 h-4" />
                                {exporting ? 'Génération...' : 'Exporter le contexte Argos'}
                              </motion.button>

                              {exportText && (
                                <div className="rounded border border-[hsl(var(--line))] overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-[hsl(var(--bg-3))] border-b border-[hsl(var(--line))]">
                                    <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">contexte-argos.md</span>
                                    <CopyButton text={exportText} label="Copier tout" />
                                  </div>
                                  <pre className="p-3 text-[10.5px] font-mono text-[hsl(var(--text-2))] max-h-48 overflow-y-auto leading-relaxed bg-[hsl(var(--bg))] whitespace-pre-wrap">
                                    {exportText}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Indicateur de complétion */}
                    <div data-tour={target.id === 'vscode' ? 'mcp-url' : undefined}
                      className="flex items-center gap-2 pt-2 border-t border-[hsl(var(--line))]">
                      <Plug className="w-3.5 h-3.5 text-[hsl(var(--green))]" />
                      <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                        Serveur MCP disponible sur{' '}
                        <span className="text-[hsl(var(--accent))]">{MCP_URL}</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}

      <TourOverlay
        steps={VSCODE_TOUR_STEPS}
        visible={tourActive}
        onFinish={() => setTourActive(false)}
        finishLabel="Connexion prête ✓"
      />
    </div>
  )
}
