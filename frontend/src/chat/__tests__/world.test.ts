import { describe, expect, it } from 'vitest'
import { hasWorldOrder, isWorldReply, maybeWorldReply, readWorldReply } from '../world/worldApi'
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
  const op = (text: string, inWorld = [] as Parameters<typeof localIntent>[1], extra?: Parameters<typeof localIntent>[2], worn: string[] = []) =>
    localIntent(text, inWorld, extra, worn)?.ops[0]

  it('handles plain catalog requests locally', () => {
    expect(op('give Lim a ball')).toMatchObject({ op: 'item', spec: { name: 'ball' } })
    expect(op('bring him a rubber duck please')).toMatchObject({ op: 'item', spec: { name: 'rubber duck' } })
    expect(op('can he have a teddy bear?')).toMatchObject({ op: 'item', spec: { name: 'teddy' } })
    expect(op('Lim deserves a crown')).toMatchObject({ op: 'item', spec: { name: 'crown' } })
    expect(op('beach ball please')).toMatchObject({ op: 'item', spec: { name: 'ball' } })
    expect(op('a ball please')).toMatchObject({ op: 'item', spec: { name: 'ball' } })
    expect(op('take him to the beach')).toMatchObject({ op: 'place', spec: { name: 'beach' } })
    expect(op('go to space')).toMatchObject({ op: 'place', spec: { name: 'space' } })
    expect(op('the beach please')).toMatchObject({ op: 'place', spec: { name: 'beach' } })
    expect(op('go home')).toEqual({ op: 'place', spec: null })
    expect(op('take him home')).toEqual({ op: 'place', spec: null })
    expect(op('tidy up the toys')).toEqual({ op: 'clear', what: 'items' })
    expect(op('get rid of all the toys')).toEqual({ op: 'clear', what: 'items' })
    expect(op('reset the world')).toEqual({ op: 'clear', what: 'all' })
    expect(op('make it snow')).toMatchObject({ op: 'tweak', set: { weather: 'snow' } })
    expect(op('low gravity please')).toEqual({ op: 'tweak', set: { gravity: 0.3 } })
    expect(op('stop the rain')).toEqual({ op: 'tweak', set: { weather: 'none' } })
    expect(localIntent('give him an apple')?.reply).toBe('An apple, coming up!')
    expect(localIntent('give him sunglasses please')).toBeNull()
    expect(localIntent('give him some sunglasses')?.reply).toBe('Some sunglasses, coming up!')
    expect(localIntent('give him a cactus')?.reply).toBe('A cactus, coming up!')
  })

  it('acts on what is already there, or brings it and then acts', () => {
    const snail = cleanItem({ name: 'snail', parts: [{ shape: 'bean', color: '#B9E59B' }] })!
    expect(op('eat the apple', [ITEMS.apple.spec])).toEqual({ op: 'act', action: 'eat', target: 'apple' })
    expect(op('kick the snail', [snail])).toEqual({ op: 'act', action: 'kick', target: 'snail' })
    // Known by what the catalog calls it, not only by its display name: no duplicates.
    expect(op('eat the bean', [ITEMS.bean.spec])).toEqual({ op: 'act', action: 'eat', target: 'jelly bean' })
    expect(op('make him kick the duck', [ITEMS.duck.spec])).toEqual({ op: 'act', action: 'kick', target: 'rubber duck' })
    expect(op('wear a crown')).toMatchObject({ op: 'item', spec: { name: 'crown' }, then: 'wear' })
    expect(op('put a crown on lim')).toMatchObject({ op: 'item', spec: { name: 'crown' }, then: 'wear' })
    expect(op('put the party hat on him', [ITEMS['party hat'].spec])).toEqual({ op: 'act', action: 'wear', target: 'party hat' })
    // Taking things off and putting them away never conjures one.
    const hat = ITEMS['party hat'].spec
    const shades = ITEMS.sunglasses.spec
    expect(localIntent('take off the party hat', [hat], undefined, ['party hat'])).toEqual({ ops: [{ op: 'act', action: 'remove', target: 'party hat' }], reply: 'Off it comes!' })
    // "it" is whatever Lim has on, not the newest hat-like thing on the floor.
    expect(op('take it off', [hat, shades], undefined, ['party hat'])).toEqual({ op: 'act', action: 'remove', target: 'party hat' })
    // "The glasses" are the glasses, even when the hat went on last.
    expect(op('take off the glasses', [shades, hat], undefined, ['sunglasses', 'party hat'])).toEqual({ op: 'act', action: 'remove', target: 'sunglasses' })
    expect(op('take the hat off', [shades, hat], undefined, ['party hat', 'sunglasses'])).toEqual({ op: 'act', action: 'remove', target: 'party hat' })
    expect(localIntent('take off the glasses', [hat], undefined, ['party hat'])).toBeNull()
    expect(localIntent('take it off', [hat])).toBeNull()
    expect(localIntent('take off the party hat')).toEqual({ ops: [], reply: 'There is no party hat here.' })
    expect(localIntent('put away the sunglasses')).toEqual({ ops: [], reply: 'There are no sunglasses here.' })
    // Feeding is eating, and uses the bean that is there.
    expect(op('feed him the bean', [ITEMS.bean.spec])).toEqual({ op: 'act', action: 'eat', target: 'jelly bean' })
    expect(localIntent('feed him the cactus')).toBeNull()
    // "play with" is whatever the item is best for.
    expect(op('play with the drum', [ITEMS.drum.spec])).toEqual({ op: 'act', action: 'dance', target: 'drum' })
    expect(op('play with the teddy', [ITEMS.teddy.spec])).toEqual({ op: 'act', action: 'hug', target: 'teddy' })
    expect(op('play with the ball', [ITEMS.ball.spec])).toEqual({ op: 'act', action: 'bounce', target: 'ball' })
    // The reply doesn't promise what the item can't do, in the visitor's own words; nothing is conjured for it.
    expect(localIntent('eat the ball', [ITEMS.ball.spec])).toEqual({ ops: [], reply: "Hmm, I don't think I can eat a ball." })
    expect(localIntent('nap on the cactus', [ITEMS.cactus.spec])).toEqual({ ops: [], reply: "Hmm, I don't think I can nap on a cactus." })
    expect(localIntent('wear the apple')).toBeNull()
  })

  it('knows things the model made earlier, so asking again is free', () => {
    const snail = cleanItem({ name: 'snail', parts: [{ shape: 'bean', color: '#B9E59B' }] })!
    const candy = cleanPlace({ name: 'candy land', sky: ['#FFC7E3', '#FFF3C4'] })!
    const coffee = cleanItem({ name: 'coffee', parts: [{ shape: 'cylinder', color: '#C99A6B' }] })!
    const home = cleanPlace({ name: 'home', sky: ['#FFC7E3', '#FFF3C4'] })!
    const extra = { items: [snail, coffee], places: [candy, home] }
    expect(op('give him a snail', [], extra)).toMatchObject({ op: 'item', spec: { name: 'snail' } })
    expect(op('take lim to candy land', [], extra)).toMatchObject({ op: 'place', spec: { name: 'candy land' } })
    expect(localIntent('give him a snail')).toBeNull()
    // Everyday names the model once used don't turn remarks into requests, and home is still home.
    expect(localIntent('Can he get a coffee with me?', [], extra)).toBeNull()
    expect(op('take him home', [], extra)).toEqual({ op: 'place', spec: null })
  })

  it('sends inventions to the model, and only those', () => {
    const invent = [
      'give him a kite', 'can he have a tiny castle', 'can he have a tiny castle?', 'take lim to a candy land', 'put a scarf on his head',
      'Lim needs a scarf', 'give lim a giant pop-up book', 'bring her a hot dog stand', 'send him to a neon city', 'make it foggy',
      'please give lim a robot dog', 'could you give him a snail?', 'can he wear a wizard hat', 'take him to the moon', 'buy him a skateboard',
    ]
    // (The model decides; this guess only stops a typed trick firing on "tiny castle".)
    for (const m of invent) {
      expect(localIntent(m), m).toBeNull()
      expect(looksLikeWorldRequest(m), m).toBe(true)
    }
    // Richer than the catalog noun: still the model's.
    expect(localIntent('give lim a golden apple tree')).toBeNull()
    expect(looksLikeWorldRequest('give lim a golden apple tree')).toBe(true)
  })

  it('never intercepts questions, remarks, idioms, or anything about Anthony or the chat', () => {
    const chat = [
      "What is Anthony's background?", 'Where has he worked?', 'Has Anthony been to the beach?', 'What are his technical skills?',
      'How can I contact him?', 'Can he play music?', 'Bear with me', 'Sweet!', 'music', 'light', 'party', 'club', 'spring', 'pool',
      'plant', 'moon', 'boo', 'Where did he go to school?', 'What did he build at Google?', 'how can I get in touch', 'Can I see his github',
      'What does he like to eat?', 'Does he like the beach?', 'Is he a star engineer?', 'Tell me about his heart for teaching',
      'What makes him tick?', 'Make it short', 'Put it in a table', 'Give me the tl;dr', 'Can you add some detail?',
      'Can you give me a list of languages he knows?', 'Create a poem about him', 'Go to the next topic', 'Change the subject',
      'Can he have a call next week?', 'Could he visit our office?', 'He needs a better website', 'Should he get a promotion?', 'Make him an offer',
      'Put him in touch with me', "It's raining here today", "What's his take on zero gravity?", 'Clear the chat', 'Reset the conversation',
      'Turn on dark mode', 'Remove the last message', 'Can he have a heart to heart with me?', 'Could he have a ball with us?', 'Should he get a star?',
      'Make it a star', 'I want to go to the beach', 'apple', 'Star', 'Heart', 'space', 'ball', 'Give me his number', 'Throw me a bone here',
      'Bring me up to speed', 'Tell me a joke', 'Send me his resume', 'Make it simpler', 'Go on', 'Take me through his career',
      'Can you give me his email?', 'Give me a summary of his work', 'Add more detail please', 'Put simply, who is he?',
      'Clear explanation, thanks', 'Is the ball in his court?', 'thanks!', 'cool', 'That was sweet', 'I love space', 'Show me his projects',
      // Round 3: chat editing that used to wipe the world.
      'Remove all the fluff', 'remove everything he said about React', 'get rid of everything after the intro', 'Clean up the formatting',
      'Clear all', 'Clear everything', 'Remove that', 'Get rid of the jargon', 'Take away the jargon', 'Tidy that up a bit',
      // Round 3: figures of speech on order verbs.
      'Give it a try', 'Give him my regards', 'Give him a break', 'Give him a chance', 'Give him a shout', 'Give him a raise', 'Give him some credit',
      'Get it?', 'Can you get him on the phone?', 'Bring it on', 'Bring him up to speed', 'Give the highlights', 'Can you bring him a contract?',
      'Can you get it done?', "Let's give him a hand", 'please give him feedback', 'and give him my thanks', 'Can he go to conferences?',
      'Can he have a go at this?', 'Can he have a say in the design?', 'Can he get this done by Friday?', 'Could he get a visa?',
      'Can he play with new frameworks?', 'Can he wear many hats?', 'Can he eat gluten?', 'Can he visit?', 'Can he visit Seoul?',
      'Could he visit in person?', 'Lim needs a break', 'Lim wants a raise', 'I want him to have my number', 'I want him to visit Korea',
      'I want him to wear a suit', 'I want it to go well', 'Can he have a friend over?', 'Go to the next one', 'Teleport', 'Spawn a new thread',
      'Drop the act', 'Drop some knowledge', 'Drop the formalities', 'Throw a party', 'Toss a coin', 'Bring the receipts', 'Summon the facts',
      'Kick it off', 'Kick the tires on his API', 'Eat it', 'Eat the frog first, right?', 'Wear it with pride', 'Hug it out', 'Bounce some ideas',
      'Bounce it off him', 'Play with the idea', 'Play with the numbers', 'Dance with the devil', 'Sleep on it', 'Nap on it', 'Build it',
      'Build him up', 'Build it in Rust', 'Make it rain money', 'Make it day one culture', 'Make it hot off the press', 'Make it dark themed',
      'Make it night and day better', 'Change the scene', 'Turn on the rain sounds', "Let's go home", 'Give him a hand', 'Give him a minute',
      'Give him a name', 'Give him hell', 'Give it a shot', 'Give him a heart attack', 'Give him a star rating', 'some space please',
      'go to the beach with him', 'hug the apple and the ball',
      // Round 4.
      'remove the items', 'remove the stuff', 'clear the things', 'get rid of the stuff', 'Clean up', 'tidy', 'tidy up', 'Make him a star',
      'Dance with the stars', 'Zero gravity?', 'no gravity?', 'normal gravity?', 'Bring him back', 'Take him back', 'The Crown', 'a heart',
      'dance floor', 'beach', 'rubber duck', 'remove the stage', 'play with his heart', 'Give him a buzz', 'Give him the benefit of the doubt', 'put the blame on him', 'take him to task',
    ]
    // Nothing here may be acted on locally. (What the model then makes of it is the model's call.)
    const leaked = chat.filter((m) => localIntent(m) !== null)
    expect(leaked).toEqual([])
    expect(looksLikeWorldRequest('give him ' + 'x '.repeat(100))).toBe(false)
    expect(looksLikeWorldRequest('')).toBe(false)
  })
})

describe('reading the model\'s world order', () => {
  it('tells an order from prose as it streams in', () => {
    for (const head of ['@', '@@', '@@wor', '  @@worl']) {
      expect(maybeWorldReply(head), head).toBe(true)
      expect(isWorldReply(head), head).toBe(false)
    }
    for (const head of ['@@world', '  @@world {"ops"', '@@world {"ops":[]}']) {
      expect(isWorldReply(head), head).toBe(true)
      expect(maybeWorldReply(head), head).toBe(false)
    }
    for (const text of ['', 'Anthony is…', '@anthony', 'See @@world', '@ me later']) {
      expect(isWorldReply(text), text).toBe(false)
      expect(maybeWorldReply(text), text).toBe(false)
    }
    // Wrapped or prefaced by the model: found once the reply is complete.
    expect(hasWorldOrder('```\n@@world {"ops":[]}\n```')).toBe(true)
    expect(hasWorldOrder('Sure!\n@@world {"ops":[]}')).toBe(true)
    expect(hasWorldOrder('The marker is @@world {…} in the docs')).toBe(false)
  })

  it('reads ops and the line, and survives anything', () => {
    const good = readWorldReply('@@world {"ops":[{"op":"item","id":"ball"},{"op":"tweak","set":{"weather":"rain"}}],"reply":"  Catch!  "}')
    expect(good.reply).toBe('Catch!')
    expect(good.ops).toHaveLength(2)
    expect(good.ops[0]).toMatchObject({ op: 'item', spec: { name: 'ball' } })
    // Trailing prose, a second order, braces in strings: the first object wins.
    expect(readWorldReply('@@world {"ops":[{"op":"item","id":"ball"}],"reply":"a } b"} Enjoy {it}!').reply).toBe('a } b')
    expect(readWorldReply('@@world {"ops":[{"op":"item","id":"ball"}],"reply":"1"}\n@@world {"ops":[],"reply":"2"}').reply).toBe('1')
    expect(readWorldReply('```\n@@world {"ops":[{"op":"place","id":"beach"}],"reply":"x"}\n```').ops).toHaveLength(1)
    for (const bad of ['@@world', '@@world {', '@@world {"ops":"x"}', '@@world not json }', '@@world {"ops":[{"op":"item","spec":{"parts":[]}}]}']) {
      expect(readWorldReply(bad).ops, bad).toEqual([])
    }
    expect(readWorldReply('@@world {"ops":[],"reply":"' + 'y'.repeat(500) + '"}').reply).toHaveLength(140)
  })
})
