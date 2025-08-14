import React from 'react';
import Link from 'next/link';

interface ErrorStateProps {
  message?: string;
  fullPage?: boolean;
  retry?: () => void;
  homeLink?: boolean;
}

export default function ErrorState({ 
  message = 'Something went wrong. Please try again later.', 
  fullPage = false,
  retry,
  homeLink = false
}: ErrorStateProps) {
  const containerClasses = fullPage 
    ? 'flex flex-col items-center justify-center min-h-[50vh] w-full text-center px-4'
    : 'flex flex-col items-center justify-center py-12 w-full text-center px-4';

  return (
    <div 
      className={containerClasses} 
      role="alert" 
      aria-live="assertive"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-12 w-12 text-red-500" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
        aria-hidden="true"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
        />
      </svg>
      <h2 className="mt-4 text-lg font-medium text-gray-900">Error</h2>
      <p className="mt-2 text-gray-600">{message}</p>
      
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        {retry && (
          <button
            onClick={retry}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label="Retry loading the content"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 mr-2" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
            Try Again
          </button>
        )}
        
        {homeLink && (
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label="Return to homepage"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 mr-2" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" 
              />
            </svg>
            Return Home
          </Link>
        )}
      </div>
    </div>
  );
}
