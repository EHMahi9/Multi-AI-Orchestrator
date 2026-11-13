import React from 'react';

interface LogoProps {
  size?: number | 'sm' | 'md' | 'lg';
  className?: string;
  glow?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', className = '', glow = true }) => {
  let dimension = 24;
  if (typeof size === 'number') {
    dimension = size;
  } else if (size === 'sm') {
    dimension = 18;
  } else if (size === 'md') {
    dimension = 24;
  } else if (size === 'lg') {
    dimension = 36;
  }

  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 128 128"
      className={`nexus-logo ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        filter: glow ? 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.45))' : 'none',
        flexShrink: 0,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="reactLogoHex" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="35%" stopColor="#3b82f6" />
          <stop offset="70%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="reactLogoCore" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* Outer Hexagon Protective Boundary */}
      <polygon
        points="64,8 114,36 114,92 64,120 14,92 14,36"
        fill="#0a0d15"
        stroke="url(#reactLogoHex)"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* Consensus Relays */}
      <line x1="64" y1="30" x2="64" y2="98" stroke="#3b82f6" strokeWidth="2.5" opacity="0.8" />
      <line x1="30" y1="64" x2="98" y2="64" stroke="#10b981" strokeWidth="2.5" opacity="0.8" />
      <line x1="64" y1="30" x2="98" y2="64" stroke="#6366f1" strokeWidth="1.5" opacity="0.5" />
      <line x1="98" y1="64" x2="64" y2="98" stroke="#6366f1" strokeWidth="1.5" opacity="0.5" />
      <line x1="64" y1="98" x2="30" y2="64" stroke="#6366f1" strokeWidth="1.5" opacity="0.5" />
      <line x1="30" y1="64" x2="64" y2="30" stroke="#6366f1" strokeWidth="1.5" opacity="0.5" />

      {/* Center Nexus Core Diamond */}
      <polygon points="64,52 76,64 64,76 52,64" fill="url(#reactLogoCore)" />
      <circle cx="64" cy="64" r="3.5" fill="#ffffff" />

      {/* 4 AI Provider Nodes */}
      <circle cx="64" cy="30" r="7" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.5" />
      <circle cx="98" cy="64" r="7" fill="#10a37f" stroke="#ffffff" strokeWidth="1.5" />
      <circle cx="64" cy="98" r="7" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
      <circle cx="30" cy="64" r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
    </svg>
  );
};
