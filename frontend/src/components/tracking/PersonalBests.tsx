import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import type { PersonalBest } from '@/stores/historyStore'
import { Wind, Flame, Box, Trophy } from 'lucide-react'

interface PersonalBestsProps {
  personalBests: Record<TechniqueId, PersonalBest | undefined>
}

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-6 w-6" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-6 w-6" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-6 w-6" />,
}

export function PersonalBests({ personalBests }: PersonalBestsProps) {
  const hasBests = Object.values(personalBests).some(Boolean)

  if (!hasBests) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Personal Bests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            Complete sessions to set personal records!
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Personal Bests
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {Object.values(TECHNIQUE_IDS).map((techniqueId) => {
            const best = personalBests[techniqueId]
            if (!best) return null

            return (
              <div
                key={techniqueId}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="text-primary">
                    {techniqueIcons[techniqueId]}
                  </div>
                  <div>
                    <div className="font-medium">
                      {breathingProtocols[techniqueId].name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(new Date(best.date))}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold text-primary">
                  {best.maxHoldTime}s
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
