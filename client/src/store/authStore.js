import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
      updateUser: (updatedUser) => set((state) => ({ user: { ...state.user, ...updatedUser } })),
      clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'blood-network-auth',
      partialize: (state) => ({ user: state.user }), // Only persist user info in localStorage, not the access token
    }
  )
);
