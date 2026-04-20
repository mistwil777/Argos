// AssistantMode - Interface RAG avec gestion multi-conversations
import { useState, useEffect, useRef } from 'react';
import { useRAGAsk, useCourse, useItem, useRAGExtractDocument } from '../../hooks/useApi';
import {
  Send, Settings, Sparkles, X, ExternalLink, Trash2,
  Plus, MessageSquare, History, CheckSquare, Square, ArrowLeft, FileText, Clock, Layers, Tag,
  Paperclip, AlertCircle, Loader2,
} from 'lucide-react';
import { Preloader } from '../components/Preloader';
import { useCockpit } from '../context/CockpitContext';

// ── Types ─────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  attachment?: { filename: string; method: string; charCount: number };
  sources?: Array<{
    course_id?: number;
    source_id?: number;
    source_type?: string;
    title: string;
    chunk_text: string;
    similarity_score?: number;
    _distance?: number;
  }>;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

// ── Persistence helpers ────────────────────────────────────────────────────

function storeKey(workspaceId: number | null) {
  return `rag_conversations_ws_${workspaceId ?? 'global'}`;
}

function loadConversations(workspaceId: number | null): Conversation[] {
  try {
    const raw = localStorage.getItem(storeKey(workspaceId));
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch { return []; }
}

function saveConversations(workspaceId: number | null, convs: Conversation[]) {
  try {
    localStorage.setItem(storeKey(workspaceId), JSON.stringify(convs));
  } catch { /* quota dépassé */ }
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newConversation(): Conversation {
  return { id: makeId(), title: 'Nouvelle conversation', createdAt: Date.now(), messages: [] };
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ── Component ──────────────────────────────────────────────────────────────

// ── Source panel ──────────────────────────────────────────────────────────

interface SourceInfo {
  courseId?: number;
  sourceId?: number;
  sourceType?: string;
  title: string;
  chunkText?: string;
  section?: string;
}

function SourcePanel({ source, onClose }: { source: SourceInfo; onClose: () => void }) {
  const isCourse = source.sourceType === 'course' || (source.sourceType == null && source.courseId != null);
  const isItem = source.sourceType === 'item';
  const { data: course, isLoading: courseLoading } = useCourse(isCourse ? (source.courseId ?? null) : null);
  const { data: item, isLoading: itemLoading } = useItem(isItem ? (source.sourceId ?? 0) : 0);

  return (
    <div className="w-80 shrink-0 bg-zinc-950 border-l border-white/[0.06] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04] shrink-0">
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
          title="Fermer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider truncate">Source</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollable p-4 flex flex-col gap-4">
        {/* Immediate fallback — always visible */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-200 leading-snug">{source.title}</h2>
          {source.section && (
            <p className="text-xs text-zinc-600 mt-0.5">{source.section}</p>
          )}
        </div>

        {/* Chunk text — always shown if available */}
        {source.chunkText && (
          <div>
            <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Extrait pertinent</p>
            <div className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
              {source.chunkText}
            </div>
          </div>
        )}

        {/* Item details — URL + summary */}
        {isItem && itemLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-700">
            <div className="w-4 h-4 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin shrink-0" />
            Chargement de la source...
          </div>
        )}

        {isItem && !itemLoading && item && (
          <>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-xs text-sky-400 hover:text-sky-300 transition-colors break-all"
              >
                <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{item.url}</span>
              </a>
            )}
            {item.summary && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Résumé</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.summary}</p>
              </div>
            )}
          </>
        )}

        {/* Course details — only when loading or available */}
        {isCourse && courseLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-700">
            <div className="w-4 h-4 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin shrink-0" />
            Chargement du document...
          </div>
        )}

        {isCourse && !courseLoading && course && (
          <>
            <span className={`self-start inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
              course.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
              course.status === 'review' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
              'bg-white/[0.04] text-zinc-500 border-white/[0.06]'
            }`}>
              {course.status}
            </span>

            <div className="flex flex-col gap-1.5">
              {course.topic && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Tag className="w-3 h-3 text-zinc-700 shrink-0" strokeWidth={1.5} />
                  {course.topic}
                </div>
              )}
              {course.level && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Layers className="w-3 h-3 text-zinc-700 shrink-0" strokeWidth={1.5} />
                  {course.level}
                </div>
              )}
              {course.duration && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Clock className="w-3 h-3 text-zinc-700 shrink-0" strokeWidth={1.5} />
                  {course.duration} min
                </div>
              )}
            </div>

            {course.description && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Résumé</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{course.description}</p>
              </div>
            )}

            {course.content && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Contenu complet</p>
                <div className="text-xs text-zinc-500 leading-relaxed whitespace-pre-wrap line-clamp-[20] bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                  {course.content}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function AssistantMode() {
  const { activeWorkspaceId } = useCockpit();
  const ragMutation = useRAGAsk();
  const extractMutation = useRAGExtractDocument();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────────────────

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = loadConversations(activeWorkspaceId);
    return saved.length > 0 ? saved : [newConversation()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadConversations(activeWorkspaceId);
    return saved.length > 0 ? saved[0].id : conversations[0]?.id ?? '';
  });
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [activeSource, setActiveSource] = useState<SourceInfo | null>(null);
  // Attachment state
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const activeConv = conversations.find(c => c.id === activeId) ?? conversations[0];
  const messages = activeConv?.messages ?? [];

  // ── Persistence ────────────────────────────────────────────────────────

  useEffect(() => {
    saveConversations(activeWorkspaceId, conversations);
  }, [conversations, activeWorkspaceId]);

  // Reload when workspace changes
  useEffect(() => {
    const saved = loadConversations(activeWorkspaceId);
    if (saved.length > 0) {
      setConversations(saved);
      setActiveId(saved[0].id);
    } else {
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    }
    setSelectedIds(new Set());
  }, [activeWorkspaceId]);

  // Scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, ragMutation.isPending]);

  // ── Conversation helpers ───────────────────────────────────────────────

  function updateConv(id: string, updater: (c: Conversation) => Conversation) {
    setConversations(prev => prev.map(c => c.id === id ? updater(c) : c));
  }

  function startNewConversation() {
    const fresh = newConversation();
    setConversations(prev => [fresh, ...prev]);
    setActiveId(fresh.id);
    setShowHistory(false);
  }

  function switchTo(id: string) {
    setActiveId(id);
    setShowHistory(false);
    setSelectedIds(new Set());
  }

  function deleteSelected() {
    setConversations(prev => {
      const remaining = prev.filter(c => !selectedIds.has(c.id));
      if (remaining.length === 0) {
        const fresh = newConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (selectedIds.has(activeId)) {
        setActiveId(remaining[0].id);
      }
      return remaining;
    });
    setSelectedIds(new Set());
  }

  function deleteSingle(id: string) {
    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== id);
      if (remaining.length === 0) {
        const fresh = newConversation();
        if (activeId === id) setActiveId(fresh.id);
        return [fresh];
      }
      if (activeId === id) setActiveId(remaining[0].id);
      return remaining;
    });
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === conversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(conversations.map(c => c.id)));
    }
  }

  // ── Attachment handlers ───────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset previous
    if (fileInputRef.current) fileInputRef.current.value = '';
    setAttachedFile(file);
    setDocumentContext(null);
    setExtractError(null);
    try {
      const result = await extractMutation.mutateAsync(file);
      setDocumentContext(result.text);
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Extraction échouée';
      setExtractError(msg);
      setAttachedFile(null);
    }
  };

  const clearAttachment = () => {
    setAttachedFile(null);
    setDocumentContext(null);
    setExtractError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Send message ───────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!input.trim() && !documentContext) || !activeConv) return;
    if (extractMutation.isPending) return;

    const text = input.trim() || '(voir document joint)';
    const userMsg: Message = {
      role: 'user',
      content: text,
      ...(attachedFile ? { attachment: { filename: attachedFile.name, method: extractMutation.data?.method ?? '', charCount: documentContext?.length ?? 0 } } : {}),
    };

    updateConv(activeId, c => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 50) : c.title,
      messages: [...c.messages, userMsg],
    }));
    setInput('');
    const ctxToSend = documentContext;
    clearAttachment();

    try {
      const response = await ragMutation.mutateAsync({ query: text, useHybridSearch: true, documentContext: ctxToSend ?? undefined, workspaceId: activeWorkspaceId });
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.answer || 'Aucune réponse disponible.',
        sources: response.sources,
      };
      updateConv(activeId, c => ({ ...c, messages: [...c.messages, assistantMsg] }));
    } catch {
      updateConv(activeId, c => ({
        ...c,
        messages: [...c.messages, { role: 'assistant', content: 'Désolé, une erreur est survenue.' }],
      }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const openSource = (source: Message['sources'][number]) => {
    const isItem = source.source_type === 'item';
    setActiveSource({
      courseId: isItem ? undefined : (source.course_id ?? source.source_id),
      sourceId: source.source_id,
      sourceType: source.source_type,
      title: source.title,
      chunkText: source.chunk_text,
      section: (source as any).section,
    });
    setShowHistory(false);
    setShowSettings(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── History sidebar ─────────────────────────────────────────────── */}
      {showHistory && (
        <div className="w-64 shrink-0 bg-zinc-950 border-r border-white/[0.06] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Conversations</span>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
            <button
              onClick={startNewConversation}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouvelle
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors"
                title={`Supprimer ${selectedIds.size} conversation${selectedIds.size > 1 ? 's' : ''}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {selectedIds.size}
              </button>
            )}
          </div>

          {/* Select all */}
          {conversations.length > 1 && (
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 px-4 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {selectedIds.size === conversations.length
                ? <CheckSquare className="w-3.5 h-3.5" />
                : <Square className="w-3.5 h-3.5" />
              }
              Tout sélectionner
            </button>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto scrollable py-1">
            {conversations.map(conv => {
              const isActive = conv.id === activeId;
              const isChecked = selectedIds.has(conv.id);
              return (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 mx-2 my-0.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-sky-500/10 border border-sky-500/20'
                      : 'hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleSelect(conv.id); }}
                    className={`shrink-0 transition-colors ${isChecked ? 'text-sky-400' : 'text-zinc-700 group-hover:text-zinc-500'}`}
                  >
                    {isChecked
                      ? <CheckSquare className="w-3.5 h-3.5" />
                      : <Square className="w-3.5 h-3.5" />
                    }
                  </button>

                  {/* Title */}
                  <button
                    onClick={() => switchTo(conv.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className={`text-xs font-medium truncate ${isActive ? 'text-sky-300' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                      {conv.title}
                    </p>
                    <p className="text-[10px] text-zinc-700 mt-0.5">
                      {conv.messages.length} msg · {formatDate(conv.createdAt)}
                    </p>
                  </button>

                  {/* Delete single */}
                  <button
                    onClick={e => { e.stopPropagation(); deleteSingle(conv.id); }}
                    className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Chat area ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] shrink-0 bg-zinc-900/40">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Bouton historique — toujours visible */}
            <button
              onClick={() => { setShowHistory(v => !v); setShowSettings(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                showHistory
                  ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                  : 'bg-white/[0.04] text-zinc-400 border-white/[0.08] hover:text-zinc-200 hover:bg-white/[0.07]'
              }`}
              title="Afficher l'historique des conversations"
            >
              <History className="w-3.5 h-3.5" />
              <span>Historique</span>
              {conversations.length > 1 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  showHistory ? 'bg-sky-500/20 text-sky-300' : 'bg-white/[0.08] text-zinc-500'
                }`}>
                  {conversations.length}
                </span>
              )}
            </button>
            <div className="w-px h-4 bg-white/[0.08]" />
            <span className="text-xs text-zinc-500 truncate max-w-[200px]">
              {activeConv?.title ?? 'Chat RAG'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={startNewConversation}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-zinc-400 border border-white/[0.08] hover:text-sky-400 hover:bg-sky-500/[0.08] hover:border-sky-500/20 transition-all"
              title="Nouvelle conversation"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouveau</span>
            </button>
            <button
              onClick={() => { setShowSettings(v => !v); setShowHistory(false); }}
              className={`p-1.5 rounded-lg transition-all ${
                showSettings ? 'bg-sky-500/12 text-sky-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'
              }`}
              title="Paramètres RAG"
            >
              {showSettings ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollable p-5 flex flex-col gap-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-zinc-600" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <h2 className="text-sm font-medium text-zinc-400 mb-1">Nouvelle conversation</h2>
                <p className="text-xs text-zinc-700 max-w-sm leading-relaxed">
                  Posez des questions sur vos documents. L'assistant utilise la recherche sémantique
                  pour vous fournir les réponses les plus pertinentes.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-sky-500/15 text-zinc-200 border border-sky-500/20'
                    : 'bg-white/[0.04] text-zinc-300 border border-white/[0.06]'
                }`}>
                  {msg.role === 'user' && msg.attachment && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-white/[0.06] rounded-lg border border-white/[0.08] w-fit">
                      <FileText className="w-3 h-3 text-sky-400 shrink-0" strokeWidth={1.5} />
                      <span className="text-[10px] text-sky-300 truncate max-w-[180px]">{msg.attachment.filename}</span>
                      <span className="text-[10px] text-zinc-600">{msg.attachment.charCount.toLocaleString()} car.</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-col gap-1.5">
                      <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider">
                        Sources ({msg.sources.length})
                      </p>
                      {msg.sources.map((source, sidx) => {
                          return (
                        <button
                          key={sidx}
                          onClick={() => openSource(source)}
                          className="text-left p-2 bg-white/[0.03] rounded-lg border border-white/[0.06] hover:border-sky-500/30 hover:bg-sky-500/[0.04] transition-colors group cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <FileText className="w-3 h-3 text-zinc-700 group-hover:text-sky-500/70 shrink-0" strokeWidth={1.5} />
                            <p className="text-xs font-medium text-zinc-300 group-hover:text-sky-300 truncate">{source.title}</p>
                          </div>
                          <p className="text-xs text-zinc-600 line-clamp-2">{source.chunk_text}</p>
                        </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {ragMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse" />
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse [animation-delay:0.1s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/[0.06]">
          {/* Attachment chip or error */}
          {(attachedFile || extractError) && (
            <div className="flex items-center gap-2 mb-2">
              {attachedFile && (
                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                  extractMutation.isPending
                    ? 'bg-zinc-900 border-white/[0.08] text-zinc-500'
                    : documentContext
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-400'
                }`}>
                  {extractMutation.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    : <FileText className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                  }
                  <span className="max-w-[200px] truncate">{attachedFile.name}</span>
                  {documentContext && <span className="text-zinc-600">{documentContext.length.toLocaleString()} car.</span>}
                  <button onClick={clearAttachment} className="text-zinc-600 hover:text-zinc-300 transition-colors ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {extractError && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{extractError}</span>
                  <button onClick={() => setExtractError(null)} className="text-zinc-600 hover:text-zinc-300 ml-1"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* File attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={extractMutation.isPending}
              className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all disabled:opacity-40 self-end"
              title="Joindre un document (PDF, image, DOCX, TXT)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.tif,.bmp,.txt,.md,.docx"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex-1">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={documentContext ? 'Question sur le document joint…' : 'Posez votre question…'}
                rows={2}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-sky-500/50 text-sm text-zinc-200 placeholder-zinc-700 transition-colors"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !documentContext) || ragMutation.isPending || extractMutation.isPending}
              className="cockpit-btn cockpit-btn-primary px-4 py-3 self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Source panel ────────────────────────────────────────────────── */}
      {activeSource !== null && (
        <SourcePanel source={activeSource} onClose={() => setActiveSource(null)} />
      )}

      {/* ── Settings sidebar ────────────────────────────────────────────── */}
      {showSettings && (
        <div className="w-72 bg-zinc-950 border-l border-white/[0.06] p-5 flex flex-col gap-5">
          <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Paramètres RAG</h3>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">Document spécifique</label>
            <select
              value={selectedCourseId || ''}
              onChange={e => setSelectedCourseId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
            >
              <option value="">Tous les documents</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">Mode de recherche</label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-zinc-500">
                <input type="checkbox" defaultChecked className="accent-sky-500" />
                Recherche hybride
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">Nombre de sources (top_k)</label>
            <input
              type="number"
              defaultValue={5}
              min={1}
              max={10}
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
            />
          </div>
          <div className="mt-auto pt-4 border-t border-white/[0.06]">
            <p className="text-[10px] text-zinc-700 uppercase tracking-wider font-semibold mb-2">Ce workspace</p>
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <MessageSquare className="w-3.5 h-3.5" />
              {conversations.length} conversation{conversations.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {ragMutation.isPending && <Preloader message="Recherche en cours" />}
    </div>
  );
}
