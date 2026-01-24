import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { teams } from '../teams';
import { defaultDraftOrder, TOTAL_ROUNDS, TEAMS_PER_ROUND } from '../draftOrder';
import { draftPlayers } from '../draftPlayers';
import { getTeamLogoPath } from '../utils/logoUtils';
import { 
  loadState, 
  saveState, 
  saveDefaultDraftOrder, 
  loadDefaultDraftOrder,
  loadDefaultTimerDuration,
  saveDefaultTimerDuration
} from '../utils/storage';

export default function AdminPanel() {
  // Initialize state from localStorage or defaults
  const savedState = loadState();
  const savedDefaultDuration = loadDefaultTimerDuration() || 120;
  

  // Core draft state
  const [currentPickIndex, setCurrentPickIndex] = useState(savedState?.currentPickIndex ?? 0);
  const [draftHistory, setDraftHistory] = useState(savedState?.draftHistory ?? []);
  const [searchQuery, setSearchQuery] = useState(savedState?.searchQuery ?? '');
  const [positionFilter, setPositionFilter] = useState(savedState?.positionFilter ?? 'All');
  const [draftOrder, setDraftOrder] = useState(savedState?.draftOrder ?? defaultDraftOrder);
  const [editableDraftOrder, setEditableDraftOrder] = useState([...(savedState?.draftOrder ?? defaultDraftOrder)]);
  
  // Fixed order for position filters
  const positions = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

  // Player selection state
  const [selectedPlayer, setSelectedPlayer] = useState(savedState?.selectedPlayer ?? null);
  const [players, setPlayers] = useState(draftPlayers); // Always use fresh draftPlayers to get latest image fields

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(savedState?.timerSeconds ?? savedDefaultDuration);
  const [isTimerRunning, setIsTimerRunning] = useState(savedState?.isTimerRunning ?? false);
  const [defaultDuration, setDefaultDuration] = useState(savedDefaultDuration);

  // UI state
  const [showEditor, setShowEditor] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showBestAvailable, setShowBestAvailable] = useState(true);
  const [isAutodraftEnabled, setIsAutodraftEnabled] = useState(false);

  // Get the best available player by overall rank
  const getBestAvailablePlayer = useCallback(() => {
    return players
      .filter(p => !p.drafted)
      .reduce((best, current) => {
        if (!best || current.overallRank < best.overallRank) {
          return current;
        }
        return best;
      }, null);
  }, [players]);

  // Refs
  const channelRef = useRef(null);

  // Derive currentTeamId from draftOrder and currentPickIndex
  const currentTeamId = draftOrder[currentPickIndex] || 1;

  // Save state to localStorage whenever it changes
  useEffect(() => {
    saveState({
      currentPickIndex,
      timerSeconds,
      selectedPlayer,
      draftOrder,
      isTimerRunning,
      draftHistory,
      players,
      defaultDuration,
      searchQuery,     // Add search persistence
      positionFilter   // Add filter persistence
    });
  }, [currentPickIndex, timerSeconds, selectedPlayer, draftOrder, isTimerRunning, draftHistory, players, defaultDuration, searchQuery, positionFilter]);

  // Initialize channel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('draft-overlay');
    return () => channelRef.current.close();
  }, []);

  // Error message timeout effect
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 2000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Broadcast state function with guaranteed fresh state
  const broadcastState = useCallback(() => {
    const timer = setTimeout(() => {
      if (channelRef.current) {
        // Get draftingTeam outside of postMessage for clarity
        const draftingTeam = selectedPlayer ? teams.find(t => t.id === currentTeamId) : undefined;
        channelRef.current.postMessage({
          type: 'STATE_UPDATE',
          payload: {
            currentTeamId,
            currentPickIndex,
            timerSeconds,
            isTimerRunning,
            draftOrder,
            selectedPlayer,
            players,
            timestamp: Date.now(),
            ...(draftingTeam && { draftingTeam })
          }
        });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [currentTeamId, currentPickIndex, timerSeconds, isTimerRunning, draftOrder, selectedPlayer, players]);

  // Broadcast state whenever it changes
  useEffect(() => {
    const cleanup = broadcastState();
    return cleanup;
  }, [broadcastState]);

  const handleNextPick = useCallback(() => {
    if (currentPickIndex < draftOrder.length - 1) {
      setCurrentPickIndex(prev => prev + 1);
      setTimerSeconds(defaultDuration);
      setIsTimerRunning(true);
      broadcastState();
    }
  }, [currentPickIndex, draftOrder.length, defaultDuration, broadcastState]);

  const handlePreviousPick = useCallback(() => {
    if (currentPickIndex > 0) {
      setCurrentPickIndex(prev => prev - 1);
      setTimerSeconds(defaultDuration);
      setIsTimerRunning(false);
      broadcastState();
    }
  }, [currentPickIndex, defaultDuration, broadcastState]);

  const handleUndoPick = useCallback(() => {
    if (currentPickIndex > 0) {
      const lastDraftedPlayer = draftHistory[draftHistory.length - 1];
      if (lastDraftedPlayer) {
        // Mark player as not drafted in players array
        setPlayers(prev => prev.map(p => 
          p.name === lastDraftedPlayer.name ? { ...p, drafted: false } : p
        ));
        
        // Get the previous pick before updating history
        const newHistory = draftHistory.slice(0, -1);
        const previousPick = newHistory[newHistory.length - 1] || null;
        const newPickIndex = currentPickIndex - 1;
        
        // Update all state
        setDraftHistory(newHistory);
        setSelectedPlayer(previousPick);
        setCurrentPickIndex(newPickIndex);
        setTimerSeconds(defaultDuration);
        setIsTimerRunning(false);

        // Broadcast undo pick and state update
        if (channelRef.current) {
          // Send undo pick message
          channelRef.current.postMessage({
            type: 'UNDO_PICK',
            payload: { 
              player: lastDraftedPlayer,
              pickIndex: newPickIndex
            }
          });

          // Broadcast full state update
          broadcastState();
        }
      }
    }
  }, [currentPickIndex, draftHistory, defaultDuration, broadcastState]);

  // Handle autodraft when timer expires
  const handleAutodraft = useCallback(() => {
    const bestPlayer = getBestAvailablePlayer();
    if (bestPlayer) {
      // Create selected player with current pick index and timestamp
      const playerWithPick = {
        ...bestPlayer,
        pickIndex: currentPickIndex,
        timestamp: Date.now(),
        drafted: true
      };
      
      // Batch update player states
      startTransition(() => {
        const updatedPlayers = players.map(p =>
          p.name === bestPlayer.name ? { ...p, drafted: true } : p
        );
        setPlayers(updatedPlayers);
        setSelectedPlayer(playerWithPick);
        setDraftHistory(prev => [...prev, playerWithPick]);
      });

      // Broadcast the player selection
      if (channelRef.current) {
        channelRef.current.postMessage({
          type: 'PLAYER_DRAFTED',
          payload: {
            selectedPlayer: playerWithPick,
            pickIndex: currentPickIndex
          }
        });
      }

      // Advance to next pick
      handleNextPick();
    } else {
      // If no best player available, just advance to next pick
      handleNextPick();
    }
  }, [getBestAvailablePlayer, players, currentPickIndex, handleNextPick, channelRef]);

  // Timer effect with auto-advance and autodraft
  useEffect(() => {
    let interval;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerRunning(false);
      if (currentPickIndex < draftOrder.length - 1) {
        if (isAutodraftEnabled) {
          handleAutodraft();
        } else {
          handleNextPick();
        }
      }
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds, currentPickIndex, draftOrder.length, handleNextPick, isAutodraftEnabled, handleAutodraft]);

  const handleTimerToggle = useCallback(() => {
    startTransition(() => {
      setIsTimerRunning(prev => !prev);
    });
    broadcastState();
  }, [broadcastState]);

  const handleTimerReset = () => {
    setTimerSeconds(defaultDuration);
    setIsTimerRunning(false);
    broadcastState();
  };

  const handleDraftOrderChange = useCallback((index, teamId) => {
    startTransition(() => {
      const newOrder = [...editableDraftOrder];
      newOrder[index] = parseInt(teamId);
      setEditableDraftOrder(newOrder);
      // Validate immediately
      const isValid = newOrder.every(id => teams.some(t => t.id === id));
      if (isValid) {
        setDraftOrder(newOrder);
        broadcastState();
      }
    });
  }, [editableDraftOrder, teams, broadcastState]);

  const validateAndApplyOrder = () => {
    setDraftOrder(editableDraftOrder);
    setShowEditor(false);
    setErrorMessage('');
    broadcastState();
  };

  const resetToDefault = async () => {
    const defaultOrder = await loadDefaultDraftOrder() || defaultDraftOrder;
    setEditableDraftOrder([...defaultOrder]);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-gray-100 py-4 flex flex-col sm:py-8">
      <div className="relative py-2 px-4 mx-auto w-full max-w-7xl">
        <div className="relative px-4 py-6 bg-white shadow-lg sm:rounded-3xl sm:p-10">
          <div className="mx-auto">
            <h1 className="text-2xl font-bold text-gray-900">Draft Control Panel</h1>
          </div>
          <p className="text-gray-600">Manage teams and control the draft timer</p>

          {/* Draft Progress */}
          <section className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <h2 className="text-xl font-semibold text-gray-800">Draft Progress</h2>
                <button
                  onClick={() => {
                    const newShowBestAvailable = !showBestAvailable;
                    setShowBestAvailable(newShowBestAvailable);
                    if (channelRef.current) {
                      channelRef.current.postMessage({
                        type: 'TOGGLE_VIEW',
                        payload: { showBestAvailable: newShowBestAvailable }
                      });
                    }
                  }}
                  className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                >
                  {showBestAvailable ? 'Show Draft Picks' : 'Show Best Available'}
                </button>
                <button
                  onClick={() => setIsAutodraftEnabled(!isAutodraftEnabled)}
                  className={`ml-4 px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${isAutodraftEnabled ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500'}`}
                >
                  Autodraft: {isAutodraftEnabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className="text-lg font-medium text-gray-600">
                Pick {currentPickIndex + 1} of {draftOrder.length}
                <span className="mx-2">|</span>
                Round {Math.floor(currentPickIndex / TEAMS_PER_ROUND) + 1} of {TOTAL_ROUNDS}
              </div>
            </div>

            <div className="flex space-x-4 mb-4">
              <button
                onClick={handlePreviousPick}
                disabled={currentPickIndex === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous Pick
              </button>
              <button
                onClick={handleNextPick}
                disabled={currentPickIndex === draftOrder.length - 1}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Pick
              </button>
              <button
                onClick={handleUndoPick}
                disabled={draftHistory.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Undo Last Pick
              </button>
              <button
                onClick={() => {
                  // Reset all draft state
                  setDraftHistory([]);
                  setCurrentPickIndex(0);
                  setTimerSeconds(defaultDuration);
                  setIsTimerRunning(false);
                  
                  // Reset all players to undrafted
                  const resetPlayers = players.map(p => ({ ...p, drafted: false }));
                  setPlayers(resetPlayers);
                  setSelectedPlayer(null);
                  
                  // Broadcast reset
                  if (channelRef.current) {
                    channelRef.current.postMessage({
                      type: 'DRAFT_RESET'
                    });
                    broadcastState();
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Reset Draft
              </button>
            </div>
          </section>

          {/* Current Team Section */}
          <section className="p-4 bg-gray-50 rounded-lg mb-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-3">Current Team</h3>
            <div className="flex items-center space-x-4">
              <img 
                src={getTeamLogoPath(teams.find(t => t.id === currentTeamId))} 
                alt="Team logo" 
                className="w-16 h-16 object-contain"
                onLoad={() => console.log(`[IMG LOAD SUCCESS] AdminPanel current team (${teams.find(t => t.id === currentTeamId)?.name}):`, getTeamLogoPath(teams.find(t => t.id === currentTeamId)))}
                onError={(e) => console.log(`[IMG LOAD ERROR] AdminPanel current team (${teams.find(t => t.id === currentTeamId)?.name}):`, getTeamLogoPath(teams.find(t => t.id === currentTeamId)), 'Error:', e)}
              />
              <div>
                <div className="text-xl font-bold text-gray-800">
                  {teams.find(t => t.id === currentTeamId)?.name}
                </div>
                <div className="text-gray-600">
                  {teams.find(t => t.id === currentTeamId)?.owner}
                </div>
              </div>
            </div>
          </section>

          {/* Timer Controls */}
          <section className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Timer Controls</h2>
            
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="flex-1 w-full sm:w-auto space-y-4">
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-gray-600">Timer Duration:</label>
                  <select
                    value={defaultDuration}
                    onChange={(e) => {
                      const newDuration = parseInt(e.target.value, 10);
                      setDefaultDuration(newDuration);
                      saveDefaultTimerDuration(newDuration);
                      if (!isTimerRunning) {
                        setTimerSeconds(newDuration);
                      }
                    }}
                    className="p-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="60">1 minute</option>
                    <option value="120">2 minutes</option>
                    <option value="180">3 minutes</option>
                    <option value="300">5 minutes</option>
                    <option value="600">10 minutes</option>
                  </select>
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={handleTimerToggle}
                    className={`flex-1 px-6 py-3 rounded-lg font-medium ${
                      isTimerRunning 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-green-500 hover:bg-green-600'
                    } text-white shadow-lg transition-colors`}
                  >
                    {isTimerRunning ? 'Stop Timer' : 'Start Timer'}
                  </button>
                  <button
                    onClick={handleTimerReset}
                    className="flex-1 px-6 py-3 rounded-lg font-medium bg-gray-500 hover:bg-gray-600 text-white shadow-lg transition-colors"
                  >
                    Reset Timer
                  </button>
                </div>
              </div>
              
              <div className="text-4xl font-mono font-bold text-gray-800 bg-gray-50 px-6 py-3 rounded-lg shadow-inner min-w-[150px] text-center">
                {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </section>

          {/* Draft Order Editor */}
          <section className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-800">Draft Order</h2>
              <button
                onClick={() => setShowEditor(!showEditor)}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                {showEditor ? 'Hide Draft Order Editor' : 'Edit Draft Order'}
              </button>
            </div>

            {showEditor && (
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-semibold text-gray-800">Draft Order Editor</h2>
                  <div className="space-x-4">
                    <button
                      onClick={() => {
                        saveDefaultDraftOrder(editableDraftOrder);
                        setErrorMessage('Current order saved as default!');
                        setTimeout(() => setErrorMessage(''), 2000);
                      }}
                      className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Set Current as Default
                    </button>
                    <button
                      onClick={resetToDefault}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Reset to Default
                    </button>
                    <button
                      onClick={validateAndApplyOrder}
                      className="px-4 py-2 text-sm font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                    >
                      Apply Order
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <div className={`mb-4 p-3 rounded ${
                    errorMessage.includes('saved as default') 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {errorMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                  {Array.from({ length: TOTAL_ROUNDS }).map((_, roundIndex) => (
                    <div key={roundIndex} className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">
                        Round {roundIndex + 1}
                      </h3>
                      <div className="space-y-3">
                        {Array.from({ length: TEAMS_PER_ROUND }).map((_, pickIndex) => {
                          const globalIndex = (roundIndex * TEAMS_PER_ROUND) + pickIndex;
                          const teamId = editableDraftOrder[globalIndex];
                          
                          return (
                            <div key={globalIndex} className="flex flex-col space-y-1">
                              <label className="text-sm font-medium text-gray-600">
                                Round {roundIndex + 1} – Pick {pickIndex + 1}
                              </label>
                              <select
                                value={teamId}
                                onChange={(e) => handleDraftOrderChange(globalIndex, e.target.value)}
                                className="p-2 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                {teams.map(team => (
                                  <option key={team.id} value={team.id}>
                                    {team.name} ({team.owner})
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Available Players */}
          <section className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Available Players</h2>
              <button
                onClick={() => {
                  setPlayers(draftPlayers);
                  setSelectedPlayer(null);
                  broadcastState();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                Reset Player Pool
              </button>
            </div>
            {/* Search and filter controls */}
            <div className="mb-4 space-y-3">
              <div className="flex gap-4 items-center">
                <input
                  type="text"
                  placeholder="Search players..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* Position filter buttons */}
              <div className="flex gap-2">
                {positions.map(position => (
                  <button
                    key={position}
                    onClick={() => setPositionFilter(position)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      positionFilter === position
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {position}
                  </button>
                ))}
              </div>
            </div>
            {/* Player list */}
            <div>
              <table className="w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Rank</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-48">Name</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Position</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Pos Rank</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-48">College</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-48">NFL Team</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {players
                    .filter(player => 
                      // Filter out drafted players
                      !player.drafted && 
                      // Apply position filter
                      (positionFilter === 'All' || player.position === positionFilter) &&
                      // Apply search filter
                      player.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((player, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 w-16 text-center">{player.overallRank || '-'}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 w-48 text-center">{player.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 w-24 text-center">{player.position}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 w-24 text-center">{player.positionRank || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 w-48 text-center">{player.college}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 w-48 text-center">{player.nflTeam}</td>
                        <td className="px-4 py-3 text-sm font-medium text-center">
                          <button
                            onClick={() => {
                              // Prevent drafting if player is already drafted
                              if (player.drafted) {
                                console.warn('Player already drafted:', player.name);
                                return;
                              }

                              // Create selected player with current pick index, asset ID and timestamp
                              const playerWithPick = {
                                ...player,
                                pickIndex: currentPickIndex, // Store which pick this was
                                pickAssetId: draftOrder[currentPickIndex].assetId, // Store unique asset ID of the pick
                                timestamp: Date.now(), // Add timestamp to identify new picks
                                drafted: true // Ensure drafted flag is set
                              };
                              
                              // Batch update player states
                              startTransition(() => {
                                const updatedPlayers = players.map(p =>
                                  p.name === player.name ? { ...p, drafted: true } : p
                                );
                                setPlayers(updatedPlayers);
                                setSelectedPlayer(playerWithPick);
                                setDraftHistory(prev => [...prev, playerWithPick]);
                              });

                              // First, broadcast the player selection
                              if (channelRef.current) {
                                channelRef.current.postMessage({
                                  type: 'PLAYER_DRAFTED',
                                  payload: {
                                    selectedPlayer: playerWithPick,
                                    pickIndex: currentPickIndex
                                  }
                                });
                              }

                              // Advance to next pick
                              handleNextPick();
                            }}
                            className="text-indigo-600 hover:text-indigo-900 font-semibold"
                          >
                            Draft
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>


          </section>

        </div>
      </div>
    </div>
  );
}