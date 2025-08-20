'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Trade, fetchTradeById, getRelatedTrades } from '@/lib/utils/trades';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import SectionHeader from '@/components/ui/SectionHeader';

export default function TradeDetailPage() {
  const params = useParams();
  const { id } = params;
  
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showValueAnalysis, setShowValueAnalysis] = useState(false);
  const [relatedTrades, setRelatedTrades] = useState<Trade[]>([]);
  
  useEffect(() => {
    const fetchTradeDetails = async () => {
      try {
        setLoading(true);
        const tradeData = await fetchTradeById(id as string);
        
        if (!tradeData) {
          setError('Trade not found');
          setTrade(null);
        } else {
          setTrade(tradeData);
          
          // Get related trades
          if (tradeData.relatedTrades && tradeData.relatedTrades.length > 0) {
            const relatedTradesData = await getRelatedTrades(tradeData.id);
            setRelatedTrades(relatedTradesData);
          }
          
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching trade:', err);
        setError('Failed to load trade details. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    if (id) {
      fetchTradeDetails();
    }
  }, [id]);
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState message="Loading trade details..." fullPage />
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState
          message={error || 'Trade not found'}
          fullPage
          retry={() => {
            setLoading(true);
            setError(null);
          }}
          homeLink
        />
        <div className="mt-8 text-center">
          <Link href="/trades" className="text-accent hover:underline inline-flex items-center" aria-label="Return to trades list">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Trades
          </Link>
        </div>
      </div>
    );
  }
  
  const formattedDate = new Date(trade.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title={`Trade between ${trade.teams.map(t => t.name).join(' and ')}`}
        subtitle={formattedDate}
        actions={
          <Link
            href="/trades"
            className="inline-flex items-center px-4 py-2 rounded-full font-medium evw-surface border border-[var(--border)] text-[var(--text)] hover:opacity-90 focus:outline-none focus:ring-2 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--surface)]"
            aria-label="Return to trades list"
          >
            ← Back to Trades
          </Link>
        }
        aria-labelledby="trade-heading"
      />
      <h1 id="trade-heading" className="sr-only">Trade between {trade.teams.map(t => t.name).join(' and ')}</h1>
      
      <article className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <div className="p-6">
          {/* Trade Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {trade.teams.map((team, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 border-b">
                  <h2 className="font-bold text-lg">{team.name} received:</h2>
                </div>
                <div className="p-4">
                  <ul className="space-y-3">
                    {team.assets.map((asset, assetIndex) => (
                      <li key={assetIndex} className="flex justify-between items-center">
                        <div>
                          {asset.type === 'player' ? (
                            <div>
                              <span className="font-medium">{asset.name}</span>
                              <span className="text-sm text-gray-500 ml-2">
                                ({asset.position}, {asset.team})
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className="font-medium">
                                {asset.name}
                                {typeof asset.pickInRound === 'number' ? (
                                  <>
                                    {' '}#{asset.pickInRound}
                                  </>
                                ) : null}
                                {asset.became ? (
                                  <>
                                    {' '}(
                                    {asset.becamePosition ? `${asset.becamePosition} - ` : ''}
                                    {asset.became})
                                  </>
                                ) : null}
                              </span>
                              {asset.originalOwner && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  originally {asset.originalOwner}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {(asset.type === 'player' && asset.playerId) ? (
                            <Link
                              href={`/trades/tracker?rootType=player&playerId=${asset.playerId}`}
                              className="text-accent hover:underline text-xs"
                              aria-label={`Track lineage for ${asset.name}`}
                            >
                              Track
                            </Link>
                          ) : null}
                          {(asset.type === 'pick' && asset.year && asset.round && (asset.draftSlot ?? asset.pickInRound)) ? (
                            <Link
                              href={`/trades/tracker?rootType=pick&season=${asset.year}&round=${asset.round}&slot=${(asset.draftSlot ?? asset.pickInRound) as number}`}
                              className="text-accent hover:underline text-xs"
                              aria-label={`Track lineage for ${asset.name}`}
                            >
                              Track
                            </Link>
                          ) : null}
                          {showValueAnalysis && (
                            <div className="badge badge-accent text-xs px-2 py-1 rounded">
                              Value: {asset.value}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  
                  {showValueAnalysis && team.totalValue !== undefined && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="font-bold">Total Value:</span>
                        <span className="font-bold text-lg">{team.totalValue}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Trade Analysis */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Trade Analysis</h3>
              <button
                onClick={() => setShowValueAnalysis(!showValueAnalysis)}
                className="btn btn-secondary"
                aria-pressed={showValueAnalysis}
                aria-label={showValueAnalysis ? 'Hide trade value analysis' : 'Show trade value analysis'}
              >
                {showValueAnalysis ? 'Hide Values' : 'Show Values'}
              </button>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              {trade.notes && <p className="text-gray-700">{trade.notes}</p>}
              
              {showValueAnalysis && trade.teams.length >= 2 && 
               trade.teams[0].totalValue !== undefined && 
               trade.teams[1].totalValue !== undefined && (
                <div className="mt-6">
                  <h4 className="font-bold mb-2">Value Breakdown:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {trade.teams.map((team, index) => (
                      <div key={index} className="bg-white p-3 rounded-md shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{team.name}</span>
                          <span className={`font-bold ${
                            index === 0 && trade.teams[0].totalValue! > trade.teams[1].totalValue! ? 'text-green-600' : 
                            index === 1 && trade.teams[1].totalValue! > trade.teams[0].totalValue! ? 'text-green-600' : 
                            'text-gray-800'
                          }`}>
                            {team.totalValue}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 text-center">
                    <span className="font-medium">
                      {trade.teams[0].totalValue! > trade.teams[1].totalValue! ? 
                        `${trade.teams[0].name} wins by ${trade.teams[0].totalValue! - trade.teams[1].totalValue!} value points` :
                        trade.teams[1].totalValue! > trade.teams[0].totalValue! ?
                        `${trade.teams[1].name} wins by ${trade.teams[1].totalValue! - trade.teams[0].totalValue!} value points` :
                        'Even trade'
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Related Trades (Trade Tree) */}
          {relatedTrades.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4">Related Trades</h3>
              
              <div className="space-y-4">
                {relatedTrades.map((relatedTrade) => (
                  <Link
                    key={relatedTrade.id}
                    href={`/trades/${relatedTrade.id}`}
                    className="block bg-white border rounded-lg p-4 hover:bg-gray-50"
                    aria-label={`View related trade between ${relatedTrade.teams.map(t => t.name).join(' and ')} from ${new Date(relatedTrade.date).toLocaleDateString()}`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium">
                          Trade between {relatedTrade.teams.map(t => t.name).join(' and ')}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {new Date(relatedTrade.date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <span className="text-accent" aria-hidden="true">View →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
