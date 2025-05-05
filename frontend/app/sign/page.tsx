'use client';

import { useState } from 'react';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, recoverPublicKey, createPublicClient, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
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

// Add this function at the top level, before the SignPage component
function proofToFields(bytes) {
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


export default function SignPage() {
    // Remove the useEffect and state variables for noir and backend
    const [nonce, setNonce] = useState('');
    const [amountToReceive, setAmountToReceive] = useState('');
    const [signature1, setSignature1] = useState('');
    const [signature2, setSignature2] = useState('');
    const [recoveredAddress1, setRecoveredAddress1] = useState('');
    const [recoveredAddress2, setRecoveredAddress2] = useState('');
    const [hash1, setHash1] = useState('');
    const [hash2, setHash2] = useState('');
    const [messageHash1, setMessageHash1] = useState('');
    const [messageHash2, setMessageHash2] = useState('');
    const [storageKey1, setStorageKey1] = useState('');
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

            let storageKey = '';

            // Only calculate storage key for the first signature
            if (isFirstSignature) {
                // Calculate storage key using balance slot 2
                // Convert BigInt to hex string properly
                const balanceSlotHex = `0x${BigInt(2).toString(16).padStart(64, '0')}`;
                storageKey = keccak256(
                    concat([signatureHash, balanceSlotHex as `0x${string}`])
                );
            }

            return { signature, recoveredAddress, signatureHash, storageKey, pubKeyX, pubKeyY, isVerified, messageHash };
        } catch (error) {
            console.error('Error signing message:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const generateProof = async () => {
        if (!circuit) {
            console.error('No circuit provided');
            return;
        }

        try {
            setIsProving(true);

            // Helper function to convert hex string to byte array
            const hexToBytes = (hex: string) => {
                const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
                return cleanHex.match(/.{2}/g)?.map(byte => `0x${byte}`) || [];
            };

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

            // Convert all hex values to byte arrays
            const signature1Bytes = hexToBytes(signature1);
            const signature2Bytes = hexToBytes(signature2);
            const pubX1Bytes = hexToBytes(pubKeyX1);
            const pubX2Bytes = hexToBytes(pubKeyX2);
            const pubY1Bytes = hexToBytes(pubKeyY1);
            const pubY2Bytes = hexToBytes(pubKeyY2);
            const contractAddressBytes = hexToBytes("0x582BEE8f43BF203964d38c54FA03e62d616159fA");

            // Validate lengths
            if (signature1Bytes.length !== 65 || signature2Bytes.length !== 65) {
                throw new Error('Signatures must be 65 bytes long');
            }
            if (pubX1Bytes.length !== 32 || pubX2Bytes.length !== 32 ||
                pubY1Bytes.length !== 32 || pubY2Bytes.length !== 32) {
                throw new Error('Public keys must be 32 bytes long');
            }
            if (contractAddressBytes.length !== 20) {
                throw new Error('Contract address must be 20 bytes long');
            }


            // Get the current block number using public client
            const publicClient = createPublicClient({
                chain: sepolia,
                transport: http() // Use Sepolia RPC endpoint
            });
            const currentBlock = await publicClient.getBlockNumber();
            console.log("current block", currentBlock);


            const inputs = {
                alice_signature_nonce_1: signature1Bytes,
                alice_signature_nonce_2: signature2Bytes,
                block_number: currentBlock.toString(),
                chain_id: 11155111,
                contract_address: contractAddressBytes,
                message_nonce_1: Number(nonce) - 1,
                message_nonce_2: Number(nonce),
                pub_x_1: pubX1Bytes,
                pub_x_2: pubX2Bytes,
                pub_y_1: pubY1Bytes,
                pub_y_2: pubY2Bytes,
                receipt_amount: amountToReceive
            };

            console.log('Inputs:', inputs);

            // Initialize Noir and backend
            const noir = new Noir(circuit as NoirCircuit);
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode, { threads: 2 }, { recursive: true });

            // Generate the proof
            const { witness } = await noir.execute(inputs, foreignCallHandler);
            console.log('Circuit execution result:', witness);

            const alice_proof = await backend.generateProof(witness);
            console.log('Generated proof:', alice_proof);
            console.log("proof", await backend.verifyProof(alice_proof));

            const { vkAsFields } = await backend.generateRecursiveProofArtifacts(
                alice_proof.proof,
                10,
            );


            console.log("vkAsFields generatged");

            const publicInputElements = 10;

            const proofAsFields = [...alice_proof.publicInputs.slice(publicInputElements), ...proofToFields(alice_proof.proof)];
            console.log("proof field length", proofAsFields.length);

            console.log("proofAsFields generated");

            const proofData = {
                alice_proof,
                vkAsFields,
                proofAsFields
            };

            setProof(JSON.stringify(proofData, null, 2));

            // Generate a unique ID for this proof
            const proofId = Math.random().toString(36).substring(2, 15);

            // Store proof data in localStorage
            localStorage.setItem(`proof_${proofId}`, JSON.stringify(proofData));

            // Generate receipt link with just the ID
            const receiptLink = `${window.location.origin}/receipt/${proofId}`;
            setReceiptLink(receiptLink);

        } catch (error) {
            console.error('Error generating proof:', error);
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError('Unknown error occurred');
            }
        } finally {
            setIsProving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsLoading(true);

            // Sign message for nonce - 1
            const result1 = await handleSign(`${parseInt(nonce) - 1}`, true);
            setSignature1(result1.signature);
            setRecoveredAddress1(result1.recoveredAddress);
            setHash1(result1.signatureHash);
            setMessageHash1(result1.messageHash);
            setPubKeyX1(result1.pubKeyX);
            setPubKeyY1(result1.pubKeyY);
            setIsVerified1(result1.isVerified);

            // Format the storage key to ensure it's a proper hex string
            const formattedStorageKey = result1.storageKey.startsWith('0x')
                ? result1.storageKey
                : `0x${result1.storageKey}`;
            setStorageKey1(formattedStorageKey);

            // Sign message for nonce
            const result2 = await handleSign(nonce, false);
            setSignature2(result2.signature);
            setRecoveredAddress2(result2.recoveredAddress);
            setHash2(result2.signatureHash);
            setMessageHash2(result2.messageHash);
            setPubKeyX2(result2.pubKeyX);
            setPubKeyY2(result2.pubKeyY);
            setIsVerified2(result2.isVerified);

        } catch (error) {
            console.error('Error in form submission:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-gray-900/80 backdrop-blur-sm shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-white">Message Signing Form</h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="nonce" className="block text-sm font-medium text-white">
                            Nonce
                        </label>
                        <input
                            type="number"
                            id="nonce"
                            value={nonce}
                            onChange={(e) => setNonce(e.target.value)}
                            className="mt-1 block w-full border border-green-500 bg-gray-800 text-white shadow-sm focus:border-green-500 focus:ring-green-500"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="amount_to_receive" className="block text-sm font-medium text-white">
                            Amount to Receive
                        </label>
                        <input
                            type="number"
                            id="amount_to_receive"
                            value={amountToReceive}
                            onChange={(e) => setAmountToReceive(e.target.value)}
                            className="mt-1 block w-full border border-green-500 bg-gray-800 text-white shadow-sm focus:border-green-500 focus:ring-green-500"
                            required
                            step="0.000000000000000001"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white">
                            Signature 1 (for nonce - 1)
                        </label>
                        <div className="mt-1 p-2 border border-green-500 bg-gray-800 text-white">
                            {signature1 || 'No signature yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Message Hash: {messageHash1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Recovered Address: {recoveredAddress1 || 'Not recovered yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Keccak256 Hash: {hash1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Storage Key: {storageKey1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Public Key X: {pubKeyX1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Public Key Y: {pubKeyY1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Public Key Verified: {isVerified1 ? '✅' : '❌'}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white">
                            Signature 2 (for nonce)
                        </label>
                        <div className="mt-1 p-2 border border-green-500 bg-gray-800 text-white">
                            {signature2 || 'No signature yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Message Hash: {messageHash2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Recovered Address: {recoveredAddress2 || 'Not recovered yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Keccak256 Hash: {hash2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Public Key X: {pubKeyX2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Public Key Y: {pubKeyY2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">
                            Public Key Verified: {isVerified2 ? '✅' : '❌'}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                        {isLoading ? 'Signing...' : 'Sign Messages'}
                    </button>

                    {signature1 && signature2 && (
                        <button
                            type="button"
                            onClick={generateProof}
                            disabled={isProving}
                            className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
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
                <div className="mt-8 max-w-md mx-auto bg-gray-900/80 backdrop-blur-sm shadow-md p-6">
                    <h2 className="text-lg font-medium text-white mb-2">Receipt Link Generated</h2>
                    <div className="p-4 border border-green-500 bg-gray-800">
                        <p className="text-sm text-gray-300">A receipt link has been generated. Click the button below to copy it.</p>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(receiptLink);
                                alert('Link copied to clipboard!');
                            }}
                            className="mt-2 w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            Copy Receipt Link
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
} 