'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TradeTreeNode, buildTradeTrees } from '@/lib/utils/trades';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';

export default function TradeTreesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tradeTrees, setTradeTrees] = useState<TradeTreeNode[]>([]);
  const [selectedTree, setSelectedTree] = useState<TradeTreeNode | null>(null);
  
  useEffect(() => {
    const fetchTradeTrees = async () => {
      try {
        setLoading(true);
        
        // Use the utility function to build trade trees
        const trees = await buildTradeTrees();
        
        setTradeTrees(trees);
        if (trees.length > 0) {
          setSelectedTree(trees[0]);
        }
      } catch (err) {
        console.error('Error building trade trees:', err);
        setError('Failed to load trade trees. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTradeTrees();
  }, []);
  
  // Function to render a trade tree node
  const renderTradeTreeNode = (node: TradeTreeNode, depth: number = 0) => {
    const dateFormatted = new Date(node.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    return (
      <div key={node.tradeId} className="mb-4">
        <div 
          className={`p-4 rounded-lg border-2 ${
            depth === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
        >
          <Link href={`/trades/${node.tradeId}`} className="block hover:underline">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-medium">
                  {node.teams.join(' and ')}
                </h4>
                <p className="text-sm text-gray-500">{dateFormatted}</p>
              </div>
              <span className="text-blue-600">View →</span>
            </div>
          </Link>
        </div>
        
        {node.children.length > 0 && (
          <div className="relative">
            <div 
              className="absolute border-l-2 border-gray-300" 
              style={{ left: `${depth * 24 + 12}px`, top: '0px', bottom: '0px', width: '2px' }}
            ></div>
            <div className="pt-4">
              {node.children.map(child => renderTradeTreeNode(child, depth + 1))}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Trade Trees</h1>
        <LoadingState message="Loading trade trees..." />
      </div>
    );
  }

  if (tradeTrees.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Trade Trees</h1>
        <EmptyState
          title="No Trade Trees Found"
          message="There are currently no trade trees in the system."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Trade Trees</h1>
        <ErrorState
          message={error}
          retry={() => {
            setLoading(true);
            setError(null);
          }}
        />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link 
          href="/trades" 
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          ← Back to Trades
        </Link>
      </div>
      
      <h1 className="text-3xl font-bold text-center mb-8">Trade Trees</h1>
      
      {tradeTrees.length > 0 ? (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Tree Selector */}
          {tradeTrees.length > 1 && (
            <div className="bg-gray-100 px-6 py-4 border-b">
              <div className="flex flex-wrap gap-2">
                {tradeTrees.map((tree, index) => (
                  <button
                    key={tree.tradeId}
                    onClick={() => setSelectedTree(tree)}
                    className={`px-3 py-1 text-sm rounded-md ${
                      selectedTree?.tradeId === tree.tradeId
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Tree {index + 1}: {tree.teams.join(' / ')}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Tree Visualization */}
          <div className="p-6">
            {selectedTree ? (
              <div>
                <h2 className="text-xl font-bold mb-6">
                  Trade Tree: {selectedTree.teams.join(' and ')}
                </h2>
                
                <div className="mb-8">
                  <p className="text-gray-600">
                    This trade tree shows how assets have moved between teams through a series of related trades.
                    Click on any trade to view its details.
                  </p>
                </div>
                
                <div className="space-y-6">
                  {renderTradeTreeNode(selectedTree)}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No trade trees available.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-gray-500">No trade trees found.</p>
        </div>
      )}
    </div>
  );
}
