import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log('Proxying request to oracle:', body);

        const response = await fetch('http://127.0.0.1:5555', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Oracle server responded with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Oracle response:', data);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error proxying to oracle:', error);
        return NextResponse.json(
            { error: 'Failed to communicate with oracle server' },
            { status: 500 }
        );
    }
} 