import React from 'react';

/** 16px stroke icons. One family, one weight — no emoji anywhere in the UI. */
const base = {
  width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const Icon = {
  person: () => <svg {...base}><circle cx="8" cy="5" r="2.6" /><path d="M2.8 13.4c.7-2.5 2.7-3.8 5.2-3.8s4.5 1.3 5.2 3.8" /></svg>,
  building: () => <svg {...base}><path d="M2.5 13.5h11M4 13.5V3.2a.7.7 0 0 1 .7-.7h4.1a.7.7 0 0 1 .7.7v10.3M9.5 6.2h2.3a.7.7 0 0 1 .7.7v6.6" /><path d="M5.8 5h2M5.8 7.4h2M5.8 9.8h2" /></svg>,
  sliders: () => <svg {...base}><path d="M2.5 4.5h7M12 4.5h1.5M2.5 11.5h1.5M6.5 11.5h7" /><circle cx="10.8" cy="4.5" r="1.6" /><circle cx="5.2" cy="11.5" r="1.6" /></svg>,
  stamp: () => <svg {...base}><path d="M3 13.5h10M4.5 11.2h7l-.5-2.1a1 1 0 0 0-1-.8H6a1 1 0 0 0-1 .8z" /><path d="M6.6 8.3V5.1a1.4 1.4 0 0 1 2.8 0v3.2" /></svg>,
  chart: () => <svg {...base}><path d="M2.5 13.3h11" /><path d="M4.4 11V7.4M7.5 11V3.8M10.6 11v-4.6" /></svg>,
  signal: () => <svg {...base}><circle cx="8" cy="8" r="1.6" /><path d="M4.9 11.1a4.4 4.4 0 0 1 0-6.2M11.1 4.9a4.4 4.4 0 0 1 0 6.2M2.8 13.2a7.4 7.4 0 0 1 0-10.4M13.2 2.8a7.4 7.4 0 0 1 0 10.4" /></svg>,
  whatsapp: () => <svg {...base}><path d="M2.6 13.4l.8-2.7a5.4 5.4 0 1 1 2 1.9z" /><path d="M6 6.3c.3 1.9 1.8 3.4 3.7 3.7l.7-1 1.2.5v1.1c-2.6.5-5.7-2.5-5.2-5.1h1.1l.5 1.2z" /></svg>,
  mail: () => <svg {...base}><rect x="2.2" y="3.6" width="11.6" height="8.8" rx="1.2" /><path d="M2.6 4.6L8 8.6l5.4-4" /></svg>,
  monitor: () => <svg {...base}><rect x="2.2" y="3" width="11.6" height="8" rx="1.2" /><path d="M6 13.4h4M8 11v2.4" /></svg>,
  check: () => <svg {...base}><path d="M3.2 8.4l3 3 6.6-7" /></svg>,
  alert: () => <svg {...base}><path d="M8 3v5.4M8 11.3v.5" /><circle cx="8" cy="8" r="6" /></svg>,
  ban: () => <svg {...base}><circle cx="8" cy="8" r="5.8" /><path d="M4 12L12 4" /></svg>,
  question: () => <svg {...base}><circle cx="8" cy="8" r="5.8" /><path d="M6.4 6.3a1.7 1.7 0 1 1 1.9 1.8v1M8.2 11.2v.4" /></svg>,
  dash: () => <svg {...base}><circle cx="8" cy="8" r="5.8" /><path d="M5.6 8h4.8" /></svg>,
  sun: () => <svg {...base}><circle cx="8" cy="8" r="2.9" /><path d="M8 1.6v1.3M8 13.1v1.3M1.6 8h1.3M13.1 8h1.3M3.5 3.5l.9.9M11.6 11.6l.9.9M12.5 3.5l-.9.9M4.4 11.6l-.9.9" /></svg>,
  moon: () => <svg {...base}><path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.7 5.7 0 1 0 6.6 6.6z" /></svg>,
  arrow: () => <svg {...base}><path d="M3 8h9.4M9 4.6L12.4 8 9 11.4" /></svg>,
  send: () => <svg {...base}><path d="M13.6 2.4L7.3 8.7M13.6 2.4l-4 11.2-2.3-4.9-4.9-2.3z" /></svg>,
  refresh: () => <svg {...base}><path d="M13.3 7a5.4 5.4 0 1 0-.3 3.3" /><path d="M13.6 3.4v3.8h-3.8" /></svg>,
  clock: () => <svg {...base}><circle cx="8" cy="8" r="5.8" /><path d="M8 4.8V8l2.2 1.4" /></svg>,
  file: () => <svg {...base}><path d="M9 1.9H4.6a1.1 1.1 0 0 0-1.1 1.1v10a1.1 1.1 0 0 0 1.1 1.1h6.8a1.1 1.1 0 0 0 1.1-1.1V5.3z" /><path d="M9 1.9v3.4h3.5" /></svg>,
};

export type IconName = keyof typeof Icon;
