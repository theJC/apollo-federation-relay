/**
 * Gateway server and main entrypoint
 */

const { ApolloServer } = require('apollo-server');
const { ApolloGateway, IntrospectAndCompose } = require('@apollo/gateway')
const { server: productServer } = require('./server-product');
const { server: reviewServer } = require('./server-review');
const { server: nodeServer } = require('./server-node');

const BASE_PORT = 8009;

const SERVERS = [
  { name: 'product', server: productServer },
  { name: 'review', server: reviewServer },
  { name: 'node', server: nodeServer },
];

async function startServers() {
  const res = SERVERS.map(async ({ server, name }, index) => {
    const number = index + 1;
    const info = await server.listen(BASE_PORT + number);

    console.log(`${name} up at ${info.url}graphql`);
    return { ...info, name, server };
  });

  return await Promise.all(res);
}

async function main() {
  const subgraphs = await startServers();

  const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
      subgraphs,
    }),
  });

  const server = new ApolloServer({
    gateway,
    subscriptions: false,
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
                      `Field ${info.parentType.name}.${info.fieldName} took ${
                        end - start
                      }ns`,
                    );
                    if (error) {
                      console.log(`Field ${info.parentType.name}.${info.fieldName} failed with ${error}`);
                    } else {
                      console.log(`Field ${info.parentType.name}.${info.fieldName} returned ${result}`);
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
  const info = await server.listen(BASE_PORT);

  console.log(`\n--\n\n🌍 gateway up at ${info.url}graphql\n\n\n\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
