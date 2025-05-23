import { JSONRPCRequest, JSONRPCServer, TypedJSONRPCServer } from 'json-rpc-2.0';
import Fastify from 'fastify';
import http from 'http';
import { MultiChainClient } from '../../../ethereum/client.js';

// Get the command-line arguments
const args = process.argv.slice(2);
const version = args[0]; // e.g., 'next' or 'nargo'

// Function to start the server
async function startServer() {
    let buildOracleServer;

    if (version === 'next') {
        // Dynamically import the Next.js version
        console.log('Using Next.js version of the Oracle server...');
        const module = await import('../noir/oracles/server/next-app.js');
        buildOracleServer = module.buildOracleServer;
    } else if (version === 'nargo') {
        // Dynamically import the normal version
        console.log('Using Nargo version of the Oracle server...');
        const module = await import('../noir/oracles/server/app.js');
        buildOracleServer = module.buildOracleServer;
    } else {
        console.error('Unknown version specified. Use "next" or "nargo".');
        process.exit(1);
    }

    // Create the server instance
    const server = buildOracleServer();

    // Start the server
    server.listen(5555, () => {
        console.log(`Oracle server running for ${version} on port 5555`);
    });
}

// Start the server
startServer().catch(error => {
    console.error('Error starting the server:', error);
});