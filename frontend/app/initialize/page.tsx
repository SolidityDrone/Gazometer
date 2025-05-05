'use client';

import { useState } from 'react';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, recoverPublicKey, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import circuit from '@/public/circuits/self_service.json';

// Add type for the circuit
interface NoirCircuit {
    bytecode: string;
    abi: any;
    noir_version: string;
    hash: number;
}

// Add this function at the top level, before the InitializePage component
function proofToFields(bytes: Uint8Array): string[] {
    const fields = [];
    for (let i = 0; i < bytes.length; i += 32) {
        const fieldBytes = new Uint8Array(32);
        const end = Math.min(i + 32, bytes.length);
        for (let j = 0; j < end - i; j++) {
            fieldBytes[j] = bytes[i + j];
        }
        fields.push(Buffer.from(fieldBytes));
    }
    return fields.map((field) => "0x" + field.toString("hex"));
}

// Helper function to convert hex string to byte array
const hexToBytes = (hex: string) => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return cleanHex.match(/.{2}/g)?.map(byte => `0x${byte}`) || [];
};

export default function InitializePage() {
    const [amount, setAmount] = useState('');
    const [signature1, setSignature1] = useState('');
    const [signature2, setSignature2] = useState('');
    const [recoveredAddress1, setRecoveredAddress1] = useState('');
    const [recoveredAddress2, setRecoveredAddress2] = useState('');
    const [hash1, setHash1] = useState('');
    const [hash2, setHash2] = useState('');
    const [messageHash1, setMessageHash1] = useState('');
    const [messageHash2, setMessageHash2] = useState('');
    const [pubKeyX1, setPubKeyX1] = useState('');
    const [pubKeyY1, setPubKeyY1] = useState('');
    const [pubKeyX2, setPubKeyX2] = useState('');
    const [pubKeyY2, setPubKeyY2] = useState('');
    const [isVerified1, setIsVerified1] = useState(false);
    const [isVerified2, setIsVerified2] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [proof, setProof] = useState<string | null>(null);
    const [isProving, setIsProving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [receiptLink, setReceiptLink] = useState<string | null>(null);

    const { address } = useAccount();

    const handleSign = async (message: string, isFirstSignature: boolean) => {
        try {
            setIsLoading(true);

            // Create wallet client with the user's wallet
            const client = createWalletClient({
                chain: sepolia,
                transport: custom(window.ethereum as any)
            });

            // Get the connected address
            const [address] = await client.getAddresses();

            // Calculate message hash before signing
            const messageHash = keccak256(stringToHex(message));

            // Sign the message
            const signature = await client.signMessage({
                account: address,
                message: message
            });

            // Recover the address from the signature
            const recoveredAddress = await recoverMessageAddress({
                message,
                signature
            });

            // Calculate keccak256 hash of the signature
            const signatureHash = keccak256(stringToHex(signature));

            // Recover the public key from the signature
            const publicKey = await recoverPublicKey({
                hash: messageHash,
                signature: signature
            });

            // Extract x and y coordinates from the public key
            const pubKeyX = publicKey.slice(4, 68); // Skip '0x04' and get x coordinate
            const pubKeyY = publicKey.slice(68); // Get y coordinate

            // Verify the public key by recovering it again from the signature
            const publicKey2 = await recoverPublicKey({
                hash: messageHash,
                signature: signature
            });
            const isVerified = publicKey === publicKey2;

            return { signature, recoveredAddress, signatureHash, pubKeyX, pubKeyY, isVerified, messageHash };
        } catch (error) {
            console.error('Error signing message:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const generateProof = async () => {
        try {
            setIsProving(true);
            setError(null);

            // Get the current block number using public client
            const publicClient = createPublicClient({
                chain: sepolia,
                transport: http()
            });
            const currentBlock = await publicClient.getBlockNumber();

            // Contract address
            const contractAddress = "0x582BEE8f43BF203964d38c54FA03e62d616159fA";

            // Convert signatures to bytes
            const signature1Bytes = hexToBytes(signature1);
            const signature2Bytes = hexToBytes(signature2);

            // Convert public keys to bytes
            const pubX1Bytes = hexToBytes(pubKeyX1);
            const pubX2Bytes = hexToBytes(pubKeyX2);
            const pubY1Bytes = hexToBytes(pubKeyY1);
            const pubY2Bytes = hexToBytes(pubKeyY2);

            // Convert contract address to bytes
            const contractAddressBytes = hexToBytes(contractAddress);

            // Validate lengths
            if (signature1Bytes.length !== 65 || signature2Bytes.length !== 65) {
                throw new Error('Invalid signature length');
            }
            if (pubX1Bytes.length !== 32 || pubX2Bytes.length !== 32 ||
                pubY1Bytes.length !== 32 || pubY2Bytes.length !== 32) {
                throw new Error('Invalid public key length');
            }
            if (contractAddressBytes.length !== 20) {
                throw new Error('Invalid contract address length');
            }

            const inputs = {
                user_signature_nonce_1: signature1Bytes,
                user_signature_nonce_2: signature2Bytes,
                chain_id: "11155111", // Sepolia chain ID
                block_number: currentBlock.toString(),
                message_nonce_1: "0",
                message_nonce_2: "0",
                pub_x_1: pubX1Bytes,
                pub_y_1: pubY1Bytes,
                pub_x_2: pubX2Bytes,
                pub_y_2: pubY2Bytes,
                contract_address: contractAddressBytes,
                amount: amount, // 1 ETH in wei
                is_deposit: "1",
                receiver_address: contractAddressBytes
            };

            console.log("inputs", inputs);

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
            const noir = new Noir(circuit as NoirCircuit);
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode, { threads: 2 }, { recursive: true });

            // Generate the proof
            const { witness } = await noir.execute(inputs, foreignCallHandler);
            console.log('Circuit execution result:', witness);

            const init_proof = await backend.generateProof(witness);
            console.log('Generated proof:', init_proof);
            console.log("proof", await backend.verifyProof(init_proof));

            setProof(JSON.stringify(init_proof, null, 2));

        } catch (error) {
            console.error('Error generating proof:', error);
            setError(error instanceof Error ? error.message : 'Failed to generate proof');
        } finally {
            setIsProving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsLoading(true);

            // Sign message for nonce 0
            const result = await handleSign('0', true);
            setSignature1(result.signature);
            setRecoveredAddress1(result.recoveredAddress);
            setHash1(result.signatureHash);
            setMessageHash1(result.messageHash);
            setPubKeyX1(result.pubKeyX);
            setPubKeyY1(result.pubKeyY);
            setIsVerified1(result.isVerified);

            // Use the same signature and public key for the second input
            setSignature2(result.signature);
            setRecoveredAddress2(result.recoveredAddress);
            setHash2(result.signatureHash);
            setMessageHash2(result.messageHash);
            setPubKeyX2(result.pubKeyX);
            setPubKeyY2(result.pubKeyY);
            setIsVerified2(result.isVerified);

        } catch (error) {
            console.error('Error in form submission:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-gray-900/80 backdrop-blur-sm shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-white">Initialize Account</h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-white">
                            Amount
                        </label>
                        <input
                            type="number"
                            id="amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="mt-1 block w-full border border-green-500 bg-gray-800 text-white shadow-sm focus:border-green-500 focus:ring-green-500"
                            required
                            step="0.000000000000000001"
                        />
                    </div>

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-white">Signature (Nonce 0)</h3>
                            <p className="text-sm text-gray-300">Signature: {signature1 || 'No signature yet'}</p>
                            <p className="text-sm text-gray-300">Recovered Address: {recoveredAddress1 || 'Not recovered yet'}</p>
                            <p className="text-sm text-gray-300">Hash: {hash1 || 'No hash yet'}</p>
                            <p className="text-sm text-gray-300">Message Hash: {messageHash1 || 'No message hash yet'}</p>
                            <p className="text-sm text-gray-300">Public Key X: {pubKeyX1 || 'No public key yet'}</p>
                            <p className="text-sm text-gray-300">Public Key Y: {pubKeyY1 || 'No public key yet'}</p>
                            <p className="text-sm text-gray-300">Verified: {isVerified1 ? 'Yes' : 'No'}</p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                        {isLoading ? 'Signing...' : 'Sign Message'}
                    </button>

                    {signature1 && (
                        <button
                            onClick={generateProof}
                            disabled={isProving}
                            className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            {isProving ? 'Generating Proof...' : 'Generate Proof'}
                        </button>
                    )}

                    {proof && (
                        <div className="mt-4">
                            <h2 className="text-lg font-medium text-white mb-2">Generated Proof</h2>
                            <pre className="p-4 border border-green-500 bg-gray-800 overflow-auto text-xs text-white">
                                {JSON.stringify(proof, null, 2)}
                            </pre>
                        </div>
                    )}
                </form>
            </div>

            {receiptLink && (
                <div className="mt-8 max-w-md mx-auto bg-gray-900/80 backdrop-blur-sm rounded-lg shadow-md p-6">
                    <h2 className="text-lg font-medium text-white mb-2">Receipt Link Generated</h2>
                    <div className="p-4 bg-gray-800 rounded-md">
                        <p className="text-sm text-gray-300">A receipt link has been generated. Click the button below to copy it.</p>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(receiptLink);
                                alert('Link copied to clipboard!');
                            }}
                            className="mt-2 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Copy Receipt Link
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
} 