// Preloader - Indicateur de tâche non-bloquant (coin bas-droite)
interface PreloaderProps {
  message?: string;
}

export function Preloader({ message = "Chargement" }: PreloaderProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60">
      {/* Animated spinner */}
      <div className="w-4 h-4 rounded-full border-2 border-white/[0.08] border-t-sky-500 animate-spin shrink-0" />
      <span className="text-xs font-medium text-zinc-300">{message}</span>
      <div className="flex gap-0.5">
        <span className="status__dot" style={{ color: 'rgb(113 113 122)' }}>.</span>
        <span className="status__dot" style={{ color: 'rgb(113 113 122)' }}>.</span>
        <span className="status__dot" style={{ color: 'rgb(113 113 122)' }}>.</span>
      </div>
    </div>
  );
}

