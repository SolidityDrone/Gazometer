'use client';

import { useState } from 'react';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, recoverPublicKey } from 'viem';
import { mainnet } from 'viem/chains';
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

    // Get the user's address using wagmi's useAccount hook
    const { address } = useAccount();

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

            // Create the foreign call handler
            const foreignCallHandler = async (name: string, inputs: string[] | any) => {
                console.log('FOREIGN CALL HANDLER TRIGGERED:', { name, inputs });
                try {
                    // Convert inputs to the correct format
                    let formattedInputs;
                    if (Array.isArray(inputs)) {
                        formattedInputs = inputs.map(input => {
                            // Remove any extra '0x' prefixes
                            const cleanInput = input.startsWith('0x0x') ? input.slice(2) : input;
                            return cleanInput;
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

                    if (!jsonRPCResponse.result || !jsonRPCResponse.result.values) {
                        throw new Error('Invalid oracle response format');
                    }

                    // Ensure we return an array of strings
                    const values = jsonRPCResponse.result.values;
                    if (Array.isArray(values)) {
                        return values.map(v => String(v));
                    } else if (typeof values === 'string') {
                        return [values];
                    } else if (typeof values === 'number') {
                        return [String(values)];
                    } else if (typeof values === 'boolean') {
                        return [String(values)];
                    } else {
                        throw new Error(`Unexpected oracle response type: ${typeof values}`);
                    }
                } catch (error: unknown) {
                    console.error('Detailed oracle error:', error);
                    if (error instanceof Error) {
                        throw new Error(`Oracle call failed: ${error.message}`);
                    }
                    throw new Error('Oracle call failed with unknown error');
                }
            };

            // Initialize Noir with the foreign call handler
            const noir = new Noir(circuit as NoirCircuit);
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode);
            (backend as any).oracle_hash = 'keccak';

            // Get current block number and chain ID
            const blockNumber = "8233877"; // You might want to get this from an API
            const chainId = "11155111";    // Sepolia testnet chain ID

            // Helper function to create a byte array of a specific length
            const createByteArray = (length: number, value: string = "0x01") => {
                return Array(length).fill(value);
            };

            // Helper function to convert hex string to byte array
            const hexToBytes = (hex: string) => {
                const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
                return cleanHex.match(/.{2}/g)?.map(byte => `0x${byte}`) || [];
            };

            // Test the foreign call handler first
            try {
                console.log('Testing foreign call handler...');
                // Create more realistic test inputs
                const testSignature = "0x" + "01".repeat(65); // 65 bytes of 0x01
                const testPubKey = "0x" + "02".repeat(32); // 32 bytes of 0x02
                const testContract = "0x" + "03".repeat(20); // 20 bytes of 0x03

                const testInputs = {
                    alice_signature_nonce_1: hexToBytes(testSignature),
                    alice_signature_nonce_2: hexToBytes(testSignature),
                    block_number: "8233877",
                    chain_id: "11155111",
                    contract_address: hexToBytes(testContract),
                    message_nonce_1: 1,
                    message_nonce_2: 2,
                    pub_x_1: hexToBytes(testPubKey),
                    pub_x_2: hexToBytes(testPubKey),
                    pub_y_1: hexToBytes(testPubKey),
                    pub_y_2: hexToBytes(testPubKey),
                    receipt_amount: "1000000000000000000" // 1 ETH in wei
                };

                console.log('Test inputs:', JSON.stringify(testInputs, null, 2));
                console.log('Test signature length:', testInputs.alice_signature_nonce_1.length);
                console.log('Test pub key length:', testInputs.pub_x_1.length);
                console.log('Test contract length:', testInputs.contract_address.length);

                const testResult = await noir.execute(testInputs);
                console.log('Test execution result:', testResult);
            } catch (error) {
                console.error('Test execution failed:', error);
                if (error instanceof Error) {
                    console.error('Test error stack:', error.stack);
                }
            }

            // Convert all hex values to decimal numbers
            const signature1Bytes = hexToBytes(signature1).map(byte => parseInt(byte.slice(2), 16));
            const signature2Bytes = hexToBytes(signature2).map(byte => parseInt(byte.slice(2), 16));
            const pubX1Bytes = hexToBytes(pubKeyX1).map(byte => parseInt(byte.slice(2), 16));
            const pubX2Bytes = hexToBytes(pubKeyX2).map(byte => parseInt(byte.slice(2), 16));
            const pubY1Bytes = hexToBytes(pubKeyY1).map(byte => parseInt(byte.slice(2), 16));
            const pubY2Bytes = hexToBytes(pubKeyY2).map(byte => parseInt(byte.slice(2), 16));
            const contractAddressBytes = hexToBytes("0x582BEE8f43BF203964d38c54FA03e62d616159fA").map(byte => parseInt(byte.slice(2), 16));

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

            const inputs = {
                alice_signature_nonce_1: signature1Bytes,
                alice_signature_nonce_2: signature2Bytes,
                block_number: parseInt(blockNumber),
                chain_id: parseInt(chainId),
                contract_address: contractAddressBytes,
                message_nonce_1: 1,
                message_nonce_2: 2,
                pub_x_1: pubX1Bytes,
                pub_x_2: pubX2Bytes,
                pub_y_1: pubY1Bytes,
                pub_y_2: pubY2Bytes,
                receipt_amount: parseInt(amountToReceive)
            };

            console.log('Starting proof generation with inputs:', JSON.stringify(inputs, null, 2));
            console.log('Signature 1 length:', inputs.alice_signature_nonce_1.length);
            console.log('Signature 2 length:', inputs.alice_signature_nonce_2.length);
            console.log('Pub key X1 length:', inputs.pub_x_1.length);
            console.log('Pub key Y1 length:', inputs.pub_y_1.length);
            console.log('Contract address length:', inputs.contract_address.length);

            // First execute the circuit to get the witness
            console.log('Executing circuit with inputs...');
            let witness;
            try {
                console.log('About to execute circuit...');
                console.log('Noir instance:', noir);
                console.log('Noir options:', (noir as any).options);

                const result = await noir.execute(inputs);
                console.log('Circuit execution result:', result);
                witness = result.witness;
                console.log('Generated witness:', witness);
            } catch (error) {
                console.error('Circuit execution error:', error);
                if (error instanceof Error) {
                    console.error('Error stack:', error.stack);
                }
                throw error;
            }

            // Then generate the proof using the backend
            const proof = await backend.generateProof(witness);
            setProof(proof.proof);

            // Verify the proof
            const isValid = await backend.verifyProof(proof);
            console.log('Proof is', isValid ? 'valid' : 'invalid');
        } catch (error) {
            console.error('Error generating proof:', error);
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

    // Test function to make a direct oracle call
    const testGetHeaderCall = async () => {
        console.log('Testing direct oracle call...');
        try {
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
                        function: "get_header",
                        inputs: ["aa36a7", "7da395"], // chain_id and block_number
                        session_id: 1,
                        root_path: "",
                        package_name: ""
                    }],
                    id: 1
                })
            });
            const data = await response.json();
            console.log('Test response:', data);
        } catch (error) {
            console.error('Test error:', error);
        }
    };

    const testGetProof = async () => {
        console.log('Testing get_proof call...');
        try {
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
                        function: "get_proof",
                        inputs: [
                            "0000000000000000000000000000000000000000000000000000000000aa36a7",
                            "00000000000000000000000000000000000000000000000000000000007da37e",
                            [
                                "0000000000000000000000000000000000000000000000000000000000000058",
                                "000000000000000000000000000000000000000000000000000000000000002b",
                                "00000000000000000000000000000000000000000000000000000000000000ee",
                                "000000000000000000000000000000000000000000000000000000000000008f",
                                "0000000000000000000000000000000000000000000000000000000000000043",
                                "00000000000000000000000000000000000000000000000000000000000000bf",
                                "0000000000000000000000000000000000000000000000000000000000000020",
                                "0000000000000000000000000000000000000000000000000000000000000039",
                                "0000000000000000000000000000000000000000000000000000000000000064",
                                "00000000000000000000000000000000000000000000000000000000000000d3",
                                "000000000000000000000000000000000000000000000000000000000000008c",
                                "0000000000000000000000000000000000000000000000000000000000000054",
                                "00000000000000000000000000000000000000000000000000000000000000fa",
                                "0000000000000000000000000000000000000000000000000000000000000003",
                                "00000000000000000000000000000000000000000000000000000000000000e6",
                                "000000000000000000000000000000000000000000000000000000000000002d",
                                "0000000000000000000000000000000000000000000000000000000000000061",
                                "0000000000000000000000000000000000000000000000000000000000000061",
                                "0000000000000000000000000000000000000000000000000000000000000059",
                                "00000000000000000000000000000000000000000000000000000000000000fa"
                            ],
                            [
                                "00000000000000000000000000000000000000000000000000000000000000db",
                                "0000000000000000000000000000000000000000000000000000000000000063",
                                "0000000000000000000000000000000000000000000000000000000000000031",
                                "000000000000000000000000000000000000000000000000000000000000008f",
                                "0000000000000000000000000000000000000000000000000000000000000009",
                                "00000000000000000000000000000000000000000000000000000000000000a1",
                                "00000000000000000000000000000000000000000000000000000000000000c8",
                                "0000000000000000000000000000000000000000000000000000000000000029",
                                "000000000000000000000000000000000000000000000000000000000000005b",
                                "0000000000000000000000000000000000000000000000000000000000000061",
                                "000000000000000000000000000000000000000000000000000000000000002f",
                                "0000000000000000000000000000000000000000000000000000000000000039",
                                "0000000000000000000000000000000000000000000000000000000000000069",
                                "00000000000000000000000000000000000000000000000000000000000000bf",
                                "0000000000000000000000000000000000000000000000000000000000000068",
                                "0000000000000000000000000000000000000000000000000000000000000046",
                                "0000000000000000000000000000000000000000000000000000000000000019",
                                "00000000000000000000000000000000000000000000000000000000000000d1",
                                "00000000000000000000000000000000000000000000000000000000000000b1",
                                "000000000000000000000000000000000000000000000000000000000000002b",
                                "00000000000000000000000000000000000000000000000000000000000000a2",
                                "0000000000000000000000000000000000000000000000000000000000000081",
                                "0000000000000000000000000000000000000000000000000000000000000010",
                                "000000000000000000000000000000000000000000000000000000000000006e",
                                "00000000000000000000000000000000000000000000000000000000000000cd",
                                "000000000000000000000000000000000000000000000000000000000000004d",
                                "00000000000000000000000000000000000000000000000000000000000000b7",
                                "0000000000000000000000000000000000000000000000000000000000000014",
                                "00000000000000000000000000000000000000000000000000000000000000e6",
                                "000000000000000000000000000000000000000000000000000000000000003a",
                                "0000000000000000000000000000000000000000000000000000000000000078",
                                "0000000000000000000000000000000000000000000000000000000000000057"
                            ]
                        ],
                        session_id: 1,
                        root_path: "",
                        package_name: ""
                    }],
                    id: 1
                })
            });
            const data = await response.json();
            console.log('Test response:', data);
        } catch (error) {
            console.error('Test error:', error);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-black">Message Signing Form</h1>

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
                        />
                    </div>

                    <div>
                        <label htmlFor="amount_to_receive" className="block text-sm font-medium text-black">
                            Amount to Receive
                        </label>
                        <input
                            type="number"
                            id="amount_to_receive"
                            value={amountToReceive}
                            onChange={(e) => setAmountToReceive(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-black"
                            required
                            step="0.000000000000000001"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-black">
                            Signature 1 (for nonce - 1)
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
                            Storage Key: {storageKey1 || 'Not calculated yet'}
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
                            Signature 2 (for nonce)
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

                    <button
                        type="button"
                        onClick={testGetHeaderCall}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Test Get Header
                    </button>

                    <button
                        type="button"
                        onClick={testGetProof}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mt-2"
                    >
                        Test Get Proof
                    </button>

                    {proof && (
                        <div className="mt-4">
                            <h2 className="text-lg font-medium text-black mb-2">Generated Proof</h2>
                            <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                                {JSON.stringify(proof, null, 2)}
                            </pre>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
} 