import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { User, Bot } from 'lucide-react';
import { PIECES_SVG } from './pieces';

const PIECE_IMAGES = {
  w: {
    p: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.w.p)}`,
    n: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.w.n)}`,
    b: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.w.b)}`,
    r: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.w.r)}`,
    q: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.w.q)}`,
    k: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.w.k)}`
  },
  b: {
    p: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.b.p)}`,
    n: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.b.n)}`,
    b: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.b.b)}`,
    r: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.b.r)}`,
    q: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.b.q)}`,
    k: `data:image/svg+xml;utf8,${encodeURIComponent(PIECES_SVG.b.k)}`
  }
};

export default function ChessBoard({ fen, role, aiDifficulty, onMove, onGameOver, status, lastMove, players }) {
  const [game, setGame] = useState(new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [promotionMove, setPromotionMove] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const moveSoundRef = useRef(null);
  const captureSoundRef = useRef(null);
  const checkmateSoundRef = useRef(null);
  const drawSoundRef = useRef(null);
  const promotionSoundRef = useRef(null);

  // Sync local game state with remote FEN
  useEffect(() => {
    try {
      if (fen && fen !== game.fen()) {
        const newGame = new Chess(fen);
        setGame(newGame);
        
        // Play sound on remote move
        if (lastMove) {
           const isCapture = newGame.get(lastMove.to) && lastMove.san.includes('x');
           if (isCapture) {
             captureSoundRef.current?.play().catch(e => console.warn("Audio play failed", e));
           } else {
             moveSoundRef.current?.play().catch(e => console.warn("Audio play failed", e));
           }
        }
      }
    } catch (e) {
      console.error("Invalid FEN received:", fen);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, lastMove]);

  // Check for game over conditions
  useEffect(() => {
    if (status !== 'active') return;

    if (game.isCheckmate()) {
      checkmateSoundRef.current?.play().catch(e => console.warn("Audio play failed", e));
      onGameOver('checkmate');
    } else if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
      drawSoundRef.current?.play().catch(e => console.warn("Audio play failed", e));
      onGameOver('draw');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fen(), status]);

  const executeMove = (sanMove) => {
    try {
      const newGame = new Chess(game.fen());
      const moveResult = newGame.move(sanMove);
      
      if (moveResult) {
        setGame(newGame);
        setSelectedSquare(null);
        setValidMoves([]);
        setPromotionMove(null);
        
        // Play sound locally
        if (moveResult.captured) {
          captureSoundRef.current?.play().catch(e => console.warn("Audio play failed", e));
        } else if (moveResult.promotion) {
          promotionSoundRef.current?.play().catch(e => console.warn("Audio play failed", e));
        } else {
          moveSoundRef.current?.play().catch(e => console.warn("Audio play failed", e));
        }
        
        // Sync move to Firebase
        onMove(newGame.fen(), {
          from: moveResult.from,
          to: moveResult.to,
          san: moveResult.san
        });
      }
    } catch (e) {
      console.error("Invalid move:", sanMove);
    }
  };

  // AI Move Logic
  useEffect(() => {
    if (role === 'local' && aiDifficulty && game.turn() === 'b' && status === 'active' && !game.isGameOver() && !aiThinking) {
      setAiThinking(true);
      setTimeout(() => {
        const moves = game.moves({ verbose: true });
        if (moves.length > 0) {
          let selectedMove;
          
          if (aiDifficulty === 'easy') {
            // Completely random move
            selectedMove = moves[Math.floor(Math.random() * moves.length)];
          } else if (aiDifficulty === 'medium') {
            // Try to capture if possible, otherwise random
            const captures = moves.filter(m => m.flags.includes('c') || m.flags.includes('e'));
            if (captures.length > 0 && Math.random() > 0.3) {
              selectedMove = captures[Math.floor(Math.random() * captures.length)];
            } else {
              selectedMove = moves[Math.floor(Math.random() * moves.length)];
            }
          } else {
            // Hard: Prefer captures, promotions, and checks
            const captures = moves.filter(m => m.flags.includes('c') || m.flags.includes('e'));
            const promotions = moves.filter(m => m.flags.includes('p') || m.flags.includes('cp'));
            const checks = moves.filter(m => m.san.includes('+') || m.san.includes('#'));
            
            const goodMoves = [...promotions, ...captures, ...checks];
            if (goodMoves.length > 0 && Math.random() > 0.1) {
              selectedMove = goodMoves[Math.floor(Math.random() * goodMoves.length)];
            } else {
              selectedMove = moves[Math.floor(Math.random() * moves.length)];
            }
          }

          executeMove(selectedMove.san);
        }
        setAiThinking(false);
      }, 1000); // 1 second delay for AI thinking
    }
  }, [game.fen(), role, aiDifficulty, status, aiThinking]);

  const isMyTurn = () => {
    if (role === 'local') return !aiDifficulty || game.turn() === 'w'; // If AI is enabled, local player is only White
    const turnColor = game.turn(); // 'w' or 'b'
    return (role === 'host' && turnColor === 'w') || (role === 'guest' && turnColor === 'b');
  };

  const handleSquareClick = (square) => {
    if (!isMyTurn() || status !== 'active') return;

    // If a promotion is pending, ignore clicks on the board
    if (promotionMove) return;

    // If a square is already selected, try to move
    if (selectedSquare) {
      const move = validMoves.find(m => m.to === square);
      
      if (move) {
        // Check for promotion
        if (move.flags.includes('p') || move.flags.includes('cp')) {
          setPromotionMove(move);
          return;
        }

        executeMove(move.san);
        return;
      }
    }

    // Select a piece
    const piece = game.get(square);
    const myColor = role === 'local' ? game.turn() : (role === 'host' ? 'w' : 'b');

    if (piece && piece.color === myColor) {
      setSelectedSquare(square);
      const moves = game.moves({ square, verbose: true });
      setValidMoves(moves);
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const handlePromotion = (pieceType) => {
    if (!promotionMove) return;
    
    // chess.js requires promotion piece type in lowercase
    const sanMove = promotionMove.san.replace(/=[QRBN]/, `=${pieceType.toUpperCase()}`);
    executeMove(sanMove);
  };

  const renderBoard = () => {
    const board = game.board();
    const isFlipped = role === 'guest';
    
    // Flip the board for black player
    const displayBoard = isFlipped ? [...board].reverse().map(row => [...row].reverse()) : board;
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    
    const displayFiles = isFlipped ? [...files].reverse() : files;
    const displayRanks = isFlipped ? [...ranks].reverse() : ranks;

    return (
      <div className={`chess-grid ${isFlipped ? 'flipped' : ''}`}>
        {displayBoard.map((row, rowIndex) => (
          row.map((piece, colIndex) => {
            const square = `${displayFiles[colIndex]}${displayRanks[rowIndex]}`;
            const isLight = (rowIndex + colIndex) % 2 === 0;
            const isSelected = selectedSquare === square;
            const isValidMove = validMoves.some(m => m.to === square);
            const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
            const isCheck = piece && piece.type === 'k' && piece.color === game.turn() && game.inCheck();

            const showRank = colIndex === 0;
            const showFile = rowIndex === 7;

            let squareClass = `chess-square ${isLight ? 'light' : 'dark'}`;
            if (isSelected) squareClass += ' selected';
            if (isValidMove) squareClass += ' valid-move';
            if (isLastMove) squareClass += ' last-move';
            if (isCheck) squareClass += ' in-check';

            return (
              <div 
                key={square} 
                className={squareClass}
                onClick={() => handleSquareClick(square)}
                data-square={square}
              >
                {showRank && <span className="coordinate rank-coord">{displayRanks[rowIndex]}</span>}
                {showFile && <span className="coordinate file-coord">{displayFiles[colIndex]}</span>}
                {isValidMove && !piece && <div className="move-hint"></div>}
                {isValidMove && piece && <div className="capture-hint"></div>}
                {piece && (
                  <div className={`chess-piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}>
                    <img 
                      src={PIECE_IMAGES[piece.color][piece.type]} 
                      alt={`${piece.color} ${piece.type}`} 
                      className="chess-piece-img" 
                      draggable="false" 
                    />
                  </div>
                )}
              </div>
            );
          })
        ))}
      </div>
    );
  };

  const topPlayer = players ? (role === 'guest' ? players.host : players.guest) : 'Opponent';
  const bottomPlayer = players ? (role === 'guest' ? players.guest : players.host) : 'You';

  return (
    <div className="chess-board-container">
      <div className={`chess-status-bar ${isMyTurn() ? 'my-turn' : 'opponent-turn'}`}>
        {game.isCheckmate() ? (
          <span className="status-text danger">Checkmate! {game.turn() === 'w' ? 'Black' : 'White'} wins!</span>
        ) : game.isDraw() || game.isStalemate() ? (
          <span className="status-text warning">Game Drawn!</span>
        ) : game.inCheck() ? (
          <span className="status-text danger">Check! {isMyTurn() ? "Your Turn" : "Opponent's Turn"}</span>
        ) : (
          <span className="status-text">
            {isMyTurn() ? "Your Turn" : "Opponent's Turn"}
          </span>
        )}
      </div>
      
      <div className="chess-player-name top-player">
        {topPlayer?.includes('AI') ? <Bot size={18} /> : <User size={18} />}
        <span>{topPlayer}</span>
      </div>

      <div className="chess-board-frame">
        {renderBoard()}
        
        {game.isGameOver() && (
          <div className="game-over-overlay">
            <div className="game-over-content">
              <h2>Game Over</h2>
              <p className="game-over-reason">
                {game.isCheckmate() ? `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins!` : 'Game Drawn!'}
              </p>
              <button className="chess-leave-btn" onClick={() => window.location.reload()} style={{margin: '20px auto 0'}}>
                Back to Lobby
              </button>
            </div>
          </div>
        )}

        {promotionMove && (
          <div className="promotion-modal">
            <div className="promotion-content">
              <h3>Promote Pawn</h3>
              <div className="promotion-options">
                {['q', 'r', 'b', 'n'].map(p => {
                  const pColor = game.turn();
                  return (
                  <button 
                    key={p} 
                    className={`chess-piece ${pColor === 'w' ? 'white-piece' : 'black-piece'}`}
                    onClick={() => handlePromotion(p)}
                  >
                    <img 
                      src={PIECE_IMAGES[pColor][p]} 
                      alt={`${pColor} ${p}`} 
                      className="chess-piece-img" 
                      draggable="false" 
                    />
                  </button>
                )})}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chess-player-name bottom-player">
        {bottomPlayer?.includes('AI') ? <Bot size={18} /> : <User size={18} />}
        <span>{bottomPlayer}</span>
      </div>

      <audio ref={moveSoundRef} src="https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3" preload="auto" />
      <audio ref={captureSoundRef} src="https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3" preload="auto" />
      <audio ref={checkmateSoundRef} src="https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3" preload="auto" />
      <audio ref={drawSoundRef} src="https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3" preload="auto" />
      <audio ref={promotionSoundRef} src="https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/promote.mp3" preload="auto" />
    </div>
  );
}
