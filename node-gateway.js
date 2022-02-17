const {
  ApolloGateway,
  IntrospectAndCompose,
  LocalGraphQLDataSource,
} = require('@apollo/gateway');
const { gql } = require('apollo-server');
const { parse, visit, graphqlSync } = require('graphql');
const { buildSubgraphSchema } = require('@apollo/federation');

const GraphQLNode = require('./graphql-node');

const NODE_SERVICE_NAME = 'NODE_SERVICE';

const isNode = node =>
  node.interfaces.some(({ name }) => name.value === 'Node');

const toTypeDefs = name =>
  gql`
    extend type ${name} implements Node @key(fields: "id") {
      id: ID! @external
    }
  `;

/**
 * A GraphQL module which enables global object look-up by translating a global
 * ID to a concrete object with an ID.
 */
class RootModule {
  /**
   * @param {Set<string>} nodeTypes Supported typenames
   */
  constructor(nodeTypes) {
    this.resolvers = {
      Query: {
        node(_, { id }) {
          const [typename] = GraphQLNode.fromId(id);
          if (!nodeTypes.has(typename)) {
            throw new Error(`Invalid node ID "${id}"`);
          }

          return { id };
        },
      },
    };
  }

  typeDefs = gql`
    type Query {
      node(id: ID!): Node
    }
  `;
}

class NodeCompose extends IntrospectAndCompose {
  createSupergraphFromSubgraphList(subgraphs) {
    // Once all real service definitions have been loaded, we need to find all
    // types that implement the Node interface. These must also become concrete
    // types in the Node service, so we build a GraphQL module for each.
    const modules = [];
    const seenNodeTypes = new Set();

    for (const subgraph of subgraphs) {
      // Manipulate the typeDefs of the service
      subgraph.typeDefs = visit(subgraph.typeDefs, {
        ObjectTypeDefinition(node) {
          const name = node.name.value;

          // Remove existing `query { node }` from service to avoid collisions
          if (name === 'Query') {
            return visit(node, {
              FieldDefinition(node) {
                if (node.name.value === 'node') {
                  return null;
                }
              },
            });
          }

          // Add any new Nodes from this service to the Node service's modules
          if (isNode(node) && !seenNodeTypes.has(name)) {
            // We don't need any resolvers for these modules; they're just
            // simple objects with a single `id` property.
            modules.push({ typeDefs: toTypeDefs(name) });
            seenNodeTypes.add(name);

            return;
          }
        },
      });
    }

    if (!modules.length) {
      return super.createSupergraphFromSubgraphList(subgraphs);
    }

    // Dynamically construct a service to do Node resolution. This requires
    // building a federated schema, and introspecting it using the
    // `_service.sdl` field so that all the machinery is correct. Effectively
    // this is what would have happened if this were a real service.
    this.nodeSchema = buildSubgraphSchema([
      // The Node service must include the Node interface and a module for
      // translating the IDs into concrete types
      GraphQLNode,
      new RootModule(seenNodeTypes),

      // The Node service must also have concrete types for each type. This
      // just requires the a type definition with an `id` field for each
      ...modules,
    ]);

    // This is a local schema, but we treat it as if it were a remote schema,
    // because all other schemas are (probably) remote. In that case, we need
    // to provide the Federated SDL as part of the type definitions.
    const typeDefs = parse(graphqlSync({
      schema: this.nodeSchema,
      source: 'query { _service { sdl } }',
    }).data._service.sdl);

    return super.createSupergraphFromSubgraphList([...subgraphs, {
      name: NODE_SERVICE_NAME,
      typeDefs,
    }]);
  }

  createNodeDataSource() {
    return new LocalGraphQLDataSource(this.nodeSchema);
  }
}

/**
 * An ApolloGateway which provides `Node` resolution across all federated
 * services, and a global `node` field, like Relay.
 */
class NodeGateway extends ApolloGateway {
  /**
   * Override `createDataSource` to let the local Node resolution service be
   * created without complaining about missing a URL.
   */
  createDataSource(serviceDef) {
    const { supergraphSdl } = this.config
    if (serviceDef.name === NODE_SERVICE_NAME && supergraphSdl instanceof NodeCompose) {
      return supergraphSdl.createNodeDataSource();
    }
    return super.createDataSource(serviceDef);
  }
}

exports.NodeCompose = NodeCompose;
exports.NodeGateway = NodeGateway;
