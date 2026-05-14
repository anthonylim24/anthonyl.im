import { memo, type CSSProperties } from 'react'

interface KirbyCharacterProps {
  size?: number
  puffAmount?: number
  style?: CSSProperties
  className?: string
}

export const KirbyCharacter = memo(function KirbyCharacter({
  size = 100,
  puffAmount = 0,
  style,
  className,
}: KirbyCharacterProps) {
  const clamped = Math.max(0, Math.min(1, puffAmount))
  const bodyScale = 0.85 + clamped * 0.45
  const cheekScale = 1 + clamped * 1.8
  const cheekOpacity = 0.2 + clamped * 0.6
  const squashY = 1 + clamped * 0.06
  const squashX = 1 - clamped * 0.03

  return (
    <div
      style={{ ...style, width: size, height: size }}
      className={className}
      data-testid="kirby-character"
    >
      <svg
        viewBox="0 0 250 250"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        fill="none"
        aria-hidden="true"
        style={{
          transform: `scale(${bodyScale}) scaleX(${squashX}) scaleY(${squashY})`,
          transformOrigin: 'center 60%',
          transition: 'transform 600ms var(--spring-smooth)',
        }}
      >
        <ellipse cx="63" cy="136" rx="27" ry="36" fill="#F58AA8" stroke="#4A0A29" strokeWidth="5" transform="rotate(-28 63 136)" />
        <ellipse cx="187" cy="136" rx="27" ry="36" fill="#F58AA8" stroke="#4A0A29" strokeWidth="5" transform="rotate(28 187 136)" />
        <ellipse cx="82" cy="208" rx="38" ry="18" fill="#C92A35" stroke="#7F1020" strokeWidth="5" transform="rotate(-12 82 208)" />
        <ellipse cx="168" cy="208" rx="38" ry="18" fill="#C92A35" stroke="#7F1020" strokeWidth="5" transform="rotate(12 168 208)" />
        <circle cx="125" cy="123" r="78" fill="url(#kirbyBody)" stroke="#4A0A29" strokeWidth="5" />
        <path d="M78 65c24-22 68-26 98 1" stroke="#FFD6E0" strokeWidth="10" strokeLinecap="round" opacity="0.45" />
        <g
          style={{
            transformOrigin: '82px 132px',
            transform: `scale(${cheekScale})`,
            transition: 'transform 600ms var(--spring-smooth), opacity 400ms ease-out',
          }}
        >
          <ellipse cx="82" cy="132" rx="17" ry="10" fill="#FF6F9B" opacity={cheekOpacity} />
        </g>
        <g
          style={{
            transformOrigin: '168px 132px',
            transform: `scale(${cheekScale})`,
            transition: 'transform 600ms var(--spring-smooth), opacity 400ms ease-out',
          }}
        >
          <ellipse cx="168" cy="132" rx="17" ry="10" fill="#FF6F9B" opacity={cheekOpacity} />
        </g>
        <ellipse cx="99" cy="103" rx="10" ry="26" fill="#241027" />
        <ellipse cx="151" cy="103" rx="10" ry="26" fill="#241027" />
        <ellipse cx="101" cy="93" rx="4" ry="9" fill="#FFFFFF" />
        <ellipse cx="153" cy="93" rx="4" ry="9" fill="#FFFFFF" />
        <path d="M111 143c7 8 21 8 28 0" stroke="#4A0A29" strokeWidth="5" strokeLinecap="round" />
        <defs>
          <radialGradient id="kirbyBody" cx="0" cy="0" r="1" gradientTransform="translate(101 84) rotate(52) scale(132)">
            <stop stopColor="#FFD7E1" />
            <stop offset="0.52" stopColor="#F9A2B8" />
            <stop offset="1" stopColor="#F07C9C" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  )
})
