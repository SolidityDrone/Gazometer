import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Receipt ID is required' },
                { status: 400 }
            );
        }

        console.log('Fetching receipt with ID:', id);

        const receipt = await prisma.receipt.findUnique({
            where: { id: parseInt(id) }
        });

        if (!receipt) {
            console.log('No receipt found for ID:', id);
            return NextResponse.json(
                { error: 'Receipt not found' },
                { status: 404 }
            );
        }

        console.log('Raw receipt data:', receipt);

        // Parse the proofData JSON string
        const parsedProofData = JSON.parse(receipt.proofData);
        console.log('Parsed proof data:', parsedProofData);

        // Return the parsed data
        return NextResponse.json(parsedProofData);
    } catch (error) {
        console.error('Error fetching receipt:', error);
        return NextResponse.json(
            { error: 'Failed to fetch receipt' },
            { status: 500 }
        );
    }
} 