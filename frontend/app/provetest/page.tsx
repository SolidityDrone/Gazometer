'use client';

import { useState } from 'react';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
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

            // Initialize Noir and backend
            const noir = new Noir(circuit as unknown as NoirCircuit);
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode);

            // Helper function to convert hex string to byte array
            const hexToBytes = (hex: string) => {
                const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
                return cleanHex.match(/.{2}/g)?.map(byte => `0x${byte}`) || [];
            };

            // Create test inputs
            const inputs = {
                alice_signature_nonce_1: [
                    7, 47, 62, 30, 35, 162, 23, 189, 195, 196, 27, 76, 97, 53, 43, 204,
                    120, 216, 20, 14, 185, 129, 11, 211, 211, 96, 55, 251, 101, 199, 175, 64,
                    109, 76, 55, 114, 176, 196, 212, 251, 41, 140, 236, 54, 208, 157, 100, 111,
                    246, 162, 73, 113, 14, 67, 205, 242, 133, 110, 93, 78, 253, 191, 123, 211,
                    28
                ],
                alice_signature_nonce_2: [
                    71, 101, 249, 203, 235, 179, 255, 37, 36, 95, 200, 227, 129, 143, 54, 162,
                    244, 250, 9, 249, 137, 211, 32, 205, 239, 196, 101, 178, 149, 214, 160, 175,
                    55, 115, 17, 87, 90, 196, 81, 153, 217, 171, 10, 159, 88, 84, 63, 18,
                    242, 94, 51, 220, 196, 199, 231, 240, 147, 25, 136, 104, 32, 136, 182, 231,
                    28
                ],
                block_number: "8233877",
                chain_id: 11155111,
                contract_address: [
                    88, 43, 238, 143, 67, 191, 32, 57, 100, 211, 140, 84, 250, 3, 230, 45, 97, 97, 89, 250],
                message_nonce_1: 1,
                message_nonce_2: 2,
                pub_x_1: [
                    202, 177, 74, 11, 181, 87, 223, 233, 10, 38, 141, 205, 4, 241, 126, 46,
                    168, 216, 204, 213, 87, 113, 170, 24, 236, 114, 58, 242, 238, 69, 146, 230
                ],
                pub_x_2: [
                    151, 15, 170, 30, 246, 253, 254, 220, 197, 33, 86, 228, 136, 13, 42, 13,
                    206, 87, 175, 250, 241, 153, 230, 96, 142, 155, 35, 201, 240, 133, 210, 209
                ],
                pub_y_1: [
                    117, 212, 75, 184, 188, 152, 219, 147, 36, 15, 72, 7, 124, 99, 170, 75,
                    41, 213, 154, 163, 53, 207, 244, 178, 160, 136, 35, 79, 105, 194, 46, 186
                ],
                pub_y_2: [
                    52, 42, 30, 161, 209, 132, 56, 146, 52, 122, 143, 154, 13, 203, 9, 114,
                    252, 208, 63, 224, 23, 210, 108, 178, 180, 205, 212, 99, 191, 123, 154, 242
                ],
                receipt_amount: 0x100
            };

            // @ts-ignore
            const { witness } = await noir.execute(inputs, foreignCallHandler);
            console.log('Circuit execution result:', witness);
            console.log("proving")
            // @ts-ignore
            const proof = await backend.generateProof(witness, { keccak: true });
            setProof(proof.proof);
            console.log("proof generated");

            const isValid = await backend.verifyProof(proof);
            console.log('Proof is', isValid ? 'valid' : 'invalid');

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