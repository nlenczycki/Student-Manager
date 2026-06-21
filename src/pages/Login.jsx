import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-sm w-full p-6 text-center">
          <h1 className="text-lg font-medium mb-2">Check your email</h1>
          <p className="text-sm text-gray-600">
            We sent a sign-in link to {email}. Click it to log in — no password needed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="max-w-sm w-full p-6">
        <h1 className="text-lg font-medium mb-1">Flight School CRM</h1>
        <p className="text-sm text-gray-600 mb-4">Sign in with your school email.</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3"
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-900 text-white rounded-md px-3 py-2 text-sm disabled:opacity-50"
        >
          {loading ? 'Sending link…' : 'Send sign-in link'}
        </button>
      </form>
    </div>
  );
}
