import React, { useState, useEffect, useRef } from 'react';
import { getDatabase, ref, onValue, set, onDisconnect, get } from 'firebase/database';
import ChessBoard from './ChessBoard';
import CommsPanel from './CommsPanel';
import './Chess.css';

export default function ChessGame({ roomCode, role, aiDifficulty }) {
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [players, setPlayers] = useState({ host: 'White', guest: 'Black' });
  const db = getDatabase();

  useEffect(() => {
    if (!roomCode) return;

    // Fetch player names
    if (role !== 'local') {
      const roomRef = ref(db, `rooms/${roomCode}`);
      get(roomRef).then(async (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const hostId = data.hostId;
          const guestId = data.guestId;
          
          let hostName = 'White';
          let guestName = 'Black';

          if (hostId) {
            const hostSnap = await get(ref(db, `users/${hostId}/displayName`));
            if (hostSnap.exists()) hostName = hostSnap.val();
          }
          if (guestId) {
            const guestSnap = await get(ref(db, `users/${guestId}/displayName`));
            if (guestSnap.exists()) guestName = guestSnap.val();
          }

          setPlayers({ host: hostName, guest: guestName });
        }
      });

      const roomStateRef = ref(db, `rooms/${roomCode}/chessState`);
      
      // Set up disconnect handler to secure the room
      const disconnectRef = onDisconnect(roomStateRef);
      if (role === 'host') {
        disconnectRef.update({ hostDisconnected: true });
      } else if (role === 'guest') {
        disconnectRef.update({ guestDisconnected: true });
      }

      const unsubscribe = onValue(roomStateRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setGameState(data);
        } else if (role === 'host') {
          // Initialize game state for host
          const initialState = {
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'w',
            lastMove: null,
            status: 'active'
          };
          set(roomStateRef, initialState);
        }
      }, (err) => {
        console.error("Firebase error:", err);
        setError("Failed to sync game state.");
      });

      return () => {
        unsubscribe();
        disconnectRef.cancel();
      };
    } else {
      setPlayers({ host: 'You', guest: aiDifficulty ? `AI (${aiDifficulty})` : 'Guest' });
      setGameState({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        lastMove: null,
        status: 'active'
      });
    }
  }, [roomCode, role, db, aiDifficulty]);

  const handleMove = (newFen, moveInfo) => {
    const newState = {
      fen: newFen,
      turn: newFen.split(' ')[1],
      lastMove: moveInfo,
      status: 'active'
    };
    
    if (role === 'local') {
      setGameState(newState);
    } else {
      const roomRef = ref(db, `rooms/${roomCode}/chessState`);
      set(roomRef, newState);
    }
  };

  const handleGameOver = (status) => {
    if (role === 'local') {
      setGameState(prev => prev ? { ...prev, status } : null);
    } else {
      const roomRef = ref(db, `rooms/${roomCode}/chessState/status`);
      set(roomRef, status);
    }
  };

  return (
    <div className="chess-game-container">
      <div className="chess-header">
        <h2 className="chess-title">Royal Chess</h2>
        <div className="chess-header-controls">
          <div className="chess-room-info">
            Room: {roomCode} | Playing as: <span className={`role-badge ${role}`}>
              {role === 'local' ? (aiDifficulty ? `White vs AI (${aiDifficulty})` : 'Local (Both)') : (role === 'host' ? 'White (Gold)' : 'Black (Silver)')}
            </span>
          </div>
          <button className="chess-leave-btn" onClick={() => window.location.reload()}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Leave Game
          </button>
        </div>
      </div>
      
      {error && <div className="chess-error">{error}</div>}
      
      <div className="chess-main">
        <div className="chess-board-wrapper">
          {gameState ? (
            <ChessBoard 
              fen={gameState.fen} 
              role={role} 
              aiDifficulty={aiDifficulty}
              onMove={handleMove} 
              onGameOver={handleGameOver}
              status={gameState.status}
              lastMove={gameState.lastMove}
              players={players}
            />
          ) : (
            <div className="chess-loading">Setting up the royal board...</div>
          )}
        </div>
        
        <div className="chess-sidebar">
          {role !== 'local' && <CommsPanel roomCode={roomCode} role={role} db={db} />}
        </div>
      </div>
    </div>
  );
}
