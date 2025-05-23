use dep::hydra::bn254::dec;

// Main function for proving decryption
fn main(
    // Signature data
    signature: [u8; 65],
    
    // Encrypted balance (as a field element)
    encrypted_balance: Field,

    // New parameters for IV
    message_nonce: u64,
    pub_x: [u8; 32],
    pub_y: [u8; 32],
) -> pub Field {

    let signature_64 = create_64_byte_signature(signature);
    // Derive key from signature (deterministic)
    let key = derive_key_from_signature(signature_64);
    
    // Create the IV using the new parameters
    let iv = [
        message_nonce as Field,
        bytes_to_field(pub_x),
        bytes_to_field(pub_y),
        0
    ];
    
    // Create encrypted fields array
    let encrypted_fields = [encrypted_balance, 0, 0, 0, 0, 0, 0, 0];
    
    // Decrypt the fields using Hydra
    let decrypted_fields = dec::decrypt(encrypted_fields, key, iv);

    // Return the first decrypted field element
    decrypted_fields[0]
}

fn create_64_byte_signature(signature: [u8; 65]) -> [u8; 64] {
    let mut sig_64: [u8; 64] = [0; 64];
    for i in 0..64 {
        sig_64[i] = signature[i];
    }
    sig_64
}


fn bytes_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    
    // Convert bytes to field
    for i in 0..32 {
        result = result * 256 + (bytes[i] as Field);
    }
    
    result
}


// Unconstrained function for frontend decryption
fn decrypt_balance(
    // Signature data
    signature: [u8; 64],
    
    // Encrypted balance (as a field element)
    encrypted_balance: Field,

    // New parameters for IV
    message_nonce: u64,
    pub_x: [u8; 32],
    pub_y: [u8; 32],
) -> pub Field {
    // Derive key from signature (deterministic)
    let key = derive_key_from_signature(signature);
    
    // Create the IV using the new parameters
    let iv = [
        message_nonce as Field,
        bytes_to_field(pub_x),
        bytes_to_field(pub_y),
        0
    ];
    
    // Create encrypted fields array
    let encrypted_fields = [encrypted_balance, 0, 0, 0, 0, 0, 0, 0];
    
    // Decrypt the fields using Hydra
    let decrypted_fields = dec::decrypt(encrypted_fields, key, iv);

    // Return the first decrypted field element
    decrypted_fields[0]
}

// Derive a deterministic key from a signature
fn derive_key_from_signature(signature: [u8; 64]) -> [Field; 4] {
    // Convert signature to field elements
    // We'll use the first 16 bytes (4 field elements) of the signature
    // This is a simplified approach - in a real implementation, you would use a proper KDF
    let mut key = [0; 4];
    
    // Convert each 4 bytes to a field element
    for i in 0..4 {
        let mut value: u64 = 0;
        for j in 0..4 {
            value = (value << 8) | (signature[i * 4 + j] as u64);
        }
        key[i] = value as Field;
    }
    
    key
}

// Test function using the provided signature
#[test]
fn test_decryption_with_signature() {
    // The provided signature for message "1"
    let signature: [u8; 65] = [
         0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];
    
    // Test with a specific encrypted value
    let encrypted_balance: Field = 0x0394e37d9de02f6842dfac3c43bfe1137f1bbd4b1ca26e02c4c71889d7373ebe;

    // New parameters for IV
    let message_nonce: u64 = 11561; // Example nonce
    let pub_x: [u8; 32] = [
        // Example public key x-coordinate
        0xca, 0xb1, 0x4a, 0x0b, 0xb5, 0x57, 0xdf, 0xe9, 0x0a, 0x26, 0x8d, 0xcd, 0x04, 0xf1, 0x7e, 0x2e,
        0xa8, 0xd8, 0xcc, 0xd5, 0x57, 0x71, 0xaa, 0x18, 0xec, 0x72, 0x3a, 0xf2, 0xee, 0x45, 0x92, 0xe6
    ];
    let pub_y: [u8; 32] = [
        // Example public key y-coordinate
        0x75, 0xd4, 0x4b, 0xb8, 0xbc, 0x98, 0xdb, 0x93, 0x24, 0x0f, 0x48, 0x07, 0x7c, 0x63, 0xaa, 0x4b,
        0x29, 0xd5, 0x9a, 0xa3, 0x35, 0xcf, 0xf4, 0xb2, 0xa0, 0x88, 0x23, 0x4f, 0x69, 0xc2, 0x2e, 0xba
    ];

    // Test both constrained and unconstrained decryption
    let decrypted_balance = main(signature, encrypted_balance, message_nonce, pub_x, pub_y);

    println(decrypted_balance);
}
  