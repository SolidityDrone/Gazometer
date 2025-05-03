import { NextResponse } from 'next/server';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import circuit from '@/public/circuits/alice_receipt.json';

export async function POST(request: Request) {
    try {
        const { inputs } = await request.json();

        // Initialize Noir and backend
        const noir = new Noir(circuit);
        const backend = new UltraHonkBackend(circuit.bytecode);
        (backend as any).oracle_hash = 'keccak';

        // Create the foreign call handler
        const foreignCallHandler = async (name: string, inputs: string[] | any) => {
            // Your existing foreign call handler logic here
            // ...
        };

        // Execute the circuit
        (noir as any).options = { foreignCallHandler };
        const result = await noir.execute(inputs);

        // Generate the proof
        const proof = await backend.generateProof(result.witness);

        // Verify the proof
        const isValid = await backend.verifyProof(proof);

        return NextResponse.json({
            proof: proof.proof,
            isValid
        });
    } catch (error) {
        console.error('Error generating proof:', error);
        return NextResponse.json(
            { error: 'Failed to generate proof' },
            { status: 500 }
        );
    }
} 