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
      labels: { 'ip-routing': 'How packets find a machine', delegation: 'Who answers for a domain', referrals: 'Following a referral' },
    },
  },
}

const CONFIG = '/cfg'
const SESSION = 'test-session'

// The engine's file system, session id, environment and clock are what the plugin
// reads; the test stands in for each beneath the plugin.
function world(on: any, files: Record<string, string>, toasts: string[] = []) {
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
      expect(await ui.find({ type: 'Button', key: 'node:delegation', text: '✗ Who answers for a domain' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '1 of 3 passed' })).toBeDefined()

      await ui.press({ key: 'node:delegation' })
      expect(await ui.find({ type: 'Text', text: /Builds on: How packets find a machine/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Leads to: Following a referral/ })).toBeDefined()
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

describe('map pane with a corrupt ledger', () => {
  test('draws without throwing when the goal is an object and the plan fields are the wrong type', async ($, on) => {
    const corrupt = { nodes: {}, session: { goal: { text: 'x' }, status: 'in-progress', dependencyMap: { nodes: ['a'], edges: 'nope' } } }
    world(on, { ...LESSON, [`${CONFIG}/sensei/ledgers/dns.json`]: JSON.stringify(corrupt) })
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: 'sensei', surface: 'terminal', component: 'Pane', requestId: 'map', props: PANE })
    expect(await ui.find({ type: 'Button', key: 'node:a' })).toBeDefined()
    await ui.press({ key: 'node:a' })
    expect(await ui.find({ type: 'Text', text: /Status:/ })).toBeDefined()
  })
})

describe('band', () => {
  test('shows the step line while a lesson runs', async ($, on) => {
    world(on, LESSON)
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({
      plugin: 'sensei', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false },
    })
    const steps = await ui.findAll({ type: 'Text', text: '✗ Step 2 of 3 · Retry: Who answers for a domain' })
    expect(steps.map(el => el.props.color)).toContain('red')
    const passed = await ui.findAll({ type: 'Text', text: /previously passed/ })
    expect(passed.map(el => el.props.color)).toContain('green')
    expect(await ui.find({ type: 'Text', text: /previously passed: How packets find a machine/ })).toBeDefined()
  })
})

describe('band while planning', () => {
  const intake = { nodes: {}, session: { goal: 'Understand DNS', status: 'intake', dependencyMap: null } }
  const proposed = { nodes: {}, session: { goal: 'Understand DNS', status: 'intake', dependencyMap: null, proposedPlan: LEDGER.session.dependencyMap } }
  const band = (surface = 'terminal') => ({ plugin: 'sensei', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } }) as const

  test('animates the planning glyph', async ($, on) => {
    const clock = world(on, { ...LESSON, [`${CONFIG}/sensei/ledgers/dns.json`]: JSON.stringify(intake) })
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount(band())
    const first = await ui.find({ type: 'Text', text: /Planning/ })
    await clock.advance(120)
    const second = await ui.find({ type: 'Text', text: /Planning/ })
    expect(first?.text).not.toEqual(second?.text)
  })

  test('colours the state and leaves the goal plain', async ($, on) => {
    world(on, { ...LESSON, [`${CONFIG}/sensei/ledgers/dns.json`]: JSON.stringify(proposed) })
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount(band())
    const state = await ui.findAll({ type: 'Text', text: '◇ Plan proposed · 3 steps' })
    expect(state.map(el => el.props.color)).toContain('yellow')
    const goal = await ui.findAll({ type: 'Text', text: /^\s*·\s*Understand DNS$/ })
    expect(goal.length).toBeGreaterThan(0)
    expect(goal.every(el => el.props.color === undefined)).toBe(true)
  })
})

describe('band follows the ledger', () => {
  test('moves from the old result to the new one when a later check changes the ledger', async ($, on) => {
    const files = { ...LESSON }
    const clock = world(on, files)
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({
      plugin: 'sensei', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false },
    })
    const next = structuredClone(LEDGER)
    next.nodes.delegation.status = 'passed'
    next.nodes.delegation.lastTaughtAt = '2026-10-10T06:00:00.000Z'
    next.session.nextNodeId = 'referrals'
    files[`${CONFIG}/sensei/ledgers/dns.json`] = JSON.stringify(next)
    await clock.advance(1000)
    expect(await ui.find({ type: 'Text', text: '● Step 3 of 3 · In progress: Following a referral' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /previously passed: Who answers for a domain/ })).toBeDefined()
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
    expect(toasts).toEqual(['✓ Who answers for a domain'])

    await clock.advance(3000)
    expect(toasts).toEqual(['✓ Who answers for a domain'])
  })


  test('toasts a batched check once, as one line with both results', async ($, on) => {
    const toasts: string[] = []
    const files = { ...LESSON }
    const clock = world(on, files, toasts)
    await $.session.start({ ...START, surface: 'terminal' })

    const next = structuredClone(LEDGER)
    next.nodes['ip-routing'].status = 'failed'
    next.nodes.delegation.status = 'passed'
    files[`${CONFIG}/sensei/ledgers/dns.json`] = JSON.stringify(next)
    await clock.advance(1000)
    expect(toasts).toEqual(['✓ 1 passed · ✗ 1 to retry'])
  })


})

describe('refresh', () => {
  test('redraws when the goal or a proposed plan arrives after the first poll', async ($, on) => {
    const files = { ...LESSON }
    const ledgerPath = `${CONFIG}/sensei/ledgers/dns.json`
    files[ledgerPath] = JSON.stringify({ nodes: {}, session: { status: 'intake', dependencyMap: null } })
    const clock = world(on, files)
    await $.session.start({ ...START, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: 'sensei', surface: 'terminal', component: 'Pane', requestId: 'map', props: PANE })
    expect(await ui.find({ type: 'Text', text: /No plan yet\./ })).toBeDefined()

    files[ledgerPath] = JSON.stringify({ nodes: {}, session: { goal: 'Understand DNS', status: 'intake', dependencyMap: null } })
    await clock.advance(1000)
    expect(await ui.find({ type: 'Text', text: /No plan yet · Understand DNS/ })).toBeDefined()
  })
})
