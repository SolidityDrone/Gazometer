'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAccount, useSignMessage, usePublicClient } from 'wagmi';
import { useEffect, useState } from 'react';
import { createWalletClient, custom, keccak256, stringToHex } from 'viem';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import circuit from '@/public/circuits/lib.json';
import { GAZOMETER_ADDRESS } from '@/app/lib/constants';
import { GAZOMETER_ABI } from '@/app/lib/abi/gazometerABI';
import { sepolia } from 'viem/chains';
interface NoirCircuit {
    bytecode: string;
    abi: any;
    noir_version: string;
    hash: number;
}

const hexToBytes = (hex: string) => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return cleanHex.match(/.{2}/g)?.map(byte => `0x${byte}`) || [];
};

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

function fieldToWei(fieldValue: string): string {
    // Remove '0x' prefix if present
    const cleanValue = fieldValue.startsWith('0x') ? fieldValue.slice(2) : fieldValue;
    // Convert to BigInt and then to wei string
    return BigInt('0x' + cleanValue).toString();
}

export default function Navbar() {
    const pathname = usePathname();
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [nonce, setNonce] = useState<number | null>(null);
    const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);

    useEffect(() => {
        const fetchNonce = async () => {
            if (!address) {
                setNonce(null);
                return;
            }

            try {
                const response = await fetch(`/api/nonce?address=${address}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch nonce');
                }
                const data = await response.json();
                setNonce(data.nonce);
            } catch (error) {
                console.error('Error fetching nonce:', error);
                setNonce(null);
            }
        };

        fetchNonce();
    }, [address]);

    const handleDecryptBalance = async () => {
        if (!address || nonce === null || !publicClient) return;
        const client = createWalletClient({
            chain: sepolia,
            transport: custom(window.ethereum as any)
        });


        try {
            // Sign the nonce
            const message = `${nonce - 1}`;
            const signature = await client.signMessage({
                account: address,
                message: message
            });

            console.log("signature", signature);
            // Hash the signature
            const commitment = keccak256(stringToHex(signature));

            // Get encrypted balance from contract
            const encryptedBalance = await publicClient.readContract({
                address: GAZOMETER_ADDRESS, // Your contract address
                abi: GAZOMETER_ABI,
                functionName: 'getBalanceCommitment',
                args: [commitment]
            });
            console.log("commitment", commitment);

            console.log("encryptedBalance", encryptedBalance);
            // Prepare inputs for Noir
            const inputs = {
                signature: hexToBytes(signature),
                encrypted_balance: encryptedBalance
            };

            // Initialize Noir and backend
            const noir = new Noir(circuit as NoirCircuit);
            const backend = new UltraHonkBackend((circuit as NoirCircuit).bytecode);

            // Generate the proof
            const { witness } = await noir.execute(inputs);
            const bal_proof = await backend.generateProof(witness);

            // Set the decrypted balance in wei
            const fieldValue = bal_proof.publicInputs[0].toString();
            const balanceInWei = fieldToWei(fieldValue);
            setDecryptedBalance(balanceInWei);
        } catch (error) {
            console.error('Error decrypting balance:', error);
        }
    };

    return (
        <nav className="fixed top-0 left-0 right-0 bg-gray-900/50 backdrop-blur-sm shadow-lg z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Image
                            src="/gazometer_logo.png"
                            alt="Gazometer Logo"
                            width={64}
                            height={64}
                            className="mr-4"
                        />
                        <Link href="/" className="text-xl font-bold text-white hover:text-green-300 transition-colors duration-200">
                            Gazometer
                            <span className="text-xs font-normal text-gray-400 ml-2">Demo</span>
                        </Link>
                    </div>
                    <div className="hidden md:block">
                        <div className="ml-10 flex items-baseline space-x-4">
                            <Link
                                href="/initialize"
                                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${pathname === '/initialize'
                                    ? 'bg-green-600/50 text-white'
                                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                            >
                                Initialize
                            </Link>
                            <Link
                                href="/sign"
                                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${pathname === '/sign'
                                    ? 'bg-green-600/50 text-white'
                                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                            >
                                Craft receipt
                            </Link>
                            <Link
                                href="/self-service"
                                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${pathname === '/self-service'
                                    ? 'bg-green-600/50 text-white'
                                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                            >
                                Deposit / Withdraw
                            </Link>
                            {address && nonce !== null && (
                                <>
                                    <div className="px-3 py-2 text-sm font-medium text-gray-300">
                                        Nonce: {nonce}
                                    </div>
                                    {!decryptedBalance && (
                                        <button
                                            onClick={handleDecryptBalance}
                                            className="px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors duration-200"
                                        >
                                            Decrypt Balance
                                        </button>
                                    )}
                                    {decryptedBalance && (
                                        <div className="px-3 py-2 text-sm font-medium text-gray-300">
                                            Balance: {decryptedBalance}
                                        </div>
                                    )}
                                </>
                            )}
                            <appkit-button />
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
} 