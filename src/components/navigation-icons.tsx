import type { NavIconName } from './nav-model';

export type NavigationIconName =
  | NavIconName
  | 'search'
  | 'menu'
  | 'close'
  | 'collapse'
  | 'expand'
  | 'logout';

const paths: Record<NavigationIconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  connections: (
    <>
      <path d="M8.5 15.5 15.5 8.5" />
      <path d="M7 6.5 5.5 5A3.5 3.5 0 0 0 .6 10l2 2a3.5 3.5 0 0 0 5 0l1-1" />
      <path d="m17 17.5 1.5 1.5a3.5 3.5 0 0 0 4.9-5l-2-2a3.5 3.5 0 0 0-5 0l-1 1" />
    </>
  ),
  inventory: (
    <>
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  kits: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12h18M7.5 8C5 8 4.5 4 7 4c2.2 0 5 4 5 4s2.8-4 5-4c2.5 0 2 4-.5 4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  tasks: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 9 1.5 1.5L12 8M14 10h3M8 15l1.5 1.5L12 14M14 16h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  clients: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 4.5a3 3 0 0 1 0 7M17 14c2.7.4 4 2.3 4 5" />
    </>
  ),
  playbooks: (
    <>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z" />
      <path d="M5 4.5v17M9 7h7M9 11h7" />
    </>
  ),
  consulting: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      <path d="m3 7 6-4 6 6 6-5" />
    </>
  ),
  portfolio: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M8 6V4h8v2M3 11h18M10 11v2h4v-2" />
    </>
  ),
  performance: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-8M22 19H2" />
      <path d="m3 6 6-3 6 5 6-6" />
    </>
  ),
  operations: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2M4.5 4.5 7 7M19.5 4.5 17 7" />
    </>
  ),
  users: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2.5 20c0-4 1.8-6 5.5-6s5.5 2 5.5 6M14 15c3.8-.5 6 1.2 6.5 4.5" />
    </>
  ),
  compare: (
    <>
      <path d="M7 7h13l-3-3M20 7l-3 3M17 17H4l3 3M4 17l3-3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  collapse: <path d="m14 6-6 6 6 6M20 4v16" />,
  expand: <path d="m10 6 6 6-6 6M4 4v16" />,
  logout: (
    <>
      <path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5M14 8l4 4-4 4M18 12H8" />
    </>
  ),
};

export function NavigationIcon({
  name,
  className = 'h-5 w-5',
}: {
  name: NavigationIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
