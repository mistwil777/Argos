// CockpitHeader - En-tête de section asymétrique
import type { ReactNode } from 'react';

interface CockpitHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function CockpitHeader({ title, subtitle, icon, actions }: CockpitHeaderProps) {
  return (
    <div className="px-6 py-5 border-b border-white/[0.06] shrink-0">
      <div className="flex items-end justify-between gap-6">
        {/* Left — asymmetric title block */}
        <div className="flex items-center gap-4">
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight leading-none mb-1">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-zinc-500 font-normal">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right — actions */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
