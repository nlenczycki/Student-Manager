import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// ===========================================================
// IMPORTANT — what this page can and can't safely do
//
// Supabase has two kinds of API keys: the "anon" key (safe to ship in
// browser code, restricted by RLS) and the "service role" key (bypasses
// RLS entirely — full read/write to every table, every user). This app
// only ever uses the anon key in the browser, on purpose: putting the
// service role key in frontend code means anyone who opens dev tools on
// the deployed site can extract it and get unrestricted access to the
// whole database.
//
// That boundary means, from this page:
//   - CAN: list users who already have a profile assigned (same
//     limitation as the Permissions page's user list — Supabase doesn't
//     expose a "list all signed-up accounts" call to the anon key, by
//     design)
//   - CAN: reassign a user's permission profile
//   - CAN: send a password reset EMAIL (supabase.auth.resetPasswordForEmail
//     — a standard, safe, anon-key-compatible call; the user clicks a
//     link and sets their own new password)
//   - CANNOT: show anyone's actual password (Supabase never stores or
//     exposes raw passwords, even to a service-role caller — they're
//     hashed)
//   - CANNOT: directly set or generate a "temporary password" for
//     someone from this UI — that specific action requires the
//     service-role-only admin API. Doing it safely means a small
//     server-side function (e.g. a Supabase Edge Function) that holds
//     the service role key on the server, not in the browser. That's a
//     real, buildable next step if you want it — flag it and it can be
//     scoped separately.
// ===========================================================

export default function UsersView() {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetStatus, setResetStatus] = useState({}); // user_id -> 'sending' | 'sent' | error message

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: userRows }, { data: profileRows }] = await Promise.all([
      supabase.from('user_profiles').select('user_id, full_name, profile_id, profiles(name)'),
      supabase.from('profiles').select('*').order('name'),
    ]);
    setUsers(userRows || []);
    setProfiles(profileRows || []);
    setLoading(false);
  }

  async function changeProfile(userId, fullName, profileId) {
    await supabase.from('user_profiles').upsert({ user_id: userId, profile_id: profileId, full_name: fullName });
    loadAll();
  }

  async function sendPasswordReset(userId, email) {
    if (!email) {
      setResetStatus((s) => ({ ...s, [userId]: 'No email on file for this user — see note below.' }));
      return;
    }
    setResetStatus((s) => ({ ...s, [userId]: 'sending' }));
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResetStatus((s) => ({ ...s, [userId]: error ? error.message : 'sent' }));
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading users…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-lg font-medium mb-1">Users</h1>
      <p className="text-sm text-gray-500 mb-2">
        Manage who has access and what profile they're assigned. Password resets send a real email with a
        sign-in link — there's no stored password to display, and no way to set one directly from here (see why
        below).
      </p>
      <details className="text-xs text-gray-500 mb-6">
        <summary className="cursor-pointer">Why can't I see or set passwords directly?</summary>
        <p className="mt-2 max-w-xl">
          Supabase never stores raw passwords, even internally — only a one-way hash, so nothing can display
          someone's actual password regardless of permissions. Setting a password FOR someone (a "temp password")
          is possible, but only through Supabase's admin API, which requires a privileged server-side key that
          must never be placed in browser code — doing so would let anyone who opens developer tools on this site
          extract full read/write access to the entire database. A password reset email is the safe equivalent:
          the user gets a link, clicks it, and sets their own new password.
        </p>
      </details>

      {users.length === 0 ? (
        <p className="text-sm text-gray-500">
          No users yet. A new sign-in needs a profile assigned manually the first time — see SETUP.md.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {users.map((u) => (
            <div key={u.user_id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.full_name || u.user_id.slice(0, 8)}</p>
                <p className="text-xs text-gray-400">{u.profiles?.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={u.profile_id}
                  onChange={(e) => changeProfile(u.user_id, u.full_name, e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ResetButton userId={u.user_id} status={resetStatus[u.user_id]} onSend={sendPasswordReset} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Note: this list doesn't have each user's email on file directly — password resets need it. If sending
        fails, the simplest fix is having the user reset their own password from the sign-in screen instead
        (same "send sign-in link" flow), or look up their email under Authentication → Users in the Supabase
        dashboard and reset it from there.
      </p>
    </div>
  );
}

function ResetButton({ userId, status, onSend }) {
  const [email, setEmail] = useState('');
  const [showInput, setShowInput] = useState(false);

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="text-xs border border-gray-300 rounded px-2 py-1.5"
      >
        Reset password
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="email"
        placeholder="user's email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1.5 text-xs w-32"
      />
      <button
        onClick={() => onSend(userId, email)}
        disabled={status === 'sending'}
        className="text-xs bg-gray-900 text-white rounded px-2 py-1.5 disabled:opacity-50"
      >
        {status === 'sending' ? '…' : 'Send'}
      </button>
      {status === 'sent' && <span className="text-xs text-green-600">Sent</span>}
      {status && status !== 'sending' && status !== 'sent' && (
        <span className="text-xs text-red-600">{status}</span>
      )}
    </div>
  );
}
