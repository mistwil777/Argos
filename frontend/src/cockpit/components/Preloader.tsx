// Preloader - Animation de chargement neumorphique
interface PreloaderProps {
  message?: string;
}

export function Preloader({ message = "Chargement" }: PreloaderProps) {
  return (
    <div className="fixed inset-0 bg-[#0f1420]/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="preloader">
          <div className="preloader__square"></div>
          <div className="preloader__square"></div>
          <div className="preloader__square"></div>
          <div className="preloader__square"></div>
        </div>
        <div className="status text-lg font-medium text-blue-200">
          {message}
          <span className="status__dot">.</span>
          <span className="status__dot">.</span>
          <span className="status__dot">.</span>
        </div>
      </div>
    </div>
  );
}
