import { Client } from '@hapi/catbox'
import { Engine as CatboxMemory } from '@hapi/catbox-memory'

const SEGMENT = 'dal-token'

let clientPromise

function getClient () {
  if (!clientPromise) {
    const client = new Client(CatboxMemory)
    clientPromise = client.start().then(() => client)
  }
  return clientPromise
}

export async function get (id) {
  const client = await getClient()
  const cached = await client.get({ segment: SEGMENT, id })
  return cached?.item ?? null
}

export async function set (id, value, ttlMs) {
  const client = await getClient()
  await client.set({ segment: SEGMENT, id }, value, ttlMs)
}

export async function drop (id) {
  const client = await getClient()
  await client.drop({ segment: SEGMENT, id })
}
