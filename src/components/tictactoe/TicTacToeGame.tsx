import React, { useState, useEffect } from 'react';
import { getDatabase, ref, onValue, set, onDisconnect, get } from 'firebase/database';
import TicTacToeBoard from './TicTacToeBoard';
import CommsPanel from '../chess/CommsPanel';
import './TicTacToe.css';

export default function TicTacToeGame({ roomCode, role, aiDifficulty }) {
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [players, setPlayers] = useState({ host: 'Player X', guest: 'Player O' });
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
          
          let hostName = 'Player X';
          let guestName = 'Player O';

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

      const roomStateRef = ref(db, `rooms/${roomCode}/tictactoeState`);
      
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
            board: Array(9).fill(null),
            turn: 'X',
            status: 'active',
            winner: null,
            winningLine: null
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
        board: Array(9).fill(null),
        turn: 'X',
        status: 'active',
        winner: null,
        winningLine: null
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, role, aiDifficulty]);

  const handleMove = (index) => {
    if (!gameState || gameState.status !== 'active' || gameState.board[index]) return;

    const newBoard = [...gameState.board];
    newBoard[index] = gameState.turn;

    const winInfo = checkWinner(newBoard);
    let newStatus = 'active';
    let winner = null;
    let winningLine = null;

    if (winInfo) {
      newStatus = 'gameover';
      winner = winInfo.winner;
      winningLine = winInfo.line;
    } else if (!newBoard.includes(null)) {
      newStatus = 'gameover';
      winner = 'draw';
    }

    const newState = {
      board: newBoard,
      turn: gameState.turn === 'X' ? 'O' : 'X',
      status: newStatus,
      winner,
      winningLine
    };
    
    if (role === 'local') {
      setGameState(newState);
    } else {
      const roomRef = ref(db, `rooms/${roomCode}/tictactoeState`);
      set(roomRef, newState);
    }
  };

  const checkWinner = (squares) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a], line: lines[i] };
      }
    }
    return null;
  };

  const resetGame = () => {
    const initialState = {
      board: Array(9).fill(null),
      turn: 'X',
      status: 'active',
      winner: null,
      winningLine: null
    };
    if (role === 'local') {
      setGameState(initialState);
    } else if (role === 'host') {
      const roomRef = ref(db, `rooms/${roomCode}/tictactoeState`);
      set(roomRef, initialState);
    }
  };

  return (
    <div className="ttt-game-container">
      <div className="ttt-header">
        <h2 className="ttt-title">Tic Tac Toe</h2>
        <div className="ttt-header-controls">
          <div className="ttt-room-info">
            Room: {roomCode} | Playing as: <span className={`role-badge ${role}`}>
              {role === 'local' ? (aiDifficulty ? `X vs AI (${aiDifficulty})` : 'Local (Both)') : (role === 'host' ? 'X' : 'O')}
            </span>
          </div>
          <button className="ttt-leave-btn" onClick={() => window.location.reload()}>
            Leave Game
          </button>
        </div>
      </div>
      
      {error && <div className="ttt-error">{error}</div>}
      
      <div className="ttt-main">
        <div className="ttt-board-wrapper">
          {gameState ? (
            <TicTacToeBoard 
              gameState={gameState} 
              role={role} 
              aiDifficulty={aiDifficulty}
              onMove={handleMove} 
              players={players}
              onReset={resetGame}
            />
          ) : (
            <div className="ttt-loading">Setting up the board...</div>
          )}
        </div>
        
        <div className="ttt-sidebar">
          {role !== 'local' && <CommsPanel roomCode={roomCode} role={role} db={db} />}
        </div>
      </div>
    </div>
  );
}
