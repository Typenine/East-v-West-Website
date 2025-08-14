import React from 'react';

interface LoadingStateProps {
  message?: string;
  fullPage?: boolean;
}

export default function LoadingState({ message = 'Loading...', fullPage = false }: LoadingStateProps) {
  const containerClasses = fullPage 
    ? 'flex flex-col items-center justify-center min-h-[50vh] w-full'
    : 'flex flex-col items-center justify-center py-12 w-full';

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      <p className="mt-4 text-gray-600 font-medium">{message}</p>
    </div>
  );
}
