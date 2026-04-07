import React, { useState, useEffect } from 'react';
import { getDatabase, ref, onValue, set, onDisconnect, get } from 'firebase/database';
import LudoBoard from './LudoBoard';
import CommsPanel from '../chess/CommsPanel';
import { playDiceRollSound, playWinSound } from '../../utils/sounds';
import './Ludo.css';

export default function LudoGame({ roomCode, role, aiDifficulty }) {
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [players, setPlayers] = useState({ host: 'Red', guest: 'Blue' });
  const db = getDatabase();

  useEffect(() => {
    if (!roomCode) return;

    if (role !== 'local') {
      const roomRef = ref(db, `rooms/${roomCode}`);
      get(roomRef).then(async (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const hostId = data.hostId;
          const guestId = data.guestId;
          
          let hostName = 'Red';
          let guestName = 'Blue';

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

      const roomStateRef = ref(db, `rooms/${roomCode}/ludoState`);
      
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
          const initialState = {
            tokens: {
              red: [-1, -1, -1, -1],
              blue: [-1, -1, -1, -1]
            },
            turn: 'red',
            diceValue: null,
            diceRolled: false,
            status: 'active',
            winner: null
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
        tokens: {
          red: [-1, -1, -1, -1],
          blue: [-1, -1, -1, -1]
        },
        turn: 'red',
        diceValue: null,
        diceRolled: false,
        status: 'active',
        winner: null
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, role, aiDifficulty]);

  const updateGameState = (newState) => {
    if (role === 'local') {
      setGameState(newState);
    } else {
      const roomRef = ref(db, `rooms/${roomCode}/ludoState`);
      set(roomRef, newState);
    }
  };

  const rollDice = () => {
    if (gameState.diceRolled || gameState.status !== 'active') return;
    
    playDiceRollSound();
    const val = Math.floor(Math.random() * 6) + 1;
    
    // Check if any moves are possible
    const color = gameState.turn;
    const tokens = gameState.tokens[color];
    let possibleMoves = false;
    
    for (let i = 0; i < 4; i++) {
      if (tokens[i] === -1 && val === 6) possibleMoves = true;
      if (tokens[i] !== -1 && ((color === 'red' && tokens[i] + val <= 105) || (color === 'blue' && tokens[i] + val <= 205))) possibleMoves = true;
    }

    if (!possibleMoves) {
      // Show dice for a moment then skip turn
      updateGameState({
        ...gameState,
        diceValue: val,
        diceRolled: true
      });
      
      setTimeout(() => {
        updateGameState({
          ...gameState,
          turn: color === 'red' ? 'blue' : 'red',
          diceRolled: false,
          diceValue: null
        });
      }, 1000);
    } else {
      updateGameState({
        ...gameState,
        diceValue: val,
        diceRolled: true
      });
    }
  };

  const moveToken = (color, index) => {
    if (gameState.status !== 'active' || !gameState.diceRolled || gameState.turn !== color) return;
    
    const val = gameState.diceValue;
    let currentPos = gameState.tokens[color][index];
    let newPos = currentPos;

    if (currentPos === -1) {
      if (val === 6) {
        newPos = color === 'red' ? 0 : 26;
      } else {
        return; // Cannot move out of base without a 6
      }
    } else {
      newPos = currentPos + val;
      // Simplified path logic: 0-51 is main track.
      // Red home stretch: > 50 -> 100+
      // Blue home stretch: > 24 (after wrapping) -> 200+
      
      if (color === 'red') {
        if (currentPos <= 50 && newPos > 50) {
          newPos = 100 + (newPos - 51); // 100, 101, 102, 103, 104, 105 (Home)
        }
      } else if (color === 'blue') {
        if (currentPos <= 24 && currentPos >= 19 && newPos > 24) {
          newPos = 200 + (newPos - 25); // 200, 201, 202, 203, 204, 205 (Home)
        } else if (currentPos <= 51 && newPos > 51) {
          newPos = newPos - 52; // Wrap around only if it was on the main track
        }
      }
    }

    // Check bounds (must reach exactly home)
    if ((color === 'red' && newPos > 105) || (color === 'blue' && newPos > 205)) {
      return; // Cannot move
    }

    const newTokens = {
      red: [...gameState.tokens.red],
      blue: [...gameState.tokens.blue]
    };

    newTokens[color][index] = newPos;

    // Capture logic
    let captured = false;
    const safeZones = [0, 8, 13, 21, 26, 34, 39, 47];
    const oppColor = color === 'red' ? 'blue' : 'red';
    
    if (!safeZones.includes(newPos) && newPos < 100) {
      for (let i = 0; i < 4; i++) {
        if (newTokens[oppColor][i] === newPos) {
          newTokens[oppColor][i] = -1; // Send back to base
          captured = true;
        }
      }
    }

    // Check win
    const hasWon = newTokens[color].every(p => (color === 'red' ? p === 105 : p === 205));
    
    if (hasWon) {
      playWinSound();
    }
    
    let nextTurn = color;
    if (val !== 6 && !captured) {
      nextTurn = color === 'red' ? 'blue' : 'red';
    }

    updateGameState({
      ...gameState,
      tokens: newTokens,
      turn: nextTurn,
      diceRolled: false,
      diceValue: null,
      status: hasWon ? 'gameover' : 'active',
      winner: hasWon ? color : null
    });
  };

  const resetGame = () => {
    updateGameState({
      tokens: { red: [-1, -1, -1, -1], blue: [-1, -1, -1, -1] },
      turn: 'red',
      diceValue: null,
      diceRolled: false,
      status: 'active',
      winner: null
    });
  };

  return (
    <div className="ludo-game-container">
      <div className="ludo-header">
        <h2 className="ludo-title">Ludo King</h2>
        <div className="ludo-header-controls">
          <div className="ludo-room-info">
            Room: {roomCode} | Playing as: <span className={`role-badge ${role}`}>
              {role === 'local' ? (aiDifficulty ? `Red vs AI (${aiDifficulty})` : 'Local (Both)') : (role === 'host' ? 'Red' : 'Blue')}
            </span>
          </div>
          <button className="ludo-leave-btn" onClick={() => window.location.reload()}>
            Leave Game
          </button>
        </div>
      </div>
      
      {error && <div className="ludo-error">{error}</div>}
      
      <div className="ludo-main">
        <div className="ludo-board-wrapper">
          {gameState ? (
            <LudoBoard 
              gameState={gameState} 
              role={role} 
              aiDifficulty={aiDifficulty}
              onRoll={rollDice}
              onMove={moveToken} 
              players={players}
              onReset={resetGame}
            />
          ) : (
            <div className="ludo-loading">Setting up the board...</div>
          )}
        </div>
        
        <div className="ludo-sidebar">
          {role !== 'local' && <CommsPanel roomCode={roomCode} role={role} db={db} />}
        </div>
      </div>
    </div>
  );
}
