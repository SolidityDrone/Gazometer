import { JSONRPCRequest, JSONRPCServer, TypedJSONRPCServer } from 'json-rpc-2.0';
import Fastify from 'fastify';
import http from 'http';
import { JSONRPCServerMethods, ServerParams, getOracleHandler, getRpcOracleHandler } from './handlers.js';
import { MultiChainClient } from '../../../ethereum/client.js';
import { getHeaderOracle } from '../rpc/headerOracle.js';
import { getAccountOracle } from '../rpc/accountOracle.js';
import { getProofOracle } from '../rpc/proofOracle.js';
import { getReceiptOracle } from '../rpc/receiptOracle.js';
import { getTransactionOracle } from '../rpc/transactionOracle.js';
import { getStorageOracle } from '../recursive/getStorageOracle.js';

const HTTP_STATUS_NO_CONTENT = 204;

// Define the resolve_foreign_call method type
type ResolveForeignCallParams = {
  session_id: number;
  function: string;
  inputs: string[];
  root_path: string;
  package_name: string;
};

// Define the server methods including resolve_foreign_call
type ExtendedJSONRPCServerMethods = JSONRPCServerMethods & {
  resolve_foreign_call(params: ResolveForeignCallParams[]): any;
};

const jsonRPCServer: TypedJSONRPCServer<ExtendedJSONRPCServerMethods, ServerParams> = new JSONRPCServer();
jsonRPCServer.addMethod('get_header', getRpcOracleHandler.bind(this, getHeaderOracle));
jsonRPCServer.addMethod('get_account', getRpcOracleHandler.bind(this, getAccountOracle));
jsonRPCServer.addMethod('get_proof', getRpcOracleHandler.bind(this, getProofOracle));
jsonRPCServer.addMethod('get_receipt', getRpcOracleHandler.bind(this, getReceiptOracle));
jsonRPCServer.addMethod('get_transaction', getRpcOracleHandler.bind(this, getTransactionOracle));
jsonRPCServer.addMethod('get_storage_recursive', getOracleHandler.bind(this, getStorageOracle));

// Add the resolve_foreign_call method handler
jsonRPCServer.addMethod('resolve_foreign_call', async (params: ResolveForeignCallParams[], { client }: ServerParams) => {
  console.log("resolve_foreign_call called with params:", JSON.stringify(params, null, 2));

  // The first parameter contains the function name and inputs
  const param = params[0];
  if (!param) {
    console.error("No parameters provided");
    throw new Error("No parameters provided");
  }

  // Extract the function name from params
  const functionName = param.function;
  console.log("Function name:", functionName);

  if (!functionName) {
    console.error("Function name is undefined");
    throw new Error("Function name is undefined");
  }

  // Check if this is a request for both block header and account
  if (functionName === 'get_block_header_and_account') {
    console.log("Processing get_block_header_and_account request");

    // Extract parameters
    const chainId = '0x' + param.inputs[0];
    const blockNumber = '0x' + param.inputs[1];

    // Process address input
    const addressInput = param.inputs[2];
    console.log("Address input type:", typeof addressInput, Array.isArray(addressInput) ? "array" : "not array");

    let addressBytes;
    if (Array.isArray(addressInput)) {
      // If it's already an array, extract the last byte from each element
      addressBytes = addressInput.map(byte => {
        // Remove any whitespace
        byte = byte.trim();

        // If the byte already has 0x prefix, just return it
        if (byte.startsWith('0x')) {
          // Extract the last two characters (one byte) from the hex string
          return '0x' + byte.slice(-2);
        }

        // Otherwise, add 0x prefix and extract the last two characters
        return '0x' + byte.slice(-2);
      });

      // Ensure we have exactly 20 bytes
      if (addressBytes.length !== 20) {
        console.log(`Expected 20 bytes for address, got ${addressBytes.length}`);
        // If we have fewer bytes, pad with 0x00
        while (addressBytes.length < 20) {
          addressBytes.unshift('0x00');
        }
        // If we have more bytes, take only the first 20
        if (addressBytes.length > 20) {
          addressBytes.splice(20);
        }
      }
    } else if (typeof addressInput === 'string' && addressInput.includes(',')) {
      // If it's a comma-separated string, split it
      addressBytes = addressInput.split(',').map(byte => {
        // Remove any whitespace
        byte = byte.trim();

        // If the byte already has 0x prefix, just return it
        if (byte.startsWith('0x')) {
          // Extract the last two characters (one byte) from the hex string
          return '0x' + byte.slice(-2);
        }

        // Otherwise, add 0x prefix and extract the last two characters
        return '0x' + byte.slice(-2);
      });

      // Ensure we have exactly 20 bytes
      if (addressBytes.length !== 20) {
        console.log(`Expected 20 bytes for address, got ${addressBytes.length}`);
        // If we have fewer bytes, pad with 0x00
        while (addressBytes.length < 20) {
          addressBytes.unshift('0x00');
        }
        // If we have more bytes, take only the first 20
        if (addressBytes.length > 20) {
          addressBytes.splice(20);
        }
      }
    } else {
      // If it's a single string, use the default handling
      addressBytes = ['0x' + addressInput];
    }

    console.log("Processed address bytes:", addressBytes);

    try {
      // Get block header
      const headerArgs = [[chainId], [blockNumber]];
      const blockHeader = await getHeaderOracle(client, headerArgs);


      // Get account data
      const accountArgs = [[chainId], [blockNumber], addressBytes];
      const accountData = await getAccountOracle(client, accountArgs);


      // Return both results
      return {
        values: {
          blockHeader,
          accountData
        }
      };
    } catch (error) {
      console.error("Error in get_block_header_and_account:", error);
      throw error;
    }
  }

  // Map the function name to the appropriate oracle handler
  const functionMap: Record<string, (client: MultiChainClient, args: any) => Promise<any>> = {
    'get_header': (client, args) => getHeaderOracle(client, args),
    'get_account': (client, args) => getAccountOracle(client, args),
    'get_proof': (client, args) => getProofOracle(client, args),
    'get_receipt': (client, args) => getReceiptOracle(client, args),
    'get_transaction': (client, args) => getTransactionOracle(client, args),
    'get_storage_recursive': (client, args) => getStorageOracle(args)
  };

  const oracleFunction = functionMap[functionName];
  if (!oracleFunction) {
    console.error(`Unknown function: ${functionName}`);
    throw new Error(`Unknown function: ${functionName}`);
  }

  // Convert inputs to the format expected by the oracle
  let noirArguments;

  if (functionName === 'get_account' || functionName === 'get_proof') {
    // Special handling for get_account and get_proof functions
    console.log(`Processing ${functionName} inputs`);

    // The first input is the chain ID
    const chainId = '0x' + param.inputs[0];

    // The second input is the block number
    const blockNumber = '0x' + param.inputs[1];

    // The third input is the address as an array of strings
    const addressInput = param.inputs[2];
    console.log("Address input type:", typeof addressInput, Array.isArray(addressInput) ? "array" : "not array");

    let addressBytes;
    if (Array.isArray(addressInput)) {
      // If it's already an array, extract the last byte from each element
      addressBytes = addressInput.map(byte => {
        // Remove any whitespace
        byte = byte.trim();

        // If the byte already has 0x prefix, just return it
        if (byte.startsWith('0x')) {
          // Extract the last two characters (one byte) from the hex string
          return '0x' + byte.slice(-2);
        }

        // Otherwise, add 0x prefix and extract the last two characters
        return '0x' + byte.slice(-2);
      });

      // Ensure we have exactly 20 bytes
      if (addressBytes.length !== 20) {
        console.log(`Expected 20 bytes for address, got ${addressBytes.length}`);
        // If we have fewer bytes, pad with 0x00
        while (addressBytes.length < 20) {
          addressBytes.unshift('0x00');
        }
        // If we have more bytes, take only the first 20
        if (addressBytes.length > 20) {
          addressBytes.splice(20);
        }
      }
    } else if (typeof addressInput === 'string' && addressInput.includes(',')) {
      // If it's a comma-separated string, split it
      addressBytes = addressInput.split(',').map(byte => {
        // Remove any whitespace
        byte = byte.trim();

        // If the byte already has 0x prefix, just return it
        if (byte.startsWith('0x')) {
          // Extract the last two characters (one byte) from the hex string
          return '0x' + byte.slice(-2);
        }

        // Otherwise, add 0x prefix and extract the last two characters
        return '0x' + byte.slice(-2);
      });

      // Ensure we have exactly 20 bytes
      if (addressBytes.length !== 20) {
        console.log(`Expected 20 bytes for address, got ${addressBytes.length}`);
        // If we have fewer bytes, pad with 0x00
        while (addressBytes.length < 20) {
          addressBytes.unshift('0x00');
        }
        // If we have more bytes, take only the first 20
        if (addressBytes.length > 20) {
          addressBytes.splice(20);
        }
      }
    } else {
      // If it's a single string, use the default handling
      addressBytes = ['0x' + addressInput];
    }

    console.log("Processed address bytes:", addressBytes);

    // Create the arguments array
    if (functionName === 'get_account') {
      noirArguments = [[chainId], [blockNumber], addressBytes];
    } else if (functionName === 'get_proof') {
      // For get_proof, we also need the storage key
      const storageKeyInput = param.inputs[3];
      console.log("Storage key input type:", typeof storageKeyInput, Array.isArray(storageKeyInput) ? "array" : "not array");

      let storageKeyBytes;
      if (Array.isArray(storageKeyInput)) {

        // If it's already an array, extract the last byte from each 32-byte hex string
        storageKeyBytes = storageKeyInput.map(byte => {
          // Remove any whitespace
          byte = byte.trim();

          // If the byte already has 0x prefix, just return it
          if (byte.startsWith('0x')) {
            // Extract the last two characters (one byte) from the hex string
            return '0x' + byte.slice(-2);
          }

          // Otherwise, add 0x prefix and extract the last two characters
          return '0x' + byte.slice(-2);
        });

        console.log("CODDIO", storageKeyBytes)

        // Ensure we have exactly 32 bytes
        if (storageKeyBytes.length !== 32) {
          console.log(`Warning: Storage key has ${storageKeyBytes.length} bytes, expected 32`);
          // If we have more than 32 bytes, take only the first 32
          if (storageKeyBytes.length > 32) {
            storageKeyBytes = storageKeyBytes.slice(0, 32);
          }
          // If we have fewer than 32 bytes, pad with 0x00
          while (storageKeyBytes.length < 32) {
            storageKeyBytes.unshift('0x00');
          }
        }
      } else if (typeof storageKeyInput === 'string' && storageKeyInput.includes(',')) {
        // If it's a comma-separated string, split it
        storageKeyBytes = storageKeyInput.split(',').map(byte => {
          // Remove any whitespace
          byte = byte.trim();

          // If the byte already has 0x prefix, just return it
          if (byte.startsWith('0x')) {
            // Extract the last two characters (one byte) from the hex string
            return '0x' + byte.slice(-2);
          }

          // Otherwise, add 0x prefix and extract the last two characters
          return '0x' + byte.slice(-2);
        });

        // Ensure we have exactly 32 bytes
        if (storageKeyBytes.length !== 32) {

          // If we have more than 32 bytes, take only the first 32
          if (storageKeyBytes.length > 32) {
            storageKeyBytes = storageKeyBytes.slice(0, 32);
          }
          // If we have fewer than 32 bytes, pad with 0x00
          while (storageKeyBytes.length < 32) {
            storageKeyBytes.unshift('0x00');
          }
        }
      } else {
        // If it's a single string, use the default handling
        storageKeyBytes = ['0x' + storageKeyInput];
      }

      console.log("Processed storage key bytes:", storageKeyBytes);

      // Make sure we have exactly 32 bytes
      if (storageKeyBytes.length !== 32) {
        console.log(`Warning: Storage key has ${storageKeyBytes.length} bytes, expected 32`);
        // If we have more than 32 bytes, take only the first 32
        if (storageKeyBytes.length > 32) {
          storageKeyBytes = storageKeyBytes.slice(0, 32);
        }
        // If we have fewer than 32 bytes, pad with 0x00
        while (storageKeyBytes.length < 32) {
          storageKeyBytes.unshift('0x00');
        }
      }

      // Create the arguments array with the correct format
      noirArguments = [[chainId], [blockNumber], addressBytes, storageKeyBytes];
      console.log("Final storage key length", storageKeyBytes.length)
    }
  } else {
    // Default handling for other functions
    noirArguments = param.inputs.map((input: string) => ['0x' + input]);
  }

  try {
    // Call the oracle function
    console.log("Noir args", noirArguments)
    const result = await oracleFunction(client, noirArguments);

    // Return the result in the format expected by the circuit
    return { values: result };
  } catch (error) {
    console.error(`Error in oracle ${functionName}:`, error);
    throw error;
  }
});

export function buildOracleServer(
  opts: Fastify.FastifyHttpOptions<http.Server> = {},
  multiChainClient: MultiChainClient = MultiChainClient.from_env()
): Fastify.FastifyInstance {
  const app = Fastify(opts);
  const serverParams = { client: multiChainClient };

  app.post('/', async (request: Fastify.FastifyRequest, reply: Fastify.FastifyReply) => {
    const jsonRPCRequest = request.body as JSONRPCRequest;
    console.log("Raw request body:", JSON.stringify(request.body, null, 2));
    console.log("Parsed JSON-RPC request:", JSON.stringify(jsonRPCRequest, null, 2));
    request.log.info({ jsonRPCRequest }, 'Received request');

    await jsonRPCServer.receive(jsonRPCRequest, serverParams).then(async (jsonRPCResponse: any) => {
      if (jsonRPCResponse) {
        await reply.send(jsonRPCResponse);
      } else {
        console.log("No response being sent to circuit (204 No Content)");
        await reply.status(HTTP_STATUS_NO_CONTENT).send();
      }
    });
  });

  return app;

}



