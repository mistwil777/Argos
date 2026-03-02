// Preloader - Animation de chargement
interface PreloaderProps {
  message?: string;
}

export function Preloader({ message = "Chargement" }: PreloaderProps) {
  return (
    <div className="fixed inset-0 bg-zinc-950/85 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="preloader">
          <div className="preloader__square"></div>
          <div className="preloader__square"></div>
          <div className="preloader__square"></div>
          <div className="preloader__square"></div>
        </div>
        <div className="status text-sm font-medium text-zinc-400">
          {message}
          <span className="status__dot">.</span>
          <span className="status__dot">.</span>
          <span className="status__dot">.</span>
        </div>
      </div>
    </div>
  );
}
