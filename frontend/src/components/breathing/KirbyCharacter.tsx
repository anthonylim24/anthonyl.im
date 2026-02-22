import type { CSSProperties } from 'react'

interface KirbyCharacterProps {
  size?: number
  puffAmount?: number // 0–1; controls how inflated the cheeks are
  style?: CSSProperties
  className?: string
}

export function KirbyCharacter({
  size = 100,
  puffAmount = 0,
  style,
  className,
}: KirbyCharacterProps) {
  const cheekRx = 11 + puffAmount * 5
  const cheekRy = 8 + puffAmount * 4

  return (
    <div style={{ width: size, height: size, ...style }} className={className}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        {/* Arms (behind body) */}
        <ellipse cx="11" cy="64" rx="9" ry="12" fill="#FFB8D4" />
        <ellipse cx="89" cy="64" rx="9" ry="12" fill="#FFB8D4" />
        {/* Feet (behind body) */}
        <ellipse cx="33" cy="88" rx="16" ry="9" fill="#DB5A7B" />
        <ellipse cx="67" cy="88" rx="16" ry="9" fill="#DB5A7B" />
        {/* Body */}
        <ellipse cx="50" cy="52" rx="42" ry="40" fill="#FFB8D4" />
        {/* Cheeks — expand with puffAmount */}
        <ellipse cx="21" cy="58" rx={cheekRx} ry={cheekRy} fill="#FF85A1" opacity="0.65" />
        <ellipse cx="79" cy="58" rx={cheekRx} ry={cheekRy} fill="#FF85A1" opacity="0.65" />
        {/* Eyes */}
        <ellipse cx="35" cy="46" rx="8" ry="10" fill="#1a1a2e" />
        <ellipse cx="65" cy="46" rx="8" ry="10" fill="#1a1a2e" />
        {/* Eye highlights */}
        <circle cx="32" cy="42" r="3" fill="white" />
        <circle cx="62" cy="42" r="3" fill="white" />
        {/* Mouth */}
        <ellipse cx="50" cy="65" rx="5" ry="4" fill="#C0405A" />
      </svg>
    </div>
  )
}
