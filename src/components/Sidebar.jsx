import { useState } from 'react';
import { canSeeSidebarItem } from '../lib/permissions';

export default function Sidebar({ view, setView, courses, selectedCourse, setSelectedCourse, profile }) {
  // Collapsed/expanded state per group, independent per section so
  // closing Courses doesn't affect Student or Admin. Courses starts
  // open since that's the most commonly used group; Admin starts
  // closed since it's used less often and can get long.
  const [openGroups, setOpenGroups] = useState({ courses: true, student: true, admin: false });

  function toggleGroup(key) {
    setOpenGroups((g) => ({ ...g, [key]: !g[key] }));
  }

  const showAdminGroup =
    canSeeSidebarItem(profile, 'tags') ||
    canSeeSidebarItem(profile, 'permissions') ||
    canSeeSidebarItem(profile, 'users') ||
    canSeeSidebarItem(profile, 'import');

  return (
    <div className="w-56 shrink-0 border-r border-gray-200 h-screen sticky top-0 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center gap-2">
        <img src="/logo.png" alt="" className="w-8 h-8 object-contain shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">Flight School Student Manager</p>
          {profile && <p className="text-xs text-gray-400 mt-0.5">{profile.name}</p>}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 text-sm">
        {canSeeSidebarItem(profile, 'school') && (
          <SidebarItem label="School" active={view === 'school'} onClick={() => setView('school')} />
        )}

        {canSeeSidebarItem(profile, 'weekly_progress') && (
          <SidebarItem
            label="Weekly Progress"
            active={view === 'weekly_progress'}
            onClick={() => setView('weekly_progress')}
          />
        )}

        {canSeeSidebarItem(profile, 'courses') && courses.length > 0 && (
          <GroupSection title="Courses" open={openGroups.courses} onToggle={() => toggleGroup('courses')}>
            {courses.map((course) => (
              <SidebarItem
                key={course}
                label={course}
                indent
                active={view === 'course' && selectedCourse === course}
                onClick={() => {
                  setSelectedCourse(course);
                  setView('course');
                }}
              />
            ))}
          </GroupSection>
        )}

        {canSeeSidebarItem(profile, 'student') && (
          <GroupSection title="Student" open={openGroups.student} onToggle={() => toggleGroup('student')}>
            <SidebarItem
              label="Find a student…"
              indent
              active={view === 'student'}
              onClick={() => setView('student')}
            />
          </GroupSection>
        )}

        {showAdminGroup && (
          <GroupSection title="Admin" open={openGroups.admin} onToggle={() => toggleGroup('admin')}>
            {canSeeSidebarItem(profile, 'tags') && (
              <SidebarItem label="Manage tags" indent active={view === 'tags'} onClick={() => setView('tags')} />
            )}
            {canSeeSidebarItem(profile, 'permissions') && (
              <SidebarItem
                label="Permissions"
                indent
                active={view === 'permissions'}
                onClick={() => setView('permissions')}
              />
            )}
            {canSeeSidebarItem(profile, 'users') && (
              <SidebarItem
                label="Manage users"
                indent
                active={view === 'users'}
                onClick={() => setView('users')}
              />
            )}
            {canSeeSidebarItem(profile, 'import') && (
              <SidebarItem
                label="Import data"
                indent
                active={view === 'import'}
                onClick={() => setView('import')}
              />
            )}
          </GroupSection>
        )}
      </nav>
    </div>
  );
}

// GroupSection — a collapsible sidebar group: a clickable header with a
// carrot, and children that only render when open. Keeps each group's
// open/closed state independent (see openGroups in the parent).
function GroupSection({ title, open, onToggle, children }) {
  return (
    <div className="mt-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 mb-1 text-xs font-medium text-gray-400 uppercase tracking-wide"
      >
        <span>{title}</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && children}
    </div>
  );
}

function SidebarItem({ label, active, onClick, indent }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1.5 mb-0.5 truncate ${
        indent ? 'text-xs' : 'text-sm font-medium'
      } ${active ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
      title={label}
    >
      {label}
    </button>
  );
}
