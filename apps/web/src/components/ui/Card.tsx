import React from 'react';

interface CardProps {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  compact?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  title, 
  icon, 
  children, 
  className = '',
  actions,
  compact = false
}) => {
  return (
    <div className={`bg-white rounded-2xl border border-surface-200 shadow-sm transition-shadow duration-200 hover:shadow-md ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-surface-100">
          <div className="flex items-center gap-3">
            {icon && <span className="text-surface-500">{icon}</span>}
            {title && <h2 className="text-base sm:text-lg font-semibold text-surface-900">{title}</h2>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={compact ? "p-4 sm:p-5" : "p-5 sm:p-6"}>{children}</div>
    </div>
  );
};

export default Card;
