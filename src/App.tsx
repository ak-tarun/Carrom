// @ts-nocheck
import React, { useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, get, update, onDisconnect, push, remove, onChildAdded } from "firebase/database";
import { Network } from '@capacitor/network';
import { App as CapacitorApp } from '@capacitor/app';

let initialized = false;

export default function App() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    const firebaseConfig = {
      apiKey: "AIzaSyCrC-iEkl0BryOOd3mfS-j_vIuWSxmu-Vc",
      authDomain: "aiforstud.firebaseapp.com",
      databaseURL: "https://aiforstud-default-rtdb.firebaseio.com",
      projectId: "aiforstud",
      storageBucket: "aiforstud.firebasestorage.app",
      messagingSenderId: "525467896028",
      appId: "1:525467896028:web:96e47678dd702a6e910c19",
      measurementId: "G-KWL6TGPQY1"
    };

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    // Connection State Handling
    const connectedRef = ref(db, ".info/connected");
    let hasInitiallyConnected = false;
    let reconnectAttempts = 0;
    let reconnectTimeout = null;

    // Online Presence & Invites
    let myUserId = localStorage.getItem('carrom_user_id');
    if (!myUserId) {
        myUserId = 'user_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('carrom_user_id', myUserId);
    }
    let myName = localStorage.getItem('carrom_user_name') || `Player ${myUserId.substring(5, 9)}`;

    onValue(connectedRef, (snap) => {
        const isConnected = snap.val() === true;
        const loader = document.getElementById('connection-loader');
        const loaderText = document.getElementById('connection-text');
        
        if (isConnected) {
            hasInitiallyConnected = true;
            reconnectAttempts = 0;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            if (loader) loader.style.display = 'none';
            
            // Re-establish presence when reconnecting
            if (myUserId) {
                updatePresence(isGameRunning ? 'in-game' : 'online');
            }
        } else {
            if (loader) {
                loader.style.display = 'flex';
                if (hasInitiallyConnected) {
                    handleReconnect(loaderText);
                } else {
                    if (loaderText) loaderText.innerText = "Connecting to server...";
                }
            }
        }
    });

    function handleReconnect(loaderText) {
        if (reconnectAttempts > 5) {
            if (loaderText) loaderText.innerText = "Connection failed. Please refresh the page.";
            return;
        }
        
        const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Max 30s
        if (loaderText) loaderText.innerText = `Connection lost. Reconnecting in ${backoffTime/1000}s...`;
        
        reconnectTimeout = setTimeout(() => {
            reconnectAttempts++;
            if (loaderText) loaderText.innerText = "Attempting to reconnect...";
            // Firebase handles the actual reconnection automatically, 
            // this is just for UI feedback and limiting attempts.
        }, backoffTime);
    }

    let myRole = null; 
    let currentRoom = null;
    let onlineTurn = 'host'; 
    let isGameRunning = false; 
    let gameUnsubscribes = [];
    
    function cleanupGameListeners() {
        gameUnsubscribes.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        gameUnsubscribes = [];
    }
    
    let gameMode = 'multi'; // 'multi' or 'single'
    let aiDifficulty = 'medium'; // 'easy', 'medium', 'hard'
    let aiThinking = false;

    let opponentAiming = false;
    let oppDragStart = {x: 0, y: 0};
    let oppCurrentDrag = {x: 0, y: 0};

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    let audioReady = false;
    let noiseBuffer;

    // Network Status Handling
    Network.getStatus().then(status => updateNetworkStatus(status));
    Network.addListener('networkStatusChange', status => updateNetworkStatus(status));

    function updateNetworkStatus(status) {
        const el = document.getElementById('network-status');
        const btnCreate = document.getElementById('btn-create');
        const btnJoin = document.getElementById('btn-join');
        const netIcon = document.getElementById('network-icon');
        const netText = document.getElementById('network-text');
        
        if (!status.connected) {
            if(el) el.style.display = 'block';
            if(btnCreate) btnCreate.disabled = true;
            if(btnJoin) btnJoin.disabled = true;
            if(netIcon) netIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.82"/></svg>`;
            if(netIcon) netIcon.style.color = 'var(--danger)';
            if(netText) { netText.innerText = 'Offline'; netText.style.color = 'var(--danger)'; }
        } else {
            if(el) el.style.display = 'none';
            if(btnCreate) btnCreate.disabled = false;
            if(btnJoin) btnJoin.disabled = false;
            
            let iconSvg = '';
            let text = '';
            let color = 'var(--success)';
            
            if (status.connectionType === 'wifi') {
                iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
                text = 'WiFi';
            } else if (status.connectionType === 'cellular') {
                iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>`;
                text = '4G/5G';
            } else {
                iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
                text = 'Online';
            }
            
            if(netIcon) { netIcon.innerHTML = iconSvg; netIcon.style.color = color; }
            if(netText) { netText.innerText = text; netText.style.color = color; }
        }
    }

    // History Handling
    function saveHistory(winner, hScore, gScore) {
        const history = JSON.parse(localStorage.getItem('carrom_history') || '[]');
        history.unshift({
            date: new Date().toLocaleString(),
            mode: gameMode === 'single' ? `Single Player (${aiDifficulty})` : 'Multiplayer',
            winner,
            hostScore: hScore,
            guestScore: gScore
        });
        localStorage.setItem('carrom_history', JSON.stringify(history.slice(0, 50))); // Keep last 50
    }

    // Online Presence & Invites
    const myPresenceRef = ref(db, `online_users/${myUserId}`);
    onDisconnect(myPresenceRef).remove();
    
    function updatePresence(status) {
        set(myPresenceRef, {
            id: myUserId,
            name: myName,
            status: status,
            lastSeen: Date.now()
        });
    }
    updatePresence('online');

    // Listen for online users
    onValue(ref(db, 'online_users'), (snapshot) => {
        const users = snapshot.val() || {};
        const listEl = document.getElementById('online-users-list');
        if (!listEl) return;
        
        const activeUsers = Object.values(users).filter(u => u.id !== myUserId);

        if (activeUsers.length === 0) {
            listEl.innerHTML = '<li style="padding: 10px; color: var(--text-muted); text-align: center;">No other players online</li>';
        } else {
            listEl.innerHTML = activeUsers.map(u => {
                const isBusy = u.status === 'in-game';
                const btnStyle = isBusy 
                    ? 'padding: 4px 12px; font-size: 12px; margin: 0; width: auto; background: rgba(255,255,255,0.1); color: var(--text-muted); cursor: not-allowed;'
                    : 'padding: 4px 12px; font-size: 12px; margin: 0; width: auto;';
                const btnText = isBusy ? 'In Game' : 'Invite';
                const btnAction = isBusy ? '' : `onclick="window.sendInvite('${u.id}')"`;
                const displayName = u.name || `Player ${u.id.substring(5, 9)}`;
                
                return `
                    <li style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text-main); font-size: 14px; font-weight: 500;">${displayName}</span>
                        <button class="lobby-btn" style="${btnStyle}" ${btnAction} ${isBusy ? 'disabled' : ''}>${btnText}</button>
                    </li>
                `;
            }).join('');
        }
    });

    // Listen for incoming invites
    onValue(ref(db, `invites/${myUserId}`), (snapshot) => {
        const invite = snapshot.val();
        if (invite && invite.status === 'pending') {
            if (isGameRunning || currentRoom) {
                // Auto-decline if currently busy
                update(ref(db, `invites/${myUserId}`), { status: 'declined_busy' });
                return;
            }
            
            // Use inviter's name from invite or fetch it
            const inviterName = invite.fromName || `Player ${invite.from.substring(5, 9)}`;
            document.getElementById('invite-text').innerText = `${inviterName} invited you to play!`;
            document.getElementById('invite-modal').style.display = 'flex';
            
            window.acceptInvite = async () => {
                await requestMicAccess();
                await update(ref(db, `invites/${myUserId}`), { status: 'accepted' });
                document.getElementById('invite-modal').style.display = 'none';
                
                // Join the room created by the inviter
                currentRoom = invite.roomId;
                myRole = 'guest';
                gameMode = 'multi';
                await update(ref(db, `rooms/${currentRoom}`), { status: 'playing', guestId: myUserId });
                startGame();
            };
            
            window.declineInvite = async () => {
                await update(ref(db, `invites/${myUserId}`), { status: 'declined' });
                document.getElementById('invite-modal').style.display = 'none';
            };
        }
    });

    window.sendInvite = async (targetUserId) => {
        initAudio();
        await requestMicAccess();
        gameMode = 'multi';
        const errorText = document.getElementById('lobby-error');
        errorText.innerText = "Sending invite...";
        
        try {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            currentRoom = code;
            myRole = 'host';
            
            await set(ref(db, `rooms/${code}`), { status: 'waiting', turn: 'host', hostId: myUserId });
            
            // Send the invite
            await set(ref(db, `invites/${targetUserId}`), {
                from: myUserId,
                fromName: myName,
                roomId: code,
                status: 'pending',
                timestamp: Date.now()
            });
            
            document.getElementById('panel-main').style.display = 'none';
            document.getElementById('panel-waiting').style.display = 'block';
            document.getElementById('room-code-display').innerText = "Waiting for accept...";
            errorText.innerText = "";

            // Listen for accept/decline
            const inviteListener = onValue(ref(db, `invites/${targetUserId}`), (snapshot) => {
                const invite = snapshot.val();
                if (invite && invite.status === 'accepted') {
                    startGame();
                    // Clean up listener (simplified for this context)
                } else if (invite && invite.status === 'declined') {
                    document.getElementById('panel-waiting').style.display = 'none';
                    document.getElementById('panel-main').style.display = 'block';
                    errorText.innerText = "Invite declined.";
                    remove(ref(db, `rooms/${code}`));
                    currentRoom = null;
                } else if (invite && invite.status === 'declined_busy') {
                    document.getElementById('panel-waiting').style.display = 'none';
                    document.getElementById('panel-main').style.display = 'block';
                    errorText.innerText = "Player is currently in a game.";
                    remove(ref(db, `rooms/${code}`));
                    currentRoom = null;
                }
            });
            
            // Also listen for normal room join just in case
            onValue(ref(db, `rooms/${code}/status`), (snapshot) => {
                if(snapshot.val() === 'playing' && !isGameRunning) startGame();
            });
        } catch (err) {
            errorText.innerText = "Error sending invite.";
            console.error(err);
        }
    };

    function showHistory() {
        const history = JSON.parse(localStorage.getItem('carrom_history') || '[]');
        const list = document.getElementById('history-list');
        if (history.length === 0) {
            list.innerHTML = '<li style="text-align: center; color: var(--text-muted); padding: 20px; font-weight: 500;">No games played yet.</li>';
        } else {
            list.innerHTML = history.map(h => `
                <li style="margin-bottom: 12px; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 15px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">${h.date} &bull; ${h.mode}</div>
                    <div style="font-weight: 800; font-size: 18px; color: ${h.winner.includes('White') ? 'var(--text-main)' : (h.winner.includes('Black') ? 'var(--text-main)' : 'var(--danger)')}">${h.winner}</div>
                    <div style="font-size: 14px; margin-top: 6px; color: var(--text-muted); font-weight: 500;">White: <span style="color:var(--text-main); font-weight:700;">${h.hostScore}</span> &bull; Black: <span style="color:var(--text-main); font-weight:700;">${h.guestScore}</span></div>
                </li>
            `).join('');
        }
        document.getElementById('history-modal').style.display = 'flex';
    }

    function initAudio() {
        if(audioReady) return;
        if(audioCtx.state === 'suspended') audioCtx.resume();
        
        let bufferSize = audioCtx.sampleRate * 0.1;
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        let output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) { output[i] = Math.random() * 2 - 1; }

        let osc = audioCtx.createOscillator();
        osc.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.001); 
        audioReady = true;
    }

    function playPhysicalImpact(baseFreq, modes, duration, vol) {
        if(!audioReady || !noiseBuffer) return;
        let t = audioCtx.currentTime;
        
        let noiseSrc = audioCtx.createBufferSource();
        noiseSrc.buffer = noiseBuffer;
        let noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = baseFreq * 1.5;
        noiseFilter.Q.value = 0.5;
        let noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(vol * 2.5, t); 
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015); 
        noiseSrc.connect(noiseFilter).connect(noiseGain).connect(audioCtx.destination);
        noiseSrc.start(t); noiseSrc.stop(t + 0.02);

        modes.forEach(mode => {
            let osc = audioCtx.createOscillator();
            let gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(baseFreq * mode.f, t);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * mode.f * 0.96, t + duration * mode.d);
            gain.gain.setValueAtTime(vol * mode.a, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration * mode.d);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t); osc.stop(t + duration * mode.d);
        });
    }

    const sounds = {
        playHit: function(impulse) {
            let vol = Math.min(1, impulse / 15) * 0.8;
            if(vol < 0.05) return;
            playPhysicalImpact(1100, [ {f: 1.0, a: 1.0, d: 1.0}, {f: 1.8, a: 0.6, d: 0.7}, {f: 2.5, a: 0.4, d: 0.4}, {f: 3.8, a: 0.2, d: 0.2} ], 0.035, vol);
        },
        playWall: function(vel) {
            let vol = Math.min(1, Math.abs(vel) / 15) * 1.0;
            if(vol < 0.05) return;
            playPhysicalImpact(220, [ {f: 1.0, a: 1.0, d: 1.0}, {f: 1.7, a: 0.7, d: 0.8}, {f: 2.6, a: 0.4, d: 0.5} ], 0.09, vol);
        },
        playPocket: function() {
            if(!audioReady) return;
            for(let i=0; i<3; i++) {
                setTimeout(() => {
                    let vol = 0.6 - (i * 0.15);
                    playPhysicalImpact(450 + (Math.random()*100), [ {f: 1.0, a: 1.0, d: 1.0}, {f: 2.1, a: 0.5, d: 0.6} ], 0.04, vol);
                }, i * 45 + (Math.random() * 15));
            }
        },
        playFoul: function() {
            if(!audioReady) return;
            let t = audioCtx.currentTime;
            let osc = audioCtx.createOscillator();
            let gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
            gain.gain.setValueAtTime(0.8, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t); osc.stop(t + 0.25);
        }
    };

    // Capacitor Back Button Handling
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        const historyModal = document.getElementById('history-modal');
        const inviteModal = document.getElementById('invite-modal');
        const gameOverOverlay = document.getElementById('game-over-overlay');
        const lobbyPanel = document.getElementById('lobby');

        if (inviteModal && inviteModal.style.display === 'flex') {
            window.declineInvite();
            return;
        }

        if (historyModal && historyModal.style.display === 'flex') {
            historyModal.style.display = 'none';
            return;
        }

        if (gameOverOverlay && gameOverOverlay.style.display === 'flex') {
            // If game over, go back to lobby
            gameOverOverlay.style.display = 'none';
            isGameRunning = false;
            cleanupGameListeners();
            updatePresence('online');
            lobbyPanel.style.display = 'flex';
            document.getElementById('panel-main').style.display = 'block';
            document.getElementById('panel-waiting').style.display = 'none';
            if (gameMode === 'multi' && currentRoom && myRole === 'host') {
                wipeRoomData();
            }
            currentRoom = null;
            return;
        }

        if (isGameRunning) {
            // Confirm exit game
            if (confirm("Are you sure you want to leave the game?")) {
                isGameRunning = false;
                cleanupGameListeners();
                updatePresence('online');
                lobbyPanel.style.display = 'flex';
                document.getElementById('panel-main').style.display = 'block';
                document.getElementById('panel-waiting').style.display = 'none';
                if (gameMode === 'multi' && currentRoom && myRole === 'host') {
                    remove(ref(db, `rooms/${currentRoom}`));
                }
                currentRoom = null;
            }
            return;
        }

        if (document.getElementById('panel-waiting').style.display === 'block') {
            // Cancel waiting
            document.getElementById('panel-waiting').style.display = 'none';
            document.getElementById('panel-main').style.display = 'block';
            if (currentRoom) remove(ref(db, `rooms/${currentRoom}`));
            return;
        }

        // If on main lobby and can't go back in web history, exit app
        if (!canGoBack) {
            CapacitorApp.exitApp();
        } else {
            window.history.back();
        }
    });

    const canvas = document.getElementById('carromBoard');
    const ctx = canvas.getContext('2d', { alpha: false }); 
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = 350 * dpr;
    canvas.height = 350 * dpr;
    ctx.scale(dpr, dpr);
    
    const statusText = document.getElementById('status');
    const scoreUserEl = document.getElementById('score-user');
    const scoreSystemEl = document.getElementById('score-system');

    let gameState = 'POSITIONING'; 
    let score = { host: 0, guest: 0 };
    const hostColor = 'white';
    const guestColor = 'black';
    
    let turnEvents = { pocketedOwn: false, pocketedQueen: false, foul: false };
    let queenStatus = { active: true, pocketedBy: null, needsCover: false };

    const FRICTION = 0.985; 
    const WALL_BOUNCE = 0.8; 
    const MAX_SPEED = 15; 
    const POCKET_RADIUS = 22;
    const pockets = [ {x:25, y:25}, {x:325, y:25}, {x:25, y:325}, {x:325, y:325} ];

    let dragStart = {x: 0, y: 0};
    let currentDrag = {x: 0, y: 0};

    function getPointerPos(e) {
        const currentRect = canvas.getBoundingClientRect();
        const scaleX = 350 / currentRect.width;
        const scaleY = 350 / currentRect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - currentRect.left) * scaleX, y: (clientY - currentRect.top) * scaleY };
    }

    function placeAtCenterSafe(coin) {
        coin.active = true;
        coin.vx = 0; coin.vy = 0;
        let safeX = 175, safeY = 175, overlapping = true, radiusOffset = 0, angleOffset = 0;
        while(overlapping && radiusOffset < 100) {
            safeX = 175 + Math.cos(angleOffset) * radiusOffset;
            safeY = 175 + Math.sin(angleOffset) * radiusOffset;
            overlapping = coins.some(c => c !== coin && c.active && Math.hypot(c.x - safeX, c.y - safeY) < (c.radius + coin.radius + 1.5));
            if(overlapping) {
                angleOffset += Math.PI / 4;
                if(angleOffset >= Math.PI * 2) { angleOffset = 0; radiusOffset += 4; }
            }
        }
        coin.x = safeX; coin.y = safeY;
    }

    class Piece {
        constructor(x, y, radius, color, type) {
            this.x = x; this.y = y; this.radius = radius;
            this.color = color; this.type = type; 
            this.vx = 0; this.vy = 0; this.active = true;
            this.isValid = true;
            this.mass = type === 'striker' ? 3.5 : 1.0; 
        }

        draw() {
            if(!this.active) return;
            if(this.type === 'striker' && !this.isValid && gameState === 'POSITIONING') ctx.globalAlpha = 0.4;

            ctx.shadowBlur = 8; 
            ctx.shadowColor = "rgba(0,0,0,0.4)"; 
            ctx.shadowOffsetX = 2; 
            ctx.shadowOffsetY = 4;
            
            let grad = ctx.createRadialGradient(this.x - this.radius*0.3, this.y - this.radius*0.3, 1, this.x, this.y, this.radius);
            
            if (this.color === 'white') { 
                grad.addColorStop(0, '#ffffff'); 
                grad.addColorStop(0.8, '#e2e8f0'); 
                grad.addColorStop(1, '#cbd5e1'); 
            } else if (this.color === 'black') { 
                grad.addColorStop(0, '#52525b'); 
                grad.addColorStop(0.8, '#27272a'); 
                grad.addColorStop(1, '#09090b'); 
            } else if (this.type === 'queen') { 
                grad.addColorStop(0, '#fef08a'); 
                grad.addColorStop(0.6, '#eab308'); 
                grad.addColorStop(1, '#a16207'); 
            } else { // Striker
                grad.addColorStop(0, '#fca5a5'); 
                grad.addColorStop(0.5, '#ef4444'); 
                grad.addColorStop(1, '#991b1b'); 
            }

            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
            
            // Reset shadow for inner details
            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; 
            
            // Inner rings
            ctx.strokeStyle = this.type === 'striker' ? (!this.isValid && gameState === 'POSITIONING' ? '#ff0000' : '#f87171') : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = this.type === 'striker' ? 2 : 1;
            
            if (this.type === 'striker') {
                ctx.beginPath(); ctx.arc(this.x, this.y, this.radius - 3, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(this.x, this.y, this.radius - 7, 0, Math.PI * 2); ctx.stroke();
                
                // Center dot
                ctx.fillStyle = "#ffffff";
                ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(this.x, this.y, this.radius - 3, 0, Math.PI * 2); ctx.stroke();
                // Inner engraved circle
                ctx.strokeStyle = this.color === 'white' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
                ctx.beginPath(); ctx.arc(this.x, this.y, this.radius - 6, 0, Math.PI * 2); ctx.stroke();
            }
            
            ctx.globalAlpha = 1.0;
        }

        update() {
            if(!this.active) return;
            this.x += this.vx; this.y += this.vy;
            this.vx *= FRICTION; this.vy *= FRICTION;

            let pocketed = false;
            pockets.forEach(p => {
                let threshold = this.type === 'striker' ? 14 : 18; 
                if (Math.hypot(this.x - p.x, this.y - p.y) < threshold) {
                    sounds.playPocket(); 
                    pocketed = true;
                    if (this.type === 'striker') {
                        sounds.playFoul(); 
                        this.vx = 0; this.vy = 0; this.x = -100; this.y = -100; 
                        turnEvents.foul = true;
                    } else {
                        this.active = false;
                        let playerColor = onlineTurn === 'host' ? hostColor : guestColor;
                        if (this.type === 'queen') {
                            turnEvents.pocketedQueen = true;
                            queenStatus.active = false;
                            queenStatus.pocketedBy = onlineTurn;
                            queenStatus.needsCover = true;
                        } else if (this.type === playerColor) {
                            turnEvents.pocketedOwn = true;
                        }
                    }
                }
            });

            if (pocketed) return; 

            if (this.x - this.radius < 0) { sounds.playWall(this.vx); this.x = this.radius; this.vx *= -WALL_BOUNCE; }
            if (this.x + this.radius > 350) { sounds.playWall(this.vx); this.x = 350 - this.radius; this.vx *= -WALL_BOUNCE; }
            if (this.y - this.radius < 0) { sounds.playWall(this.vy); this.y = this.radius; this.vy *= -WALL_BOUNCE; }
            if (this.y + this.radius > 350) { sounds.playWall(this.vy); this.y = 350 - this.radius; this.vy *= -WALL_BOUNCE; }

            if (Math.abs(this.vx) < 0.05) this.vx = 0;
            if (Math.abs(this.vy) < 0.05) this.vy = 0;
        }
    }

    const striker = new Piece(175, 290, 14, '#e74c3c', 'striker');
    let coins = [];

    function initCoins() {
        const cx = 175, cy = 175;
        coins = [];
        coins.push(new Piece(cx, cy, 11, 'queen', 'queen'));
        for(let i=0; i<6; i++) {
            let angle = (i * Math.PI) / 3;
            let type = i % 2 === 0 ? 'white' : 'black';
            coins.push(new Piece(cx + Math.cos(angle)*24, cy + Math.sin(angle)*24, 11, type, type));
        }
        for(let i=0; i<12; i++) {
            let angle = (i * Math.PI) / 6;
            let type = i % 2 === 0 ? 'black' : 'white';
            coins.push(new Piece(cx + Math.cos(angle)*46, cy + Math.sin(angle)*46, 11, type, type));
        }
    }

    function updateScores() {
        let hostCoins = 9 - coins.filter(c => c.type === 'white' && c.active).length;
        let guestCoins = 9 - coins.filter(c => c.type === 'black' && c.active).length;
        
        score.host = hostCoins + (!queenStatus.active && queenStatus.pocketedBy === 'host' && !queenStatus.needsCover ? 3 : 0);
        score.guest = guestCoins + (!queenStatus.active && queenStatus.pocketedBy === 'guest' && !queenStatus.needsCover ? 3 : 0);
        
        if (myRole === 'host') {
            scoreUserEl.innerText = score.host;
            scoreSystemEl.innerText = score.guest;
        } else {
            scoreUserEl.innerText = score.guest;
            scoreSystemEl.innerText = score.host;
        }
    }

    function drawBoardUI() {
        let bgGrad = ctx.createLinearGradient(0, 0, 350, 350);
        bgGrad.addColorStop(0, '#e8c396'); 
        bgGrad.addColorStop(0.5, '#dcb282'); 
        bgGrad.addColorStop(1, '#c89b68');
        ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, 350, 350);
        
        const lineColor = "rgba(0, 0, 0, 0.6)";
        const redColor = "#dc2626";

        pockets.forEach(p => { 
            let pGrad = ctx.createRadialGradient(p.x, p.y, POCKET_RADIUS * 0.2, p.x, p.y, POCKET_RADIUS);
            pGrad.addColorStop(0, '#000000'); pGrad.addColorStop(0.8, '#111'); pGrad.addColorStop(1, '#222');
            ctx.fillStyle = pGrad;
            ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2); ctx.fill(); 
            ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_RADIUS + 1, 0, Math.PI * 2); ctx.stroke();
        });
        
        ctx.strokeStyle = lineColor; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(45,45); ctx.lineTo(100,100); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(305,45); ctx.lineTo(250,100); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(45,305); ctx.lineTo(100,250); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(305,305); ctx.lineTo(250,250); ctx.stroke();

        const drawCornerArc = (x, y, startAngle, endAngle) => {
            ctx.beginPath(); ctx.arc(x, y, 25, startAngle, endAngle); ctx.stroke();
        };
        drawCornerArc(100, 100, Math.PI, Math.PI * 1.5);
        drawCornerArc(250, 100, Math.PI * 1.5, Math.PI * 2);
        drawCornerArc(100, 250, Math.PI * 0.5, Math.PI);
        drawCornerArc(250, 250, 0, Math.PI * 0.5);

        ctx.beginPath(); ctx.arc(175, 175, 50, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(175, 175, 55, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(175, 175, 12, 0, Math.PI * 2); 
        ctx.fillStyle = redColor; ctx.fill(); ctx.stroke();
        
        for(let i=0; i<8; i++) {
            let angle = (i * Math.PI) / 4;
            ctx.beginPath(); 
            ctx.moveTo(175 + Math.cos(angle)*12, 175 + Math.sin(angle)*12); 
            ctx.lineTo(175 + Math.cos(angle)*50, 175 + Math.sin(angle)*50); 
            ctx.stroke();
        }
        
        const drawBaseLine = (x1, y1, x2, y2, isRedLeft) => {
            ctx.strokeStyle = lineColor; ctx.lineWidth = 1;
            if (y1 === y2) { 
                ctx.beginPath(); ctx.moveTo(x1, y1 - 10); ctx.lineTo(x2, y2 - 10); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x1, y1 + 10); ctx.lineTo(x2, y2 + 10); ctx.stroke();
                ctx.beginPath(); ctx.arc(x1, y1, 10, 0, Math.PI*2); ctx.fillStyle = isRedLeft ? redColor : 'transparent'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(x2, y2, 10, 0, Math.PI*2); ctx.fillStyle = !isRedLeft ? redColor : 'transparent'; ctx.fill(); ctx.stroke();
            } else { 
                ctx.beginPath(); ctx.moveTo(x1 - 10, y1); ctx.lineTo(x2 - 10, y2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x1 + 10, y1); ctx.lineTo(x2 + 10, y2); ctx.stroke();
                ctx.beginPath(); ctx.arc(x1, y1, 10, 0, Math.PI*2); ctx.fillStyle = isRedLeft ? redColor : 'transparent'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(x2, y2, 10, 0, Math.PI*2); ctx.fillStyle = !isRedLeft ? redColor : 'transparent'; ctx.fill(); ctx.stroke();
            }
        };

        drawBaseLine(75, 55, 275, 55, true); 
        drawBaseLine(75, 295, 275, 295, true); 
        drawBaseLine(55, 75, 55, 275, true); 
        drawBaseLine(295, 75, 295, 275, true); 
    }

    function drawAimLine() {
        let isMyAim = (gameState === 'AIMING' && onlineTurn === myRole);
        let isOppAim = (onlineTurn !== myRole && opponentAiming);

        if (isMyAim || isOppAim) {
            const dx = isMyAim ? dragStart.x - currentDrag.x : oppDragStart.x - oppCurrentDrag.x;
            const dy = isMyAim ? dragStart.y - currentDrag.y : oppDragStart.y - oppCurrentDrag.y;
            
            let visualMag = Math.min(120, Math.hypot(dx, dy)); 
            let normX = dx === 0 ? 0 : dx / Math.hypot(dx, dy);
            let normY = dy === 0 ? 0 : dy / Math.hypot(dx, dy);
            
            ctx.beginPath(); ctx.moveTo(striker.x, striker.y); ctx.lineTo(striker.x + normX * visualMag * 1.5, striker.y + normY * visualMag * 1.5);
            
            let colorCode = isMyAim ? "255, 255, 255" : "239, 68, 68"; 
            let lineGrad = ctx.createLinearGradient(striker.x, striker.y, striker.x + normX * visualMag * 1.5, striker.y + normY * visualMag * 1.5);
            lineGrad.addColorStop(0, `rgba(${colorCode}, 0.1)`); lineGrad.addColorStop(1, `rgba(${colorCode}, 0.9)`);
            
            ctx.strokeStyle = lineGrad; ctx.lineWidth = 3.5; ctx.stroke(); 
            
            ctx.beginPath(); ctx.arc(striker.x + normX * visualMag * 1.5, striker.y + normY * visualMag * 1.5, 4, 0, Math.PI*2);
            ctx.fillStyle = isMyAim ? "white" : "#ef4444"; 
            ctx.shadowBlur = 10; ctx.shadowColor = isMyAim ? "white" : "#ef4444"; 
            ctx.fill(); ctx.shadowBlur = 0;
        }
    }

    function handleCollisions() {
        let activePieces = [...coins.filter(c => c.active)];
        if (gameState === 'MOVING') activePieces.push(striker);

        for (let i = 0; i < activePieces.length; i++) {
            for (let j = i + 1; j < activePieces.length; j++) {
                let p1 = activePieces[i], p2 = activePieces[j];
                let dx = p2.x - p1.x, dy = p2.y - p1.y;
                let dist = Math.hypot(dx, dy);
                let minDist = p1.radius + p2.radius;

                if (dist === 0) { dx = 0.1; dy = 0.1; dist = Math.hypot(dx, dy); }

                if (dist < minDist) { 
                    let overlap = minDist - dist;
                    let nx = dx / dist, ny = dy / dist;
                    let totalMass = p1.mass + p2.mass;
                    let ratio1 = p2.mass / totalMass, ratio2 = p1.mass / totalMass;
                    
                    p1.x -= nx * overlap * ratio1; p1.y -= ny * overlap * ratio1;
                    p2.x += nx * overlap * ratio2; p2.y += ny * overlap * ratio2;
                    
                    let kx = p1.vx - p2.vx, ky = p1.vy - p2.vy;
                    let dotProduct = nx * kx + ny * ky;
                    
                    if (dotProduct > 0) {
                        let restitution = 0.9; 
                        let impulse = (1 + restitution) * dotProduct / ((1 / p1.mass) + (1 / p2.mass));
                        sounds.playHit(impulse); 
                        p1.vx -= (impulse / p1.mass) * nx; p1.vy -= (impulse / p1.mass) * ny;
                        p2.vx += (impulse / p2.mass) * nx; p2.vy += (impulse / p2.mass) * ny;
                    }
                }
            }
        }
    }

    function syncBoardToFirebase(nextTurn) {
        if(gameMode === 'single' || myRole !== 'host') return; 
        const boardState = coins.map(c => ({x: c.x, y: c.y, vx: c.vx, vy: c.vy, active: c.active}));
        
        let syncData = {
            coins: boardState,
            queenStatus: queenStatus,
            turn: nextTurn,
            gameState: gameState,
            hostScore: score.host,
            guestScore: score.guest,
            timestamp: Date.now()
        };
        
        if (statusText.innerText.includes('Foul')) {
            syncData.statusText = statusText.innerText;
            syncData.statusColor = statusText.style.color;
        }
        
        update(ref(db, `rooms/${currentRoom}/sync`), syncData);
    }

    function endTurnLogic() {
        if (turnEvents.foul) {
            let pColor = onlineTurn === 'host' ? hostColor : guestColor;
            let pocketedPCoins = coins.filter(c => c.type === pColor && !c.active);
            if (pocketedPCoins.length > 0) placeAtCenterSafe(pocketedPCoins[0]);
            statusText.innerText = "Foul! Penalty Applied.";
            statusText.style.color = "var(--danger)";
        }

        if (queenStatus.needsCover) {
            if (turnEvents.pocketedOwn) {
                queenStatus.needsCover = false; 
            } else if (!turnEvents.pocketedQueen) {
                let qCoin = coins.find(c => c.type === 'queen');
                placeAtCenterSafe(qCoin);
                queenStatus.active = true; queenStatus.pocketedBy = null; queenStatus.needsCover = false;
            }
        }

        updateScores();

        let hostCoinsLeft = coins.filter(c => c.type === 'white' && c.active).length;
        let guestCoinsLeft = coins.filter(c => c.type === 'black' && c.active).length;
        
        if (hostCoinsLeft === 0 || guestCoinsLeft === 0) {
            gameState = 'GAMEOVER';
            let winner;
            if (queenStatus.active || queenStatus.needsCover) {
                winner = hostCoinsLeft === 0 ? "Black Wins (Foul)!" : "White Wins (Foul)!";
            } else {
                winner = hostCoinsLeft === 0 ? "White Wins!" : "Black Wins!";
            }
            
            saveHistory(winner, score.host, score.guest);
            
            statusText.innerText = `GAME OVER`;
            statusText.style.color = "var(--accent)";
            document.getElementById('go-text').innerText = winner;
            document.getElementById('game-over-overlay').style.display = 'flex';
            
            if(gameMode === 'multi' && myRole === 'host') syncBoardToFirebase(onlineTurn);
            return;
        }

        let keepTurn = (turnEvents.pocketedOwn || turnEvents.pocketedQueen) && !turnEvents.foul;
        
        if (!keepTurn) { onlineTurn = onlineTurn === 'host' ? 'guest' : 'host'; }

        let hadFoul = turnEvents.foul;
        turnEvents = { pocketedOwn: false, pocketedQueen: false, foul: false };
        gameState = 'POSITIONING';
        resetStrikerForTurn(hadFoul);

        if (hadFoul) {
            setTimeout(() => {
                if (gameState === 'POSITIONING') {
                    resetStrikerForTurn(false);
                }
            }, 2000);
        }

        if(gameMode === 'multi' && myRole === 'host') syncBoardToFirebase(onlineTurn);
    }

    function resetStrikerForTurn(keepStatusText = false) {
        striker.vx = 0; striker.vy = 0; striker.isValid = true;
        
        const userBox = document.querySelector('.user-box');
        const systemBox = document.querySelector('.system-box');
        
        if (onlineTurn === myRole) {
            userBox?.classList.add('active-turn');
            systemBox?.classList.remove('active-turn');
        } else {
            userBox?.classList.remove('active-turn');
            systemBox?.classList.add('active-turn');
        }

        if (onlineTurn === myRole) {
            striker.y = 295; striker.x = 175; 
            if (!keepStatusText) {
                statusText.innerText = "Your Turn";
                statusText.style.color = "var(--success)";
            }
        } else {
            striker.y = 55; striker.x = 175; 
            if (!keepStatusText) {
                statusText.innerText = gameMode === 'single' ? "AI's Turn" : "Opponent's Turn";
                statusText.style.color = "var(--text-muted)";
            }
        }
    }

    function playAITurn() {
        if (aiThinking || gameState !== 'POSITIONING') return;
        aiThinking = true;

        setTimeout(() => {
            if (gameState !== 'POSITIONING') {
                aiThinking = false;
                return;
            }

            // 1. Find target
            let targets = coins.filter(c => c.active && (c.type === 'black' || c.type === 'queen'));
            if (targets.length === 0) targets = coins.filter(c => c.active); // Fallback
            
            if (targets.length > 0) {
                let target = targets[Math.floor(Math.random() * targets.length)];
                let pocket = pockets[Math.floor(Math.random() * pockets.length)];
                
                // Simple aiming math
                let dx = pocket.x - target.x;
                let dy = pocket.y - target.y;
                let dist = Math.hypot(dx, dy);
                let nx = dx / dist;
                let ny = dy / dist;
                
                // Hit point on the coin
                let hitX = target.x - nx * (target.radius + striker.radius);
                let hitY = target.y - ny * (target.radius + striker.radius);
                
                // Place striker
                striker.x = Math.max(75, Math.min(275, hitX));
                striker.y = 55; // AI is guest, plays from top
                
                // Calculate shot vector
                let shotDx = hitX - striker.x;
                let shotDy = hitY - striker.y;
                let shotDist = Math.hypot(shotDx, shotDy);
                
                let power = 13; // Base power
                let svx = (shotDx / shotDist) * power;
                let svy = (shotDy / shotDist) * power;
                
                // Apply difficulty noise
                let noiseLevel = aiDifficulty === 'easy' ? 3.5 : (aiDifficulty === 'medium' ? 1.5 : 0.2);
                svx += (Math.random() * noiseLevel * 2) - noiseLevel;
                svy += (Math.random() * noiseLevel * 2) - noiseLevel;
                
                striker.vx = svx;
                striker.vy = svy;
                gameState = 'MOVING';
            }
            aiThinking = false;
        }, 1200); // 1.2s delay for realism
    }

    function gameLoop() {
        if (gameState === 'GAMEOVER' || !currentRoom) return requestAnimationFrame(gameLoop);

        if (gameState === 'POSITIONING') {
            striker.isValid = coins.every(c => !c.active || Math.hypot(c.x - striker.x, c.y - striker.y) > striker.radius + c.radius);
        }

        if (gameState === 'GAMEOVER') return;

        ctx.clearRect(0, 0, 350, 350);
        drawBoardUI();
        
        let anyMoving = false;
        striker.update();
        if(Math.abs(striker.vx) > 0 || Math.abs(striker.vy) > 0) anyMoving = true;
        
        coins.forEach(c => { 
            c.update(); 
            if(c.active && (Math.abs(c.vx) > 0 || Math.abs(c.vy) > 0)) anyMoving = true;
        });

        handleCollisions();
        drawAimLine();
        
        coins.forEach(c => c.draw());
        striker.draw();

        if (gameState === 'MOVING' && !anyMoving) {
            if (!(gameMode === 'multi' && myRole === 'guest')) {
                endTurnLogic();
            }
        }

        if (gameMode === 'single' && onlineTurn === 'guest' && gameState === 'POSITIONING' && !aiThinking) {
            playAITurn();
        }

        requestAnimationFrame(gameLoop);
    }

    function handleStart(e) {
        initAudio(); 
        if(e.cancelable && e.type.startsWith('touch')) e.preventDefault(); 
        if(onlineTurn !== myRole || gameState === 'MOVING' || gameState === 'GAMEOVER') return;
        const pos = getPointerPos(e);
        if (Math.hypot(pos.x - striker.x, pos.y - striker.y) < striker.radius + 15) {
            gameState = 'POSITIONING';
        } else {
            if (striker.isValid === false) return; 
            gameState = 'AIMING'; dragStart = pos; currentDrag = pos;
            if (gameMode === 'multi') {
                set(ref(db, `rooms/${currentRoom}/aim`), { dragStart: dragStart, currentDrag: currentDrag, isAiming: true });
            }
        }
    }

    function handleMove(e) {
        if(onlineTurn !== myRole || gameState === 'MOVING' || gameState === 'GAMEOVER') return;
        if(e.cancelable && e.type.startsWith('touch')) e.preventDefault(); 
        const pos = getPointerPos(e);
        if (gameState === 'POSITIONING') {
            striker.x = Math.max(75, Math.min(275, pos.x));
            if (gameMode === 'multi') {
                set(ref(db, `rooms/${currentRoom}/preShot`), { x: striker.x, y: striker.y });
            }
        } else if (gameState === 'AIMING') {
            currentDrag = pos;
            if (gameMode === 'multi') {
                set(ref(db, `rooms/${currentRoom}/aim`), { dragStart: dragStart, currentDrag: currentDrag, isAiming: true });
            }
        }
    }

    function handleEnd(e) {
        if(onlineTurn !== myRole || gameState === 'MOVING' || gameState === 'GAMEOVER') return;
        if (gameState === 'AIMING') {
            if (gameMode === 'multi') {
                set(ref(db, `rooms/${currentRoom}/aim`), { isAiming: false });
            }
            
            const dx = dragStart.x - currentDrag.x;
            const dy = dragStart.y - currentDrag.y;
            let powerX = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, dx * 0.08));
            let powerY = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, dy * 0.08));
            
            if(Math.hypot(powerX, powerY) > 1.5) {
                striker.vx = powerX; striker.vy = powerY;
                gameState = 'MOVING';
                
                if (gameMode === 'multi') {
                    set(ref(db, `rooms/${currentRoom}/shot`), {
                        x: striker.x, y: striker.y, vx: striker.vx, vy: striker.vy, timestamp: Date.now()
                    });
                }
                
            } else {
                gameState = 'POSITIONING';
            }
        }
    }

    canvas.addEventListener('touchstart', handleStart, {passive: false});
    canvas.addEventListener('touchmove', handleMove, {passive: false});
    canvas.addEventListener('touchend', handleEnd);
    window.addEventListener('touchend', handleEnd); 
    
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    const lobbyEl = document.getElementById('lobby');
    const errorText = document.getElementById('lobby-error');

    document.getElementById('btn-rematch').addEventListener('click', () => {
        if (gameMode === 'single') {
            document.getElementById('game-over-overlay').style.display = 'none';
            initCoins();
            score = { host: 0, guest: 0 };
            queenStatus = { active: true, pocketedBy: null, needsCover: false };
            turnEvents = { pocketedOwn: false, pocketedQueen: false, foul: false };
            onlineTurn = 'host';
            opponentAiming = false;
            aiThinking = false;
            gameState = 'POSITIONING';
            resetStrikerForTurn();
            updateScores();
        } else {
            update(ref(db, `rooms/${currentRoom}`), { reset: Date.now() });
        }
    });

    document.getElementById('btn-history').addEventListener('click', showHistory);
    document.getElementById('btn-close-history').addEventListener('click', () => {
        document.getElementById('history-modal').style.display = 'none';
    });

    document.getElementById('btn-single').addEventListener('click', () => {
        initAudio();
        gameMode = 'single';
        aiDifficulty = document.querySelector('input[name="difficulty"]:checked').value;
        myRole = 'host';
        currentRoom = 'local';
        startGame();
    });

    // --- COMMS SYSTEM ---
    let localStream;
    let peer;
    let isMicMuted = true;

    function secureRoomSetup(code) {
        const roomRef = ref(db, `rooms/${code}`);
        if (myRole === 'host') {
            // We removed onDisconnect(roomRef).remove() here to prevent auto-leaving
            // when the user briefly loses connection (e.g., app goes to background).
            // wipeRoomData() handles cleanup when the game ends.
        }
    }

    function wipeRoomData() {
        if (myRole === 'host' && currentRoom && currentRoom !== 'local') {
            remove(ref(db, `rooms/${currentRoom}/chat`));
            remove(ref(db, `rooms/${currentRoom}/voiceId`));
            remove(ref(db, `rooms/${currentRoom}`));
            console.log("Room data wiped for security.");
        }
    }

    const handleUnload = () => {
        wipeRoomData();
    };
    window.addEventListener('beforeunload', handleUnload);

    async function requestMicAccess() {
        if (localStream) return;
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn("getUserMedia is not supported in this browser.");
                return;
            }
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (localStream.getAudioTracks().length > 0) {
                localStream.getAudioTracks()[0].enabled = false; // Muted by default
            }
        } catch (err) {
            console.warn("Mic Access Denied or Error:", err.message || err);
        }
    }

    function initChat() {
        if (gameMode !== 'multi') return;
        const commsPanel = document.getElementById('comms-panel');
        if (commsPanel) commsPanel.style.display = 'flex';
        const chatRef = ref(db, `rooms/${currentRoom}/chat`);
        const messagesDiv = document.getElementById('chat-messages');
        if (messagesDiv) messagesDiv.innerHTML = '';

        const btnSend = document.getElementById('btn-send');
        if (btnSend) {
            // Remove old listeners to prevent duplicates
            const newBtnSend = btnSend.cloneNode(true);
            btnSend.parentNode.replaceChild(newBtnSend, btnSend);
            
            newBtnSend.addEventListener('click', () => {
                const input = document.getElementById('chat-input');
                const text = input.value.trim();
                if (text) {
                    push(chatRef, { sender: myRole, text: text, timestamp: Date.now() });
                    input.value = '';
                }
            });

            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                const newChatInput = chatInput.cloneNode(true);
                chatInput.parentNode.replaceChild(newChatInput, chatInput);
                newChatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const text = newChatInput.value.trim();
                        if (text) {
                            push(chatRef, { sender: myRole, text: text, timestamp: Date.now() });
                            newChatInput.value = '';
                        }
                    }
                });
            }
        }

        const unsubChat = onChildAdded(chatRef, (snapshot) => {
            const msg = snapshot.val();
            const msgEl = document.createElement('div');
            const isMe = msg.sender === myRole;
            
            msgEl.style.alignSelf = isMe ? 'flex-end' : 'flex-start';
            msgEl.style.background = isMe ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'rgba(255,255,255,0.1)';
            msgEl.style.color = isMe ? '#020617' : 'white';
            msgEl.style.padding = '8px 12px';
            msgEl.style.borderRadius = isMe ? '12px 12px 0 12px' : '12px 12px 12px 0';
            msgEl.innerText = msg.text;
            
            const msgsDiv = document.getElementById('chat-messages');
            if (msgsDiv) {
                msgsDiv.appendChild(msgEl);
                msgsDiv.scrollTop = msgsDiv.scrollHeight;
            }
        });
        gameUnsubscribes.push(unsubChat);
    }

    function monitorAudioLevel(stream, elementId) {
        if (!stream || stream.getAudioTracks().length === 0) return;
        
        const el = document.getElementById(elementId);
        if (!el) return;
        
        el.style.display = 'inline-block';
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            function update() {
                if (!isGameRunning) {
                    el.style.display = 'none';
                    return;
                }
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for(let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                let average = sum / bufferLength;
                
                // If average > 10, user is speaking
                if (average > 10) {
                    const scale = 1 + (average / 256) * 0.5;
                    el.style.transform = `scale(${scale})`;
                    el.style.opacity = '1';
                } else {
                    el.style.transform = `scale(1)`;
                    el.style.opacity = '0.5';
                }
                
                requestAnimationFrame(update);
            }
            update();
        } catch (e) {
            console.warn("Audio monitoring failed:", e);
        }
    }

    async function initVoiceChat() {
        if (gameMode !== 'multi') return;
        
        const micBtn = document.getElementById('btn-mic-toggle');
        
        if (!localStream) {
            console.warn("Mic Access was denied or failed earlier.");
            if (micBtn) {
                micBtn.innerText = "🚫 Mic Denied";
                micBtn.style.background = "rgba(239, 68, 68, 0.9)";
                micBtn.style.color = "white";
                micBtn.disabled = true;
                micBtn.style.cursor = "not-allowed";
                micBtn.style.opacity = "0.7";
            }
        } else {
            monitorAudioLevel(localStream, 'local-mic-indicator');
            if (micBtn) {
                const newMicBtn = micBtn.cloneNode(true);
                micBtn.parentNode.replaceChild(newMicBtn, micBtn);
                
                newMicBtn.addEventListener('click', () => {
                    if (!localStream || localStream.getAudioTracks().length === 0) return;
                    isMicMuted = !isMicMuted;
                    localStream.getAudioTracks()[0].enabled = !isMicMuted;
                    newMicBtn.innerText = isMicMuted ? '🎤 Mic Off' : '🎤 Mic On';
                    newMicBtn.style.background = isMicMuted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(74, 222, 128, 0.9)';
                    newMicBtn.style.color = isMicMuted ? 'white' : '#020617';
                    
                    const localMicInd = document.getElementById('local-mic-indicator');
                    if (localMicInd) {
                        localMicInd.style.display = isMicMuted ? 'none' : 'inline-block';
                    }
                });
            }
        }

        try {
            peer = new window.Peer(); 

            peer.on('error', (err) => {
                console.error("PeerJS Error:", err);
            });

            peer.on('open', (id) => {
                if (myRole === 'host') {
                    set(ref(db, `rooms/${currentRoom}/voiceId`), id);
                }
            });

            peer.on('call', (call) => {
                if (localStream) {
                    call.answer(localStream); 
                } else {
                    const ctx = new AudioContext();
                    const dest = ctx.createMediaStreamDestination();
                    call.answer(dest.stream);
                }
                call.on('stream', (remoteStream) => {
                    const remoteAudio = document.getElementById('remote-audio');
                    if (remoteAudio) {
                        remoteAudio.srcObject = remoteStream;
                        remoteAudio.play().catch(e => console.error("Audio play error:", e));
                        monitorAudioLevel(remoteStream, 'remote-mic-indicator');
                    }
                });
            });

            if (myRole === 'guest') {
                const unsubscribe = onValue(ref(db, `rooms/${currentRoom}/voiceId`), (snapshot) => {
                    const hostVoiceId = snapshot.val();
                    if (hostVoiceId) {
                        let streamToUse = localStream;
                        if (!streamToUse) {
                            const ctx = new AudioContext();
                            const dest = ctx.createMediaStreamDestination();
                            streamToUse = dest.stream;
                        }
                        const call = peer.call(hostVoiceId, streamToUse);
                        call.on('stream', (remoteStream) => {
                            const remoteAudio = document.getElementById('remote-audio');
                            if (remoteAudio) {
                                remoteAudio.srcObject = remoteStream;
                                remoteAudio.play().catch(e => console.error("Audio play error:", e));
                                monitorAudioLevel(remoteStream, 'remote-mic-indicator');
                            }
                        });
                        unsubscribe();
                    }
                });
            }

        } catch (err) {
            console.error("PeerJS Initialization Error:", err);
        }
    }

    if (window.location.protocol === 'file:') {
        errorText.innerText = "WARNING: Multiplayer requires a local server (like Live Server) to bypass CORS issues.";
    }
    
    // Username handling
    const inputUsername = document.getElementById('input-username');
    if (inputUsername) {
        inputUsername.value = myName;
    }
    
    document.getElementById('btn-settings').addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'flex';
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'none';
    });
    
    document.getElementById('btn-save-name').addEventListener('click', () => {
        const newName = document.getElementById('input-username').value.trim();
        if (newName) {
            myName = newName;
            localStorage.setItem('carrom_user_name', myName);
            updatePresence(isGameRunning ? 'in-game' : 'online');
            const btn = document.getElementById('btn-save-name');
            btn.innerText = "Saved!";
            btn.style.background = "var(--success)";
            setTimeout(() => {
                btn.innerText = "Save Name";
                btn.style.background = "rgba(255, 255, 255, 0.1)";
            }, 2000);
        }
    });

    document.getElementById('btn-create').addEventListener('click', async () => {
        initAudio();
        await requestMicAccess();
        gameMode = 'multi';
        
        const btnCreate = document.getElementById('btn-create');
        const originalText = btnCreate.innerText;
        btnCreate.innerText = "Creating...";
        btnCreate.disabled = true;
        errorText.innerText = "";
        
        try {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            currentRoom = code;
            myRole = 'host';
            secureRoomSetup(code);
            
            await set(ref(db, `rooms/${code}`), { status: 'waiting', turn: 'host', hostId: myUserId });
            
            document.getElementById('panel-main').style.display = 'none';
            document.getElementById('panel-waiting').style.display = 'block';
            document.getElementById('room-code-display').innerText = code;
            errorText.innerText = "";

            onValue(ref(db, `rooms/${code}/status`), (snapshot) => {
                if(snapshot.val() === 'playing') startGame();
            });
        } catch (err) {
            errorText.innerText = "Firebase Error. Please check your console.";
            console.error(err);
        } finally {
            btnCreate.innerText = originalText;
            btnCreate.disabled = false;
        }
    });

    document.getElementById('btn-join').addEventListener('click', async () => {
        initAudio();
        await requestMicAccess();
        gameMode = 'multi';
        const code = document.getElementById('input-room').value.toUpperCase();
        if(!code) {
            errorText.innerText = "Please enter a valid code.";
            return;
        }
        
        const btnJoin = document.getElementById('btn-join');
        const originalText = btnJoin.innerText;
        btnJoin.innerText = "Joining...";
        btnJoin.disabled = true;
        errorText.innerText = "";
        
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snapshot = await get(roomRef);
            
            if(snapshot.exists() && snapshot.val().status === 'waiting') {
                currentRoom = code;
                myRole = 'guest';
                await update(roomRef, { status: 'playing', guestId: myUserId });
                startGame();
            } else {
                errorText.innerText = "Room not found or already full.";
            }
        } catch (err) {
            errorText.innerText = "Connection Error. Please check database permissions.";
            console.error(err);
        } finally {
            btnJoin.innerText = originalText;
            btnJoin.disabled = false;
        }
    });

    function startGame() {
        if (isGameRunning) return; 
        cleanupGameListeners();
        isGameRunning = true; 
        updatePresence('in-game');
        
        initChat();
        initVoiceChat();
        
        lobbyEl.style.display = 'none';
        initCoins();
        
        if (myRole === 'host') {
            document.querySelector('.user-box .score-text').innerText = `${myName} (White)`;
            if (gameMode === 'multi' && currentRoom) {
                get(ref(db, `rooms/${currentRoom}`)).then(snap => {
                    if (snap.exists() && snap.val().guestId) {
                        get(ref(db, `online_users/${snap.val().guestId}`)).then(guestSnap => {
                            const guestName = guestSnap.exists() && guestSnap.val().name ? guestSnap.val().name : "Opponent";
                            document.querySelector('.system-box .score-text').innerText = `${guestName} (Black)`;
                        });
                    }
                });
            } else {
                document.querySelector('.system-box .score-text').innerText = "AI (Black)";
            }
        } else {
            document.querySelector('.user-box .score-text').innerText = `${myName} (Black)`;
            if (currentRoom) {
                get(ref(db, `rooms/${currentRoom}`)).then(snap => {
                    if (snap.exists() && snap.val().hostId) {
                        get(ref(db, `online_users/${snap.val().hostId}`)).then(hostSnap => {
                            const hostName = hostSnap.exists() && hostSnap.val().name ? hostSnap.val().name : "Opponent";
                            document.querySelector('.system-box .score-text').innerText = `${hostName} (White)`;
                        });
                    }
                });
            }
        }

        if (myRole === 'guest') {
            coins.forEach(c => { c.x = 350 - c.x; c.y = 350 - c.y; });
        }

        updateScores();
        resetStrikerForTurn();
        
        if (gameMode === 'multi') {
            gameUnsubscribes.push(onValue(ref(db, `rooms/${currentRoom}/preShot`), (snap) => {
                if(snap.exists() && onlineTurn !== myRole && gameState === 'POSITIONING') {
                    striker.x = 350 - snap.val().x; 
                    striker.y = 350 - snap.val().y;
                }
            }));

            gameUnsubscribes.push(onValue(ref(db, `rooms/${currentRoom}/aim`), (snap) => {
                const data = snap.val();
                if(data && onlineTurn !== myRole) {
                    opponentAiming = data.isAiming;
                    if(data.isAiming) {
                        oppDragStart.x = 350 - data.dragStart.x;
                        oppDragStart.y = 350 - data.dragStart.y;
                        oppCurrentDrag.x = 350 - data.currentDrag.x;
                        oppCurrentDrag.y = 350 - data.currentDrag.y;
                    }
                }
            }));

            gameUnsubscribes.push(onValue(ref(db, `rooms/${currentRoom}/reset`), (snap) => {
                if(snap.exists()) {
                    document.getElementById('game-over-overlay').style.display = 'none';
                    initCoins();
                    if (myRole === 'guest') {
                        coins.forEach(c => { c.x = 350 - c.x; c.y = 350 - c.y; });
                    }
                    score = { host: 0, guest: 0 };
                    queenStatus = { active: true, pocketedBy: null, needsCover: false };
                    turnEvents = { pocketedOwn: false, pocketedQueen: false, foul: false };
                    onlineTurn = 'host';
                    opponentAiming = false;
                    gameState = 'POSITIONING';
                    resetStrikerForTurn();
                    updateScores();
                }
            }));

            gameUnsubscribes.push(onValue(ref(db, `rooms/${currentRoom}/shot`), (snap) => {
                const data = snap.val();
                if(data && onlineTurn !== myRole) {
                    striker.x = 350 - data.x; 
                    striker.y = 350 - data.y;
                    striker.vx = -data.vx; 
                    striker.vy = -data.vy;
                    gameState = 'MOVING';
                }
            }));

            if(myRole === 'guest') {
                gameUnsubscribes.push(onValue(ref(db, `rooms/${currentRoom}/sync`), (snap) => {
                    const data = snap.val();
                    if(data && data.coins && data.coins.length === coins.length) {
                        data.coins.forEach((cData, i) => {
                            coins[i].x = 350 - cData.x; 
                            coins[i].y = 350 - cData.y; 
                            coins[i].vx = -cData.vx; 
                            coins[i].vy = -cData.vy; 
                            coins[i].active = cData.active;
                        });
                        queenStatus = data.queenStatus;
                        onlineTurn = data.turn;
                        gameState = data.gameState || 'POSITIONING';
                        
                        if (data.statusText) {
                            const st = document.getElementById('status');
                            if (st) {
                                st.innerText = data.statusText;
                                st.style.color = data.statusColor || 'var(--accent)';
                            }
                        }
                        
                        updateScores();

                        if (gameState === 'GAMEOVER') {
                            let hostCoinsLeft = coins.filter(c => c.type === 'white' && c.active).length;
                            let guestCoinsLeft = coins.filter(c => c.type === 'black' && c.active).length;
                            let winner;
                            if (queenStatus.active || queenStatus.needsCover) {
                                winner = hostCoinsLeft === 0 ? "Black Wins (Foul)!" : "White Wins (Foul)!";
                            } else {
                                winner = hostCoinsLeft === 0 ? "White Wins!" : "Black Wins!";
                            }
                            
                            saveHistory(winner, score.host, score.guest);
                            
                            statusText.innerText = `GAME OVER`;
                            statusText.style.color = "var(--accent)";
                            document.getElementById('go-text').innerText = winner;
                            document.getElementById('game-over-overlay').style.display = 'flex';
                            return;
                        }

                        if (data.statusText) {
                            statusText.innerText = data.statusText;
                            statusText.style.color = data.statusColor || 'var(--text-main)';
                            resetStrikerForTurn(true);
                            setTimeout(() => {
                                if (gameState === 'POSITIONING') {
                                    resetStrikerForTurn(false);
                                }
                            }, 2000);
                        } else {
                            resetStrikerForTurn();
                        }
                    }
                }));
            }

            // Listen for opponent disconnect
            let opponentDisconnectTimeout = null;
            let oppPresenceUnsubscribe = null;
            
            gameUnsubscribes.push(onValue(ref(db, `rooms/${currentRoom}`), (snap) => {
                if (!snap.exists() && isGameRunning) {
                    alert("Opponent has left the game.");
                    isGameRunning = false;
                    cleanupGameListeners();
                    updatePresence('online');
                    document.getElementById('lobby').style.display = 'flex';
                    document.getElementById('panel-main').style.display = 'block';
                    document.getElementById('panel-waiting').style.display = 'none';
                    currentRoom = null;
                    if (oppPresenceUnsubscribe) {
                        oppPresenceUnsubscribe();
                        oppPresenceUnsubscribe = null;
                    }
                } else if (snap.exists() && isGameRunning) {
                    const roomData = snap.val();
                    const oppId = myRole === 'host' ? roomData.guestId : roomData.hostId;
                    
                    if (oppId && !oppPresenceUnsubscribe) {
                        oppPresenceUnsubscribe = onValue(ref(db, `online_users/${oppId}`), (presenceSnap) => {
                            if (!presenceSnap.exists() && isGameRunning) {
                                // Give them 30 seconds to reconnect before ending game
                                if (!opponentDisconnectTimeout) {
                                    opponentDisconnectTimeout = setTimeout(() => {
                                        if (isGameRunning) {
                                            alert("Opponent has disconnected.");
                                            isGameRunning = false;
                                            cleanupGameListeners();
                                            updatePresence('online');
                                            document.getElementById('lobby').style.display = 'flex';
                                            document.getElementById('panel-main').style.display = 'block';
                                            document.getElementById('panel-waiting').style.display = 'none';
                                            if (myRole === 'host') remove(ref(db, `rooms/${currentRoom}`));
                                            currentRoom = null;
                                            if (oppPresenceUnsubscribe) {
                                                oppPresenceUnsubscribe();
                                                oppPresenceUnsubscribe = null;
                                            }
                                        }
                                    }, 30000);
                                }
                            } else if (presenceSnap.exists() && presenceSnap.val().status !== 'in-game' && isGameRunning) {
                                // Opponent intentionally left the game
                                alert("Opponent has left the game.");
                                isGameRunning = false;
                                cleanupGameListeners();
                                updatePresence('online');
                                document.getElementById('lobby').style.display = 'flex';
                                document.getElementById('panel-main').style.display = 'block';
                                document.getElementById('panel-waiting').style.display = 'none';
                                if (myRole === 'host') remove(ref(db, `rooms/${currentRoom}`));
                                currentRoom = null;
                                if (oppPresenceUnsubscribe) {
                                    oppPresenceUnsubscribe();
                                    oppPresenceUnsubscribe = null;
                                }
                                if (opponentDisconnectTimeout) {
                                    clearTimeout(opponentDisconnectTimeout);
                                    opponentDisconnectTimeout = null;
                                }
                            } else {
                                if (opponentDisconnectTimeout) {
                                    clearTimeout(opponentDisconnectTimeout);
                                    opponentDisconnectTimeout = null;
                                }
                            }
                        });
                    }
                }
            }));
        }
        
        requestAnimationFrame(gameLoop);
    }
  }, []);

  return (
    <>
      <div id="connection-loader" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(9, 9, 11, 0.95)', zIndex: 9999, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '15px' }}></div>
          <p id="connection-text" style={{ color: 'var(--text-main)', fontSize: '16px', fontWeight: 600, letterSpacing: '0.5px' }}>Connecting to server...</p>
          <button id="btn-offline-anyway" style={{ marginTop: '20px', background: 'transparent', border: '1px solid var(--text-muted)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => { document.getElementById('connection-loader').style.display = 'none'; }}>Play Offline Anyway</button>
      </div>

      <div id="network-status" style={{ display: 'none', background: '#ef4444', color: 'white', textAlign: 'center', padding: '8px', paddingTop: 'calc(8px + env(safe-area-inset-top))', position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 1000, fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>
        OFFLINE - MULTIPLAYER DISABLED
      </div>

      <div id="network-indicator" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, zIndex: 100, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: '0 0 12px 12px', border: '1px solid var(--glass-border)', borderTop: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <span id="network-icon" style={{ display: 'flex', alignItems: 'center' }}></span>
          <span id="network-text">Checking...</span>
      </div>

      <div id="lobby">
          <div className="lobby-panel" id="panel-main" style={{ position: 'relative' }}>
              <button id="btn-settings" style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px' }}>⚙️</button>
              <h1 style={{fontSize: '32px', fontWeight: 900, margin: '0 0 20px 0', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase'}}>Carrom</h1>
              
              <div className="lobby-section">
                  <h3 className="section-title">Play Online</h3>
                  <button className="lobby-btn primary" id="btn-create">Create Room</button>
                  <div className="divider"><span>OR</span></div>
                  <div className="join-row">
                      <input type="text" className="lobby-input" id="input-room" placeholder="Room Code" maxLength={6} />
                      <button className="lobby-btn secondary" id="btn-join">Join</button>
                  </div>
                  <p id="lobby-error" className="error-text"></p>
              </div>

              <div className="lobby-section">
                  <h3 className="section-title">Active Players</h3>
                  <ul id="online-users-list" className="users-list">
                      <li style={{padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div className="skeleton-text" style={{width: '80px', height: '14px'}}></div>
                          <div className="skeleton-btn" style={{width: '50px', height: '24px'}}></div>
                      </li>
                      <li style={{padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div className="skeleton-text" style={{width: '60px', height: '14px'}}></div>
                          <div className="skeleton-btn" style={{width: '50px', height: '24px'}}></div>
                      </li>
                  </ul>
              </div>

              <div className="lobby-section">
                  <h3 className="section-title">Practice Mode</h3>
                  <div className="segmented-control">
                      <input type="radio" id="diff-easy" name="difficulty" value="easy" defaultChecked />
                      <label htmlFor="diff-easy">Easy</label>
                      <input type="radio" id="diff-medium" name="difficulty" value="medium" />
                      <label htmlFor="diff-medium">Medium</label>
                      <input type="radio" id="diff-hard" name="difficulty" value="hard" />
                      <label htmlFor="diff-hard">Hard</label>
                      <div className="pill"></div>
                  </div>
                  <button className="lobby-btn success" id="btn-single">Play</button>
              </div>
              
              <button className="lobby-btn outline" id="btn-history" style={{marginTop: '10px'}}>View Match History</button>
          </div>
          
          <div className="lobby-panel" id="panel-waiting" style={{display: 'none'}}>
              <h2>Room Created</h2>
              <p style={{color: 'var(--text-muted)', fontSize: '14px'}}>Share this code with your friend:</p>
              <div id="room-code-display">----</div>
              <p style={{color: 'var(--accent)', fontSize: '14px', fontWeight: 600, animation: 'pulse 2s infinite'}}>Waiting for player 2...</p>
          </div>
      </div>

      <div id="history-modal" style={{ display: 'none', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(9, 9, 11, 0.95)', zIndex: 200, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <div className="lobby-panel" style={{ width: '90%', maxWidth: '400px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '30px 20px' }}>
              <h2 style={{ marginTop: 0, color: 'var(--text-main)', textAlign: 'center', fontSize: '24px' }}>Match History</h2>
              <ul id="history-list" style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', flex: 1, textAlign: 'left' }}></ul>
              <button className="lobby-btn outline" id="btn-close-history" style={{ marginTop: '20px' }}>Close</button>
          </div>
      </div>

      <div id="settings-modal" style={{ display: 'none', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(9, 9, 11, 0.95)', zIndex: 400, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <div className="lobby-panel" style={{ width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', padding: '30px 20px' }}>
              <h2 style={{ marginTop: 0, color: 'var(--text-main)', textAlign: 'center', fontSize: '24px' }}>Settings</h2>
              
              <div className="lobby-section" style={{ marginTop: '20px' }}>
                  <h3 className="section-title">Your Profile</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Display Name</label>
                      <input type="text" className="lobby-input" id="input-username" placeholder="Enter your name" maxLength={15} />
                      <button className="lobby-btn secondary" id="btn-save-name">Save Name</button>
                  </div>
              </div>

              <button className="lobby-btn outline" id="btn-close-settings" style={{ marginTop: '20px' }}>Close</button>
          </div>
      </div>

      <div id="invite-modal" style={{ display: 'none', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(9, 9, 11, 0.95)', zIndex: 300, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <div className="lobby-panel" style={{ width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', padding: '30px 20px', textAlign: 'center' }}>
              <h2 style={{ marginTop: 0, color: 'var(--text-main)', fontSize: '22px' }}>Game Invite</h2>
              <p id="invite-text" style={{ color: 'var(--text-muted)', fontSize: '16px', margin: '20px 0' }}></p>
              <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="lobby-btn primary" onClick={() => window.acceptInvite()} style={{ flex: 1 }}>Accept</button>
                  <button className="lobby-btn outline" onClick={() => window.declineInvite()} style={{ flex: 1 }}>Decline</button>
              </div>
          </div>
      </div>

      <div className="header">
          <div className="score-box user-box">
              <div style={{display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center', marginBottom: '5px'}}>
                  <p className="score-text" style={{margin: 0}}>Host (White)</p>
                  <span id="local-mic-indicator" style={{display: 'none', transition: 'transform 0.1s'}}>🎤</span>
              </div>
              <p className="score-val" id="score-user">0</p>
          </div>
          <div className="score-box system-box">
              <div style={{display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center', marginBottom: '5px'}}>
                  <p className="score-text" style={{margin: 0}}>Guest (Black)</p>
                  <span id="remote-mic-indicator" style={{display: 'none', transition: 'transform 0.1s'}}>🎤</span>
              </div>
              <p className="score-val" id="score-system">0</p>
          </div>
      </div>
      
      <div id="status">Waiting for players...</div>
      
      <div id="game-container">
          <canvas id="carromBoard" width="350" height="350"></canvas>

          <div id="game-over-overlay">
              <h2 id="go-text" style={{color: 'var(--text-main)', textAlign: 'center', padding: '0 10px', fontSize: '32px', fontWeight: 800, textShadow: '0 4px 15px rgba(0,0,0,0.5)', marginBottom: '5px', letterSpacing: '-0.5px'}}>Game Over</h2>
              <p style={{color: 'var(--text-muted)', fontSize: '14px', marginBottom: '30px', fontWeight: 500}}>Both players will reset to a new game.</p>
              <button className="lobby-btn primary" id="btn-rematch" style={{width: '220px'}}>Play Again</button>
          </div>
      </div>

      <audio id="remote-audio" autoPlay playsInline></audio>

      <div id="comms-panel" style={{display: 'none', position: 'relative', width: '100%', maxWidth: 'min(94vw, 420px)', zIndex: 50, flexDirection: 'column', gap: '10px', marginTop: '10px', paddingBottom: '20px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={{color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px'}}>Voice & Chat</span>
              <button id="btn-mic-toggle" style={{background: 'rgba(239, 68, 68, 0.9)', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '20px', color: 'white', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'}}>
                  🎤 Mic Off
              </button>
          </div>

          <div style={{background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '12px', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'}}>
              <div id="chat-messages" style={{height: '100px', overflowY: 'auto', color: 'white', fontSize: '13px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '5px'}}></div>
              <div style={{display: 'flex', gap: '8px'}}>
                  <input type="text" id="chat-input" placeholder="Type message..." style={{flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)', color: 'white', outline: 'none', fontSize: '14px', fontFamily: "'Outfit', sans-serif"}} />
                  <button id="btn-send" style={{padding: '10px 16px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--accent), #ea580c)', color: 'white', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', fontSize: '13px', boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)'}}>Send</button>
              </div>
          </div>
      </div>
    </>
  );
}
