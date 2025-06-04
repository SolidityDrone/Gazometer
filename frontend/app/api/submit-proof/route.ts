import { NextResponse } from 'next/server';
import { createWalletClient, http, Hex, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { GAZOMETER_ABI } from '@/lib/abi/gazometerABI';
import { GAZOMETER_ADDRESS } from '@/lib/constants';

// Use environment variable for private key (never commit real keys!)
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY?.startsWith('0x')
    ? process.env.BACKEND_PRIVATE_KEY as Hex
    : `0x${process.env.BACKEND_PRIVATE_KEY}` as Hex;

export async function POST(request: Request) {
    try {
        const { proofBytes, publicInputs, functionName, value = '0' } = await request.json();

        if (
            !proofBytes ||
            !Array.isArray(publicInputs) ||
            !functionName
        ) {
            return NextResponse.json(
                { error: 'Missing proofBytes, publicInputs, or functionName' },
                { status: 400 }
            );
        }

        // Create account from private key
        const account = privateKeyToAccount(PRIVATE_KEY);

        // Create wallet client
        const client = createWalletClient({
            chain: sepolia,
            transport: http(),
            account
        });
        // Prepare transaction data
        const data = encodeFunctionData({
            abi: GAZOMETER_ABI,
            functionName,
            args: [proofBytes, publicInputs],
        });

        const txRequest = await client.prepareTransactionRequest({
            to: GAZOMETER_ADDRESS as `0x${string}`,
            data,
            value: BigInt(value),
            gasLimit: 8000000
        });

        if (!txRequest.to) {
            throw new Error('Transaction address is missing');
        }

        // Ensure the transaction has the correct address format
        const formattedTxRequest = {
            ...txRequest,
            to: txRequest.to.startsWith('0x') ? txRequest.to as `0x${string}` : `0x${txRequest.to}` as `0x${string}`
        };

        // Send the transaction
        const txHash = await client.sendTransaction(formattedTxRequest);

        return NextResponse.json({ txHash });
    } catch (error) {
        console.error('Error submitting proof:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
} 