import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/Common/LoadingSpinner';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // The backend delivers the JWT in the URL fragment (#token=…) so it never
    // hits a server log or Referer header. Read it from the hash, then strip it.
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (token) {
      localStorage.setItem('token', token);
      window.history.replaceState(null, '', window.location.pathname);
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-surface-bg gap-4">
      <LoadingSpinner size="lg" />
      <p className="text-content-secondary text-sm">
        Authenticating, please wait...
      </p>
    </div>
  );
}
