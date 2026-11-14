import { describe, expect, it } from 'vitest'
import {
  ACTIONS, ITEMS, PLACES, SHAPES, TRAITS, actionsFor, cleanItem, cleanName, cleanOps, cleanPlace, cleanTweak, localIntent,
  looksLikeWorldRequest, soften,
} from '../world/spec'

const HEX = /^#[0-9A-F]{6}$/

describe('catalog', () => {
  it('every item is a valid spec that Lim can do several things with', () => {
    for (const [id, { spec }] of Object.entries(ITEMS)) {
      expect(spec.parts.length, id).toBeGreaterThan(0)
      expect(spec.parts.length, id).toBeLessThanOrEqual(6)
      for (const p of spec.parts) {
        expect(SHAPES, id).toContain(p.shape)
        expect(p.color, id).toMatch(HEX)
      }
      for (const t of spec.traits) expect(TRAITS, id).toContain(t)
      expect(spec.face, id).toBeLessThan(spec.parts.length)
      // look, kick, hug, put away, and usually something of its own.
      expect(actionsFor(spec).length, id).toBeGreaterThanOrEqual(4)
      // A catalog spec survives its own cleaner unchanged in shape.
      expect(cleanItem(spec)?.parts.length, id).toBe(spec.parts.length)
    }
  })

  it('every place is a valid spec', () => {
    for (const [id, { spec }] of Object.entries(PLACES)) {
      const cleaned = cleanPlace(spec)
      expect(cleaned?.name, id).toBe(spec.name)
      expect(cleaned?.weather, id).toBe(spec.weather)
    }
  })

  it('traits open up actions', () => {
    expect(actionsFor(ITEMS.apple.spec)).toContain('eat')
    expect(actionsFor(ITEMS.apple.spec)).not.toContain('wear')
    expect(actionsFor(ITEMS.crown.spec)).toContain('wear')
    expect(actionsFor(ITEMS.ball.spec)).toContain('bounce')
    expect(actionsFor(ITEMS.drum.spec)).toContain('dance')
    expect(actionsFor(ITEMS.pillow.spec)).toContain('nap')
    for (const a of actionsFor(ITEMS.teddy.spec)) expect(ACTIONS).toContain(a)
  })
})

describe('cleaning what the model sends', () => {
  it('clamps numbers, drops unknown enums, bounds the part count and the name', () => {
    const item = cleanItem({
      name: '<img src=x onerror=alert(1)> DROP TABLE; a very very very long name indeed',
      size: 9999,
      traits: ['edible', 'explosive', 'edible', 42],
      face: 12,
      parts: Array.from({ length: 20 }, (_, i) => ({ shape: i ? 'tesseract' : 'box', color: 'red', at: [1e9, -1e9, NaN], scale: [0, 99, -3], tilt: 1e6 })),
    })!
    expect(item.parts).toHaveLength(6)
    expect(item.size).toBe(1.7)
    expect(item.traits).toEqual(['edible'])
    expect(item.face).toBe(-1)
    expect(item.name.length).toBeLessThanOrEqual(28)
    expect(item.name).not.toMatch(/[<>=;()]/)
    for (const p of item.parts) {
      expect(SHAPES).toContain(p.shape)
      expect(p.color).toMatch(HEX)
      for (const v of [...p.at, ...p.scale, p.tilt]) expect(Number.isFinite(v)).toBe(true)
      for (const v of p.at) expect(Math.abs(v)).toBeLessThanOrEqual(1.8 * 3)
      for (const v of p.scale) expect(v).toBeGreaterThan(0)
    }
    expect(item.parts[0].at).toEqual([0, 0, 0])
  })

  it('rejects things that are not items or places at all', () => {
    for (const raw of [null, undefined, 3, 'ball', [], {}, { parts: [] }, { parts: 'many' }, { parts: [null, 4] }]) expect(cleanItem(raw)).toBeNull()
    for (const raw of [null, 3, {}, { sky: [] }, { sky: ['blue', 'red'] }, { name: 'studio', sky: ['#000000', '#111111'] }]) expect(cleanPlace(raw)).toBeNull()
  })

  it('rescales an item built in the wrong units to about one body radius', () => {
    const tiny = cleanItem({ parts: [{ shape: 'ball', color: '#AABBCC', scale: [0.3, 0.3, 0.3] }, { shape: 'cone', color: '#AABBCC', at: [0, 0.3, 0], scale: [0.1, 0.1, 0.1] }] })!
    const huge = cleanItem({ parts: [{ shape: 'ball', color: '#AABBCC', scale: [1.6, 1.6, 1.6] }, { shape: 'cone', color: '#AABBCC', at: [0, 1.8, 0], scale: [1.6, 1.6, 1.6] }] })!
    const reach = (item: typeof tiny) => Math.max(...item.parts.flatMap((p) => [Math.abs(p.at[0]) + p.scale[0], Math.abs(p.at[1]) + p.scale[1]]))
    expect(reach(tiny)).toBeGreaterThan(0.9)
    expect(reach(huge)).toBeLessThan(2.4)
  })

  it('pulls invented colours into the palette', () => {
    expect(soften('#000000')).toBe('#2B2140')
    expect(soften('#FF0000')).not.toBe('#FF0000')
    expect(soften('#C7B6FF')).toMatch(HEX)
    const place = cleanPlace({ sky: ['#00ff00', '#00FF00'], floor: '#FFFFFF', dots: '#FFFFFF', rug: '#FFFFFF' })!
    expect(place.sky[0]).not.toBe('#00FF00')
    // Dots and rug stay visible against the floor.
    expect(place.dots).not.toBe(place.floor)
    expect(place.rug).not.toBe(place.floor)
    expect(place.gravity).toBe(1)
  })

  it('reads ops: catalog ids, invented specs, acts, tweaks; drops the rest', () => {
    const ops = cleanOps([
      { op: 'item', id: 'BALL' },
      { op: 'item', id: 'nope' },
      { op: 'place', id: 'studio' },
      { op: 'tweak', set: { weather: 'rain', gravity: -5, dark: 'yes', bogus: 1 } },
    ])
    expect(ops).toHaveLength(3)
    expect(ops[0]).toMatchObject({ op: 'item', spec: { name: 'ball' } })
    expect(ops[1]).toEqual({ op: 'place', spec: null })
    expect(ops[2]).toEqual({ op: 'tweak', set: { weather: 'rain', weatherColor: '#9CC7EE', gravity: 0.25 } })
    const more = cleanOps([
      { op: 'act', action: 'explode', target: '  The <b>Apple</b> ' },
      { op: 'clear', what: 'universe' },
      { op: 'launch' },
      { op: 'item', id: 'duck' },
      // Only the first four entries are ever considered.
      { op: 'item', id: 'ball' },
    ])
    expect(more).toHaveLength(3)
    expect(more[0]).toEqual({ op: 'act', action: 'look', target: 'the b apple b' })
    expect(more[1]).toEqual({ op: 'clear', what: 'items' })
    expect(cleanOps('nonsense')).toEqual([])
    expect(cleanOps([{ op: 'tweak', set: {} }])).toEqual([])
    expect(cleanTweak({ weather: 'acid' })).toBeNull()
    expect(cleanName('  Rubber   DUCK!! ')).toBe('rubber duck')
  })
})

describe('reading a message without the model', () => {
  it('handles plain catalog requests locally', () => {
    expect(localIntent('give Lim a ball')?.ops[0]).toMatchObject({ op: 'item', spec: { name: 'ball' } })
    expect(localIntent('drop a rubber duck please')?.ops[0]).toMatchObject({ op: 'item', spec: { name: 'rubber duck' } })
    expect(localIntent('can he have a teddy bear?')?.ops[0]).toMatchObject({ op: 'item', spec: { name: 'teddy' } })
    expect(localIntent('beach ball')?.ops[0]).toMatchObject({ op: 'item', spec: { name: 'ball' } })
    expect(localIntent('take him to the beach')?.ops[0]).toMatchObject({ op: 'place', spec: { name: 'beach' } })
    expect(localIntent('space!')?.ops[0]).toMatchObject({ op: 'place', spec: { name: 'space' } })
    expect(localIntent('go home')?.ops[0]).toEqual({ op: 'place', spec: null })
    expect(localIntent('tidy up')?.ops[0]).toEqual({ op: 'clear', what: 'items' })
    expect(localIntent('make it snow')?.ops[0]).toMatchObject({ op: 'tweak', set: { weather: 'snow' } })
    expect(localIntent('low gravity please')?.ops[0]).toEqual({ op: 'tweak', set: { gravity: 0.3 } })
    expect(localIntent('stop the rain')?.ops[0]).toEqual({ op: 'tweak', set: { weather: 'none' } })
  })

  it('acts on what is already there, or brings it and then acts', () => {
    expect(localIntent('eat the apple', ['apple'])?.ops[0]).toEqual({ op: 'act', action: 'eat', target: 'apple' })
    expect(localIntent('kick the snail', ['snail'])?.ops[0]).toEqual({ op: 'act', action: 'kick', target: 'snail' })
    expect(localIntent('wear a crown')?.ops[0]).toMatchObject({ op: 'item', spec: { name: 'crown' }, then: 'wear' })
    // Not something this item can do: just bring it.
    expect(localIntent('eat the crown')?.ops[0]).toMatchObject({ op: 'item', then: undefined })
  })

  it('knows things the model made earlier, so asking again is free', () => {
    const snail = cleanItem({ name: 'snail', parts: [{ shape: 'bean', color: '#B9E59B' }] })!
    const candy = cleanPlace({ name: 'candy land', sky: ['#FFC7E3', '#FFF3C4'] })!
    const extra = { items: [snail], places: [candy] }
    expect(localIntent('give him a snail', [], extra)?.ops[0]).toMatchObject({ op: 'item', spec: { name: 'snail' } })
    expect(localIntent('take lim to candy land', [], extra)?.ops[0]).toMatchObject({ op: 'place', spec: { name: 'candy land' } })
    expect(localIntent('give him a snail')).toBeNull()
  })

  it('leaves richer requests to the model', () => {
    expect(localIntent('take him to a candy land')).toBeNull()
    expect(localIntent('give lim a golden apple tree')).toBeNull()
    expect(localIntent('take him to the beach at night with fireworks')).toBeNull()
    expect(localIntent('make it rain frogs')).toBeNull()
    for (const m of ['give him a kite', 'can he have a tiny castle', 'take lim to a candy land', 'put a hat on his head', 'make it rain frogs', 'Lim needs a scarf']) {
      expect(looksLikeWorldRequest(m), m).toBe(true)
    }
  })

  it('never intercepts questions, remarks, or anything about Anthony', () => {
    const chat = [
      "What is Anthony's background?", 'Where has he worked?', 'Has Anthony been to the beach?', 'What are his technical skills?',
      'How can I contact him?', 'Can he play music?', 'Bear with me', 'Sweet!', 'music', 'light', 'party', 'club', 'spring', 'pool',
      'plant', 'moon', 'boo', 'Where did he go to school?', 'What did he build at Google?', 'how can I get in touch', 'Can I see his github',
      'What does he like to eat?', 'Does he like the beach?', 'Is he a star engineer?', 'Tell me about his heart for teaching',
      'What makes him tick?', 'Can you give me his email?', 'Give me a summary of his work', 'Add more detail please', 'Put simply, who is he?',
      'Clear explanation, thanks', 'Is the ball in his court?', 'thanks!', 'cool', 'That was sweet', 'I love space', 'Show me his projects',
    ]
    for (const m of chat) {
      expect(localIntent(m), m).toBeNull()
      expect(looksLikeWorldRequest(m), m).toBe(false)
    }
    expect(looksLikeWorldRequest('give ' + 'x'.repeat(300))).toBe(false)
    expect(looksLikeWorldRequest('')).toBe(false)
  })
})
