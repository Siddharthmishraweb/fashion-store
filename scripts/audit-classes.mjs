/* Dev-only audit: reports class names used in JSX that have no rule in index.css. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const srcDir = join(root, 'src')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (['.js', '.jsx'].includes(extname(full))) out.push(full)
  }
  return out
}

const css = readFileSync(join(srcDir, 'index.css'), 'utf8')
const cssClasses = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]))

const used = new Map()
for (const file of walk(srcDir)) {
  const code = readFileSync(file, 'utf8')
  const strings = [
    ...[...code.matchAll(/className=(?:"([^"]*)"|\{cx\(([^)]*)\)\}|\{'([^']*)'\}|\{`([^`]*)`\})/g)].flatMap((m) =>
      [m[1], m[2], m[3], m[4]].filter(Boolean),
    ),
    ...[...code.matchAll(/cx\(([^()]*)\)/g)].map((m) => m[1]),
  ]
  for (const raw of strings) {
    for (const token of raw.split(/[^\w-]+/)) {
      if (!token || /^\d/.test(token)) continue
      if (!used.has(token)) used.set(token, new Set())
      used.get(token).add(file.replace(root, ''))
    }
  }
}

// Words that appear inside cx()/template expressions but are code, not classes.
const NOT_CLASSES = new Set([
  'cx', 'true', 'false', 'null', 'undefined', 'and', 'on', 'off', 'open', 'active', 'done',
  'unread', 'className', 'props', 'style', 'variant', 'size', 'tone', 'loading', 'disabled',
])

const missing = [...used.entries()]
  .filter(([name]) => !cssClasses.has(name) && !NOT_CLASSES.has(name))
  .sort(([a], [b]) => a.localeCompare(b))

if (!missing.length) {
  console.log('All JSX class names have matching CSS rules.')
} else {
  console.log(`${missing.length} class names used in JSX with no CSS rule:\n`)
  for (const [name, files] of missing) console.log(`  ${name}  <-  ${[...files].join(', ')}`)
}
