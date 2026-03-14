import type { CSSProperties } from 'react'

interface KirbyCharacterProps {
  size?: number
  puffAmount?: number // 0–1; controls cheek size and body scale
  style?: CSSProperties
  className?: string
}

export function KirbyCharacter({
  size = 100,
  puffAmount = 0,
  style,
  className,
}: KirbyCharacterProps) {
  const clamped = Math.max(0, Math.min(1, puffAmount))

  // Body inflates noticeably when puffed
  const bodyScale = 1 + clamped * 0.15

  // Cheeks grow significantly and become much more visible
  const cheekScale = 1 + clamped * 1.3
  const cheekOpacity = 0.3 + clamped * 0.5

  return (
    <div
      style={{ ...style, width: size, height: size }}
      className={`kirby-float${className ? ` ${className}` : ''}`}
    >
      <svg
        viewBox="0 0 250 250"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        fill="none"
        aria-hidden="true"
        style={{
          transform: `scale(${bodyScale})`,
          transformOrigin: 'center',
          transition: 'transform 600ms var(--spring-smooth)',
        }}
      >
        <path d="m180.9 168.1c11.86 6.56 24.12 20.1 24.54 33 0.34 10.52-9.24 14.97-30.34 15.11-15.89 0.11-39.12-5.13-47.39-13.25-2.38-2.34-3.65-4.79-4.44-6.5l3.33-2.38 51.57-27.08 2.73 1.1z" fill="#D12828" stroke="#B72222" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" />
        <path d="m140.5 195.8c5.25 8.9 14.34 13.26 29.31 19.23-7.17 0.23-31.57-4.23-41.36-12.9-2.14-2-3.34-3.87-4.24-5.63l3.6-1.58 10.4-1.27 2.29 2.15z" fill="#AF1515" />
        <path d="m50.62 168.1c-11.86 6.56-24.12 18.87-26.39 31.6-2.08 11.28 7.18 16.37 28.28 16.51 15.89 0.11 36.98-5.13 46.38-12.66 3.38-2.83 4.87-5.38 5.93-7.09l-2.91-1.75-48.56-27.71-2.73 1.1z" fill="#D12828" stroke="#9E141B" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.98" />
        <path d="m89.71 195.8c-5.25 8.9-12.49 14.1-27.46 18.85 8.61-0.69 25.63-4.95 34.68-12.11 2.79-2.34 4.13-4.14 5.36-5.89l-3.28-1.54-7.6-1-1.7 1.69z" fill="#AF1515" />
        <path d="m33.92 97.82c-11.86 7.36-23.8 23.09-24.91 37.1-1.26 17.01 10.02 23.36 24.21 22.31 4.99-0.37 8.2-1.05 11.64-2.41l2.03-4.96-5.72-49.54-7.25-2.5z" fill="url(#paint0_radial_603_196)" stroke="#4A0A29" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.98" />
        <path d="m115.1 32c-39.02 0-70.98 26.13-80.08 61.79-1.67 6.89-2.61 13.17-2.61 18.62 0 41.75 30.58 85.21 82.44 85.21 42.49 0 73.39-30.9 80.19-62.7 11.16 1.01 26.07-3.21 34.71-11.45 10.2-9.86 12.79-27.26 7.4-38.75-4.03-8.45-14.5-11.65-14.95-10.87-1.06-1.56 0.36-9.59-5.08-16.64-3.97-5.1-12.71-5-14.27 5.42-1.05 7.15 0.09 14.13-5.35 18.48l-6.25 1.56c-14.2-29.65-40.11-50.67-76.15-50.67z" fill="url(#paint1_radial_603_196)" stroke="#4A0A29" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.98" />
        <path d="m182.5 89.62c4.55-5.93 10.33-7.44 14.76-8.8 5.89-1.86 4.89-14.17 5.99-20 1.76-9.4 10.7-9.2 15.05-1.94 3.78 6.28 3.43 9.96 3.78 14.09 7.03 0.85 13.57 5.75 16.17 11.94 5.44 13.3 1.86 30.02-7.93 39.52s-26.29 11.69-38.56 9.64" fill="url(#paint2_radial_603_196)" />
        <path d="m182.5 89.62c4.55-5.93 10.33-7.44 14.76-8.8 5.89-1.86 4.89-14.17 5.99-20 1.76-9.4 11.3-9.49 15.4-1.94 3.43 6.28 3.08 9.96 3.43 14.09 7.03 0.85 13.57 5.75 16.17 11.94 5.44 13.3 1.86 30.02-7.93 39.52s-26.29 11.69-40.49 9.35" stroke="#4A0A29" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" />
        <path d="m214.7 119.7c-8.39-3.54-12.99-12.69-12.6-20.81 0.4-8.8 5.98-20.19 13.77-20.19" stroke="#4A0A29" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" />
        <path d="m238.6 105.2c-2.81 5.49-7.46 9.89-14.65 9.89-9.81 0-18.81-9.75-18.81-19.06-1.35 7.7 2.73 18.72 9.65 23.03 1.3 0.82 0.9 1.77-0.4 1.37-6.92 5.3-14.22 6.95-24.22 4.26-2.44-0.91-4.58-3.45-4.58-3.45 3.64 5.94 2.54 8.49 2 10.44l1.14 1.95c4.54 1.46 7.87 1.46 10.01 1.26 10.96-0.59 24.41-5.89 29.36-10.59 6.89-6.56 9.59-14.2 10.5-19.1z" fill="#D15769" opacity=".2" />
        <path d="m196.3 192.8c-1.57 3.16-4.31 2.66-6.29-0.59-1.78-3.25-0.84-4.1 0.2-4.54 3.12-1.31 7.23 2.34 6.09 5.13z" fill="#FEE7E7" opacity=".4" />
        <path d="m34.99 135.4c-4.1 5-8.24 7.3-13.98 7.4-6.79 0.1-9.8-4.8-10.3-8.74-0.7 10.42 5.2 21.64 19.4 22.04 6.04 0.17 8.6-0.5 12.41-1.7l-5.19-9.82-0.75-10.52-1.59 1.34z" fill="#D15769" opacity=".2" />
        <path d="m32.38 108.8c2.34-42.05 35.51-74.77 82.54-74.77 33.97 0 59.79 19.62 73.69 46.83l-2.4 2.34c-11.4-25.03-34.85-46.52-71.14-46.52-44.06 0-77.16 32.1-77.16 70.42 0 35.75 29.28 71.8 74.21 71.8 33.57 0 60.79-22.29 74.09-51.85-4.15 32.92-33.7 67.92-74.09 67.92-45.93 0-79.74-34.42-79.74-82.52v-3.65z" fill="url(#paint3_radial_603_196)" opacity=".3" />
        <path d="m32.13 192.1c1.09 3.8 4.05 3.95 6.28 0.9 2.24-3.05 0.6-4.6-0.4-5-3.19-1.3-6.63 1.15-5.88 4.1z" fill="#FEE7E7" opacity=".3" />
        <path d="m105.7 88.72c0 11.96-2.74 21.69-8.78 21.69-6.49 0-8.98-9.73-8.98-21.69 0-11.51 3.09-21.81 9.13-21.81 6.49 0 8.63 10.3 8.63 21.81z" fill="#4A0A29" />
        <path d="m97.05 86.67c3.76 0 5.04-4.59 5.04-8.36 0-3.76-1.88-8.53-5.04-8.53-3.54 0-4.79 4.9-4.79 8.53 0 3.92 1.4 8.36 4.79 8.36z" fill="#FEFFFE" />
        <path d="m91.21 94.48c0.5 7.49 2.5 12.98 5.84 12.98s5.63-5.14 6.08-12.98c-1.94 2.34-4.04 2.94-6.08 2.94s-4.14-0.75-5.84-2.94z" fill="url(#paint4_linear_603_196)" stroke="#185A81" strokeMiterlimit="10" strokeWidth="1.1" />
        <path d="m141.8 88.72c0 11.96-2.99 21.69-8.73 21.69-6.49 0-9.28-9.73-9.28-21.69 0-11.51 3.09-21.81 9.13-21.81 6.24 0 8.88 10.3 8.88 21.81z" fill="#4A0A29" />
        <path d="m133.2 86.67c3.94 0 4.84-4.89 4.84-8.36 0-3.68-1.75-8.53-4.84-8.53-3.69 0-5.14 4.9-5.14 8.53 0 3.92 1.7 8.36 5.14 8.36z" fill="#FEFFFE" />
        <path d="m126.4 94.48c1 7.49 2.7 12.98 6.64 12.98 3.69 0 5.54-6.24 5.84-12.98-1.75 2.34-3.8 2.94-5.84 2.94-2.34 0-4.44-0.75-6.64-2.94z" fill="url(#paint5_linear_603_196)" stroke="#185A81" strokeMiterlimit="10" strokeWidth="1.1" />
        <path d="m115.3 115.2c-6.54-0.15-11.63 1.8-11.63 4.5 0 6.04 5.39 13.63 11.63 13.49 6.89-0.15 11.29-10.82 10.89-14.02-0.3-2.44-5.99-3.87-10.89-3.97z" fill="url(#paint6_linear_603_196)" stroke="#4A0A29" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
        {/* Left cheek — scales outward from its centre as puffAmount rises */}
        <g
          style={{
            transformOrigin: '72px 107px',
            transform: `scale(${cheekScale})`,
            transition: 'transform 600ms var(--spring-smooth), opacity 400ms ease-out',
          }}
        >
          <path d="m71.93 103.7c-7.74 0-11.83 3.99-11.83 6.44 0 3.95 4.54 7 12.13 7 8.69 0 11.98-3.25 11.98-7 0-3.64-4.39-6.44-12.28-6.44z" fill="#FF85A1" opacity={cheekOpacity} />
        </g>
        {/* Right cheek */}
        <g
          style={{
            transformOrigin: '157px 107px',
            transform: `scale(${cheekScale})`,
            transition: 'transform 600ms var(--spring-smooth), opacity 400ms ease-out',
          }}
        >
          <path d="m157.4 103.7c-7.79 0-12.03 3.39-12.03 6.44 0 4.25 4.24 7 11.83 7 7.44 0 11.58-3.65 11.58-7 0-3.94-3.89-6.44-11.38-6.44z" fill="#FF85A1" opacity={cheekOpacity} />
        </g>
        <defs>
          <radialGradient id="paint0_radial_603_196" cx="0" cy="0" r="1" gradientTransform="translate(27.46 127.4) scale(29.08 30.79)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFB5C1" offset="0" />
            <stop stopColor="#F6929E" offset="1" />
          </radialGradient>
          <radialGradient id="paint1_radial_603_196" cx="0" cy="0" r="1" gradientTransform="translate(114.2 101.3) scale(102 99.9)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFB5C1" offset="0" />
            <stop stopColor="#F9909D" offset="1" />
          </radialGradient>
          <radialGradient id="paint2_radial_603_196" cx="0" cy="0" r="1" gradientTransform="translate(215 100.6) scale(33.17 32.55)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFB5C1" offset="0" />
            <stop stopColor="#F6929E" offset="1" />
          </radialGradient>
          <radialGradient id="paint3_radial_603_196" cx="0" cy="0" r="1" gradientTransform="translate(112.4 104.7) scale(92.26 90.41)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFD2DC" offset="0" />
            <stop stopColor="#FFB8C6" stopOpacity=".01" offset="1" />
          </radialGradient>
          <linearGradient id="paint4_linear_603_196" x1="97.17" x2="97.17" y1="94.48" y2="107.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#365489" offset="0" />
            <stop stopColor="#206182" offset="1" />
          </linearGradient>
          <linearGradient id="paint5_linear_603_196" x1="132.6" x2="132.6" y1="94.48" y2="107.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#365489" offset="0" />
            <stop stopColor="#206182" offset="1" />
          </linearGradient>
          <linearGradient id="paint6_linear_603_196" x1="115" x2="115" y1="115.2" y2="133.2" gradientUnits="userSpaceOnUse">
            <stop stopColor="#CA3538" offset="0" />
            <stop stopColor="#F1646F" offset="1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
