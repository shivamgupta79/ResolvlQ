import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

let socket = null;

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: true, reconnection: true });
  }
  return socket;
}

/**
 * Subscribe to a socket event. Automatically cleans up on unmount.
 * Exported as both `useSocket` (legacy name) and `useSocketEvent`.
 */
export function useSocket(event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = getSocket();
    const cb = (...args) => handlerRef.current(...args);
    s.on(event, cb);
    return () => s.off(event, cb);
  }, [event]);
}

// Alias
export const useSocketEvent = useSocket;

export default getSocket;
