import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  }

  if (!session) {
    return <Login />;
  }

  return <Dashboard session={session} />;
}
