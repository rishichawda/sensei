import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { MapView } from '../../types'
import { displayName } from '../vault/graph.mjs'
import { bandLine, changedStatuses, chipLabel, layers, nodeDetail, progress, proposedPlan, snapshot } from './map-layout.mjs'

const PANE = 'map'
const view = atom({ plugin: 'sensei', key: 'view' } as const, { topic: null, ledger: null, selected: null } as MapView)

async function configRoot($: any): Promise<string | null> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (dir) return dir
  const home = await $.env.get('HOME')
  return home ? `${home}/.claude` : null
}

async function readJson($: any, path: string): Promise<any> {
  try {
    return JSON.parse(await $.fs.read(path))
  } catch {
    return null
  }
}

// The active file is written by the vault hook (keyed by session id); the ledger
// is the teach skill's own record. Either missing means no lesson is running.
async function load($: any): Promise<{ topic: string; ledger: any } | null> {
  const root = await configRoot($)
  if (!root) return null
  const id = await $.session.id()
  const active = await readJson($, `${root}/sensei/active/${id}.json`)
  if (!active || typeof active.topic !== 'string') return null
  const ledger = await readJson($, `${root}/sensei/ledgers/${active.topic}.json`)
  return ledger ? { topic: active.topic, ledger } : null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'map', description: 'Show your learning map' })

    // `previous` only words toasts; losing it on a reload just skips one toast.
    // `drawn` is what the view holds: any change to the ledger redraws.
    let previous: ReturnType<typeof snapshot> = null
    let drawn: string | undefined
    const refresh = async () => {
      const loaded = await load($)
      const raw = JSON.stringify(loaded)
      if (raw === drawn) return
      drawn = raw
      const current = loaded ? snapshot(loaded.topic, loaded.ledger) : null
      for (const text of changedStatuses(previous, current)) $.ui.toast(text)
      previous = current
      await update($, view, v => ({
        topic: loaded?.topic ?? null,
        ledger: loaded?.ledger ?? null,
        selected: loaded && v.topic === loaded.topic ? v.selected : null,
      }))
    }
    await refresh()
    $.clock.every(1000, refresh)

    return next(e)
  })

  on('command.run', { command: 'map' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Map' })
    return { text: 'Opened your learning map.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    const band = bandLine(v.ledger)
    if (!band) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text>
        <Text color={band.tone}>{`${band.glyph} ${band.head}`}</Text>
        {band.detail && <Text dimColor>{`  ·  ${band.detail}`}</Text>}
        {band.last && <Text color="green" dimColor>{`  ·  ✓ previously passed: ${band.last}`}</Text>}
        <Text dimColor>{'  ·  /map'}</Text>
      </Text>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await read($, view)
    const ledger = v.ledger as any
    const proposed = proposedPlan(ledger)
    const map = ledger?.session?.dependencyMap ?? proposed
    if (!map || !Array.isArray(map.nodes) || map.nodes.length === 0) {
      const goal = ledger?.session?.goal
      return <Text dimColor>{goal ? `No plan yet · ${goal}. Claude shows one for you to approve first.` : 'No plan yet. Ask Claude to teach you something and it shows a plan for you to approve first.'}</Text>
    }
    const isProposal = !ledger.session?.dependencyMap
    const { passed, total } = progress(ledger)
    const rows = layers(map.nodes, map.edges)
    const detail = v.selected ? nodeDetail(ledger, v.selected) : null

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {isProposal && <Text bold>Proposed plan — not approved yet</Text>}
          <Text bold>{ledger.session?.goal ?? displayName(v.topic ?? '')}</Text>
          <Text dimColor>{isProposal ? `${map.nodes.length} steps` : `${passed} of ${total} passed`}</Text>
        </Box>
        {rows.map((row, i) => (
          <Box key={`row:${i}`} flexDirection="row" flexWrap="wrap" gap={1}>
            {row.map(id => (
              <Button
                key={`node:${id}`}
                label={chipLabel(ledger, id)}
                variant={id === v.selected ? 'primary' : 'secondary'}
                onPress={() => update($, view, s => ({ ...s, selected: id }))}
              />
            ))}
          </Box>
        ))}
        {detail && (
          <Box flexDirection="column">
            <Text bold>{detail.name}</Text>
            <Text>{`Status: ${detail.status}${detail.taught ? ` · taught ${detail.taught}` : ''}`}</Text>
            {detail.prerequisites.length > 0 && <Text>{`Needs: ${detail.prerequisites.join(', ')}`}</Text>}
            {detail.dependents.length > 0 && <Text>{`Unlocks: ${detail.dependents.join(', ')}`}</Text>}
          </Box>
        )}
      </Box>
    )
  })
}
