import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './InfoBar.module.css';
import { draft2024 } from '../../../data/2024DraftResults';
import { draftPlayers } from '../../../draftPlayers';
import teamInfo2024 from '../../../data/teamInfo2024.json';
import { teams } from '../../../teams';

const infoBarViews = ['teamInfo', 'bestAvailable', 'draft2024'];

const BestAvailableView = () => {
  const [localPlayers, setLocalPlayers] = useState(draftPlayers);
  const [lastDraftTime, setLastDraftTime] = useState(0);

  React.useEffect(() => {
    const channel = new BroadcastChannel('draft-overlay');
    let isMounted = true;

    const handleMessage = (event) => {
      const { type, payload } = event.data;

      if (!isMounted) return;

      if (type === 'PLAYER_DRAFTED') {
        const { selectedPlayer } = payload;
        if (selectedPlayer) {
          const now = Date.now();
          setLastDraftTime(now);
          setLocalPlayers(prev => prev.map(p =>
            p.name === selectedPlayer.name ? { ...p, drafted: true } : p
          ));
        }
      } else if (type === 'UNDO_PICK') {
        const { player } = payload;
        if (player) {
          setLocalPlayers(prev => prev.map(p =>
            p.name === player.name ? { ...p, drafted: false } : p
          ));
        }
      } else if (type === 'STATE_UPDATE' && payload?.players) {
        // Only accept STATE_UPDATE if it's newer than our last draft
        const updateTime = payload.timestamp || 0;
        if (updateTime > lastDraftTime) {
          setLocalPlayers(payload.players);
        }
      } else if (type === 'DRAFT_RESET') {
        setLastDraftTime(0);
        setLocalPlayers(draftPlayers);
      } else if (type === 'PLAYERPOOL_RESET' && payload?.players) {
        setLastDraftTime(0);
        setLocalPlayers(payload.players);
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      isMounted = false;
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [lastDraftTime]); // Include lastDraftTime since we use it in handleMessage

  // Filter out drafted players and sort by overall rank
  const visiblePlayers = useMemo(() => {
    return localPlayers
      .filter(p => !p.drafted)
      .sort((a, b) => (a.overallRank || 999) - (b.overallRank || 999))
      .slice(0, 10); // Show top 10
  }, [localPlayers]);

  return (
    <div className={styles.bestAvailable}>
      <div className={styles.viewTitle}>Best Available</div>
      <div className={styles.playerList}>
        {visiblePlayers.map((player, index) => (
          <div key={player.overallRank} className={styles.playerCard}>
            <div className={styles.rank}>{index + 1}.</div>
            <div className={styles.playerInfo}>
              <div className={styles.playerName}>{player.name}</div>
              <div className={styles.playerDetails}>
                {player.position} - {player.college} - {player.nflTeam || '-'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Draft2024View = ({ initialTeamId }) => {
  const [currentTeamId, setCurrentTeamId] = useState(initialTeamId);
  const [teamPicks, setTeamPicks] = useState([]);
  const channelRef = useRef(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('draft-overlay');

    const handleMessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === 'STATE_UPDATE' && payload?.currentTeamId) {
        setCurrentTeamId(payload.currentTeamId);
      } else if (type === 'DRAFT_RESET') {
        setCurrentTeamId(1);
      }
    };

    channelRef.current.addEventListener('message', handleMessage);
    channelRef.current.postMessage({ type: 'REQUEST_STATE' });

    return () => {
      channelRef.current?.removeEventListener('message', handleMessage);
      channelRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!currentTeamId) return;
    const picks = draft2024
      .filter(p => p.teamId === currentTeamId)
      .sort((a, b) => a.round !== b.round ? a.round - b.round : a.pick - b.pick);
    setTeamPicks(picks);
  }, [currentTeamId]);

  return (
    <div className={styles.draft2024}>
      <div className={styles.viewTitle}>2024 Draft Picks</div>
      <AnimatePresence mode="wait">
        <div key="picks" className={styles.playerList}>
          {teamPicks.length === 0 ? (
            <div>No picks yet</div>
          ) : (
            teamPicks.slice(0, 6).map((pick, i) => (
              <div key={`${pick.round}-${pick.pick}`} className={styles.playerCard}>
                <div className={styles.rank}>{i + 1}.</div>
                <div className={styles.playerInfo}>
                  <div className={styles.playerName}>{pick.player}</div>
                  <div className={styles.playerDetails}>
                    {pick.position} - {pick.nflTeam || '-'} - Round {pick.round}, Pick {pick.pick}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </AnimatePresence>
    </div>
  );
};

const getOrdinalSuffix = (n) => {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
};

const TeamInfoView = ({ currentTeamId: initialTeamId }) => {
  const [currentTeamId, setCurrentTeamId] = useState(initialTeamId);
  const channelRef = useRef(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('draft-overlay');
    const handleMessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === 'STATE_UPDATE' && payload?.currentTeamId) {
        setCurrentTeamId(payload.currentTeamId);
      } else if (type === 'DRAFT_RESET') {
        setCurrentTeamId(1);
      }
    };
    channelRef.current.addEventListener('message', handleMessage);
    channelRef.current.postMessage({ type: 'REQUEST_STATE' });

    return () => {
      channelRef.current?.removeEventListener('message', handleMessage);
      channelRef.current?.close();
    };
  }, []);

  const currentTeam = teams.find(team => team.id === currentTeamId);
  if (!currentTeam) return null;
  const info = teamInfo2024.find(i => i.teamName.trim() === currentTeam.name.trim());
  if (!info) return null;

  return (
    <div className={styles.teamInfo}>
      <div className={styles.viewTitle}>Team Info</div>
      <div className={styles.infoGrid}>
        <div className={styles.infoRow}>
          <div className={styles.infoHeader}>Record</div>
          <div className={styles.infoHeader}>Points For</div>
          <div className={styles.infoHeader}>Points Against</div>
          <div className={styles.infoHeader}>Playoff Result</div>
        </div>
        <div className={styles.infoRow}>
          <div className={styles.infoValue}>{info.record}</div>
          <div className={styles.infoValue}>
            {info.fptsFor}
            <span className={styles.rank}>{info.rankFptsFor}{getOrdinalSuffix(info.rankFptsFor)}</span>
          </div>
          <div className={styles.infoValue}>
            {info.fptsAgainst}
            <span className={styles.rank}>{info.rankFptsAgainst}{getOrdinalSuffix(info.rankFptsAgainst)}</span>
          </div>
          <div className={styles.infoValue}>{info.playoffResult}</div>
        </div>
      </div>
    </div>
  );
};

const InfoBar = ({ teamColors = ['#0076B6', '#B0B7BC'], currentTeamId }) => {
  const [currentView, setCurrentView] = useState(infoBarViews[0]);
  const cycleTimerRef = useRef(null);

  const startCycleLoop = useCallback(() => {
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = setTimeout(() => {
      setCurrentView(prev => {
        const index = infoBarViews.indexOf(prev);
        return infoBarViews[(index + 1) % infoBarViews.length];
      });
      startCycleLoop();
    }, 10000);
  }, []);

  useEffect(() => {
    startCycleLoop();
    return () => clearTimeout(cycleTimerRef.current);
  }, [startCycleLoop]);



  // Keep all views mounted but hidden when not active
  const bestAvailableRef = useRef(null);
  const draft2024Ref = useRef(null);
  const teamInfoRef = useRef(null);

  // Initialize refs on first render
  useEffect(() => {
    if (!bestAvailableRef.current) bestAvailableRef.current = <BestAvailableView />;
    if (!draft2024Ref.current) draft2024Ref.current = <Draft2024View initialTeamId={currentTeamId} />;
    if (!teamInfoRef.current) teamInfoRef.current = <TeamInfoView currentTeamId={currentTeamId} />;
  }, [currentTeamId]);

  return (
    <div
      className={styles.infoBar}
      style={{
        '--team-primary-color': teamColors[0],
        '--team-secondary-color': teamColors[1],
        backgroundColor: teamColors[0]
      }}
    >
      {/* Keep all views mounted but hidden */}
      <div style={{ display: currentView === 'bestAvailable' ? 'block' : 'none' }}>
        {bestAvailableRef.current}
      </div>
      <div style={{ display: currentView === 'draft2024' ? 'block' : 'none' }}>
        {draft2024Ref.current}
      </div>
      <div style={{ display: currentView === 'teamInfo' ? 'block' : 'none' }}>
        {teamInfoRef.current}
      </div>

      {/* Animate current view */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentView}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ display: 'none' }} // This is just a placeholder for animation
        />
      </AnimatePresence>
    </div>
  );
};

class InfoBarErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('InfoBar Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorContainer}>
          <div className={styles.errorMessage}>
            Something went wrong displaying the InfoBar. Please refresh the page.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export { InfoBar, InfoBarErrorBoundary };