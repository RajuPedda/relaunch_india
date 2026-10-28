import React, { useEffect, useState } from 'react';
import type { Job, Organization, Profile } from '@relaunch/shared';
import { api } from './lib/api.js';
import { Eyebrow, Notice, Skeleton, ToastHost, useAsync } from './components/ui.js';
import { Icon, type IconName } from './components/icons.js';
import { Employee } from './pages/Employee.js';
import { Employer } from './pages/Employer.js';
import { Admin } from './pages/Admin.js';
import { Reviewer } from './pages/Reviewer.js';
import { Ops } from './pages/Ops.js';
import { Metrics } from './pages/Metrics.js';

interface Bootstrap {
  orgs: Organization[];
  profiles: Profile[];
  jobs: Job[];
  roles: { id: string; title: string; status: string }[];
}

type View = 'employee' | 'employer' | 'admin' | 'reviewer' | 'measures' | 'operations';

const VIEWS: { id: View; label: string; glyph: IconName; group: string; title: string; lede: string }[] = [
  { id: 'employee', label: 'Worker', glyph: 'person', group: 'Who is using it',
    title: 'Worker', lede: 'Assess a work sample, learn the workflow, practise the gap, reassess on an unseen task, act on the evidence.' },
  { id: 'employer', label: 'Employer', glyph: 'building', group: 'Who is using it',
    title: 'Employer', lede: 'Publish a role, confirm every extracted requirement, and work with applicants in one record.' },
  { id: 'admin', label: 'Role configuration', glyph: 'sliders', group: 'Who approves it',
    title: 'Role configuration', lede: 'Any profession can enter intake. Nothing becomes a validated assessment until a domain expert approves it.' },
  { id: 'reviewer', label: 'Review queue', glyph: 'stamp', group: 'Who approves it',
    title: 'Review queue', lede: 'Resolve disputed findings, judge professional judgment, approve conclusions.' },
  { id: 'measures', label: 'Pilot measures', glyph: 'chart', group: 'What it produces',
    title: 'Pilot measures', lede: 'The five employer questions, each with the measure that answers it and the caveats that go with it.' },
  { id: 'operations', label: 'Operations', glyph: 'signal', group: 'What it produces',
    title: 'Operations', lede: 'Messages sent and withheld, the event bus, and the consent and audit trail.' },
];

type Theme = 'system' | 'light' | 'dark';

export function App() {
  const [view, setView] = useState<View>('employee');
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('relaunch.theme') as Theme) ?? 'system'; } catch { return 'system'; }
  });
  const boot = useAsync(() => api.get<Bootstrap>('/bootstrap'), []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('relaunch.theme', theme); } catch { /* private window */ }
  }, [theme]);

  const meta = VIEWS.find((v) => v.id === view)!;
  const groups = [...new Set(VIEWS.map((v) => v.group))];

  return (
    <ToastHost>
      <div className="app">
        <nav className="rail" aria-label="Sections">
          <div className="brand">
            <span className="mark">RI</span>
            <span>
              <div className="name">ReLaunch</div>
              <div className="place">India · proof of concept</div>
            </span>
          </div>

          {groups.map((group) => (
            <div className="rail-group" key={group}>
              <Eyebrow>{group}</Eyebrow>
              {VIEWS.filter((v) => v.group === group).map((v) => {
                const Glyph = Icon[v.glyph];
                return (
                  <button
                    key={v.id}
                    className="nav"
                    aria-current={view === v.id ? 'page' : undefined}
                    onClick={() => setView(v.id)}
                  >
                    <span className="glyph"><Glyph /></span>
                    {v.label}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="rail-foot">
            <div className="small muted" style={{ padding: '0 8px' }}>Synthetic data. No employer material.</div>
          </div>
        </nav>

        <div className="content">
          <header className="context">
            <div>
              <h1>{meta.title}</h1>
              <p className="lede">{meta.lede}</p>
            </div>
            <div className="right">
              <div className="segmented" role="group" aria-label="Theme">
                <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')} title="Light"><Icon.sun /></button>
                <button aria-pressed={theme === 'system'} onClick={() => setTheme('system')} title="Match the system">Auto</button>
                <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} title="Dark"><Icon.moon /></button>
              </div>
            </div>
          </header>

          <main>
            {boot.error && (
              <Notice tone="bad">
                The API is not reachable ({boot.error}). Start it with <span className="mono">npm run dev:api</span>.
              </Notice>
            )}
            {boot.loading && !boot.data && <Skeleton rows={5} />}
            {boot.data && (
              <>
                {view === 'employee' && <Employee profiles={boot.data.profiles} jobs={boot.data.jobs} reload={boot.reload} />}
                {view === 'employer' && <Employer orgs={boot.data.orgs} jobs={boot.data.jobs} profiles={boot.data.profiles} reload={boot.reload} />}
                {view === 'admin' && <Admin reload={boot.reload} />}
                {view === 'reviewer' && <Reviewer profiles={boot.data.profiles} reload={boot.reload} />}
                {view === 'measures' && <Metrics profiles={boot.data.profiles} />}
                {view === 'operations' && <Ops profiles={boot.data.profiles} orgs={boot.data.orgs} />}
              </>
            )}
          </main>
        </div>
      </div>
    </ToastHost>
  );
}
