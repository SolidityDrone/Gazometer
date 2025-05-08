'use client';

import { useState, useEffect } from 'react';
import { createWalletClient, custom, recoverMessageAddress, keccak256, stringToHex, concat, pad, toHex, recoverPublicKey, createPublicClient, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { useAccount, useWriteContract, useTransactionReceipt } from 'wagmi';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import circuit from '@/public/circuits/self_service.json';
import { GAZOMETER_ADDRESS } from '../lib/constants';
import { GAZOMETER_ABI } from '../lib/abi/gazometerABI';

// Add type for the circuit
interface NoirCircuit {
    bytecode: string;
    abi: any;
    noir_version: string;
    hash: number;
}

// Helper function to convert hex string to byte array
const hexToBytes = (hex: string) => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return cleanHex.match(/.{2}/g)?.map(byte => `0x${byte}`) || [];
};

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
    const [isVerifying, setIsVerifying] = useState(false);
    const [proofVerified, setProofVerified] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [receiptLink, setReceiptLink] = useState<string | null>(null);
    const [publicInputs, setPublicInputs] = useState<string[] | null>(null);
    const [isSubmittingProof, setIsSubmittingProof] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [showTxModal, setShowTxModal] = useState(false);
    const [txStatus, setTxStatus] = useState<'pending' | 'success' | 'error' | null>(null);
    const [isSubmittingToRelayer, setIsSubmittingToRelayer] = useState(false);
    const [relayerStatus, setRelayerStatus] = useState<'pending' | 'success' | 'error' | null>(null);

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

            // Get the current block number using public client
            const publicClient = createPublicClient({
                chain: sepolia,
                transport: http()
            });
            const currentBlock = await publicClient.getBlockNumber();

            // Convert signatures to bytes
            const signature1Bytes = hexToBytes(signature1);
            const signature2Bytes = hexToBytes(signature2);

            // Convert public keys to bytes
            const pubX1Bytes = hexToBytes(pubKeyX1);
            const pubX2Bytes = hexToBytes(pubKeyX2);
            const pubY1Bytes = hexToBytes(pubKeyY1);
            const pubY2Bytes = hexToBytes(pubKeyY2);

            // Convert contract address to bytes
            const contractAddressBytes = hexToBytes(GAZOMETER_ADDRESS);

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

            console.log("WHat will deposit", isDeposit ? "1" : "0");
            const inputs = {
                user_signature_nonce_1: signature1Bytes,
                user_signature_nonce_2: signature2Bytes,
                chain_id: "11155111", // Sepolia chain ID
                block_number: currentBlock.toString(),
                message_nonce_1: Number(nonce) - 1,
                pub_x_1: pubX1Bytes,
                pub_y_1: pubY1Bytes,
                pub_x_2: pubX2Bytes,
                pub_y_2: pubY2Bytes,
                contract_address: contractAddressBytes,
                amount: amount, // 1 ETH in wei
                is_deposit: isDeposit ? "1" : "0",
                receiver_address: hexToBytes(receiverAddress)
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

            // Switch to verification state
            setIsProving(false);
            setIsVerifying(true);

            // Verify the proof
            const isVerified = await backend.verifyProof(init_proof);
            console.log("proof verification result:", isVerified);

            if (isVerified) {
                setProofVerified(true);
                const proofBytes = `0x${Buffer.from(init_proof.proof).toString('hex')}`;
                const publicInputsArray = init_proof.publicInputs.slice(0, 11);

                // Set the proof state
                setProof(proofBytes);
                setPublicInputs(publicInputsArray);

                // Close modal after 2 seconds
                setTimeout(() => {
                    setIsVerifying(false);
                    setProofVerified(false);
                }, 2000);
            } else {
                throw new Error('Proof verification failed');
            }

        } catch (error) {
            console.error('Error generating proof:', error);
            setError(error instanceof Error ? error.message : 'Failed to generate proof');
            setIsVerifying(false);
            setProofVerified(false);
        } finally {
            setIsProving(false);
        }
    };
    const handleSendOnchain = (e: React.FormEvent) => {
        e.preventDefault(); // Prevent form submission
        if (!proof || !publicInputs) {
            alert('Proof or public inputs missing!');
            return;
        }
        setIsLoading(true);
        try {
            const slicedInputs = publicInputs.slice(0, 11);
            console.log("isDeposit", isDeposit);
            console.log("slicedInputs", slicedInputs);
            writeContract({
                address: GAZOMETER_ADDRESS,
                abi: GAZOMETER_ABI,
                functionName: 'selfService',
                args: [proof as `0x${string}`, slicedInputs as readonly `0x${string}`[]],
                value: isDeposit ? BigInt(amount) : BigInt(0)
            });

            console.log("amount", amount);
            console.log("inputs", slicedInputs as readonly `0x${string}`[]);
            console.log("proof", proof as `0x${string}`);

        } catch (err) {
            alert('Failed to send onchain: ' + (err instanceof Error ? err.message : 'Unknown error'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendViaRelayer = async () => {
        if (!proof || !publicInputs) {
            alert('Proof or public inputs missing!');
            return;
        }
        setIsSubmittingToRelayer(true);
        setShowTxModal(true);
        setTxStatus('pending');
        try {
            const slicedInputs = publicInputs.slice(0, 11);
            const response = await fetch('/api/submit-proof', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    proofBytes: proof,
                    publicInputs: slicedInputs,
                    functionName: 'selfService',
                    value: isDeposit ? amount : '0'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send via relayer');
            }

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }

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

            setTxStatus('success');
            setTimeout(() => {
                setShowTxModal(false);
                setTxStatus(null);
            }, 3000);
        } catch (err) {
            console.error('Failed to send via relayer:', err);
            setTxStatus('error');
            setTimeout(() => {
                setShowTxModal(false);
                setTxStatus(null);
            }, 3000);
        } finally {
            setIsSubmittingToRelayer(false);
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
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 mt-32">
            <div className="max-w-md mx-auto bg-gray-900/80 backdrop-blur-sm shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center text-white">Self Service</h1>

                {/* Loading Modal */}
                {(isProving || isVerifying) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
                        <div className="bg-gray-900 p-6 shadow-xl flex flex-col items-center border border-green-500">
                            {isProving && (
                                <>
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
                                    <p className="text-white text-lg">Generating your proof...</p>
                                </>
                            )}
                            {isVerifying && !proofVerified && (
                                <>
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
                                    <p className="text-white text-lg">Verifying proof...</p>
                                </>
                            )}
                            {isVerifying && proofVerified && (
                                <>
                                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mb-4">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    </div>
                                    <p className="text-white text-lg">Proof verified successfully!</p>
                                </>
                            )}
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
                            min="1"
                        />
                    </div>

                    <div>
                        <label htmlFor="receiver" className="block text-sm font-medium text-white">
                            Receiver Address
                        </label>
                        <input
                            type="text"
                            id="receiver"
                            value={receiverAddress}
                            onChange={(e) => setReceiverAddress(e.target.value)}
                            className="mt-1 block w-full border border-green-500 bg-gray-800 text-white shadow-sm focus:border-green-500 focus:ring-green-500"
                            required
                            placeholder="0x..."
                        />
                    </div>

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

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="isDeposit"
                            checked={isDeposit}
                            onChange={(e) => setIsDeposit(e.target.checked)}
                            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isDeposit" className="ml-2 block text-sm text-white">
                            Deposit (uncheck for withdrawal)
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white">
                            Signature 1
                        </label>
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
                                Message Hash: {messageHash1 ? `${messageHash1.slice(0, 6)}...${messageHash1.slice(-4)}` : 'Not calculated yet'}
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
                                Commit Hash: {hash1 ? `${hash1.slice(0, 6)}...${hash1.slice(-4)}` : 'Not calculated yet'}
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
                        <div className="mt-2 text-sm text-gray-300">
                            Public Key Verified: {isVerified1 ? '✅' : '❌'}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white">
                            Signature 2
                        </label>
                        <div className="flex justify-between items-center py-2">
                            <p className="text-sm text-gray-300">
                                Signature: {signature2 ? `${signature2.slice(0, 6)}...${signature2.slice(-4)}` : 'No signature yet'}
                            </p>
                            {signature2 && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        navigator.clipboard.writeText(signature2);
                                        setCopiedField('signature2');
                                        setTimeout(() => setCopiedField(null), 2000);
                                    }}
                                    className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'signature2'
                                        ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                        : 'bg-green-600 hover:bg-green-700'
                                        }`}
                                >
                                    {copiedField === 'signature2' ? 'Copied!' : 'Copy'}
                                </button>
                            )}
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <p className="text-sm text-gray-300">
                                Message Hash: {messageHash2 ? `${messageHash2.slice(0, 6)}...${messageHash2.slice(-4)}` : 'Not calculated yet'}
                            </p>
                            {messageHash2 && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        navigator.clipboard.writeText(messageHash2);
                                        setCopiedField('messageHash2');
                                        setTimeout(() => setCopiedField(null), 2000);
                                    }}
                                    className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'messageHash2'
                                        ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                        : 'bg-green-600 hover:bg-green-700'
                                        }`}
                                >
                                    {copiedField === 'messageHash2' ? 'Copied!' : 'Copy'}
                                </button>
                            )}
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <p className="text-sm text-gray-300">
                                Recovered Address: {recoveredAddress2 ? `${recoveredAddress2.slice(0, 6)}...${recoveredAddress2.slice(-4)}` : 'Not recovered yet'}
                            </p>
                            {recoveredAddress2 && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        navigator.clipboard.writeText(recoveredAddress2);
                                        setCopiedField('recoveredAddress2');
                                        setTimeout(() => setCopiedField(null), 2000);
                                    }}
                                    className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'recoveredAddress2'
                                        ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                        : 'bg-green-600 hover:bg-green-700'
                                        }`}
                                >
                                    {copiedField === 'recoveredAddress2' ? 'Copied!' : 'Copy'}
                                </button>
                            )}
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <p className="text-sm text-gray-300">
                                Commit Hash: {hash2 ? `${hash2.slice(0, 6)}...${hash2.slice(-4)}` : 'Not calculated yet'}
                            </p>
                            {hash2 && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        navigator.clipboard.writeText(hash2);
                                        setCopiedField('hash2');
                                        setTimeout(() => setCopiedField(null), 2000);
                                    }}
                                    className={`px-3 py-1 text-white text-sm transition-all duration-200 w-20 text-center ${copiedField === 'hash2'
                                        ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                        : 'bg-green-600 hover:bg-green-700'
                                        }`}
                                >
                                    {copiedField === 'hash2' ? 'Copied!' : 'Copy'}
                                </button>
                            )}
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

                    {proof && publicInputs && (
                        <div className="mt-4">
                            <h2 className="text-lg font-medium text-white mb-2">Proof Bytes</h2>
                            <pre className="p-4 border border-green-500 bg-gray-800 overflow-auto text-xs text-white">
                                {proof}
                            </pre>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleSendOnchain}
                                    disabled={isLoading}
                                    className="flex-1 flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    {isLoading ? 'Sending...' : 'Send Onchain'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendViaRelayer}
                                    disabled={isSubmittingToRelayer}
                                    className="flex-1 flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
                                >
                                    {isSubmittingToRelayer ? 'Sending...' : 'Send via Relayer'}
                                </button>
                            </div>
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
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(receiptLink);
                                setCopiedField('receiptLink');
                                setTimeout(() => setCopiedField(null), 2000);
                            }}
                            className={`mt-2 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-all duration-200 ${copiedField === 'receiptLink'
                                ? 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                        >
                            {copiedField === 'receiptLink' ? 'Copied!' : 'Copy Receipt Link'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
} 