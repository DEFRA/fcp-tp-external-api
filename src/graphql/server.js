import { join } from 'node:path'
import { ApolloServer } from '@apollo/server'
import { loadFilesSync } from '@graphql-tools/load-files'
import { mergeTypeDefs } from '@graphql-tools/merge'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { config } from '../config.js'
import { resolvers } from './resolvers/index.js'

const typeDefs = mergeTypeDefs(
  loadFilesSync(join(import.meta.dirname, 'types'), { extensions: ['gql'] })
)

export const schema = makeExecutableSchema({ typeDefs, resolvers })

export const apolloServer = new ApolloServer({
  schema,
  introspection: config.get('graphql.isIntrospectionEnabled'),
  csrfPrevention: true
})

export async function start () {
  if (apolloServer.internals.state.phase !== 'started') {
    await apolloServer.start()
  }
}

export async function stop () {
  if (apolloServer.internals.state.phase === 'started') {
    await apolloServer.stop()
  }
}
