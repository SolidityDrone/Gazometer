declare module '@noir-lang/noir_js' {
    export class Noir {
        constructor(circuit: { bytecode: any }, options?: {
            foreignCallHandler?: (name: string, args: any[]) => Promise<any>;
        });
        execute(inputs: any): Promise<{ witness: any }>;
    }
}

declare module '@aztec/bb.js' {
    export class UltraHonkBackend {
        constructor(bytecode: any);
        generateProof(witness: any): Promise<{ proof: string }>;
        verifyProof(proof: any): Promise<boolean>;
    }
} 