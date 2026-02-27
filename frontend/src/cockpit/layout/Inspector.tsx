// Inspector - Panneau droit contextuel
import { useCockpit } from '../context/CockpitContext';
import { X } from 'lucide-react';
import { ItemInspector } from '../components/inspectors/ItemInspector';
import { DocInspector } from '../components/inspectors/DocInspector';

export function Inspector() {
  const { activeMode, setInspectorOpen, selectedItemId, selectedDocId } = useCockpit();

  // Détermine quel inspector afficher selon le contexte
  const showItemInspector = activeMode === 'flux' && selectedItemId !== null;
  const showDocInspector = activeMode === 'production' && selectedDocId !== null;

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Inspector</h2>
        <button
          onClick={() => setInspectorOpen(false)}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showItemInspector && <ItemInspector itemId={selectedItemId!} />}
        {showDocInspector && <DocInspector docId={selectedDocId!} />}
        
        {!showItemInspector && !showDocInspector && (
          <div className="p-4 text-sm text-gray-500 text-center">
            Sélectionnez un élément pour voir les détails
          </div>
        )}
      </div>
    </div>
  );
}
