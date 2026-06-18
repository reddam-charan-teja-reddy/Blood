import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export async function api(endpoint, options = {}) {
  const token = useAuthStore.getState().accessToken;

  const headers = {
    ...(!(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  let response = await fetch(`${BASE_URL}${endpoint}`, { 
    ...options, 
    headers,
    credentials: 'include'
  });

  // Attempt token refresh on 401
  const isAuthAction = endpoint.includes('/auth/login') || 
                       endpoint.includes('/auth/otp/') || 
                       endpoint.includes('/auth/refresh') || 
                       endpoint.includes('/auth/register');

  if (response.status === 401 && !isAuthAction) {
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (!refreshRes.ok) throw new Error('Refresh failed');
      
      const { accessToken, user } = await refreshRes.json();
      useAuthStore.getState().setAuth(user, accessToken);

      // Retry original request with new token
      response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: { 
          ...headers, 
          'Authorization': `Bearer ${accessToken}` 
        },
        credentials: 'include',
      });
    } catch (error) {
      useAuthStore.getState().clearAuth();
      // If we are not on the login/register/landing pages, redirect
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register' && path !== '/') {
        window.location.href = '/login';
      }
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  // Return the parsed JSON directly — callers don't need to call .json()
  return response.json();
}
