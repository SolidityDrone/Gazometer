use dep::lib::{ecrecover, proof};
use std::hash::{keccak256, poseidon};
use dep::hydra::bn254::{enc, dec};

fn main(
    // Signature data
    signature: [u8; 64],
    
    // Balance to encrypt
    balance: Field,
    
    // Output
    encrypted_balance: [Field; 8],
) -> pub [Field; 8] {
    // Derive key from signature (deterministic)
    let key = derive_key_from_signature(signature);
    
    // Create a fixed IV (all zeros)
    let iv = [0, 0, 0, 0];
    
    // Convert balance to field elements
    let balance_array = [balance, 0, 0, 0, 0, 0, 0, 0];
    
    // Encrypt the balance using Hydra
    let encrypted = enc::encrypt(balance_array, key, iv);
    
    // Return the encrypted balance
    encrypted
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
fn test_encryption_with_signature() {
    // The provided signature for message "1"
    let signature: [u8; 64] = [
        0x5c, 0xf2, 0x7c, 0x90, 0x91, 0xf6, 0x3c, 0xa3, 0x1b, 0x03, 0x02, 0x2c, 0xcd, 0x88, 0x1a, 0xd3,
        0xd0, 0x44, 0x7c, 0x51, 0x28, 0x13, 0x55, 0xc6, 0xb9, 0x7b, 0x75, 0xbe, 0xde, 0x1e, 0x7c, 0x8c,
        0x15, 0x96, 0x9b, 0x50, 0x98, 0x66, 0x1d, 0x0e, 0x7e, 0x75, 0x3e, 0xc7, 0x86, 0x5e, 0x89, 0xf0,
        0x53, 0xde, 0x5b, 0xe4, 0xf0, 0xad, 0xf2, 0xf0, 0x0a, 0xa7, 0xc6, 0x7f, 0x29, 0xab, 0x99, 0xb2
    ];
    
    // Balance to encrypt
    let balance: Field = 100;
    
    // Derive key from signature
    let key = derive_key_from_signature(signature);
    
    // Create fixed IV
    let iv = [0, 0, 0, 0];
    
    // Convert balance to field elements
    let balance_array = [balance, 0, 0, 0, 0, 0, 0, 0];
    
    // Encrypt the balance using Hydra
    let encrypted = enc::encrypt(balance_array, key, iv);
    
    // Decrypt the balance using Hydra
    let decrypted = dec::decrypt(encrypted, key, iv);
    
    // Verify that the decrypted balance matches the original balance
    assert(decrypted[0] == balance, "Decryption failed");
    
    // Print the encrypted and decrypted values for verification
    println("Original balance");
    println(balance);
    println("Encrypted balance");
    println(encrypted);
    println("Decrypted balance");
    println(decrypted[0]);
}
  