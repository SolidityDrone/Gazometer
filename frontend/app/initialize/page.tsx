'use client';

import { useState, useEffect } from 'react';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, recoverPublicKey, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { useAccount, useWriteContract, useTransactionReceipt } from 'wagmi';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import circuit from '@/public/circuits/self_service.json';
import { GAZOMETER_ADDRESS } from '@/lib/constants';
import { GAZOMETER_ABI } from '@/lib/abi/gazometerABI';
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
    const [publicInputs, setPublicInputs] = useState<string[] | null>(null);
    const [isSubmittingProof, setIsSubmittingProof] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isProofVerified, setIsProofVerified] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [showTxModal, setShowTxModal] = useState(false);
    const [txStatus, setTxStatus] = useState<'pending' | 'success' | 'error' | null>(null);
    const [proofTimer, setProofTimer] = useState(0);
    const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
    const { address } = useAccount();

    const { writeContract, isPending, isSuccess, data, error: writeError } = useWriteContract();
    const { data: receipt, isError: isReceiptError } = useTransactionReceipt({
        hash: data,
    });

    useEffect(() => {
        if (data) {
            setShowTxModal(true);
            setTxStatus('pending');
        }
    }, [data]);

    useEffect(() => {
        if (receipt) {
            setTxStatus('success');
            setTimeout(() => {
                setShowTxModal(false);
                setTxStatus(null);
            }, 3000);
        }
    }, [receipt]);

    useEffect(() => {
        if (isReceiptError || writeError) {
            setTxStatus('error');
            setTimeout(() => {
                setShowTxModal(false);
                setTxStatus(null);
            }, 3000);
        }
    }, [isReceiptError, writeError]);

    // Timer effect for proof generation
    useEffect(() => {
        if (isProving) {
            setProofTimer(0);
            const interval = setInterval(() => {
                setProofTimer(prev => prev + 1);
            }, 1000);
            setTimerInterval(interval);
        } else {
            if (timerInterval) {
                clearInterval(timerInterval);
                setTimerInterval(null);
            }
        }

        return () => {
            if (timerInterval) {
                clearInterval(timerInterval);
            }
        };
    }, [isProving]);

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

            // Log additional information to console
            console.log('Public Key X:', pubKeyX);
            console.log('Public Key Y:', pubKeyY);
            console.log('Signature Verified:', isVerified);

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
            const contractAddress = GAZOMETER_ADDRESS;

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
            const threads = window.navigator.hardwareConcurrency;
            const backend = new UltraHonkBackend(circuit.bytecode, { threads });

            //@ts-ignore
            const { witness } = await noir.execute(inputs, { keccak: true });
            console.log('Circuit execution result:', witness);
            //@ts-ignore
            const init_proof = await backend.generateProof(witness, { keccak: true });
            console.log('Generated proof:', init_proof);

            const proofBytes = `0x${Buffer.from(init_proof.proof).toString('hex')}`;
            const publicInputsArray = init_proof.publicInputs.slice(0, 11);

            // Set the proof state
            setProof(proofBytes);
            setPublicInputs(publicInputsArray);

        } catch (error) {
            console.error('Error generating proof:', error);
            setError(error instanceof Error ? error.message : 'Failed to generate proof');
        } finally {
            setIsProving(false);
        }
    };

    const verifyProof = async () => {
        try {
            setIsVerifying(true);
            setError(null);

            if (!proof || !publicInputs) {
                throw new Error('Proof or public inputs missing');
            }

            // Initialize backend
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode);

            // Convert proof from hex string to Uint8Array
            const proofBytes = new Uint8Array(Buffer.from(proof.slice(2), 'hex'));

            // Verify the proof
            const isVerified = await backend.verifyProof({
                proof: proofBytes,
                publicInputs: publicInputs
            });

            setIsProofVerified(isVerified);
            if (!isVerified) {
                throw new Error('Proof verification failed');
            }

        } catch (error) {
            console.error('Error verifying proof:', error);
            setError(error instanceof Error ? error.message : 'Failed to verify proof');
            setIsProofVerified(false);
        } finally {
            setIsVerifying(false);
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

    const handleInitialize = async () => {
        if (!address) {
            alert('Please connect your wallet first');
            return;
        }

        setIsLoading(true);
        try {
            const slicedInputs = publicInputs!.slice(0, 11);
            await writeContract({
                address: GAZOMETER_ADDRESS,
                abi: GAZOMETER_ABI,
                functionName: 'initCommit',
                args: [proof as `0x${string}`, slicedInputs as readonly `0x${string}`[]],
                value: BigInt(amount)
            });

            console.log("amount", amount);
            console.log("inputs", slicedInputs as readonly `0x${string}`[]);
            console.log("proof", proof as `0x${string}`);

        } catch (error) {
            console.error('Error:', error);
            setError(error instanceof Error ? error.message : 'An error occurred');
            setIsLoading(false);
        }
    };

    // Add effect to handle successful transaction
    useEffect(() => {
        const handleSuccessfulTransaction = async () => {
            if (receipt && receipt.status === 'success') {
                try {
                    const response = await fetch('/api/nonce', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ address })
                    });

                    if (!response.ok) {
                        throw new Error('Failed to increment nonce');
                    }

                    const { nonce } = await response.json();
                    console.log('Nonce incremented:', nonce);
                } catch (error) {
                    console.error('Error incrementing nonce:', error);
                }
            }
        };

        handleSuccessfulTransaction();
    }, [receipt, address]);

    // Helper function to format time
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };

    return (
        <div className="min-h-screen py-24 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-gray-900/80 backdrop-blur-sm shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-white">Initialize Account</h1>

                {/* Loading Modal */}
                {isProving && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
                        <div className="bg-gray-900 p-6 shadow-xl flex flex-col items-center border border-green-500">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
                            <p className="text-white text-lg">Generating your initial commit proof...</p>
                            <div className="mt-3 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <p className="text-green-400 text-sm font-mono">
                                    Elapsed time: {formatTime(proofTimer)}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transaction Status Modal */}
                {showTxModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
                        <div className="bg-gray-900 p-6 shadow-xl flex flex-col items-center border border-green-500">
                            {txStatus === 'pending' && (
                                <>
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
                                    <p className="text-white text-lg">Transaction pending...</p>
                                </>
                            )}
                            {txStatus === 'success' && (
                                <>
                                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mb-4">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    </div>
                                    <p className="text-white text-lg">Transaction successful!</p>
                                </>
                            )}
                            {txStatus === 'error' && (
                                <>
                                    <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mb-4">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </div>
                                    <p className="text-white text-lg">Transaction failed</p>
                                    <p className="text-red-400 text-sm mt-2">{writeError?.message || 'Unknown error occurred'}</p>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-white">
                            Amount {"(wei)"}
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
                            <div className="flex justify-between items-center py-2">
                                <p className="text-sm text-gray-300">
                                    Signature: {signature1 ? `${signature1.slice(0, 6)}...${signature1.slice(-4)}` : 'No signature yet'}
                                </p>
                                {signature1 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            navigator.clipboard.writeText(signature1);
                                            setCopiedField('signature1');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'signature1'
                                            ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                            : 'bg-green-600 hover:bg-green-700'
                                            }`}
                                    >
                                        {copiedField === 'signature1' ? 'Copied!' : 'Copy'}
                                    </button>
                                )}
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <p className="text-sm text-gray-300">
                                    Recovered Address: {recoveredAddress1 ? `${recoveredAddress1.slice(0, 6)}...${recoveredAddress1.slice(-4)}` : 'Not recovered yet'}
                                </p>
                                {recoveredAddress1 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            navigator.clipboard.writeText(recoveredAddress1);
                                            setCopiedField('recoveredAddress1');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'recoveredAddress1'
                                            ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                            : 'bg-green-600 hover:bg-green-700'
                                            }`}
                                    >
                                        {copiedField === 'recoveredAddress1' ? 'Copied!' : 'Copy'}
                                    </button>
                                )}
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <p className="text-sm text-gray-300">
                                    Commit Hash: {hash1 ? `${hash1.slice(0, 6)}...${hash1.slice(-4)}` : 'No hash yet'}
                                </p>
                                {hash1 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            navigator.clipboard.writeText(hash1);
                                            setCopiedField('hash1');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'hash1'
                                            ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                            : 'bg-green-600 hover:bg-green-700'
                                            }`}
                                    >
                                        {copiedField === 'hash1' ? 'Copied!' : 'Copy'}
                                    </button>
                                )}
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <p className="text-sm text-gray-300">
                                    Message Hash: {messageHash1 ? `${messageHash1.slice(0, 6)}...${messageHash1.slice(-4)}` : 'No message hash yet'}
                                </p>
                                {messageHash1 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            navigator.clipboard.writeText(messageHash1);
                                            setCopiedField('messageHash1');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'messageHash1'
                                            ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                            : 'bg-green-600 hover:bg-green-700'
                                            }`}
                                    >
                                        {copiedField === 'messageHash1' ? 'Copied!' : 'Copy'}
                                    </button>
                                )}
                            </div>
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
                            type="button"
                            onClick={generateProof}
                            disabled={isProving}
                            className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            {isProving ? 'Generating Proof...' : 'Generate Proof'}
                        </button>
                    )}

                    {/*    {proof && publicInputs  (
                        <button
                            type="button"
                            onClick={verifyProof}
                            disabled={isVerifying}
                            className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {isVerifying ? 'Verifying...' : 'Verify Proof'}
                        </button>
                    )} */}

                    {proof && publicInputs && (
                        <button
                            type="button"
                            onClick={handleInitialize}
                            disabled={isSubmittingProof}
                            className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            {isSubmittingProof ? 'Sending...' : 'Send Onchain'}
                        </button>
                    )}

                    {error && (
                        <div className="mt-4 p-4 bg-red-900/50 rounded-md">
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}

                    {isProofVerified && (
                        <div className="mt-4 p-4 bg-green-900/50 rounded-md">
                            <p className="text-sm text-green-300">✅ Proof verified successfully!</p>
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
                                if (receiptLink) {
                                    navigator.clipboard.writeText(receiptLink);
                                    alert('Link copied to clipboard!');
                                }
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