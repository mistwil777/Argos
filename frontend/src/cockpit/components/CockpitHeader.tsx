// CockpitHeader - En-tête moderne avec fond animé
import type { ReactNode } from 'react';

interface CockpitHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function CockpitHeader({ title, subtitle, icon, actions }: CockpitHeaderProps) {
  return (
    <div className="relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 via-cyan-900/20 to-transparent">
        {/* Animated grid pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(to right, rgba(59, 130, 246, 0.3) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59, 130, 246, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '4rem 4rem',
            animation: 'grid-flow 20s linear infinite'
          }} />
        </div>
        
        {/* Animated glow orbs */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse-slower" />
      </div>

      {/* Content */}
      <div className="relative z-10 px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {icon && (
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/40 to-cyan-600/40 border border-blue-500/50 shadow-lg shadow-blue-500/30">
                {icon}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-100 tracking-tight mb-1 drop-shadow-lg">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-blue-300/80 font-medium">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center space-x-3">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Bottom border glow */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
    </div>
  );
}
