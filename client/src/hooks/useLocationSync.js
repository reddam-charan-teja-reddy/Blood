import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';

export function useLocationSync() {
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.role === 'ADMIN') return; // Admin location sync not needed

    const syncLocation = () => {
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const endpoint = user.role === 'ORG' ? '/orgs/profile' : '/donors/profile';
          
          try {
            await api(endpoint, {
              method: 'PUT',
              body: JSON.stringify({ latitude, longitude }),
            });
            console.log(`📡 Background location sync successful: [${latitude}, ${longitude}]`);
          } catch (err) {
            console.error('📡 Background location sync failed:', err.message);
          }
        },
        (error) => {
          console.warn('📡 Geolocation access denied or unavailable:', error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    };

    // Run once immediately on mount/auth
    syncLocation();

    // Setup interval for every 10 minutes
    const intervalId = setInterval(syncLocation, 10 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [user, isAuthenticated]);
}
