'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { UltraHonkBackend } from '@aztec/bb.js';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, recoverPublicKey, createPublicClient, formatUnits, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
import alice_circuit from '@/public/circuits/alice_receipt.json';
import bob_circuit from '@/public/circuits/bob_recursive.json';
import { Noir } from '@noir-lang/noir_js';
import { GAZOMETER_ADDRESS } from '@/app/lib/constants';

interface NoirCircuit {
    bytecode: string;
    abi: any;
    noir_version: string;
    hash: number;
}

function proofToFields(bytes: string) {
    const fields = [];
    const buffer = Buffer.from(bytes.replace('0x', ''), 'hex');
    for (let i = 0; i < buffer.length; i += 32) {
        const fieldBytes = new Uint8Array(32);
        const end = Math.min(i + 32, buffer.length);
        for (let j = 0; j < end - i; j++) {
            fieldBytes[j] = buffer[i + j];
        }
        fields.push(Buffer.from(fieldBytes));
    }
    return fields.map((field) => "0x" + field.toString("hex"));
}

export default function ReceiptPage() {
    const params = useParams();
    const { address } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isValidAlice, setIsValidAlice] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [storedProofData, setStoredProofData] = useState<any>(null);

    // Signature states
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
    const [nonce, setNonce] = useState('');
    const [amountToSend, setAmountToSend] = useState('');

    const [isProving, setIsProving] = useState(false);
    const [proofSuccess, setProofSuccess] = useState(false);

    // Helper function to convert hex string to byte array
    const hexToBytes = (hex: string) => {
        const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
        return cleanHex.match(/.{2}/g)?.map(byte => `0x${byte}`) || [];
    };

    useEffect(() => {
        // Load proof data from localStorage
        const proofId = params.id as string;
        const storedProof = localStorage.getItem(`proof_${proofId}`);

        if (storedProof) {
            const proof = JSON.parse(storedProof);
            setStoredProofData(proof);

            // Set amount to send from Alice's proof data
            if (proof.alice_proof && proof.alice_proof.publicInputs) {
                // The amount is in the public inputs array
                const amountHex = proof.alice_proof.publicInputs[8]; // Assuming amount is at index 9
                // Convert from hex to wei, then format to ether
                const amountInWei = BigInt(amountHex);
                const amountInEth = formatUnits(amountInWei, 18); // 18 decimals for ether
                setAmountToSend(amountInEth);
            }

            // Extract and set signature data
            if (proof.alice_proof) {
                setSignature1(proof.alice_proof.signature1 || '');
                setSignature2(proof.alice_proof.signature2 || '');
                setRecoveredAddress1(proof.alice_proof.recoveredAddress1 || '');
                setRecoveredAddress2(proof.alice_proof.recoveredAddress2 || '');
                setHash1(proof.alice_proof.hash1 || '');
                setHash2(proof.alice_proof.hash2 || '');
                setMessageHash1(proof.alice_proof.messageHash1 || '');
                setMessageHash2(proof.alice_proof.messageHash2 || '');
                setStorageKey1(proof.alice_proof.storageKey1 || '');
                setPubKeyX1(proof.alice_proof.pubKeyX1 || '');
                setPubKeyY1(proof.alice_proof.pubKeyY1 || '');
                setPubKeyX2(proof.alice_proof.pubKeyX2 || '');
                setPubKeyY2(proof.alice_proof.pubKeyY2 || '');
                setIsVerified1(proof.alice_proof.isVerified1 || false);
                setIsVerified2(proof.alice_proof.isVerified2 || false);
                setNonce(proof.alice_proof.nonce || '');
            }
        }
    }, [params.id]);

    const handleSign = async (message: string, isFirstSignature: boolean) => {
        try {
            setIsLoading(true);

            // Create wallet client with the user's wallet
            const client = createWalletClient({
                chain: mainnet,
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

    const verifyAliceProof = async () => {
        try {
            setIsVerifying(true);
            setError(null);
            setIsValidAlice(null);

            if (!storedProofData) {
                throw new Error('No proof data available');
            }

            // Initialize backend
            const backend = new UltraHonkBackend((alice_circuit as NoirCircuit).bytecode, { threads: 2 }, { recursive: true });

            // Verify Alice's proof
            if (!storedProofData.alice_proof) {
                throw new Error('Invalid Alice proof data structure');
            }
            const aliceProofArray = new Uint8Array(Object.values(storedProofData.alice_proof.proof));
            const aliceReconstructedProof = {
                proof: aliceProofArray,
                publicInputs: storedProofData.alice_proof.publicInputs
            };
            const isValidAlice = await backend.verifyProof(aliceReconstructedProof);
            setIsValidAlice(isValidAlice);

        } catch (error) {
            console.error('Error verifying proof:', error);
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError('Unknown error occurred');
            }
        } finally {
            setIsVerifying(false);
        }
    };

    const generateBobProof = async () => {
        if (!bob_circuit) {
            console.error('No circuit provided');
            return;
        }

        try {
            setIsProving(true);
            setProofSuccess(false);
            console.log('Starting Bob proof generation...');

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
            console.log('Converting hex values to byte arrays...');
            const signature1Bytes = hexToBytes(signature1);
            const signature2Bytes = hexToBytes(signature2);
            const pubX1Bytes = hexToBytes(pubKeyX1);
            const pubX2Bytes = hexToBytes(pubKeyX2);
            const pubY1Bytes = hexToBytes(pubKeyY1);
            const pubY2Bytes = hexToBytes(pubKeyY2);
            const contractAddressBytes = hexToBytes(GAZOMETER_ADDRESS);

            console.log('Byte array lengths:', {
                signature1Bytes: signature1Bytes.length,
                signature2Bytes: signature2Bytes.length,
                pubX1Bytes: pubX1Bytes.length,
                pubX2Bytes: pubX2Bytes.length,
                pubY1Bytes: pubY1Bytes.length,
                pubY2Bytes: pubY2Bytes.length,
                contractAddressBytes: contractAddressBytes.length
            });

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

            // Create fixed-size arrays for verification_key, proof, and public_inputs
            console.log('Creating fixed-size arrays...');
            const verification_key = new Array(128).fill(0);
            const proof = new Array(456).fill(0);
            const public_inputs = new Array(10).fill(0);

            // Map values from storedProofData
            console.log('Mapping values from storedProofData...');
            //@ts-ignore
            storedProofData.vkAsFields.forEach((value, index) => {
                if (index < verification_key.length) {
                    verification_key[index] = value;
                }
            });
            //@ts-ignore
            storedProofData.proofAsFields.forEach((value, index) => {
                if (index < proof.length) {
                    proof[index] = value;
                }
            });
            //@ts-ignore
            storedProofData.alice_proof.publicInputs.forEach((value, index) => {
                if (index < public_inputs.length) {
                    public_inputs[index] = value;
                }
            });

            console.log('Array lengths after mapping:', {
                verification_key: verification_key.length,
                proof: proof.length,
                public_inputs: public_inputs.length
            });
            const vkHash = "0x" + "0".repeat(64);

            // Get the current block number using public client
            const publicClient = createPublicClient({
                chain: sepolia,
                transport: http() // Use Sepolia RPC endpoint
            });
            const currentBlock = await publicClient.getBlockNumber();
            console.log("current block", currentBlock);

            const inputs = {
                verification_key,
                proof,
                public_inputs: public_inputs.slice(0, 10),
                key_hash: vkHash,
                bob_signature_nonce_1: signature1Bytes,
                bob_signature_nonce_2: signature2Bytes,
                chain_id: 11155111,
                block_number: currentBlock.toString(),
                message_nonce_1: Number(nonce) - 1,
                message_nonce_2: Number(nonce),
                pub_x_1: pubX1Bytes,
                pub_x_2: pubX2Bytes,
                pub_y_1: pubY1Bytes,
                pub_y_2: pubY2Bytes,
                contract_address: contractAddressBytes
            };

            console.log('Final inputs object:', JSON.stringify(inputs, null, 2));

            // Initialize Noir and backend
            console.log('Initializing Noir and backend...');
            const noir = new Noir(bob_circuit as NoirCircuit);
            const backend = new UltraHonkBackend((bob_circuit as NoirCircuit).bytecode, { threads: 2 }, { recursive: true });

            // Generate the proof
            console.log('Generating witness...');
            const { witness } = await noir.execute(inputs, foreignCallHandler);
            console.log('Witness generated:', witness);

            console.log('Generating proof...');
            const bob_proof = await backend.generateProof(witness);
            console.log('Proof generated:', bob_proof);

            console.log('Verifying proof...');
            const isVerified = await backend.verifyProof(bob_proof);
            console.log('Proof verification result:', isVerified);

            setProofSuccess(true);

        } catch (error) {
            console.error('Error generating proof:', error);
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError('Unknown error occurred');
            }
            setProofSuccess(false);
        } finally {
            setIsProving(false);
        }
    };

    return (
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-gray-900/80 backdrop-blur-sm shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-white">Receipt Verification</h1>

                {error && (
                    <div className="mt-4 p-4 bg-red-900/50 rounded-md">
                        <p className="text-sm text-red-300">{error}</p>
                    </div>
                )}

                {/* Alice's Proof Verification */}
                <div className="mb-6">
                    <h2 className="text-lg font-medium text-white mb-4">Alice's Proof Verification</h2>
                    <button
                        onClick={verifyAliceProof}
                        disabled={isVerifying}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                        {isVerifying ? 'Verifying...' : 'Verify Alice\'s Proof'}
                    </button>

                    {isValidAlice !== null && !isVerifying && (
                        <div className="mt-4">
                            <div className={`p-4 rounded-md ${isValidAlice ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                                <p className={`text-sm ${isValidAlice ? 'text-green-300' : 'text-red-300'}`}>
                                    Alice's Proof: {isValidAlice ? '✅ Valid' : '❌ Invalid'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bob's Signing Section */}
                <div className="border-t border-gray-700 pt-6">
                    <h2 className="text-lg font-medium text-white mb-4">Bob's Signatures</h2>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-white">
                            Amount to Send (Ethers)
                        </label>
                        <div className="mt-1 p-2 bg-gray-800 rounded-md text-white">
                            {amountToSend || 'Loading...'}
                        </div>
                    </div>

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
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            {isLoading ? 'Signing...' : 'Sign Messages'}
                        </button>
                    </form>

                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-white">
                                Signature 1 (for nonce - 1)
                            </label>
                            <div className="mt-1 p-2 bg-gray-800 rounded-md text-white">
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
                            <div className="mt-1 p-2 bg-gray-800 rounded-md text-white">
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
                    </div>

                    {signature1 && signature2 && (
                        <button
                            onClick={generateBobProof}
                            disabled={isProving}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            {isProving ? 'Generating Proof...' : 'Generate Bob\'s Proof'}
                        </button>
                    )}

                    {proofSuccess && (
                        <div className="mt-4 p-4 bg-green-900/50 rounded-md">
                            <p className="text-sm text-green-300">✅ Proof generated and verified successfully!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}