import { withViteBase } from '@/lib/routerBasename'
import { sx, stylex } from '@/styles/merge'

const styles = stylex.create({
  root: {
    flexShrink: 0,
    objectFit: 'contain',
  },
})

interface BreathFlowMarkProps {
  size?: number
  style?: Parameters<typeof sx>[0]
}

export function BreathFlowMark({ size = 28, style }: BreathFlowMarkProps) {
  return (
    <img
      src={withViteBase('/breathflow-mark.png')}
      alt=""
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      {...sx(styles.root, style)}
    />
  )
}
