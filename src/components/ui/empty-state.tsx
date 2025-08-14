import React from 'react';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center py-12 w-full text-center px-4 bg-gray-50 rounded-lg border border-gray-200"
      role="status"
      aria-live="polite"
    >
      {icon || (
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-12 w-12 text-gray-400" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
          aria-hidden="true"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" 
          />
        </svg>
      )}
      <h3 className="mt-4 text-lg font-medium text-gray-900">{title}</h3>
      <p className="mt-2 text-gray-600">{message}</p>
      
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label={action.label}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
