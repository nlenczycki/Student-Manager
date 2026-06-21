import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function TagsView({ allTags, onReload }) {
  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newCategory, setNewCategory] = useState('flag');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const existingGroups = useMemo(() => {
    const set = new Set(allTags.map((t) => t.group_name).filter(Boolean));
    return Array.from(set).sort();
  }, [allTags]);

  const groupedTags = useMemo(() => {
    const groups = {};
    for (const t of allTags) {
      const g = t.group_name || 'Ungrouped';
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    }
    // Sort each group's tags alphabetically, and put "Ungrouped" last.
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      if (a === 'Ungrouped') return 1;
      if (b === 'Ungrouped') return -1;
      return a.localeCompare(b);
    });
    return sortedGroupNames.map((name) => ({
      name,
      tags: groups[name].sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [allTags]);

  async function addTag(e) {
    e.preventDefault();
    setError(null);
    const label = newLabel.trim();
    if (!label) return;

    setSaving(true);
    const { error } = await supabase.from('tags').insert({
      label,
      group_name: newGroup.trim() || null,
      category: newCategory,
      active: true,
    });
    setSaving(false);

    if (error) {
      // Most likely cause: RLS rejected the insert because this user
      // isn't actually an admin server-side (the sidebar link is hidden
      // for non-admins, but RLS is the real enforcement — this message
      // surfaces that rather than failing silently).
      setError(error.message);
      return;
    }

    setNewLabel('');
    setNewGroup('');
    setNewCategory('flag');
    onReload();
  }

  async function setTagActive(tagId, active) {
    // Archive, never hard-delete — a tag in use by students must keep
    // existing so their tag history isn't silently lost. Setting
    // active = false just hides it from future tagging; it can be
    // restored any time by flipping this back.
    await supabase.from('tags').update({ active }).eq('id', tagId);
    onReload();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-lg font-medium mb-1">Manage tags</h1>
      <p className="text-sm text-gray-500 mb-6">
        Tags are organized into groups (e.g. Progress, Course, Issue) so instructors can find the right one quickly.
        Archiving a tag removes it from future use but keeps it on any student it's already applied to.
      </p>

      <form onSubmit={addTag} className="border border-gray-200 rounded-lg p-5 mb-6">
        <p className="text-sm font-medium mb-3">Add a tag</p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <input
            type="text"
            placeholder="Tag label, e.g. Behind pace"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm col-span-1"
            required
          />
          <input
            type="text"
            list="existing-groups"
            placeholder="Group, e.g. Progress"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm col-span-1"
          />
          <datalist id="existing-groups">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm col-span-1"
          >
            <option value="flag">Flag (amber)</option>
            <option value="strength">Strength (green)</option>
            <option value="admin">Admin (gray)</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Group is free text — type an existing group to add to it, or a new name to start one. Leave blank for "Ungrouped."
        </p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={saving || !newLabel.trim()}
          className="bg-gray-900 text-white rounded-md px-3 py-2 text-sm disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add tag'}
        </button>
      </form>

      {groupedTags.map((group) => (
        <div key={group.name} className="mb-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{group.name}</p>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {group.tags.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <CategoryDot category={t.category} />
                  <span className={`text-sm ${t.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                    {t.label}
                  </span>
                  {!t.active && <span className="text-xs text-gray-400">(archived)</span>}
                </div>
                {t.active ? (
                  <button
                    onClick={() => setTagActive(t.id, false)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    onClick={() => setTagActive(t.id, true)}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {groupedTags.length === 0 && <p className="text-sm text-gray-500">No tags yet — add one above.</p>}
    </div>
  );
}

function CategoryDot({ category }) {
  const color =
    category === 'strength' ? 'bg-green-500' : category === 'admin' ? 'bg-gray-400' : 'bg-amber-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}
