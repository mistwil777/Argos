// Inspector - Panneau droit contextuel
import { useCockpit } from '../context/CockpitContext';
import { X, MousePointer } from 'lucide-react';
import { ItemInspector } from '../components/inspectors/ItemInspector';
import { DocInspector } from '../components/inspectors/DocInspector';

export function Inspector() {
  const { activeMode, setInspectorOpen, selectedItemId, selectedDocId } = useCockpit();

  const showItemInspector = activeMode === 'flux' && selectedItemId !== null;
  const showDocInspector = activeMode === 'production' && selectedDocId !== null;

  return (
    <div className="w-[320px] bg-zinc-950 border-l border-white/[0.06] flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
        <span className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest">Inspecteur</span>
        <button
          onClick={() => setInspectorOpen(false)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-700 hover:text-zinc-300 hover:bg-white/[0.05] transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollable">
        {showItemInspector && <ItemInspector itemId={selectedItemId!} />}
        {showDocInspector && <DocInspector docId={selectedDocId!} />}

        {!showItemInspector && !showDocInspector && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 px-8">
            <MousePointer className="w-7 h-7 text-zinc-800" strokeWidth={1.5} />
            <p className="text-xs text-zinc-700 text-center leading-relaxed">
              Sélectionnez un élément<br />pour voir ses détails
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

