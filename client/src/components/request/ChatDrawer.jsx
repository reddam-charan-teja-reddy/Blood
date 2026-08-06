import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Send, X, MessageCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { useSocket } from '../../hooks/useSocket';

export default function ChatDrawer({ isOpen, onClose, requestId, currentUser }) {
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);
  const socket = useSocket();

  // Query to fetch messages
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['chat', requestId],
    queryFn: () => api(`/requests/${requestId}/chat`),
    enabled: isOpen && !!requestId,
    refetchInterval: isOpen ? 10000 : false,
  });

  // Real-time socket message handler
  useEffect(() => {
    if (!socket || !isOpen || !requestId) return;

    socket.emit('join_request', requestId);

    const handleNewMessage = (msg) => {
      queryClient.setQueryData(['chat', requestId], (prev = []) => {
        // Prevent duplicate messages if already present
        if (prev.some(m => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
      scrollToBottom();
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.emit('leave_request', requestId);
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, isOpen, requestId]);

  const sendMutation = useMutation({
    mutationFn: (content) => api(`/requests/${requestId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
    onSuccess: (newMessage) => {
      queryClient.setQueryData(['chat', requestId], (prev = []) => [...prev, newMessage]);
      setMessageText('');
      scrollToBottom();
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to send message');
    },
  });

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Scroll to bottom when drawer opens or messages load
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom();
    }
  }, [isOpen, messages.length]);

  if (!isOpen) return null;

  const handleSend = (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    sendMutation.mutate(messageText);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      maxWidth: '450px',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(20px)',
      borderLeft: '1px solid var(--border-color)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.5)',
      animation: 'slideInRight 0.3s ease forwards',
    }}>
      {/* Header */}
      <div className="flex justify-between align-center" style={{
        padding: '1.25rem',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
      }}>
        <div className="flex align-center gap-2">
          <MessageCircle size={20} color="var(--primary-color)" />
          <h3 style={{ fontWeight: 700, color: '#fff', fontSize: '1.125rem' }}>Coordination Chat</h3>
        </div>
        <button 
          onClick={onClose} 
          className="btn btn-secondary btn-sm"
          style={{ minWidth: '36px', height: '36px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        {isLoading ? (
          <div className="flex justify-center align-center" style={{ height: '100%' }}>
            <Loader2 className="animate-spin" color="var(--primary-color)" size={32} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col align-center justify-center text-center" style={{ height: '100%', color: 'var(--text-secondary)', padding: '2rem' }}>
            <MessageCircle size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
            <h4 style={{ color: '#fff', fontWeight: 600 }}>No messages yet</h4>
            <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
              Start the conversation to coordinate donation timing and location details.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId?._id === currentUser?.id;
            return (
              <div key={msg._id} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                alignSelf: isMe ? 'flex-end' : 'flex-start',
              }}>
                {/* Sender Name */}
                <span style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.25rem',
                  paddingLeft: isMe ? 0 : '0.25rem',
                  paddingRight: isMe ? '0.25rem' : 0,
                }}>
                  {msg.senderId?.fullName} {msg.senderId?.role === 'ADMIN' && '(Admin)'}
                </span>

                {/* Message Bubble */}
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                  backgroundColor: isMe ? 'var(--primary-color)' : 'rgba(30, 41, 59, 0.8)',
                  border: isMe ? 'none' : '1px solid var(--border-color)',
                  color: '#fff',
                  fontSize: '0.875rem',
                  lineHeight: '1.4',
                  boxShadow: isMe ? '0 4px 10px rgba(239, 68, 68, 0.2)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>

                {/* Time */}
                <span style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.25rem',
                  paddingLeft: isMe ? 0 : '0.25rem',
                }}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} style={{
        padding: '1.25rem',
        borderTop: '1px solid var(--border-color)',
        backgroundColor: 'rgba(30, 41, 59, 0.3)',
      }} className="flex gap-2">
        <input 
          type="text" 
          className="form-input" 
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          style={{ borderRadius: '24px', marginBottom: 0 }}
          disabled={sendMutation.isPending}
        />
        <button 
          type="submit" 
          className="btn btn-primary"
          style={{
            minWidth: '42px',
            height: '42px',
            borderRadius: '50%',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          disabled={!messageText.trim() || sendMutation.isPending}
        >
          {sendMutation.isPending ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>

      {/* Slide-in CSS Animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
