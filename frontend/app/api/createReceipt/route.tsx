// pages/api/createReceipt/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
    const body = await req.json(); // Use req.json() to parse the body
    console.log('Received body:', body); // Log the entire body

    const { proofData } = body; // Destructure proofData from the body

    // Log the incoming proofData for debugging
    console.log('Received proofData:', proofData);

    try {
        const receipt = await prisma.receipt.create({
            data: {
                proofData: JSON.stringify(proofData), // Save proof data
            },
        });
        return NextResponse.json({ id: receipt.id }); // Use NextResponse to return the response
    } catch (error) {
        console.error('Error creating receipt:', error);
        return NextResponse.json({ error: 'Failed to create receipt' }, { status: 500 });
    }
}