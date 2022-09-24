/**
 * Gateway server and main entrypoint
 */

const { NodeGateway } = require('./node-gateway');
const { ApolloServer } = require('apollo-server');
const { IntrospectAndCompose } = require('@apollo/gateway')
const { server: serverProduct } = require('./server-product');
const { server: serverReview } = require('./server-review');

const BASE_PORT = 8009;

const SERVERS = [
  { name: 'product', server: serverProduct },
  { name: 'review', server: serverReview },
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

  const gateway = new NodeGateway({ 
    supergraphSdl: new IntrospectAndCompose({
    subgraphs
    })
  });

  const server = new ApolloServer({ gateway, subscriptions: false });
  const info = await server.listen(BASE_PORT);

  console.log(`\n--\n\n🌍 gateway up at ${info.url}graphql`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
