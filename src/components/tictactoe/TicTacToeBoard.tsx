import React, { useEffect, useState } from 'react';
import { playMoveSound, playWinSound } from '../../utils/sounds';

export default function TicTacToeBoard({ gameState, role, aiDifficulty, onMove, players, onReset }) {
  const { board, turn, status, winner, winningLine } = gameState;
  const [aiThinking, setAiThinking] = useState(false);

  useEffect(() => {
    if (status === 'gameover' && winner !== 'draw') {
      playWinSound();
    }
  }, [status, winner]);

  const isMyTurn = () => {
    if (status !== 'active') return false;
    if (role === 'local') return !aiDifficulty || turn === 'X';
    return (role === 'host' && turn === 'X') || (role === 'guest' && turn === 'O');
  };

  const handleSquareClick = (index) => {
    if (isMyTurn() && !board[index]) {
      playMoveSound();
      onMove(index);
    }
  };

  // AI Logic
  useEffect(() => {
    if (role === 'local' && aiDifficulty && turn === 'O' && status === 'active' && !aiThinking) {
      setAiThinking(true);
      setTimeout(() => {
        const emptyIndices = board.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
        if (emptyIndices.length > 0) {
          let selectedMove = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
          
          if (aiDifficulty === 'medium' || aiDifficulty === 'hard') {
            // Basic block/win logic
            const lines = [
              [0, 1, 2], [3, 4, 5], [6, 7, 8],
              [0, 3, 6], [1, 4, 7], [2, 5, 8],
              [0, 4, 8], [2, 4, 6]
            ];
            
            let moveFound = false;
            // 1. Try to win
            for (let line of lines) {
              const [a, b, c] = line;
              const vals = [board[a], board[b], board[c]];
              if (vals.filter(v => v === 'O').length === 2 && vals.filter(v => v === null).length === 1) {
                selectedMove = line[vals.indexOf(null)];
                moveFound = true;
                break;
              }
            }
            
            // 2. Try to block
            if (!moveFound) {
              for (let line of lines) {
                const [a, b, c] = line;
                const vals = [board[a], board[b], board[c]];
                if (vals.filter(v => v === 'X').length === 2 && vals.filter(v => v === null).length === 1) {
                  selectedMove = line[vals.indexOf(null)];
                  moveFound = true;
                  break;
                }
              }
            }
            
            // 3. Center
            if (!moveFound && aiDifficulty === 'hard' && board[4] === null) {
              selectedMove = 4;
            }
          }
          
          onMove(selectedMove);
        }
        setAiThinking(false);
      }, 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, turn, role, aiDifficulty, status, aiThinking]);

  return (
    <div className="ttt-board-container">
      <div className="ttt-players">
        <div className={`ttt-player ${turn === 'X' ? 'active' : ''}`}>
          <div className="ttt-player-avatar x-avatar">X</div>
          <div className="ttt-player-info">
            <span className="ttt-player-name">{players.host}</span>
          </div>
        </div>
        <div className="ttt-status-badge">
          {status === 'active' ? (
            <span className="ttt-turn-text">{turn}'s Turn</span>
          ) : (
            <span className="ttt-game-over-text">Game Over</span>
          )}
        </div>
        <div className={`ttt-player ${turn === 'O' ? 'active' : ''}`}>
          <div className="ttt-player-info" style={{ textAlign: 'right' }}>
            <span className="ttt-player-name">{players.guest}</span>
          </div>
          <div className="ttt-player-avatar o-avatar">O</div>
        </div>
      </div>

      <div className="ttt-grid">
        {board.map((square, i) => {
          const isWinningSquare = winningLine && winningLine.includes(i);
          return (
            <div 
              key={i} 
              className={`ttt-square ${square ? 'filled' : ''} ${isWinningSquare ? 'winning' : ''} ${isMyTurn() && !square ? 'clickable' : ''}`}
              onClick={() => handleSquareClick(i)}
            >
              {square === 'X' && (
                <span className="ttt-mark x-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </span>
              )}
              {square === 'O' && (
                <span className="ttt-mark o-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                  </svg>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {status === 'gameover' && (
        <div className="ttt-gameover-modal">
          <div className="ttt-modal-content">
            <h3>{winner === 'draw' ? "It's a Draw!" : `${winner} Wins!`}</h3>
            {(role === 'host' || role === 'local') && (
              <button className="ttt-play-again-btn" onClick={onReset}>Play Again</button>
            )}
            {role === 'guest' && (
              <p>Waiting for host to restart...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
