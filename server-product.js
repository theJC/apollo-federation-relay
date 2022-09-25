/**
 * Product service
 */

const { ApolloServer, gql } = require('apollo-server');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { toRecords } = require('./util');
const GraphQLNode = require('./graphql-node');
const { connectionFromArray } = require('graphql-relay');

const { toId } = GraphQLNode;

const PRODUCTS = [
  {
    id: toId('Product', '1'),
    name: 'My little product',
    related: [toId('Product', '2'), toId('Product', '3')],
  },
  {
    id: toId('Product', '2'),
    name: 'My other product',
    related: [toId('Product', '1')],
  },
  {
    id: toId('Product', '3'),
    name: 'My third product',
  },
];

const PRODUCTS_MAP = toRecords(PRODUCTS);

const typeDefs = gql`
  type Query {
    product(id: ID!): Product
    products(ids: [ID!]): [Product]
  }

  type Product implements Node @key(fields: "id") {
    id: ID!
    name: String!
    related(
      after: String
      first: Int
      before: String
      last: Int
    ): ProductConnection
  }

  type ProductConnection {
    pageInfo: PageInfo!
    edges: [ProductEdge]
  }

  type ProductEdge {
    node: Product
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }
`;

const nodeTypes = new Set(['Product']);

const resolvers = {
  Query: {
    node(_, { id }) {
      const [typename] = fromId(id);
      if (!nodeTypes.has(typename)) {
        throw new Error(`Invalid node ID "${id}"`);
      }

      return PRODUCTS_MAP[id];
    },

    product(_, { id }) {
      return PRODUCTS_MAP[id];
    },

    products(_, { ids }) {
      if (!ids) {
        return PRODUCTS;
      }

      return ids.map(id => PRODUCTS_MAP[id] || null);
    },
  },

  Product: {
    related({ related }, args) {
      const data = related ? related.map(id => PRODUCTS_MAP[id]) : [];
      return connectionFromArray(data, args);
    },

    __resolveReference(product) {
      return PRODUCTS_MAP[product.id];
    },
  },
};

exports.server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }, GraphQLNode]),
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
                    `Product Field ${info.parentType.name}.${info.fieldName} took ${
                      end - start
                    }ns`,
                  );
                  if (error) {
                    console.log(`Product Field ${info.parentType.name}.${info.fieldName} with ${error}`);
                  } else {
                    console.log(`Product Field ${info.parentType.name}.${info.fieldName} returned ${JSON.stringify(result)}`);
                  }
                };
              },
            };
          },
        };
      },
    },
  ],
});
