import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { address } = await request.json();

        if (!address) {
            return NextResponse.json(
                { error: 'Address is required' },
                { status: 400 }
            );
        }

        // Upsert the user (create if doesn't exist, update if exists)
        const user = await prisma.user.upsert({
            where: { address },
            update: {
                nonce: {
                    increment: 1
                }
            },
            create: {
                address,
                nonce: 1
            }
        });

        return NextResponse.json({ nonce: user.nonce });
    } catch (error) {
        console.error('Error incrementing nonce:', error);
        return NextResponse.json(
            { error: 'Failed to increment nonce' },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');

        if (!address) {
            return NextResponse.json(
                { error: 'Address is required' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { address }
        });

        return NextResponse.json({ nonce: user?.nonce ?? 0 });
    } catch (error) {
        console.error('Error getting nonce:', error);
        return NextResponse.json(
            { error: 'Failed to get nonce' },
            { status: 500 }
        );
    }
} 