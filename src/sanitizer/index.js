import { config } from '../config.js'
import { createSeed } from './hash.js'
import { generate } from './generators.js'
import { sanitizeRules } from './rules.js'

function substituteFields (result, rule, typeName, secret) {
  for (const [field, kind] of Object.entries(rule.fields ?? {})) {
    const value = result[field]
    if (value === null || value === undefined) {
      continue
    }
    result[field] = generate(kind, createSeed(String(value), secret, `${typeName}.${field}`))
  }
}

function sanitizeChildren (result, rule, secret, rules) {
  for (const [field, childType] of Object.entries(rule.children ?? {})) {
    if (result[field] === null || result[field] === undefined) {
      continue
    }
    result[field] = sanitizeNode(result[field], childType, secret, rules)
  }
}

function sanitizeNode (node, typeName, secret, rules) {
  if (node === null || node === undefined) {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((item) => sanitizeNode(item, typeName, secret, rules))
  }

  const rule = rules[typeName]

  if (!rule || typeof node !== 'object') {
    return node
  }

  const result = { ...node }

  substituteFields(result, rule, typeName, secret)
  sanitizeChildren(result, rule, secret, rules)

  return result
}

// Exported for tests so the secret and rules can be supplied directly.
export function sanitizeWith (node, typeName, secret, rules = sanitizeRules) {
  if (!secret) {
    throw new Error('A sanitization secret is required. Set SANITIZE_SECRET.')
  }
  return sanitizeNode(node, typeName, secret, rules)
}

export function sanitize (node, typeName) {
  if (!config.get('sanitize.isEnabled')) {
    return node
  }
  return sanitizeWith(node, typeName, config.get('sanitize.secret'))
}
