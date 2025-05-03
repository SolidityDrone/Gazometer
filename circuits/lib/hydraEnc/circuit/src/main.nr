use dep::lib::{ecrecover, proof};
use std::hash::{keccak256, poseidon};
use dep::hydra::bn254::{enc, dec};

fn main(
    // Signature data
    signature: [u8; 64],
    
    // Balance to encrypt (as bytes)
    balance: [u8; 30],
    
    // Output
    encrypted_balance: [u8; 30],
) -> pub [u8; 30] {
    // Derive key from signature (deterministic)
    let key = derive_key_from_signature(signature);
    
    // Create a fixed IV (all zeros)
    let iv = [0, 0, 0, 0];
    
    // Convert balance bytes to field elements for encryption
    let balance_fields = bytes_to_fields(balance);
    
    // Encrypt the balance using Hydra
    let encrypted_fields = enc::encrypt(balance_fields, key, iv);
    
    // Convert encrypted fields back to bytes
    let encrypted_bytes = fields_to_bytes(encrypted_fields);
    
    // Return the encrypted balance
    encrypted_bytes
}

// Convert bytes to field elements
fn bytes_to_fields(bytes: [u8; 30]) -> [Field; 4] {
    let mut fields = [0; 4];
    for i in 0..4 {
        let mut value: u64 = 0;
        for j in 0..7 {
            if i * 7 + j < 30 {
                value = (value << 8) | (bytes[i * 7 + j] as u64);
            }
        }
        fields[i] = value as Field;
    }
    fields
}

// Convert field elements back to bytes
fn fields_to_bytes(fields: [Field; 4]) -> [u8; 30] {
    let mut bytes = [0; 30];
    for i in 0..4 {
        let value = fields[i] as u64;
        for j in 0..7 {
            if i * 7 + j < 30 {
                bytes[i * 7 + j] = ((value >> (8 * (6 - j))) & 0xFF) as u8;
            }
        }
    }
    bytes
}

// Derive a deterministic key from a signature
fn derive_key_from_signature(signature: [u8; 64]) -> [Field; 4] {
    let mut key = [0; 4];
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
fn test_encryption_with_signature() {
    // The provided signature for message "1"
    let signature: [u8; 64] = [
        0x5c, 0xf2, 0x7c, 0x90, 0x91, 0xf6, 0x3c, 0xa3, 0x1b, 0x03, 0x02, 0x2c, 0xcd, 0x88, 0x1a, 0xd3,
        0xd0, 0x44, 0x7c, 0x51, 0x28, 0x13, 0x55, 0xc6, 0xb9, 0x7b, 0x75, 0xbe, 0xde, 0x1e, 0x7c, 0x8c,
        0x15, 0x96, 0x9b, 0x50, 0x98, 0x66, 0x1d, 0x0e, 0x7e, 0x75, 0x3e, 0xc7, 0x86, 0x5e, 0x89, 0xf0,
        0x53, 0xde, 0x5b, 0xe4, 0xf0, 0xad, 0xf2, 0xf0, 0x0a, 0xa7, 0xc6, 0x7f, 0x29, 0xab, 0x99, 0xb2
    ];
    
    // Balance to encrypt (as bytes)
    let balance: [u8; 30] = [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    // Derive key from signature
    let key = derive_key_from_signature(signature);
    
    // Create fixed IV
    let iv = [0, 0, 0, 0];
    
    // Convert balance bytes to field elements
    let balance_fields = bytes_to_fields(balance);
    
    // Encrypt the balance using Hydra
    let encrypted_fields = enc::encrypt(balance_fields, key, iv);
    
    // Convert encrypted fields back to bytes
    let encrypted_bytes = fields_to_bytes(encrypted_fields);
    
    // Decrypt the balance using Hydra
    let decrypted_fields = dec::decrypt(encrypted_fields, key, iv);
    let decrypted_bytes = fields_to_bytes(decrypted_fields);
    
    // Verify that the decrypted balance matches the original balance
    assert(decrypted_bytes[0] == balance[0], "Decryption failed");
    
    // Print the encrypted and decrypted values for verification
    println("Original balance");
    println(balance[0]);
    println("Encrypted balance");
    println(encrypted_bytes);
    println("Decrypted balance");
    println(decrypted_bytes[0]);
}
  