// FluxMode - Refonte UX complete - liste dense + statuts visuels + docs générés
import { useState, useMemo } from 'react';
import { useItems, useDeleteItem, useClassifyBatch, useCourses } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { AlertCircle, Trash2, Globe, Sparkles, BookOpen, Clock, CheckCircle2, Layers, ChevronRight } from 'lucide-react';
import type { Item } from '../../types';

function sourceDomain(url?: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}
const IMP_LABEL: Record<string,string> = { High:'Élevé', Medium:'Moyen', Low:'Faible', Critical:'Critique' };
const IMP_CLS: Record<string,string> = {
  High:'bg-red-500/10 text-red-400 border-red-500/15',
  Medium:'bg-amber-500/10 text-amber-400 border-amber-500/15',
  Low:'bg-zinc-700/30 text-zinc-500 border-white/[0.06]',
  Critical:'bg-red-600/15 text-red-300 border-red-600/20',
};
type Filter = 'all' | 'pending' | 'classified' | 'used';

function Pill({ label, count, active, onClick }: { label:string; count:number; active:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${active ? 'bg-white/[0.09] text-zinc-200' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'}`}>
      {label}
      <span className={`font-mono tabular-nums text-[10px] px-1 py-0.5 rounded ml-1 ${active ? 'bg-white/[0.08] text-zinc-400' : 'text-zinc-700'}`}>{count}</span>
    </button>
  );
}

interface RowProps {
  item: Item; selected: boolean; courses: any[];
  onSelect:(e:React.MouseEvent)=>void; onOpen:()=>void; onDelete:()=>void; onSourceClick:(url:string)=>void;
}
function ItemRow({ item, selected, courses, onSelect, onOpen, onDelete, onSourceClick }: RowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isUsed = courses.length > 0;
  const isPending = item.classification_status === 'pending';
  const domain = sourceDomain(item.source_url);
  const statusDot = isPending ? 'bg-amber-400 cockpit-indicator-active' : isUsed ? 'bg-sky-400' : 'bg-emerald-400';

  return (
    <div
      className={`group relative flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.025] transition-all duration-100 cursor-pointer ${selected ? 'bg-sky-500/[0.04]' : ''} ${isUsed ? 'opacity-65 hover:opacity-85' : ''}`}
      onClick={onOpen}>
      <div className="flex items-center gap-2.5 pt-[3px] shrink-0" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={()=>{}} onClick={onSelect} className="w-3 h-3 accent-sky-500 cursor-pointer" />
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-sm font-medium leading-snug max-w-[480px] truncate transition-colors ${isUsed ? 'text-zinc-500' : 'text-zinc-200 group-hover:text-zinc-100'}`}>{item.title}</h3>
              {isUsed && (
                <div className="flex items-center gap-1 shrink-0">
                  {courses.map((c:any) => (
                    <span key={c.id} title={c.title} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <BookOpen className="w-2.5 h-2.5 shrink-0" />Cours
                      {c.status === 'published' && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed mt-0.5 line-clamp-1 max-w-[580px]">{item.summary}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {item.importance && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${IMP_CLS[item.importance] ?? ''}`}>{IMP_LABEL[item.importance] ?? item.importance}</span>}
            {domain && (
              <button onClick={(e)=>{e.stopPropagation();item.source_url&&onSourceClick(item.source_url);}} className="flex items-center gap-1 text-[10px] text-zinc-700 hover:text-sky-400 transition-colors">
                <Globe className="w-2.5 h-2.5 shrink-0" />{domain}
              </button>
            )}
            <span className="text-[10px] text-zinc-700 font-mono tabular-nums w-12 text-right">
              {new Date(item.created_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
            </span>
            <div className="flex items-center w-24 justify-end" onClick={(e)=>e.stopPropagation()}>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button onClick={()=>{onDelete();setConfirmDelete(false);}} className="text-[10px] px-2 py-1 rounded font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all whitespace-nowrap">
                    {isUsed ? 'Définitif !' : 'Confirmer'}
                  </button>
                  <button onClick={()=>setConfirmDelete(false)} className="text-[10px] text-zinc-600 hover:text-zinc-300 px-1">✕</button>
                </div>
              ) : (
                <button onClick={()=>setConfirmDelete(true)}
                  title={isUsed ? 'Supprimer définitivement (item déjà utilisé dans un document)' : 'Supprimer'}
                  className={`opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all ${isUsed ? 'text-red-400/60 hover:text-red-300 hover:bg-red-500/10' : 'text-zinc-700 hover:text-red-400 hover:bg-red-500/8'}`}>
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
        {item.topics && item.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.topics.slice(0,4).map((t:string,i:number) => (
              <span key={i} className="text-[10px] px-1.5 py-px rounded bg-sky-500/6 text-sky-500/60 border border-sky-500/10">{t}</span>
            ))}
            {item.topics.length > 4 && <span className="text-[10px] text-zinc-700">+{item.topics.length-4}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function FluxMode() {
  const { setSelectedItemId, setInspectorOpen, activeWorkspaceId, setActiveMode, setSelectedSourceUrl } = useCockpit();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'importance'>('date');
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const wsReady = activeWorkspaceId !== null;

  const { data: itemsData, isLoading } = useItems({ workspace_id: activeWorkspaceId ?? undefined }, { enabled: wsReady });
  const { data: coursesData } = useCourses({ workspace_id: activeWorkspaceId ?? undefined, limit: 500 }, { enabled: wsReady });
  const deleteItem = useDeleteItem();
  const classifyBatch = useClassifyBatch();
  const allItems: Item[] = itemsData?.items ?? [];
  const allCourses: any[] = coursesData?.courses ?? [];

  const itemToCourses = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const c of allCourses) {
      if (c.source_item_id != null) {
        if (!m.has(c.source_item_id)) m.set(c.source_item_id, []);
        m.get(c.source_item_id)!.push(c);
      }
    }
    return m;
  }, [allCourses]);

  const counts = useMemo(() => ({
    all: allItems.length,
    pending: allItems.filter(i => i.classification_status === 'pending').length,
    classified: allItems.filter(i => i.classification_status === 'classified').length,
    used: allItems.filter(i => itemToCourses.has(i.id)).length,
  }), [allItems, itemToCourses]);

  const visibleItems = useMemo(() => {
    let list = allItems;
    if (filter === 'pending')    list = list.filter(i => i.classification_status === 'pending');
    if (filter === 'classified') list = list.filter(i => i.classification_status === 'classified');
    if (filter === 'used')       list = list.filter(i => itemToCourses.has(i.id));
    if (sortBy === 'importance') {
      const order: Record<string,number> = { Critical:0, High:1, Medium:2, Low:3 };
      list = [...list].sort((a,b) => (order[a.importance ?? ''] ?? 9) - (order[b.importance ?? ''] ?? 9));
    }
    return list;
  }, [allItems, filter, sortBy, itemToCourses]);

  // Group visible items by source domain
  const itemsByDomain = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visibleItems) {
      const d = sourceDomain(item.source_url) ?? '(source inconnue)';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(item);
    }
    return map;
  }, [visibleItems]);

  const toggleDomain = (domain: string) =>
    setExpandedDomains(prev => { const n = new Set(prev); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });

  const allChecked = visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id));
  const someChecked = selectedIds.size > 0;
  const toggleOne = (id:number, e:React.MouseEvent) => { e.stopPropagation(); setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const toggleAll = () => { if (allChecked) setSelectedIds(new Set()); else setSelectedIds(new Set(visibleItems.map(i=>i.id))); };
  const handleDelete = (id:number) => { deleteItem.mutate(id); setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }); };
  const handleBatchDelete = () => { [...selectedIds].forEach(id => deleteItem.mutate(id)); setSelectedIds(new Set()); };
  const handleBatchClassify = () => {
    const ids = [...selectedIds].filter(id => visibleItems.find(i => i.id === id)?.classification_status === 'pending');
    if (ids.length > 0) classifyBatch.mutate(ids);
    setSelectedIds(new Set());
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-zinc-950">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.05] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
          <Layers className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-zinc-200 leading-none">Flux d'items</h1>
          <p className="text-[11px] text-zinc-600 mt-0.5">{counts.all} collectés · {counts.used} utilisés · {counts.pending} à traiter</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[10px] text-zinc-700">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> À classifier</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Classifié</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" /> Utilisé (docs générés)</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.04] shrink-0">
        <label className="flex items-center mr-1 cursor-pointer" onClick={toggleAll}>
          <input type="checkbox" readOnly checked={allChecked} className="w-3 h-3 accent-sky-500 cursor-pointer rounded" />
        </label>
        <Pill label="Tous"         count={counts.all}        active={filter==='all'}        onClick={()=>setFilter('all')} />
        <Pill label="À classifier" count={counts.pending}    active={filter==='pending'}    onClick={()=>setFilter('pending')} />
        <Pill label="Classifiés"   count={counts.classified} active={filter==='classified'} onClick={()=>setFilter('classified')} />
        <Pill label="Utilisés"     count={counts.used}       active={filter==='used'}       onClick={()=>setFilter('used')} />
        <div className="flex-1" />
        <div className="flex items-center border border-white/[0.06] rounded-lg overflow-hidden text-[11px]">
          <button onClick={()=>setSortBy('date')} className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${sortBy==='date' ? 'bg-white/[0.06] text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'}`}><Clock className="w-3 h-3" /> Date</button>
          <button onClick={()=>setSortBy('importance')} className={`flex items-center gap-1 px-2.5 py-1.5 border-l border-white/[0.06] transition-colors ${sortBy==='importance' ? 'bg-white/[0.06] text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'}`}>Priorité</button>
        </div>
        {someChecked && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/[0.06]">
            <span className="text-[11px] text-zinc-600">{selectedIds.size} sél.</span>
            {[...selectedIds].some(id => visibleItems.find(i=>i.id===id)?.classification_status==='pending') && (
              <button onClick={handleBatchClassify} disabled={classifyBatch.isPending} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-500/8 text-sky-400 border border-sky-500/15 hover:bg-sky-500/12 transition-all disabled:opacity-50">
                <Sparkles className="w-3 h-3" />{classifyBatch.isPending ? 'En cours…' : 'Classifier'}
              </button>
            )}
            <button onClick={handleBatchDelete} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/8 text-red-400 border border-red-500/15 hover:bg-red-500/12 transition-all">
              <Trash2 className="w-3 h-3" /> Supprimer
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/[0.04] shrink-0 bg-white/[0.01]">
        <div className="w-8 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-700 flex-1">Item / Résumé</span>
        <div className="flex items-center gap-2 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-700 pr-24">
          <span className="w-14 text-center">Priorité</span>
          <span className="w-20 text-center">Source</span>
          <span className="w-12 text-right">Date</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollable p-4 flex flex-col gap-3">
        {isLoading && (
          <>
            {[1,2,3].map(i => <div key={i} className="h-32 rounded-xl shimmer-box" />)}
          </>
        )}
        {!isLoading && visibleItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <AlertCircle className="w-8 h-8 text-zinc-800" strokeWidth={1} />
            <p className="text-sm text-zinc-700">Aucun item dans cette catégorie</p>
            {filter !== 'all' && <button onClick={()=>setFilter('all')} className="text-xs text-sky-500 hover:text-sky-400 transition-colors">Voir tous les items</button>}
          </div>
        )}
        {!isLoading && [...itemsByDomain.entries()].map(([domain, domainItems]) => {
          const isCollapsed = !expandedDomains.has(domain);
          const pendingCt = domainItems.filter(i => i.classification_status === 'pending').length;
          const classifiedCt = domainItems.filter(i => i.classification_status === 'classified').length;
          const usedCt = domainItems.filter(i => itemToCourses.has(i.id)).length;
          const allDomainChecked = domainItems.every(i => selectedIds.has(i.id));
          return (
            <div key={domain} className="rounded-xl border border-white/[0.07] overflow-hidden bg-white/[0.01]">
              {/* Domain group header */}
              <div className="flex items-center gap-4 px-5 py-4 bg-white/[0.025] border-b border-white/[0.06]">
                {/* Favicon + domain */}
                <button
                  onClick={() => toggleDomain(domain)}
                  className="flex items-center gap-3 flex-1 min-w-0 group/hdr text-left"
                >
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${isCollapsed ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-sky-500/8 border-sky-500/20'}`}>
                    <Globe className={`w-4 h-4 transition-colors ${isCollapsed ? 'text-zinc-600' : 'text-sky-400'}`} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-200 group-hover/hdr:text-white transition-colors truncate">{domain}</span>
                      <ChevronRight className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`} />
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      {domainItems.length} item{domainItems.length > 1 ? 's' : ''} collectés
                    </p>
                  </div>
                </button>

                {/* Stat pills */}
                <div className="flex items-center gap-2 shrink-0">
                  {pendingCt > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/8 text-amber-400 border border-amber-500/15 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 cockpit-indicator-active shrink-0" />
                      {pendingCt} à classifier
                    </span>
                  )}
                  {classifiedCt > 0 && pendingCt === 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/8 text-emerald-400 border border-emerald-500/15 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      {classifiedCt} classifié{classifiedCt > 1 ? 's' : ''}
                    </span>
                  )}
                  {usedCt > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-sky-500/8 text-sky-400 border border-sky-500/15 font-medium">
                      <BookOpen className="w-3 h-3 shrink-0" />
                      {usedCt} doc{usedCt > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Select-all checkbox for group */}
                <label
                  className="flex items-center cursor-pointer shrink-0"
                  title="Sélectionner tout le groupe"
                  onClick={e => { e.preventDefault(); if (allDomainChecked) setSelectedIds(prev => { const n = new Set(prev); domainItems.forEach(i => n.delete(i.id)); return n; }); else setSelectedIds(prev => { const n = new Set(prev); domainItems.forEach(i => n.add(i.id)); return n; }); }}
                >
                  <input type="checkbox" readOnly checked={allDomainChecked} className="w-3.5 h-3.5 accent-sky-500 cursor-pointer" />
                </label>
              </div>

              {/* Items list — hidden when collapsed */}
              {!isCollapsed && (
                <div>
                  {domainItems.map(item => (
                    <ItemRow
                      key={item.id} item={item} selected={selectedIds.has(item.id)}
                      courses={itemToCourses.get(item.id) ?? []}
                      onSelect={(e)=>toggleOne(item.id,e)}
                      onOpen={()=>{setSelectedItemId(item.id);setInspectorOpen(true);}}
                      onDelete={()=>handleDelete(item.id)}
                      onSourceClick={(url)=>{setSelectedSourceUrl(url);setActiveMode('sources');}}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isLoading && visibleItems.length > 0 && (
        <div className="shrink-0 flex items-center gap-4 px-5 py-2 border-t border-white/[0.04] text-[10px] text-zinc-700">
          <span className="font-mono tabular-nums">{visibleItems.length} item{visibleItems.length > 1 ? 's' : ''}</span>
          <span>·</span><span>{counts.used} ont généré des documents</span>
          <span>·</span><span>{counts.pending} en attente de classification</span>
        </div>
      )}
    </div>
  );
}
