import React, { useEffect, useState, useRef } from 'react';
import { playMoveSound, playCaptureSound, playHomeSound, initSounds } from '../../utils/sounds';

export default function LudoBoard({ gameState, role, aiDifficulty, onRoll, onMove, players, onReset }) {
  const { tokens, turn, diceValue, diceRolled, status, winner } = gameState;
  const [aiThinking, setAiThinking] = useState(false);
  const prevTokensRef = useRef(tokens);
  const [animatingTokens, setAnimatingTokens] = useState({});
  const [displayTokens, setDisplayTokens] = useState(tokens);

  const getNextStep = (currentPos, targetPos, color) => {
    if (currentPos === targetPos) return currentPos;
    if (currentPos === -1) return targetPos; // Jump out of base
    if (targetPos === -1) return targetPos; // Jump to base (captured)

    let nextPos = currentPos + 1;
    
    if (color === 'red') {
      if (currentPos === 50 && targetPos >= 100) nextPos = 100;
    } else if (color === 'blue') {
      if (currentPos === 24 && targetPos >= 200) nextPos = 200;
      else if (currentPos === 51) nextPos = 0;
    }
    
    return nextPos;
  };

  useEffect(() => {
    let timeoutId;

    const animateSteps = () => {
      setDisplayTokens(prev => {
        let changed = false;
        const nextTokens = { red: [...prev.red], blue: [...prev.blue] };

        ['red', 'blue'].forEach(color => {
          tokens[color].forEach((targetPos, idx) => {
            const currentPos = prev[color][idx];
            if (currentPos !== targetPos) {
              changed = true;
              nextTokens[color][idx] = getNextStep(currentPos, targetPos, color);
            }
          });
        });

        if (changed) {
          playMoveSound();
          timeoutId = setTimeout(animateSteps, 250);
        }
        return changed ? nextTokens : prev;
      });
    };

    animateSteps();

    return () => clearTimeout(timeoutId);
  }, [tokens]);

  useEffect(() => {
    const newAnimating = {};
    let changed = false;
    
    ['red', 'blue'].forEach(color => {
      displayTokens[color].forEach((pos, idx) => {
        const prevPos = prevTokensRef.current[color][idx];
        if (prevPos > -1 && pos === -1) {
          newAnimating[`${color}-${idx}`] = 'captured';
          changed = true;
          playCaptureSound();
        } else if (prevPos !== pos && ((color === 'red' && pos === 105) || (color === 'blue' && pos === 205))) {
          newAnimating[`${color}-${idx}`] = 'home';
          changed = true;
          playHomeSound();
        }
      });
    });

    if (changed) {
      setAnimatingTokens(newAnimating);
      setTimeout(() => setAnimatingTokens({}), 1000);
    }
    
    prevTokensRef.current = displayTokens;
  }, [displayTokens]);

  const isMyTurn = () => {
    if (status !== 'active') return false;
    if (role === 'local') return !aiDifficulty || turn === 'red';
    return (role === 'host' && turn === 'red') || (role === 'guest' && turn === 'blue');
  };

  // AI Logic
  useEffect(() => {
    if (role === 'local' && aiDifficulty && turn === 'blue' && status === 'active' && !aiThinking) {
      setAiThinking(true);
      setTimeout(() => {
        if (!diceRolled) {
          onRoll();
        } else {
          // AI Move Logic
          const val = diceValue;
          const myTokens = tokens.blue;
          let moved = false;
          
          // Simple AI: 
          // 1. If can move out of base, do it.
          // 2. Otherwise, move the furthest token that can move.
          
          let possibleMoves = [];
          for (let i = 0; i < 4; i++) {
            let pos = myTokens[i];
            if (pos === -1 && val === 6) {
              possibleMoves.push({ index: i, priority: 10 });
            } else if (pos !== -1 && pos < 205) {
              // Check if move is valid
              let newPos = pos + val;
              if (pos <= 24 && pos >= 19 && newPos > 24) {
                newPos = 200 + (newPos - 25);
              } else if (pos <= 51 && newPos > 51) {
                newPos = newPos - 52;
              }
              if (newPos <= 205) {
                possibleMoves.push({ index: i, priority: pos });
              }
            }
          }
          
          if (possibleMoves.length > 0) {
            possibleMoves.sort((a, b) => b.priority - a.priority);
            onMove('blue', possibleMoves[0].index);
          }
        }
        setAiThinking(false);
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, turn, diceRolled, diceValue, role, aiDifficulty, status, aiThinking]);

  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (diceRolled && diceValue) {
      setIsRolling(true);
      const timer = setTimeout(() => setIsRolling(false), 500);
      return () => clearTimeout(timer);
    }
  }, [diceRolled, diceValue]);

  const handleRoll = () => {
    initSounds();
    if (!isRolling) {
      onRoll();
    }
  };

  const getGridPosition = (pos, color) => {
    if (pos === -1) {
      // Base positions (handled differently, but let's give them a default)
      return { x: 50, y: 50 };
    }
    
    // 15x15 grid, so each cell is 100/15 = 6.666% wide/high
    // Center of cell is (col + 0.5) * 6.666
    const toPercent = (col, row) => ({
      left: `${(col + 0.5) * (100 / 15)}%`,
      top: `${(row + 0.5) * (100 / 15)}%`
    });

    if (color === 'red' && pos >= 100) {
      // Red home stretch (row 7, col 1 to 5)
      const step = pos - 100;
      if (step === 5) return toPercent(6, 7); // Home (inside red triangle)
      return toPercent(1 + step, 7);
    }
    
    if (color === 'blue' && pos >= 200) {
      // Blue home stretch (row 7, col 13 to 9)
      const step = pos - 200;
      if (step === 5) return toPercent(8, 7); // Home (inside blue triangle)
      return toPercent(13 - step, 7);
    }

    // Main path (0 to 51)
    // Map 0-51 to (col, row) on 15x15 grid
    const pathMap = [
      [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], // 0-4
      [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], // 5-10
      [7, 0], [8, 0], // 11-12
      [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], // 13-17
      [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // 18-23
      [14, 7], [14, 8], // 24-25
      [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // 26-30
      [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // 31-36
      [7, 14], [6, 14], // 37-38
      [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // 39-43
      [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], // 44-49
      [0, 7], [0, 6] // 50-51
    ];

    const p = pos % 52;
    if (pathMap[p]) {
      return toPercent(pathMap[p][0], pathMap[p][1]);
    }
    
    return { left: '50%', top: '50%' };
  };

  const renderTokens = (color) => {
    return displayTokens[color].map((pos, idx) => {
      let style = {};
      let isHome = false;
      
      if (pos === -1) {
        // Render in base
        const baseOffsets = [
          { left: '25%', top: '25%' },
          { left: '75%', top: '25%' },
          { left: '25%', top: '75%' },
          { left: '75%', top: '75%' }
        ];
        
        // We will render base tokens inside the base div directly, not here.
        // Actually, for animation, it's better to render them here but calculate absolute base positions.
        // Base is 40% width/height.
        // Red base: top 0, left 0.
        // Blue base: bottom 0, right 0.
        
        if (color === 'red') {
          style = {
            left: `${13.2 + (idx % 2) * 13.6}%`,
            top: `${13.2 + Math.floor(idx / 2) * 13.6}%`
          };
        } else {
          style = {
            left: `${73.2 + (idx % 2) * 13.6}%`,
            top: `${73.2 + Math.floor(idx / 2) * 13.6}%`
          };
        }
      } else {
        if ((color === 'red' && pos === 105) || (color === 'blue' && pos === 205)) {
          isHome = true;
        }
        style = getGridPosition(pos, color);
      }

      if (isHome && animatingTokens[`${color}-${idx}`] !== 'home') return null; // Don't render if fully home, unless animating

      const animClass = animatingTokens[`${color}-${idx}`] || '';

      return (
        <div 
          key={`${color}-${idx}`}
          className={`ludo-token ${color} ${isMyTurn() && turn === color ? 'clickable' : ''} ${animClass}`}
          style={style}
          onClick={() => {
            initSounds();
            onMove(color, idx);
          }}
        />
      );
    });
  };

  // Generate grid cells
  const renderGridCells = () => {
    const cells = [];
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        // Skip bases and center
        if ((row < 6 && col < 6) || (row < 6 && col > 8) || (row > 8 && col < 6) || (row > 8 && col > 8) || (row >= 6 && row <= 8 && col >= 6 && col <= 8)) {
          continue;
        }
        
        let className = "ludo-cell";
        
        // Home stretches
        if (row === 7 && col >= 1 && col <= 5) className += " red-path";
        if (col === 7 && row >= 1 && row <= 5) className += " green-path";
        if (row === 7 && col >= 9 && col <= 13) className += " blue-path";
        if (col === 7 && row >= 9 && row <= 13) className += " yellow-path";
        
        // Starting cells (also safe zones)
        if (row === 6 && col === 1) className += " red-path safe start-cell right-arrow";
        if (row === 1 && col === 8) className += " green-path safe start-cell down-arrow";
        if (row === 8 && col === 13) className += " blue-path safe start-cell left-arrow";
        if (row === 13 && col === 6) className += " yellow-path safe start-cell up-arrow";

        // Other safe zones (star cells)
        if ((row === 2 && col === 6) || (row === 6 && col === 12) || (row === 12 && col === 8) || (row === 8 && col === 2)) {
          className += " safe star-cell";
        }

        cells.push(
          <div 
            key={`${row}-${col}`} 
            className={className}
            style={{ gridRow: row + 1, gridColumn: col + 1 }}
          />
        );
      }
    }
    return cells;
  };

  return (
    <div className="ludo-board-container">
      <div className="ludo-players">
        <div className={`ludo-player ${turn === 'red' ? 'active' : ''}`}>
          <div className="ludo-player-avatar red-avatar">R</div>
          <div className="ludo-player-info">
            <span className="ludo-player-name">{players.host}</span>
          </div>
        </div>
        
        <div className="ludo-dice-area">
          <div className={`ludo-dice-display ${isRolling ? 'rolling' : ''}`} data-value={diceValue || 1}>
            {diceValue === 1 && <div className="dice-dot center"></div>}
            {diceValue === 2 && (
              <>
                <div className="dice-dot top-left"></div>
                <div className="dice-dot bottom-right"></div>
              </>
            )}
            {diceValue === 3 && (
              <>
                <div className="dice-dot top-left"></div>
                <div className="dice-dot center"></div>
                <div className="dice-dot bottom-right"></div>
              </>
            )}
            {diceValue === 4 && (
              <>
                <div className="dice-dot top-left"></div>
                <div className="dice-dot top-right"></div>
                <div className="dice-dot bottom-left"></div>
                <div className="dice-dot bottom-right"></div>
              </>
            )}
            {diceValue === 5 && (
              <>
                <div className="dice-dot top-left"></div>
                <div className="dice-dot top-right"></div>
                <div className="dice-dot center"></div>
                <div className="dice-dot bottom-left"></div>
                <div className="dice-dot bottom-right"></div>
              </>
            )}
            {diceValue === 6 && (
              <>
                <div className="dice-dot top-left"></div>
                <div className="dice-dot top-right"></div>
                <div className="dice-dot middle-left"></div>
                <div className="dice-dot middle-right"></div>
                <div className="dice-dot bottom-left"></div>
                <div className="dice-dot bottom-right"></div>
              </>
            )}
            {!diceValue && <span style={{fontSize: '24px', color: '#ccc'}}>?</span>}
          </div>
          <div className="ludo-action-container">
            {isMyTurn() && !diceRolled && status === 'active' && (
              <button className="ludo-roll-btn" onClick={handleRoll}>Roll</button>
            )}
            {(!isMyTurn() || diceRolled) && status === 'active' && (
              <div className="ludo-turn-text">{turn}'s Turn</div>
            )}
          </div>
        </div>

        <div className={`ludo-player ${turn === 'blue' ? 'active' : ''}`}>
          <div className="ludo-player-info" style={{ textAlign: 'right' }}>
            <span className="ludo-player-name">{players.guest}</span>
          </div>
          <div className="ludo-player-avatar blue-avatar">B</div>
        </div>
      </div>

      <div className="ludo-board-visual">
        {renderGridCells()}
        
        <div className="ludo-base red-base">
          <div className="ludo-base-inner">
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
          </div>
        </div>
        <div className="ludo-base green-base">
          <div className="ludo-base-inner">
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
          </div>
        </div>
        <div className="ludo-base yellow-base">
          <div className="ludo-base-inner">
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
          </div>
        </div>
        <div className="ludo-base blue-base">
          <div className="ludo-base-inner">
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
            <div className="ludo-base-circle"></div>
          </div>
        </div>
        
        <div className="ludo-center-home"></div>
        
        {renderTokens('red')}
        {renderTokens('blue')}
      </div>

      {status === 'gameover' && (
        <div className="ludo-gameover-modal">
          <div className="ludo-modal-content">
            <h3>{winner === 'red' ? players.host : players.guest} Wins!</h3>
            {(role === 'host' || role === 'local') && (
              <button className="ludo-play-again-btn" onClick={onReset}>Play Again</button>
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
