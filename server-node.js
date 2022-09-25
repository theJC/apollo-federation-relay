/**
 * Node service
 */

 const { ApolloServer, gql } = require('apollo-server');
 const { buildSubgraphSchema } = require('@apollo/subgraph');
 const GraphQLNode = require('./graphql-node');

const typeDefs = gql`
  type Query {
    node(id: ID!): Node
  }

  extend type Review implements Node @key(fields: "id") {
    id: ID! @external
  }

  extend type Product implements Node @key(fields: "id") {
    id: ID! @external
  }

  interface Node {
    id: ID!
  }
`;


const resolvers = {
  Node: {
    __resolveType({ id }) {
      console.log('__resolveType :::::::::::::::::::::::::::::::::::::::: ${id} ');
      const [typename] = fromId(id);
      return typename;
    },
  },
  Query: {
    node(_, { id }) {
      //const [typename] = GraphQLNode.fromId(id);
      // if (!nodeTypes.has(typename)) {
      //   throw new Error(`Invalid node ID "${id}"`);
      // }
      console.log('node :::::::::::::::::::::::::::::::::::::::: ${id} ');
      return { id };
    },
  },
};

exports.server = new ApolloServer({
  debug: true,
  schema: buildSubgraphSchema(typeDefs, resolvers),
  plugins: [
    {
      async requestDidStart(initialRequestContext) {
        return {
          async executionDidStart(executionRequestContext) {
            return {
              willResolveField({ source, args, context, info }) {
                const start = process.hrtime.bigint();
                return (error, result) => {
                  const end = process.hrtime.bigint();
                  console.log(
                    `Node Field ${info.parentType.name}.${info.fieldName} took ${
                      end - start
                    }ns`,
                  );
                  if (error) {
                    console.log(`Node Field ${info.parentType.name}.${info.fieldName} failed with ${error}`);
                  } else {
                    console.log(`Node Field ${info.parentType.name}.${info.fieldName} returned ${JSON.stringify(result)}`);
                  }
                };
              },
            };
          }
        }
      }
    }
  ],
});

/**
 * Decodes a Base64 encoded global ID into typename and key
 *
 * @param {string} id Base64 encoded Node ID
 * @returns {[string, Buffer]} A tuple of the decoded typename and key.
 *   The key is not decoded, since it may be binary. There's no validation
 *   of the typename.
 * @throws {RangeError} If id cannot be decoded
 */
function fromId(id) {
  const b = Buffer.from(id, 'base64');
  const i = b.indexOf(DIVIDER_TOKEN);

  if (i === -1) {
    throw new RangeError('Invalid Node ID');
  }

  const typename = b.slice(0, i).toString('ascii');
  const key = b.slice(i);
  return [typename, key];
}
