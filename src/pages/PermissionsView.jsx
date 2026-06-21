import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SIDEBAR_KEYS, ELEMENT_KEYS, CAPABILITY_KEYS } from '../lib/permissions';

const EMPTY_PERMISSIONS = { sidebar: {}, elements: {}, capabilities: {} };

export default function PermissionsView() {
  const [profiles, setProfiles] = useState([]);
  const [users, setUsers] = useState([]); // user_profiles rows, joined with profile name
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [draft, setDraft] = useState(null); // working copy of the selected profile, edited locally before saving
  const [newProfileName, setNewProfileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: profileRows }, { data: userRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('user_profiles').select('user_id, full_name, profile_id, profiles(name)'),
    ]);
    setProfiles(profileRows || []);
    setUsers(userRows || []);
    if (profileRows && profileRows.length && !selectedProfileId) {
      selectProfile(profileRows[0]);
    }
    setLoading(false);
  }

  function selectProfile(p) {
    setSelectedProfileId(p.id);
    setDraft({
      ...p,
      permissions: {
        sidebar: { ...EMPTY_PERMISSIONS.sidebar, ...(p.permissions?.sidebar || {}) },
        elements: { ...EMPTY_PERMISSIONS.elements, ...(p.permissions?.elements || {}) },
        capabilities: { ...EMPTY_PERMISSIONS.capabilities, ...(p.permissions?.capabilities || {}) },
      },
    });
    setError(null);
  }

  function toggleDraft(section, key) {
    setDraft((d) => ({
      ...d,
      permissions: {
        ...d.permissions,
        [section]: { ...d.permissions[section], [key]: !d.permissions[section][key] },
      },
    }));
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ permissions: draft.permissions, description: draft.description })
      .eq('id', draft.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    loadAll();
  }

  async function createProfile(e) {
    e.preventDefault();
    const name = newProfileName.trim();
    if (!name) return;
    setError(null);
    const { data, error } = await supabase
      .from('profiles')
      .insert({ name, permissions: EMPTY_PERMISSIONS })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setNewProfileName('');
    await loadAll();
    if (data) selectProfile(data);
  }

  async function deleteProfile(p) {
    if (p.is_system) return; // belt-and-suspenders — RLS also blocks this
    if (!confirm(`Delete the "${p.name}" profile? Users currently assigned to it will lose access until reassigned.`)) {
      return;
    }
    const { error } = await supabase.from('profiles').delete().eq('id', p.id);
    if (error) {
      setError(error.message);
      return;
    }
    loadAll();
  }

  async function assignUserProfile(userId, fullName, profileId) {
    await supabase.from('user_profiles').upsert({ user_id: userId, profile_id: profileId, full_name: fullName });
    loadAll();
  }

  const groupedElementKeys = useMemo(() => {
    // ELEMENT_KEYS labels look like "Student page — Notes" — group by the
    // part before the dash so the checkbox list has section headers
    // rather than one long flat list.
    const groups = {};
    for (const item of ELEMENT_KEYS) {
      const [section] = item.label.split(' — ');
      if (!groups[section]) groups[section] = [];
      groups[section].push(item);
    }
    return groups;
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading permissions…</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-lg font-medium mb-1">Permissions</h1>
      <p className="text-sm text-gray-500 mb-6">
        Profiles control what each signed-in user sees in the app. The "Owner" profile is built in and can't be
        deleted. Note: visibility settings (sidebar items, page elements) are a UI convenience — the underlying
        write actions (managing tags, profiles, students, and others' notes) are separately enforced by the
        database regardless of what's shown here.
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* Profile list */}
        <div className="col-span-1">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Profiles</p>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-3">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => selectProfile(p)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  selectedProfileId === p.id ? 'bg-gray-50 font-medium' : ''
                }`}
              >
                <span>
                  {p.name}
                  {p.is_system && <span className="text-xs text-gray-400 ml-1">(built-in)</span>}
                </span>
                <span className="text-xs text-gray-400">
                  {users.filter((u) => u.profile_id === p.id).length}
                </span>
              </button>
            ))}
          </div>

          <form onSubmit={createProfile} className="flex gap-2">
            <input
              type="text"
              placeholder="New profile name"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
            />
            <button type="submit" className="bg-gray-900 text-white rounded-md px-3 py-1.5 text-sm">
              Add
            </button>
          </form>

          <div className="mt-6">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Assign users</p>
            <UserAssignment users={users} profiles={profiles} onAssign={assignUserProfile} />
          </div>
        </div>

        {/* Selected profile editor */}
        <div className="col-span-2">
          {!draft ? (
            <p className="text-sm text-gray-500">No profiles yet — create one to get started.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">{draft.name}</h2>
                {!draft.is_system && (
                  <button onClick={() => deleteProfile(draft)} className="text-xs text-red-600 hover:underline">
                    Delete profile
                  </button>
                )}
              </div>

              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

              <PermissionSection title="Sidebar items" disabled={draft.is_system}>
                {SIDEBAR_KEYS.map((item) => (
                  <Checkbox
                    key={item.key}
                    label={item.label}
                    checked={Boolean(draft.permissions.sidebar[item.key])}
                    disabled={draft.is_system}
                    onChange={() => toggleDraft('sidebar', item.key)}
                  />
                ))}
              </PermissionSection>

              {Object.entries(groupedElementKeys).map(([section, items]) => (
                <PermissionSection key={section} title={`Page elements — ${section}`} disabled={draft.is_system}>
                  {items.map((item) => (
                    <Checkbox
                      key={item.key}
                      label={item.label.split(' — ')[1]}
                      checked={Boolean(draft.permissions.elements[item.key])}
                      disabled={draft.is_system}
                      onChange={() => toggleDraft('elements', item.key)}
                    />
                  ))}
                </PermissionSection>
              ))}

              <PermissionSection
                title="Write capabilities (database-enforced)"
                disabled={draft.is_system}
                note="These are real security boundaries, not just UI visibility."
              >
                {CAPABILITY_KEYS.map((item) => (
                  <Checkbox
                    key={item.key}
                    label={item.label}
                    checked={Boolean(draft.permissions.capabilities[item.key])}
                    disabled={draft.is_system}
                    onChange={() => toggleDraft('capabilities', item.key)}
                  />
                ))}
              </PermissionSection>

              {draft.is_system ? (
                <p className="text-xs text-gray-400 mt-2">
                  The Owner profile always has full access and can't be edited.
                </p>
              ) : (
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="bg-gray-900 text-white rounded-md px-3 py-2 text-sm disabled:opacity-50 mt-2"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionSection({ title, children, disabled, note }) {
  return (
    <div className={`mb-5 ${disabled ? 'opacity-50' : ''}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {note && <p className="text-xs text-gray-400 mb-2">{note}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">{children}</div>
    </div>
  );
}

function Checkbox({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  );
}

function UserAssignment({ users, profiles, onAssign }) {
  // user_profiles only contains users who've already been assigned a
  // profile at least once. A brand new sign-up won't show up here until
  // an Owner manually creates their first assignment with this same
  // upsert path — there's no separate "list of all signed-up users"
  // query here since RLS on user_profiles only exposes rows the current
  // user already has visibility into (their own, or all of them if they
  // hold can_manage_profiles).
  if (users.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No users assigned yet. New sign-ins need a profile assigned manually the first time — see SETUP.md.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div key={u.user_id} className="flex items-center justify-between text-xs">
          <span className="text-gray-700">{u.full_name || u.user_id.slice(0, 8)}</span>
          <select
            value={u.profile_id}
            onChange={(e) => onAssign(u.user_id, u.full_name, e.target.value)}
            className="border border-gray-300 rounded px-1.5 py-1 text-xs"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
