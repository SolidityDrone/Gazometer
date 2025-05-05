'use client';

import { useState } from 'react';
import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, RawBuffer, UltraHonkBackend } from "@aztec/bb.js";
import circuit from '@/public/circuits/alice_receipt.json';

// Add type for the circuit
interface NoirCircuit {
    bytecode: string;
    abi: any;
    noir_version: string;
    hash: number;
}

export default function ProveTestPage() {
    const [isProving, setIsProving] = useState(false);
    const [proof, setProof] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const testProof = async () => {
        try {
            setIsProving(true);
            setError(null);

            // Create the foreign call handler
            const foreignCallHandler = async (name: string, inputs: string[] | any) => {
                console.log('FOREIGN CALL HANDLER TRIGGERED:', { name, inputs });
                try {


                    // Convert inputs to the correct format
                    let formattedInputs;
                    if (Array.isArray(inputs)) {
                        formattedInputs = inputs.map(input => {
                            // Handle nested arrays
                            if (Array.isArray(input)) {
                                // Convert each hex byte to its numeric value
                                const numbers = input.map(byte => {
                                    const cleanByte = byte.replace(/^0x+/i, '');
                                    return parseInt(cleanByte, 16);
                                });
                                return numbers;
                            }
                            // Handle string inputs
                            else if (typeof input === 'string') {
                                // Special handling for identifiers like chain_id and block_number
                                if (name === 'get_header') {
                                    if (inputs[0] === input) {
                                        return input; // Keep chain_id as string
                                    } else if (inputs[1] === input) {
                                        return `0x${parseInt(input).toString(16)}`; // Convert block number to hex
                                    }
                                }
                                const cleanHex = input.replace(/^0x+/i, '');
                                return parseInt(cleanHex, 16);
                            } else if (typeof input === 'number') {
                                return input;
                            } else if (typeof input === 'boolean') {
                                return input ? 1 : 0;
                            } else {
                                console.warn('Unexpected input type:', typeof input, input);
                                return String(input);
                            }
                        });
                    } else if (typeof inputs === 'object') {
                        // Handle object inputs by converting to array
                        formattedInputs = Object.values(inputs).flat();
                    } else {
                        throw new Error(`Unexpected inputs type: ${typeof inputs}`);
                    }

                    console.log('Formatted inputs:', formattedInputs);

                    const response = await fetch('/api/oracle', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            method: "resolve_foreign_call",
                            params: [{
                                function: name,
                                inputs: formattedInputs,
                                session_id: 1,
                                root_path: "",
                                package_name: ""
                            }],
                            id: 1
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const jsonRPCResponse = await response.json();
                    console.log('Oracle response:', jsonRPCResponse);

                    if (jsonRPCResponse.error) {
                        throw new Error(`Oracle error: ${jsonRPCResponse.error.message}`);
                    }

                    if (!jsonRPCResponse.result || !jsonRPCResponse.result.values) {
                        throw new Error('Invalid oracle response format');
                    }

                    // Ensure we return an array of strings
                    const values = jsonRPCResponse.result.values;

                    console.log("Values:", values);
                    return values;
                } catch (error: unknown) {
                    console.error('Detailed oracle error:', error);
                    if (error instanceof Error) {
                        throw new Error(`Oracle call failed: ${error.message}`);
                    }
                    throw new Error('Oracle call failed with unknown error');
                }
            };




            // Create test inputs
            const inputs = {
                alice_signature_nonce_1: [
                    "0x07", "0x2f", "0x3e", "0x1e", "0x23", "0xa2", "0x17", "0xbd", "0xc3", "0xc4", "0x1b", "0x4c", "0x61", "0x35", "0x2b", "0xcc",
                    "0x78", "0xd8", "0x14", "0x0e", "0xb9", "0x81", "0x0b", "0xd3", "0xd3", "0x60", "0x37", "0xfb", "0x65", "0xc7", "0xaf", "0x40",
                    "0x6d", "0x4c", "0x37", "0x72", "0xb0", "0xc4", "0xd4", "0xfb", "0x29", "0x8c", "0xec", "0x36", "0xd0", "0x9d", "0x64", "0x6f",
                    "0xf6", "0xa2", "0x49", "0x71", "0x0e", "0x43", "0xcd", "0xf2", "0x85", "0x6e", "0x5d", "0x4e", "0xfd", "0xbf", "0x7b", "0xd3",
                    "0x1c"
                ],
                alice_signature_nonce_2: [
                    "0x47", "0x65", "0xf9", "0xcb", "0xeb", "0xb3", "0xff", "0x25", "0x24", "0x5f", "0xc8", "0xe3", "0x81", "0x8f", "0x36", "0xa2",
                    "0xf4", "0xfa", "0x09", "0xf9", "0x89", "0xd3", "0x20", "0xcd", "0xef", "0xc4", "0x65", "0xb2", "0x95", "0xd6", "0xa0", "0xaf",
                    "0x37", "0x73", "0x11", "0x57", "0x5a", "0xc4", "0x51", "0x99", "0xd9", "0xab", "0x0a", "0x9f", "0x58", "0x54", "0x3f", "0x12",
                    "0xf2", "0x5e", "0x33", "0xdc", "0xc4", "0xc7", "0xe7", "0xf0", "0x93", "0x19", "0x88", "0x68", "0x20", "0x88", "0xb6", "0xe7",
                    "0x1c"
                ],
                block_number: "8233877",
                chain_id: 11155111,
                contract_address: [
                    "0x58", "0x2B", "0xEE", "0x8f", "0x43", "0xBF", "0x20", "0x39", "0x64", "0xd3", "0x8c", "0x54", "0xFA", "0x03", "0xe6", "0x2d",
                    "0x61", "0x61", "0x59", "0xfA"
                ],
                message_nonce_1: 1,
                message_nonce_2: 2,
                pub_x_1: [
                    "0xca", "0xb1", "0x4a", "0x0b", "0xb5", "0x57", "0xdf", "0xe9", "0x0a", "0x26", "0x8d", "0xcd", "0x04", "0xf1", "0x7e", "0x2e",
                    "0xa8", "0xd8", "0xcc", "0xd5", "0x57", "0x71", "0xaa", "0x18", "0xec", "0x72", "0x3a", "0xf2", "0xee", "0x45", "0x92", "0xe6"
                ],
                pub_x_2: [
                    "0x97", "0x0f", "0xaa", "0x1e", "0xf6", "0xfd", "0xfe", "0xdc", "0xc5", "0x21", "0x56", "0xe4", "0x88", "0x0d", "0x2a", "0x0d",
                    "0xce", "0x57", "0xaf", "0xfa", "0xf1", "0x99", "0xe6", "0x60", "0x8e", "0x9b", "0x23", "0xc9", "0xf0", "0x85", "0xd2", "0xd1"
                ],
                pub_y_1: [
                    "0x75", "0xd4", "0x4b", "0xb8", "0xbc", "0x98", "0xdb", "0x93", "0x24", "0x0f", "0x48", "0x07", "0x7c", "0x63", "0xaa", "0x4b",
                    "0x29", "0xd5", "0x9a", "0xa3", "0x35", "0xcf", "0xf4", "0xb2", "0xa0", "0x88", "0x23", "0x4f", "0x69", "0xc2", "0x2e", "0xba"
                ],
                pub_y_2: [
                    "0x34", "0x2a", "0x1e", "0xa1", "0xd1", "0x84", "0x38", "0x92", "0x34", "0x7a", "0x8f", "0x9a", "0x0d", "0xcb", "0x09", "0x72",
                    "0xfc", "0xd0", "0x3f", "0xe0", "0x17", "0xd2", "0x6c", "0xb2", "0xb4", "0xcd", "0xd4", "0x63", "0xbf", "0x7b", "0x9a", "0xf2"
                ],
                receipt_amount: "1"
            };


            // Initialize Noir and backend
            const noir = new Noir(circuit as NoirCircuit);
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode, { threads: 2 }, { recursive: true });

            // Generate the proof
            const { witness } = await noir.execute(inputs, foreignCallHandler);
            console.log('Circuit execution result:', witness);

            // Generate the proof using the backend
            const recursiveProof = await backend.generateProof(witness, { recursive: true });

            setProof(recursiveProof.proof);
            console.log("Proof generated:", (recursiveProof.proof));
            console.log("Proof verified:", await backend.verifyProof(recursiveProof.proof));


            console.log('Proof is', await backend.verifyProof(proof));

            const res = await backend.generateProofForRecursiveAggregation(witness);
            console.log("Recursive proof aggregation generated:", res);
            console.log("Recursive proof aggregation verified:", await backend.verifyProof(res.proof));

        } catch (error) {
            console.error('Error in test proof:', error);
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError('Unknown error occurred');
            }
        } finally {
            setIsProving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-black">Noir Proof Test</h1>

                <button
                    onClick={testProof}
                    disabled={isProving}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                    {isProving ? 'Generating Proof...' : 'Generate Test Proof'}
                </button>

                {error && (
                    <div className="mt-4 p-4 bg-red-50 rounded-md">
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                {proof && (
                    <div className="mt-4">
                        <h2 className="text-lg font-medium text-black mb-2">Generated Proof</h2>
                        <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                            {JSON.stringify(proof, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
} 