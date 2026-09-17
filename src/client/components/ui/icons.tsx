import type { SVGProps } from "react";

// Conjunto minimo de icones proprios (stroke-based, 24x24, stroke-width 1.75) para evitar
// adicionar uma biblioteca de icones externa nesta primeira rodada do Design System.
// Todos compartilham a mesma assinatura visual para permanecerem consistentes entre si.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function iconBaseProps(size: number, props: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props
  };
}

export function MenuIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <line x1="3.5" y1="6.5" x2="20.5" y2="6.5" />
      <line x1="3.5" y1="12" x2="20.5" y2="12" />
      <line x1="3.5" y1="17.5" x2="20.5" y2="17.5" />
    </svg>
  );
}

export function CloseIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <polyline points="5.5 8.5 12 15 18.5 8.5" />
    </svg>
  );
}

export function HomeIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5h12V10" />
      <path d="M10 19.5v-6h4v6" />
    </svg>
  );
}

export function BriefcaseIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <rect x="3.5" y="7.5" width="17" height="11.5" rx="2" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <line x1="3.5" y1="12.5" x2="20.5" y2="12.5" />
    </svg>
  );
}

export function UsersIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.3.4 3.8 2.1 4 4.8" />
    </svg>
  );
}

export function TrendingUpIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <polyline points="3.5 16.5 9.5 10.5 13.5 14 20.5 6.5" />
      <polyline points="14.5 6.5 20.5 6.5 20.5 12.5" />
    </svg>
  );
}

export function BuildingIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <rect x="5" y="3.5" width="10" height="17" rx="1" />
      <rect x="15" y="9.5" width="4.5" height="11" rx="1" />
      <line x1="8" y1="7.5" x2="8" y2="7.5" />
      <line x1="12" y1="7.5" x2="12" y2="7.5" />
      <line x1="8" y1="11" x2="8" y2="11" />
      <line x1="12" y1="11" x2="12" y2="11" />
      <line x1="8" y1="14.5" x2="8" y2="14.5" />
      <line x1="12" y1="14.5" x2="12" y2="14.5" />
    </svg>
  );
}

export function SettingsIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3M12 18.2v2.3M4.9 6.9l1.6 1.6M17.5 15.5l1.6 1.6M3.5 12h2.3M18.2 12h2.3M4.9 17.1l1.6-1.6M17.5 8.5l1.6-1.6" />
    </svg>
  );
}

export function SparkleIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9Z" />
    </svg>
  );
}

export function UserIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5 19c0-3.4 3.1-6 7-6s7 2.6 7 6" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <path d="M12 4 21 19.5H3Z" />
      <line x1="12" y1="10" x2="12" y2="14.3" />
      <line x1="12" y1="16.7" x2="12" y2="16.7" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="8.3 12.3 10.8 14.8 15.7 9.5" />
    </svg>
  );
}

export function InboxIcon({ size = 32, ...props }: IconProps) {
  return (
    <svg {...iconBaseProps(size, props)}>
      <path d="M4 12.5 6.5 5h11L20 12.5" />
      <path d="M4 12.5v6a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-6" />
      <path d="M4 12.5h5l1 2.3h4l1-2.3h5" />
    </svg>
  );
}
