'use client';

import { useState } from 'react';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, createPublicClient, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { useAccount } from 'wagmi';

// Define the input type for Noir ZK proof
type NoirProofInput = {
    signature1: string;
    signature2: string;
    nonce1: number;
    nonce2: number;
    storageHash: string;
    storageNodes: any; // Can be null for now
    storage_leaf: string;
    storageDepth: number;
    storageValue: string;
    storageKey: string;
    chainId: number;
    blockNumber: number;
    gazometerAddress: string;
    balanceCommitSlot: number;
    address: string;
    amount_to_receive: number;
};

// Define the refined input type for Noir ZK proof
type RefinedNoirInput = {
    alice_address: string[];
    alice_signature_nonce1: string[];
    alice_signature_nonce2: string[];
    amount_to_receive: string;
    balance_commitment_storage_depth: string;
    balance_commitment_storage_hash: string[];
    balance_commitment_storage_leaf: string[];
    balance_commitment_storage_nodes: string[][];
    balance_commitment_storage_key: string[];
    balance_commitment_storage_value: string[];
    bounded_encrypted_balance: string[];
    commitments_storage_depth: string;
    commitments_storage_hash: string[];
    commitments_storage_leaf: string[];
    commitments_storage_nodes: string[][];
    contract_address: string[];
    current_nonce: string;
    next_nonce: string;
    prev_commitment_value: string[];
    prev_encrypted_balance_value: string[];
};

export default function SignPage() {
    const [nonce, setNonce] = useState('');
    const [amountToReceive, setAmountToReceive] = useState('');
    const [signature1, setSignature1] = useState('');
    const [signature2, setSignature2] = useState('');
    const [recoveredAddress1, setRecoveredAddress1] = useState('');
    const [recoveredAddress2, setRecoveredAddress2] = useState('');
    const [hash1, setHash1] = useState('');
    const [hash2, setHash2] = useState('');
    const [storageKey1, setStorageKey1] = useState('');
    const [proofResult, setProofResult] = useState('');
    const [noirInput, setNoirInput] = useState<NoirProofInput | null>(null);
    const [refinedInput, setRefinedInput] = useState<RefinedNoirInput | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Get the user's address using wagmi's useAccount hook
    const { address } = useAccount();

    const handleSign = async (message: string, isFirstSignature: boolean) => {
        try {
            setIsLoading(true);

            // Create wallet client with the user's wallet
            const client = createWalletClient({
                chain: mainnet,
                transport: custom(window.ethereum)
            });

            // Get the connected address
            const [address] = await client.getAddresses();

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

            return { signature, recoveredAddress, signatureHash, storageKey };
        } catch (error) {
            console.error('Error signing message:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const getProof = async (storageKey: string) => {
        try {
            setIsLoading(true);

            // Create a public client for Base Sepolia
            const publicClient = createPublicClient({
                chain: sepolia,
                transport: http('https://gateway.tenderly.co/public/sepolia')
            });

            // Ensure storage key is a proper hex string with 0x prefix
            const formattedStorageKey = storageKey.startsWith('0x')
                ? storageKey as `0x${string}`
                : `0x${storageKey}` as `0x${string}`;

            // Get the proof for the storage key
            const proof = await publicClient.getProof({
                address: '0x52E2D64b28C3Fc99B71790BF6223f6aA004453b1',
                storageKeys: [formattedStorageKey]
            });

            // Convert any BigInt values in the proof to hex strings before stringifying
            const safeProof = JSON.parse(JSON.stringify(proof, (_, value) => {
                if (typeof value === 'bigint') {
                    // Convert BigInt to hex string with 0x prefix
                    return `0x${value.toString(16)}`;
                }
                return value;
            }));

            return safeProof;
        } catch (error) {
            console.error('Error getting proof:', error);
            return `Error: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            setIsLoading(false);
        }
    };

    // Helper function to format hex array with specified length and padding
    const formatHexArray = (hex: string | number | undefined | null, options: { length: number, pad: 'left' | 'right' }): string => {
        // Handle undefined or null input
        if (hex === undefined || hex === null) {
            return '0x' + '0'.repeat(options.length * 2);
        }

        // Convert number to hex string if needed
        const hexStr = typeof hex === 'number' ? hex.toString(16) : String(hex);

        // Remove 0x prefix if present
        const cleanHex = hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr;

        // Pad the hex string to the specified length
        let paddedHex = cleanHex;
        if (cleanHex.length < options.length * 2) {
            const padding = '0'.repeat(options.length * 2 - cleanHex.length);
            paddedHex = options.pad === 'left' ? padding + cleanHex : cleanHex + padding;
        }

        return `0x${paddedHex}`;
    };

    const prepareNoirInput = async (
        sig1: string,
        sig2: string,
        hash1: string,
        hash2: string,
        nonce1: number,
        nonce2: number,
        proof: any
    ) => {
        try {
            // Create a public client for Base Sepolia
            const publicClient = createPublicClient({
                chain: sepolia,
                transport: http('https://gateway.tenderly.co/public/sepolia')
            });

            // Get the latest block number
            const blockNumber = await publicClient.getBlockNumber();

            // Extract storage proof information
            const storageProof = proof.storageProof[0];
            const value = storageProof.value;
            const depth = storageProof.proof.length;
            const key = storageProof.key;

            // Get the storage nodes from the proof
            const storageNodes = storageProof.proof;

            // Get the leaf from the last node in the proof
            const leaf = storageProof.proof[storageProof.proof.length - 1];

            // Format the leaf with the specified length and padding
            const storage_leaf = formatHexArray(leaf, { length: 69, pad: 'right' });

            // Create the Noir input
            const input: NoirProofInput = {
                signature1: sig1,
                signature2: sig2,
                nonce1: nonce1,
                nonce2: nonce2,
                storageHash: proof.storageHash,
                storageNodes: storageNodes, // Use the actual storage nodes from the proof
                storage_leaf: storage_leaf,
                storageDepth: storageNodes.length - 1,
                storageValue: value,
                storageKey: key,
                chainId: sepolia.id,
                blockNumber: Number(blockNumber),
                gazometerAddress: '0x52E2D64b28C3Fc99B71790BF6223f6aA004453b1',
                balanceCommitSlot: 2,
                address: address || '0x0000000000000000000000000000000000000000',
                amount_to_receive: parseFloat(amountToReceive) || 0,
            };

            return input;
        } catch (error) {
            console.error('Error preparing Noir input:', error);
            throw error;
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

            // Get proof for the storage key
            if (formattedStorageKey) {
                const proof = await getProof(formattedStorageKey);
                setProofResult(JSON.stringify(proof, null, 2));

                // Prepare Noir input
                const noirInput = await prepareNoirInput(
                    result1.signature,
                    result2.signature,
                    result1.signatureHash,
                    result2.signatureHash,
                    parseInt(nonce) - 1,
                    parseInt(nonce),
                    proof
                );

                setNoirInput(noirInput);
            }

        } catch (error) {
            console.error('Error in form submission:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getRefinedInputs = () => {
        if (!noirInput) return;

        // Convert hex strings to byte arrays
        const hexToBytes = (hex: string): string[] => {
            // Remove 0x prefix if present
            const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
            const bytes: string[] = [];

            // Split into pairs of characters (bytes)
            for (let i = 0; i < cleanHex.length; i += 2) {
                bytes.push(`0x${cleanHex.slice(i, i + 2)}`);
            }

            return bytes;
        };

        // Convert address to byte array
        const addressBytes = hexToBytes(noirInput.address);

        // Convert signatures to byte arrays
        const sig1Bytes = hexToBytes(noirInput.signature1);
        const sig2Bytes = hexToBytes(noirInput.signature2);

        // Convert storage hash to byte array
        const storageHashBytes = hexToBytes(noirInput.storageHash);

        // Convert storage leaf to byte array
        const storageLeafBytes = hexToBytes(noirInput.storage_leaf);

        // Convert storage key to byte array
        const storageKeyBytes = hexToBytes(noirInput.storageKey);

        // Convert storage value to byte array
        const storageValueBytes = hexToBytes(noirInput.storageValue);

        // Process storage nodes to ensure we have 7 arrays of the same length
        const storageNodesBytes: string[][] = [];

        // If we have storage nodes, process them
        if (Array.isArray(noirInput.storageNodes) && noirInput.storageNodes.length > 0) {
            // Process each node
            noirInput.storageNodes.forEach((node: string) => {
                storageNodesBytes.push(hexToBytes(node));
            });
        }

        // Create a zero array of the specified length (532 bytes as per the error message)
        const createZeroArray = (length: number): string[] => {
            const zeroArray: string[] = [];
            for (let i = 0; i < length; i++) {
                zeroArray.push('0x00');
            }
            return zeroArray;
        };

        // Ensure we have exactly 7 arrays with 532 bytes each
        while (storageNodesBytes.length < 7) {
            storageNodesBytes.push(createZeroArray(532));
        }

        // Ensure each array has exactly 532 bytes
        for (let i = 0; i < storageNodesBytes.length; i++) {
            if (storageNodesBytes[i].length < 532) {
                // Pad with zeros if needed
                const padding = createZeroArray(532 - storageNodesBytes[i].length);
                storageNodesBytes[i] = [...storageNodesBytes[i], ...padding];
            } else if (storageNodesBytes[i].length > 532) {
                // Truncate if too long
                storageNodesBytes[i] = storageNodesBytes[i].slice(0, 532);
            }
        }

        // Convert contract address to byte array
        const contractAddressBytes = hexToBytes(noirInput.gazometerAddress);

        // Create the refined input
        const refined: RefinedNoirInput = {
            alice_address: addressBytes,
            alice_signature_nonce1: sig1Bytes,
            alice_signature_nonce2: sig2Bytes,
            amount_to_receive: noirInput.amount_to_receive.toString(),
            balance_commitment_storage_depth: noirInput.storageDepth.toString(),
            balance_commitment_storage_hash: storageHashBytes,
            balance_commitment_storage_leaf: storageLeafBytes,
            balance_commitment_storage_nodes: storageNodesBytes,
            balance_commitment_storage_key: storageKeyBytes,
            balance_commitment_storage_value: storageValueBytes,
            bounded_encrypted_balance: [], // Placeholder
            commitments_storage_depth: "0", // Placeholder
            commitments_storage_hash: [], // Placeholder
            commitments_storage_leaf: [], // Placeholder
            commitments_storage_nodes: [], // Placeholder
            contract_address: contractAddressBytes,
            current_nonce: noirInput.nonce1.toString(),
            next_nonce: noirInput.nonce2.toString(),
            prev_commitment_value: [], // Placeholder
            prev_encrypted_balance_value: [], // Placeholder
        };

        setRefinedInput(refined);
    };

    // Custom JSON stringify function to format arrays in a more compact way
    const customStringify = (obj: any): string => {
        // First convert to JSON with our custom array formatting
        const jsonString = JSON.stringify(obj, (key, value) => {
            if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && value[0].startsWith('0x')) {
                // Format byte arrays in a more compact way
                return `[${value.join(', ')}]`;
            }
            return value;
        }, 2);

        // Now remove quotes and curly braces
        return jsonString
            .replace(/"([^"]+)":/g, '$1:') // Remove quotes from keys
            .replace(/"([^"]+)"/g, '$1')   // Remove quotes from string values
            .replace(/{\n/g, '')           // Remove opening curly braces
            .replace(/\n}/g, '')           // Remove closing curly braces
            .replace(/,\n/g, '\n')         // Remove trailing commas
            .replace(/\[\n/g, '[')         // Remove opening brackets with newlines
            .replace(/\n\]/g, ']');        // Remove closing brackets with newlines
    };

    // Custom function to format storage nodes for easy copy-paste into Noir
    const formatStorageNodesForNoir = (nodes: string[][]): string => {
        let result = 'let storage_nodes = [\n';

        for (let i = 0; i < nodes.length; i++) {
            result += '    [';

            // Add each byte with proper formatting
            for (let j = 0; j < nodes[i].length; j++) {
                result += nodes[i][j];
                if (j < nodes[i].length - 1) {
                    result += ', ';
                }

                // Add line breaks for readability (every 16 bytes)
                if ((j + 1) % 16 === 0 && j < nodes[i].length - 1) {
                    result += '\n             ';
                }
            }

            result += ']';
            if (i < nodes.length - 1) {
                result += ',\n';
            } else {
                result += '\n';
            }
        }

        result += '];';
        return result;
    };

    // Function to format storage nodes for easy copy-paste into Noir tests
    const formatStorageNodesForNoirTest = (nodes: string[][]): string => {
        let result = 'let storage_nodes = [\n';

        for (let i = 0; i < nodes.length; i++) {
            result += '    [\n';

            // Add each byte with proper formatting
            for (let j = 0; j < nodes[i].length; j++) {
                result += `        0x${nodes[i][j].substring(2)}`;
                if (j < nodes[i].length - 1) {
                    result += ', ';
                }

                // Add line breaks for readability (every 16 bytes)
                if ((j + 1) % 16 === 0 && j < nodes[i].length - 1) {
                    result += '\n';
                }
            }

            result += '\n    ]';
            if (i < nodes.length - 1) {
                result += ',\n';
            } else {
                result += '\n';
            }
        }

        result += '];';
        return result;
    };

    // Function to format a complete Noir test with all necessary components
    const formatCompleteNoirTest = (input: RefinedNoirInput): string => {
        let result = '// Complete Noir test format\n\n';

        // Add key (using storage key)
        result += 'let key = [\n';
        for (let i = 0; i < input.balance_commitment_storage_key.length; i++) {
            result += `    0x${input.balance_commitment_storage_key[i].substring(2)}`;
            if (i < input.balance_commitment_storage_key.length - 1) {
                result += ', ';
            }
            if ((i + 1) % 16 === 0 && i < input.balance_commitment_storage_key.length - 1) {
                result += '\n';
            }
        }
        result += '\n];\n\n';

        // Add storage value
        result += 'let storage_value = [\n';
        for (let i = 0; i < input.balance_commitment_storage_value.length; i++) {
            result += `    0x${input.balance_commitment_storage_value[i].substring(2)}`;
            if (i < input.balance_commitment_storage_value.length - 1) {
                result += ', ';
            }
            if ((i + 1) % 16 === 0 && i < input.balance_commitment_storage_value.length - 1) {
                result += '\n';
            }
        }
        result += '\n];\n\n';

        // Add storage hash
        result += 'let storage_hash = [\n';
        for (let i = 0; i < input.balance_commitment_storage_hash.length; i++) {
            result += `    0x${input.balance_commitment_storage_hash[i].substring(2)}`;
            if (i < input.balance_commitment_storage_hash.length - 1) {
                result += ', ';
            }
            if ((i + 1) % 16 === 0 && i < input.balance_commitment_storage_hash.length - 1) {
                result += '\n';
            }
        }
        result += '\n];\n\n';

        // Add storage nodes
        result += 'let storage_nodes = [\n';
        for (let i = 0; i < input.balance_commitment_storage_nodes.length; i++) {
            result += '    [\n';
            for (let j = 0; j < input.balance_commitment_storage_nodes[i].length; j++) {
                result += `        0x${input.balance_commitment_storage_nodes[i][j].substring(2)}`;
                if (j < input.balance_commitment_storage_nodes[i].length - 1) {
                    result += ', ';
                }
                if ((j + 1) % 16 === 0 && j < input.balance_commitment_storage_nodes[i].length - 1) {
                    result += '\n';
                }
            }
            result += '\n    ]';
            if (i < input.balance_commitment_storage_nodes.length - 1) {
                result += ',\n';
            } else {
                result += '\n';
            }
        }
        result += '];\n\n';

        // Add storage leaf
        result += 'let storage_leaf = [\n';
        for (let i = 0; i < input.balance_commitment_storage_leaf.length; i++) {
            result += `    0x${input.balance_commitment_storage_leaf[i].substring(2)}`;
            if (i < input.balance_commitment_storage_leaf.length - 1) {
                result += ', ';
            }
            if ((i + 1) % 16 === 0 && i < input.balance_commitment_storage_leaf.length - 1) {
                result += '\n';
            }
        }
        result += '\n];\n\n';

        // Add storage depth
        result += `let storage_depth = ${parseInt(input.balance_commitment_storage_depth)};\n`;

        return result;
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
                            Recovered Address: {recoveredAddress1 || 'Not recovered yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Keccak256 Hash: {hash1 || 'Not calculated yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Storage Key: {storageKey1 || 'Not calculated yet'}
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
                            Recovered Address: {recoveredAddress2 || 'Not recovered yet'}
                        </div>
                        <div className="mt-2 text-sm text-black">
                            Keccak256 Hash: {hash2 || 'Not calculated yet'}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                        {isLoading ? 'Signing...' : 'Sign Messages'}
                    </button>
                </form>

                {proofResult && (
                    <div className="mt-6">
                        <h2 className="text-lg font-medium text-black mb-2">Proof Result</h2>
                        <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                            {proofResult}
                        </pre>
                    </div>
                )}

                {noirInput && (
                    <div className="mt-6">
                        <h2 className="text-lg font-medium text-black mb-2">Noir ZK Proof Input</h2>
                        <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                            {JSON.stringify(noirInput, null, 2)}
                        </pre>

                        <button
                            onClick={getRefinedInputs}
                            className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            Get Refined Inputs
                        </button>
                    </div>
                )}

                {refinedInput && (
                    <div className="mt-6">
                        <h2 className="text-lg font-medium text-black mb-2">Refined Noir ZK Proof Input</h2>
                        <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                            {customStringify(refinedInput)}
                        </pre>

                        <h2 className="text-lg font-medium text-black mt-4 mb-2">Storage Nodes for Noir</h2>
                        <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                            {formatStorageNodesForNoir(refinedInput.balance_commitment_storage_nodes)}
                        </pre>

                        <h2 className="text-lg font-medium text-black mt-4 mb-2">Storage Nodes for Noir Test</h2>
                        <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                            {formatStorageNodesForNoirTest(refinedInput.balance_commitment_storage_nodes)}
                        </pre>

                        <h2 className="text-lg font-medium text-black mt-4 mb-2">Complete Noir Test Format</h2>
                        <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs text-black">
                            {formatCompleteNoirTest(refinedInput)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
} 