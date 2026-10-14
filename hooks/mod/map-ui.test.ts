import { describe, expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

const LEDGER = {
  version: 1,
  nodes: {
    'ip-routing': { status: 'passed', lastTaughtAt: '2026-10-10T04:35:00.702Z' },
    delegation: { status: 'failed', lastTaughtAt: '2026-10-10T05:00:00.000Z' },
  },
  session: {
    goal: 'Understand DNS',
    status: 'in-progress',
    nextNodeId: 'delegation',
    dependencyMap: {
      nodes: ['ip-routing', 'delegation', 'referrals'],
      edges: [['ip-routing', 'delegation'], ['delegation', 'referrals']],
    },
  },
}

const CONFIG = '/cfg'
const SESSION = 'test-session'

// The engine's file system, session id, environment and clock are what the plugin
// reads; the test stands in for each beneath the plugin.
function world(on: any, files: Record<string, string>, toasts: string[] = [], statuses: (string | undefined)[] = []) {
  mock.env(on, { CLAUDE_CONFIG_DIR: CONFIG })
  const clock = mock.clock(on)
  on('session.id', () => ({ value: SESSION }))
  on('fs.read', (_$: any, e: any) => {
    if (!(e.path in files)) throw new Error(`ENOENT: ${e.path}`)
    return { value: files[e.path] }
  })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$: any, e: any) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  return clock
}

const LESSON = {
  [`${CONFIG}/sensei/active/${SESSION}.json`]: JSON.stringify({ topic: 'dns' }),
  [`${CONFIG}/sensei/ledgers/dns.json`]: JSON.stringify(LEDGER),
}

const START = { cwd: '/', isInteractive: true }
const PANE = { title: 'Map', isFocused: true, bodyColumns: 80 }

describe('map pane', () => {
  for (const surface of SURFACES) {
    test(`draws the map and a node's detail on ${surface}`, async ($, on) => {
      world(on, LESSON)
      await $.session.start({ ...START, surface })
      const ui = await $.ui.mount({ plugin: 'sensei', surface, component: 'Pane', requestId: 'map', props: PANE })

      expect(await ui.find({ type: 'Button', key: 'node:ip-routing' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'node:delegation' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '1 of 3 passed' })).toBeDefined()

      await ui.press({ key: 'node:delegation' })
      expect(await ui.find({ type: 'Text', text: /Needs: ip routing/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Unlocks: referrals/ })).toBeDefined()
    })
  }

  test('says there is no plan yet when no topic is active', async ($, on) => {
    world(on, {})
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: 'sensei', surface: 'terminal', component: 'Pane', requestId: 'map', props: PANE })
    expect(await ui.find({ type: 'Text', text: /No plan yet/ })).toBeDefined()
  })

  test('says there is no plan yet while the lesson has none', async ($, on) => {
    const intake = { nodes: {}, session: { goal: 'Understand DNS', status: 'intake', dependencyMap: null } }
    world(on, { ...LESSON, [`${CONFIG}/sensei/ledgers/dns.json`]: JSON.stringify(intake) })
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: 'sensei', surface: 'terminal', component: 'Pane', requestId: 'map', props: PANE })
    expect(await ui.find({ type: 'Text', text: /No plan yet/ })).toBeDefined()
  })

  test('draws a proposed plan with a clear label and no progress count', async ($, on) => {
    const proposed = { nodes: {}, session: { goal: 'Understand DNS', status: 'intake', dependencyMap: null, proposedPlan: LEDGER.session.dependencyMap } }
    world(on, { ...LESSON, [`${CONFIG}/sensei/ledgers/dns.json`]: JSON.stringify(proposed) })
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: 'sensei', surface: 'terminal', component: 'Pane', requestId: 'map', props: PANE })
    expect(await ui.find({ type: 'Text', text: /Proposed plan — not approved yet/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'node:referrals' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /passed/ })).toBeUndefined()
    await ui.press({ key: 'node:referrals' })
    expect(await ui.find({ type: 'Text', text: /Status: proposed/ })).toBeDefined()
  })

  test('draws what it can from a ledger with a cyclic plan and missing fields', async ($, on) => {
    const odd = { nodes: {}, session: { goal: 'g', status: 'in-progress', dependencyMap: { nodes: ['a', 'b'], edges: [['a', 'b'], ['b', 'a'], 'junk'] } } }
    world(on, { ...LESSON, [`${CONFIG}/sensei/ledgers/dns.json`]: JSON.stringify(odd) })
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: 'sensei', surface: 'terminal', component: 'Pane', requestId: 'map', props: PANE })
    expect(await ui.find({ type: 'Button', key: 'node:a' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'node:b' })).toBeDefined()
  })
})

describe('band', () => {
  test('shows the step line while a lesson runs', async ($, on) => {
    world(on, LESSON)
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({
      plugin: 'sensei', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false },
    })
    expect(await ui.find({ type: 'Text', text: /Step 2 of 3 · delegation · retry/ })).toBeDefined()
  })
})

describe('toasts', () => {
  test('toasts a newly passed node once, when the ledger changes between polls', async ($, on) => {
    const toasts: string[] = []
    const files = { ...LESSON }
    const clock = world(on, files, toasts)
    await $.session.start({ ...START, surface: 'terminal' })
    expect(toasts).toEqual([])

    const next = structuredClone(LEDGER)
    next.nodes.delegation.status = 'passed'
    files[`${CONFIG}/sensei/ledgers/dns.json`] = JSON.stringify(next)
    await clock.advance(1000)
    expect(toasts).toEqual(['✓ delegation'])

    await clock.advance(3000)
    expect(toasts).toEqual(['✓ delegation'])
  })

  test('pins the latest result on the status line beside the toast, and clears it with the lesson', async ($, on) => {
    const toasts: string[] = []
    const statuses: (string | undefined)[] = []
    const files = { ...LESSON }
    const clock = world(on, files, toasts, statuses)
    await $.session.start({ ...START, surface: 'terminal' })

    const next = structuredClone(LEDGER)
    next.nodes.delegation.status = 'passed'
    files[`${CONFIG}/sensei/ledgers/dns.json`] = JSON.stringify(next)
    await clock.advance(1000)
    expect(statuses).toEqual(['✓ delegation'])

    delete files[`${CONFIG}/sensei/active/${SESSION}.json`]
    await clock.advance(1000)
    expect(statuses).toEqual(['✓ delegation', undefined])
  })
})
