import React, { useState, useEffect, useRef } from 'react';
import { ref, onChildAdded, push, serverTimestamp } from 'firebase/database';
import Peer from 'peerjs';

export default function CommsPanel({ roomCode, role, db }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [peerId, setPeerId] = useState('');
  const [remotePeerId, setRemotePeerId] = useState('');
  
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Initialize Chat
  useEffect(() => {
    if (!roomCode) return;
    const chatRef = ref(db, `rooms/${roomCode}/chat`);
    
    const unsubscribe = onChildAdded(chatRef, (snapshot) => {
      const msg = snapshot.val();
      setMessages(prev => [...prev, msg]);
    });

    return () => unsubscribe();
  }, [roomCode, db]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize WebRTC (PeerJS)
  useEffect(() => {
    if (!roomCode) return;

    const initPeer = async () => {
      let stream: MediaStream | undefined;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        
        // Mute initially
        stream.getAudioTracks().forEach(track => track.enabled = false);
      } catch (err) {
        console.warn("Microphone access denied or unavailable. Voice chat will be disabled.", err);
        // Continue without stream so text chat and other features aren't blocked,
        // though PeerJS is primarily used for voice here.
      }

      try {
        const myId = `${roomCode}-${role}`;
        const theirId = `${roomCode}-${role === 'host' ? 'guest' : 'host'}`;
        
        setPeerId(myId);
        setRemotePeerId(theirId);

        const peer = new Peer(myId, {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        peerRef.current = peer;

        peer.on('open', (id) => {
          console.log('My peer ID is: ' + id);
          
          // If guest, call host
          if (role === 'guest' && stream) {
            setTimeout(() => {
              const call = peer.call(theirId, stream!);
              if (call) {
                call.on('stream', (remoteStream) => {
                  if (audioRef.current) {
                    audioRef.current.srcObject = remoteStream;
                  }
                });
              }
            }, 1000);
          }
        });

        peer.on('call', (call) => {
          if (stream) {
            call.answer(stream);
          } else {
            // Answer without a stream if we don't have one
            call.answer();
          }
          call.on('stream', (remoteStream) => {
            if (audioRef.current) {
              audioRef.current.srcObject = remoteStream;
            }
          });
        });

      } catch (err) {
        console.error("Failed to initialize PeerJS", err);
      }
    };

    initPeer();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [roomCode, role]);

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicEnabled(audioTrack.enabled);
      }
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const chatRef = ref(db, `rooms/${roomCode}/chat`);
    push(chatRef, {
      text: inputText.trim(),
      sender: role,
      timestamp: serverTimestamp()
    });
    
    setInputText('');
  };

  return (
    <div className="comms-panel">
      <div className="comms-header">
        <h3>Comms</h3>
        <button 
          className={`mic-btn ${micEnabled ? 'active' : ''}`} 
          onClick={toggleMic}
        >
          {micEnabled ? '🎤 Mic On' : '🔇 Mic Off'}
        </button>
      </div>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.sender === role ? 'sent' : 'received'}`}>
              <span className="sender-name">{msg.sender === 'host' ? 'White' : 'Black'}</span>
              <p>{msg.text}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <form className="chat-input-form" onSubmit={sendMessage}>
          <input 
            type="text" 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)} 
            placeholder="Type a message..." 
            className="chat-input"
          />
          <button type="submit" className="chat-send-btn">Send</button>
        </form>
      </div>

      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
    </div>
  );
}
