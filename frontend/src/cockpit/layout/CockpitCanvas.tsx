// CockpitCanvas - Zone principale selon le mode actif
import { useCockpit } from '../context/CockpitContext';
import { FluxMode } from '../modes/FluxMode';
import { ProductionMode } from '../modes/ProductionMode';
import { AssistantMode } from '../modes/AssistantMode';
import { SourcesMode } from '../modes/SourcesMode';

export function CockpitCanvas() {
  const { activeMode } = useCockpit();

  return (
    <div className="flex-1 overflow-hidden bg-zinc-950">
      {activeMode === 'flux' && <FluxMode />}
      {activeMode === 'production' && <ProductionMode />}
      {activeMode === 'assistant' && <AssistantMode />}
      {activeMode === 'sources' && <SourcesMode />}
    </div>
  );
}

