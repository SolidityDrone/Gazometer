import { NextResponse } from 'next/server';
import { createWalletClient, http, Hex, encodeFunctionData } from 'viem';
import { sepolia } from 'viem/chains';
import { GAZOMETER_ABI } from '@/lib/abi/gazometerABI';
import { GAZOMETER_ADDRESS } from '@/lib/constants';

// Use environment variable for private key (never commit real keys!)
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY as Hex;

export async function POST(request: Request) {
    try {
        const { proofBytes, publicInputs, functionName } = await request.json();

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

        // Create wallet client
        const client = createWalletClient({
            chain: sepolia,
            transport: http(),
            account: PRIVATE_KEY,
        });
        // Prepare transaction data
        const data = encodeFunctionData({
            abi: GAZOMETER_ABI,
            functionName,
            args: [proofBytes, publicInputs],
        });

        const { request: txRequest } = await client.prepareTransactionRequest({
            to: GAZOMETER_ADDRESS,
            data,
        });

        // Send the transaction
        const txHash = await client.sendTransaction(txRequest);

        return NextResponse.json({ txHash });
    } catch (error) {
        console.error('Error submitting proof:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
} 