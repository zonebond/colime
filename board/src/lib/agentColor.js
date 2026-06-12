const palette = [
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#f97316', // orange
  '#84cc16', // lime
  '#14b8a6', // teal
]

const knownAgents = {
  ask: '#8b5cf6',
  build: '#3b82f6',
  docs: '#06b6d4',
  plan: '#f59e0b',
  code: '#10b981',
  default: '#8b5cf6',
}

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash
}

export function getAgentColor(name) {
  if (!name) return palette[0]
  const lower = name.toLowerCase()
  if (knownAgents[lower]) return knownAgents[lower]
  return palette[hashString(lower) % palette.length]
}
