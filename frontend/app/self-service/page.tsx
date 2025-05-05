'use client';

import { useState } from 'react';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, recoverPublicKey, createPublicClient, http, hexToBytes } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
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

export default function SelfServicePage() {
    const [amount, setAmount] = useState('');
    const [nonce, setNonce] = useState('');
    const [receiverAddress, setReceiverAddress] = useState('');
    const [isDeposit, setIsDeposit] = useState(true);
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

    const handleSign = async (message: string) => {
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
            setProof(null);
            setReceiptLink(null);

            // Get the current block number using public client
            const publicClient = createPublicClient({
                chain: sepolia,
                transport: http()
            });
            const currentBlock = await publicClient.getBlockNumber();

            // Contract address
            const contractAddress = "0x582BEE8f43BF203964d38c54FA03e62d616159fA" as `0x${string}`;

            // Convert signatures to bytes and format as hex strings
            const signature1Bytes = Array.from(hexToBytes(signature1.startsWith('0x') ? signature1 as `0x${string}` : `0x${signature1}` as `0x${string}`)).map(b => `0x${b.toString(16).padStart(2, '0')}`);
            const signature2Bytes = Array.from(hexToBytes(signature2.startsWith('0x') ? signature2 as `0x${string}` : `0x${signature2}` as `0x${string}`)).map(b => `0x${b.toString(16).padStart(2, '0')}`);

            // Convert public keys to bytes and format as hex strings
            const pubX1Bytes = Array.from(hexToBytes(pubKeyX1.startsWith('0x') ? pubKeyX1 as `0x${string}` : `0x${pubKeyX1}` as `0x${string}`)).map(b => `0x${b.toString(16).padStart(2, '0')}`);
            const pubX2Bytes = Array.from(hexToBytes(pubKeyX2.startsWith('0x') ? pubKeyX2 as `0x${string}` : `0x${pubKeyX2}` as `0x${string}`)).map(b => `0x${b.toString(16).padStart(2, '0')}`);
            const pubY1Bytes = Array.from(hexToBytes(pubKeyY1.startsWith('0x') ? pubKeyY1 as `0x${string}` : `0x${pubKeyY1}` as `0x${string}`)).map(b => `0x${b.toString(16).padStart(2, '0')}`);
            const pubY2Bytes = Array.from(hexToBytes(pubKeyY2.startsWith('0x') ? pubKeyY2 as `0x${string}` : `0x${pubKeyY2}` as `0x${string}`)).map(b => `0x${b.toString(16).padStart(2, '0')}`);

            // Convert contract address to bytes and format as hex strings
            const contractAddressBytes = Array.from(hexToBytes(contractAddress)).map(b => `0x${b.toString(16).padStart(2, '0')}`);

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
                message_nonce_1: Number(nonce) - 1,
                message_nonce_2: nonce,
                pub_x_1: pubX1Bytes,
                pub_y_1: pubY1Bytes,
                pub_x_2: pubX2Bytes,
                pub_y_2: pubY2Bytes,
                contract_address: contractAddressBytes,
                amount: amount,
                is_deposit: isDeposit ? "1" : "0",
                receiver_address: contractAddressBytes
            };

            console.log('Inputs:', inputs);

            // Initialize Noir and backend
            const noir = new Noir(circuit as NoirCircuit);
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode, { threads: 2 }, { recursive: true });

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

            // Sign message for previous nonce
            const result1 = await handleSign((Number(nonce) - 1).toString());
            setSignature1(result1.signature);
            setRecoveredAddress1(result1.recoveredAddress);
            setHash1(result1.signatureHash);
            setMessageHash1(result1.messageHash);
            setPubKeyX1(result1.pubKeyX);
            setPubKeyY1(result1.pubKeyY);
            setIsVerified1(result1.isVerified);

            // Sign message for current nonce
            const result2 = await handleSign(nonce);
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
        <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-black">Self Service</h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="nonce" className="block text-sm font-medium text-black">
                            Nonce
                        </label>
                        <input
                            type="number"
                            id="nonce"
                            value={nonce}
                            onChange={(e) => setNonce(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-black"
                            required
                            min="1"
                        />
                    </div>

                    <div>
                        <label htmlFor="receiver" className="block text-sm font-medium text-black">
                            Receiver Address
                        </label>
                        <input
                            type="text"
                            id="receiver"
                            value={receiverAddress}
                            onChange={(e) => setReceiverAddress(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-black"
                            required
                            placeholder="0x..."
                        />
                    </div>

                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-black">
                            Amount
                        </label>
                        <input
                            type="number"
                            id="amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-black"
                            required
                            step="0.000000000000000001"
                        />
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="isDeposit"
                            checked={isDeposit}
                            onChange={(e) => setIsDeposit(e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isDeposit" className="ml-2 block text-sm text-black">
                            Deposit (uncheck for withdrawal)
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-black">
                            Signature 1
                        </label>
                        <div className="mt-1 p-2 bg-gray-50 rounded-md text-black">
                            {signature1 || 'No signature yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Message Hash: {messageHash1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Recovered Address: {recoveredAddress1 || 'Not recovered yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Keccak256 Hash: {hash1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Public Key X: {pubKeyX1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Public Key Y: {pubKeyY1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Public Key Verified: {isVerified1 ? '✅' : '❌'}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-black">
                            Signature 2
                        </label>
                        <div className="mt-1 p-2 bg-gray-50 rounded-md text-black">
                            {signature2 || 'No signature yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Message Hash: {messageHash2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Recovered Address: {recoveredAddress2 || 'Not recovered yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Keccak256 Hash: {hash2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Public Key X: {pubKeyX2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Public Key Y: {pubKeyY2 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Public Key Verified: {isVerified2 ? '✅' : '❌'}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                        {isLoading ? 'Signing...' : 'Sign Messages'}
                    </button>

                    {signature1 && signature2 && (
                        <button
                            type="button"
                            onClick={generateProof}
                            disabled={isProving}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            {isProving ? 'Generating Proof...' : 'Generate Proof'}
                        </button>
                    )}

                    {proof && (
                        <div className="mt-4">
                            <h2 className="text-lg font-medium text-black mb-2">Generated Proof</h2>
                            <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                                {proof}
                            </pre>
                        </div>
                    )}
                </form>
            </div>

            {receiptLink && (
                <div className="mt-8 max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-lg font-medium text-black mb-2">Receipt Link Generated</h2>
                    <div className="p-4 bg-gray-50 rounded-md">
                        <p className="text-sm text-gray-600">A receipt link has been generated. Click the button below to copy it.</p>
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