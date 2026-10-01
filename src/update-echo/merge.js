function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Overlays only the keys present in fragment onto entity. An explicit null in
// fragment clears a field rather than being treated as "no value to merge".
export function mergeFragment (entity, fragment) {
  if (!entity || !fragment || Object.keys(fragment).length === 0) {
    return entity
  }

  const result = { ...entity }

  for (const [key, value] of Object.entries(fragment)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? mergeFragment(result[key], value)
      : value
  }

  return result
}
