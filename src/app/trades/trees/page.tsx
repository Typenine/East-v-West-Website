'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TradeTreeNode, buildTradeTrees } from '@/lib/utils/trades';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function TradeTreesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tradeTrees, setTradeTrees] = useState<TradeTreeNode[]>([]);
  const [selectedTree, setSelectedTree] = useState<TradeTreeNode | null>(null);
  const router = useRouter();
  
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
      <div key={node.tradeId} className="mb-4" style={{ marginLeft: `${depth * 24}px` }}>
        <Card className={depth === 0 ? 'border-2 border-[var(--border)]' : undefined}>
          <CardContent>
            <Link href={`/trades/${node.tradeId}`} className="block focus-visible:outline-none" aria-label={`View trade between ${node.teams.join(' and ')} on ${dateFormatted}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium">
                    {node.teams.join(' and ')}
                  </h4>
                  <p className="text-sm text-[var(--muted)]">{dateFormatted}</p>
                </div>
                <span className="text-[var(--muted)]">View →</span>
              </div>
            </Link>
          </CardContent>
        </Card>
        {node.children.length > 0 && (
          <div className="relative">
            <div
              className="absolute border-l-2 border-[var(--border)]"
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
        <SectionHeader title="Trade Trees" />
        <LoadingState message="Loading trade trees..." />
      </div>
    );
  }

  if (tradeTrees.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Trade Trees" />
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
        <SectionHeader title="Trade Trees" />
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push('/trades')}
          aria-label="Back to Trades"
        >
          ← Back to Trades
        </Button>
      </div>
      
      <SectionHeader title="Trade Trees" />
      
      {tradeTrees.length > 0 ? (
        <Card>
          {/* Tree Selector */}
          {tradeTrees.length > 1 && (
            <CardHeader>
              <div className="flex flex-wrap gap-2">
                {tradeTrees.map((tree, index) => (
                  <Button
                    key={tree.tradeId}
                    size="sm"
                    variant={selectedTree?.tradeId === tree.tradeId ? 'primary' : 'secondary'}
                    onClick={() => setSelectedTree(tree)}
                    aria-pressed={selectedTree?.tradeId === tree.tradeId}
                    className="whitespace-nowrap"
                    title={`Select tree ${index + 1}`}
                  >
                    Tree {index + 1}: {tree.teams.join(' / ')}
                  </Button>
                ))}
              </div>
            </CardHeader>
          )}
          
          {/* Tree Visualization */}
          <CardContent>
            {selectedTree ? (
              <div>
                <h2 className="text-xl font-bold mb-6">
                  Trade Tree: {selectedTree.teams.join(' and ')}
                </h2>
                
                <div className="mb-8">
                  <p className="text-[var(--muted)]">
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
                <p className="text-[var(--muted)]">No trade trees available.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="text-center">
          <CardContent>
            <p className="text-[var(--muted)]">No trade trees found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

