import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/v1', '') : 'http://localhost:5000');

let globalSocket = null;

export function getSocket() {
  return globalSocket;
}

export function useSocket(onNotification = null) {
  const { accessToken, user } = useAuthStore();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(SOCKET_URL, {
        auth: { token: accessToken },
        transports: ['websocket', 'polling'],
        reconnection: true,
      });
    } else if (accessToken) {
      globalSocket.auth = { token: accessToken };
    }

    socketRef.current = globalSocket;

    const handleNewNotification = (notif) => {
      toast(notif.title || 'New Blood Alert', {
        icon: '🩸',
        duration: 6000,
      });
      if (onNotification) onNotification(notif);
    };

    globalSocket.on('new_notification', handleNewNotification);

    return () => {
      globalSocket?.off('new_notification', handleNewNotification);
    };
  }, [accessToken, user?.id]);

  return socketRef.current || globalSocket;
}
