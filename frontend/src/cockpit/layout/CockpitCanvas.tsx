// CockpitCanvas - Zone principale qui affiche le contenu selon le mode actif
import { useCockpit } from '../context/CockpitContext';
import { FluxMode } from '../modes/FluxMode';
import { ProductionMode } from '../modes/ProductionMode';
import { AssistantMode } from '../modes/AssistantMode';
import { ControleMode } from '../modes/ControleMode';

export function CockpitCanvas() {
  const { activeMode } = useCockpit();

  return (
    <div className="flex-1 overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50/30">
      {activeMode === 'flux' && <FluxMode />}
      {activeMode === 'production' && <ProductionMode />}
      {activeMode === 'assistant' && <AssistantMode />}
      {activeMode === 'controle' && <ControleMode />}
    </div>
  );
}
