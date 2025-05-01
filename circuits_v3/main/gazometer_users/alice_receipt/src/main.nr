use dep::ethereum::account_with_storage::{get_header, StorageWithinBlock};
use dep::ethereum::misc::types::{Address, Bytes32};
use dep::ethereum::account::{get_account, AccountWithinBlock, MAX_PREFIXED_KEY_NIBBLE_LEN};
use dep::ethereum::merkle_patricia_proofs::proof::{ProofInput, Key, Value, Proof, Node, Leaf, verify_merkle_proof};
use dep::ethereum::verifiers::storage::verify_storage_values;
use dep::ethereum::account_with_storage::get_account_with_storage;
use dep::hydra::bn254::{enc, dec};
use dep::keccak256::keccak256;


// Alice sign nonce n & n-1
// n-1 is hashed and check that keccak(sig(n-1))) exist in the storage of the contract
// if it does, prove state of balanceCommit exist for that key(keccak(sig(n-1)))
// use sig(n-1) to decrypt the balanceCommit of n-1 and save the value

// updated Finalbalance = receipt_balance_change + n-1 decrypted balanceCommit
// encrypt the FinalBalance with sign(n)

// output chain_id, block_number, keccak(sign(n))[commit2], encrypted_FinalBalance



fn main(
    alice_signature_nonce_1: [u8; 65],
    alice_signature_nonce_2: [u8; 65],
    chain_id: Field,
    block_number: u64,
    contract_address: Address,
    receipt_amount: Field,
) -> pub (Field, u64, Bytes32, [u8; 32], Field) {

    let balance_commit_slot = 2;

    let commit_1_hash = 
        keccak256(hex_bytes_to_ascii(alice_signature_nonce_1), 132);
    let commit_2_hash = 
        keccak256(hex_bytes_to_ascii(alice_signature_nonce_2), 132);
    
    //----- compute storage keys ----- //

    let mut key_and_slot: [u8; 64] = [0; 64];    
    for i in 0..32 {
        key_and_slot[i] = commit_1_hash[i];
    }
    key_and_slot[63] = balance_commit_slot as u8;  
    let commit_1_storage_key = keccak256(key_and_slot, 64);

    for i in 0..32 {
        key_and_slot[i] = commit_2_hash[i];
    }
    key_and_slot[63] = balance_commit_slot as u8;  
    let balance_commit_1_storage_key = keccak256(key_and_slot, 64);

    //---- Get Verified Storage Values ----- //
        // get balance for key(commit_1_storage_key) => balance_commit_verified_storage.values[0]
    let commit_1_verified_storage = get_account_with_storage(
        chain_id,
        block_number,
        contract_address,
        commit_1_storage_key
    );
    // If key value dosent exist in mapping (commit=>balance) then the oracle will reject
    // therefore we might check mapping(commit=>bool) is true, but we can neglet it here
    // as a false commitment wont match the sig, and a non mapped key will throw error

   
    
    //------ Compose new balance -----------//
    // @Dev: Security is low, for same sig and fiferent balance an attacker
    // could figure out the length of the value, by checking the switching bytes
    // But since we use 1 commit 1 derived key we get rid of this iussue
    
    // 1) decrypt balanceCommit for n-1 
    let iv = [0, 0, 0, 0];
    let nonce_1_derived_key = derive_key_from_signature(alice_signature_nonce_1);
    let encrypted_balance = bytes_to_field(commit_1_verified_storage.values[0]);
    let decrypted_1_balance_commit = 
        decrypt_balance(alice_signature_nonce_1, encrypted_balance);
    // 2) add receipt_amount to the decrypted balanceCommit for n-1 
    let new_balance = decrypted_1_balance_commit + receipt_amount;
    // 3) encrypt the new balance with sign(n)
    let new_key = derive_key_from_signature(alice_signature_nonce_2);
    let balance_fields = [new_balance, 0, 0, 0, 0, 0, 0, 0];
    let encrypted_fields = enc::encrypt(balance_fields, new_key, iv);

    let encrypted_final_balance = encrypted_fields[0];
    // nullifier serve to prevent double spending of same state, we dont need to check
    // storage value for it, this pass to bob. If nullifier already exist bob's proof will be 
    // rejected in the smart contract
    let nullifier = keccak256(keccak256(hex_bytes_to_ascii(alice_signature_nonce_2), 132), 32);
    
    // return chain_id, block_number, keccak(sign(n))[commit2], encrypted_FinalBalance
    (
        chain_id,
        block_number, 
        commit_1_verified_storage.block_hash, 
        nullifier, // <---- nullifier for commit_2 
        encrypted_final_balance // <-- balance destined for commit_2
    )
}

// Define a larger key size that can accommodate the nibble conversion of a 32-byte key
global LARGER_KEY_SIZE: u32 = 132; // 2 * 32 + 68 (extra space for prefix)

// Derive a deterministic key from a signature
fn derive_key_from_signature(signature: [u8; 65]) -> [Field; 4] {
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

fn decrypt_balance(
    // Signature data
    signature: [u8; 65],
    
    // Encrypted balance (field element)
    encrypted_balance: Field,
) -> pub Field {
    // Derive key from signature (same as encryption)
    let key = derive_key_from_signature(signature);
    
    // Create a fixed IV (same as encryption)
    let iv = [0, 0, 0, 0];
    
    // Create encrypted fields array
    let encrypted_fields = [encrypted_balance, 0, 0, 0, 0, 0, 0, 0];

    
    // Decrypt the fields
    let decrypted_fields = dec::decrypt(encrypted_fields, key, iv);
    
    
    // Return the first decrypted field element
    decrypted_fields[0]
}

// Helper function to convert a single hex nibble to its ASCII character
fn nibble_to_ascii(nibble: u8) -> u8 {
    if nibble < 10 {
        nibble + 48  // '0' to '9'
    } else {
        nibble + 87  // 'a' to 'f'
    }
}

// Function to convert hex bytes to ASCII string representation
fn hex_bytes_to_ascii(hex_bytes: [u8; 65]) -> [u8; 132] {
    let mut result: [u8; 132] = [0; 132];
    
    // Add "0x" prefix
    result[0] = 48;  // '0'
    result[1] = 120; // 'x'
    
    // Convert each byte to two ASCII characters
    for i in 0..65 {
        let byte = hex_bytes[i];
        let high_nibble = byte >> 4;
        let low_nibble = byte & 0x0f;
        
        result[2 + i * 2] = nibble_to_ascii(high_nibble);
        result[2 + i * 2 + 1] = nibble_to_ascii(low_nibble);
    }
    
    result
}

// Function to convert bytes to a Field value
fn bytes_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    for i in 0..32 {
        result = result * 256 + (bytes[i] as Field);
    }
    result
}






#[test]
fn test_storage_proof() {
    // Chain ID for Sepolia testnet
    let chain_id = 11155111;
    
    // Block number
    let block_number = 8220588;
    
    // contract_address to check - using the correct type
    let contract_address: Address = [0x52, 0xE2, 0xD6, 0x4b, 0x28, 0xC3, 0xFc, 0x99, 0xB7, 0x17, 0x90, 0xBF, 0x62, 0x23, 0xf6, 0xaA, 0x00, 0x44, 0x53, 0xb1];
    
    let alice_signature_nonce_1: [u8; 65] = [
        0x47, 0x65, 0xf9, 0xcb, 0xeb, 0xb3, 0xff, 0x25, 0x24, 0x5f, 0xc8, 0xe3, 0x81, 0x8f, 0x36, 0xa2,
        0xf4, 0xfa, 0x09, 0xf9, 0x89, 0xd3, 0x20, 0xcd, 0xef, 0xc4, 0x65, 0xb2, 0x95, 0xd6, 0xa0, 0xaf,
        0x37, 0x73, 0x11, 0x57, 0x5a, 0xc4, 0x51, 0x99, 0xd9, 0xab, 0x0a, 0x9f, 0x58, 0x54, 0x3f, 0x12,
        0xf2, 0x5e, 0x33, 0xdc, 0xc4, 0xc7, 0xe7, 0xf0, 0x93, 0x19, 0x88, 0x68, 0x20, 0x88, 0xb6, 0xe7,
        0x1c
    ];
    let alice_signature_nonce_2: [u8; 65] = [
        0xff, 0x48, 0x75, 0x1f, 0xed, 0x88, 0xed, 0x31, 0x4c, 0xd5, 0xd0, 0xe6, 0x90, 0x8e, 0x24, 0x93,
        0x61, 0x4d, 0xed, 0xd2, 0x8e, 0xfb, 0x96, 0x57, 0x02, 0x89, 0xbb, 0x3b, 0x1d, 0xda, 0xef, 0x43,
        0x31, 0xbe, 0xb3, 0xdf, 0xbc, 0xf3, 0xc6, 0x8e, 0xc0, 0xa8, 0xab, 0x2d, 0x72, 0xa1, 0x40, 0xca,
        0x06, 0x47, 0x3d, 0x0b, 0x32, 0x53, 0xf3, 0x11, 0x8d, 0x37, 0xcb, 0xf3, 0x16, 0xfc, 0xcc, 0x41,
        0x1b
    ];
    
    let receipt_amount = 100;
    
    let (chain_id, block_number, block_hash) = main(
        alice_signature_nonce_1, 
        alice_signature_nonce_2, 
        chain_id, 
        block_number, 
        contract_address, 
        receipt_amount
    );
} 

#[test]
fn test_storage_key_generation() {
    // Given hash
    let hash: [u8; 32] = [
        0x48, 0xfc, 0x0d, 0xf3, 0x39, 0x48, 0xd2, 0x89, 0x57, 0xd5, 0xf6, 0x2e, 0xe1, 0x76, 0x43, 0xb0,
        0x31, 0x1d, 0x4d, 0xda, 0x43, 0xf2, 0xcf, 0x74, 0x78, 0x39, 0x70, 0x3c, 0x52, 0xf3, 0x80, 0x98
    ];
    
    // Create a buffer for the concatenated key and slot
    let mut key_and_slot: [u8; 64] = [0; 64];
    
    // Copy the hash into the buffer
    for i in 0..32 {
        key_and_slot[i] = hash[i];
    }
    
    // Add the slot number at the end (padded with zeros)
    key_and_slot[63] = 2;  // slot 2
    
    // Hash the concatenated key and slot to get the storage key
    let storage_key = keccak256(key_and_slot, 64);
    
    println("Original hash:");
    println(hash);
    println("Generated storage key:");
    println(storage_key);
}

#[test]
fn test_hex_literal_hashing() {
    // The actual hex values as bytes
    let hex_bytes = [
        0x47, 0x65, 0xf9, 0xcb, 0xeb, 0xb3, 0xff, 0x25, 0x24, 0x5f, 0xc8, 0xe3, 0x81, 0x8f, 0x36, 0xa2,
        0xf4, 0xfa, 0x09, 0xf9, 0x89, 0xd3, 0x20, 0xcd, 0xef, 0xc4, 0x65, 0xb2, 0x95, 0xd6, 0xa0, 0xaf,
        0x37, 0x73, 0x11, 0x57, 0x5a, 0xc4, 0x51, 0x99, 0xd9, 0xab, 0x0a, 0x9f, 0x58, 0x54, 0x3f, 0x12,
        0xf2, 0x5e, 0x33, 0xdc, 0xc4, 0xc7, 0xe7, 0xf0, 0x93, 0x19, 0x88, 0x68, 0x20, 0x88, 0xb6, 0xe7,
        0x1c
    ];

    // Convert hex bytes to ASCII string representation
    let hex_string_bytes = hex_bytes_to_ascii(hex_bytes);

    println("Hash from ASCII string bytes (including '0x' prefix):");
    println(keccak256(hex_string_bytes, 132));

    println("Hash from actual hex bytes:");
    println(keccak256(hex_bytes, 65));
} 

#[test]
fn test_encryption() {
    let alice_signature_nonce_1: [u8; 65] = [
        0x47, 0x65, 0xf9, 0xcb, 0xeb, 0xb3, 0xff, 0x25, 0x24, 0x5f, 0xc8, 0xe3, 0x81, 0x8f, 0x36, 0xa2,
        0xf4, 0xfa, 0x09, 0xf9, 0x89, 0xd3, 0x20, 0xcd, 0xef, 0xc4, 0x65, 0xb2, 0x95, 0xd6, 0xa0, 0xaf,
        0x37, 0x73, 0x11, 0x57, 0x5a, 0xc4, 0x51, 0x99, 0xd9, 0xab, 0x0a, 0x9f, 0x58, 0x54, 0x3f, 0x12,
        0xf2, 0x5e, 0x33, 0xdc, 0xc4, 0xc7, 0xe7, 0xf0, 0x93, 0x19, 0x88, 0x68, 0x20, 0x88, 0xb6, 0xe7,
        0x1c
    ];

    // Derive key from signature
    let key = derive_key_from_signature(alice_signature_nonce_1);
    println("Derived key:");
    println(key);

    // Create IV
    let iv = [0, 0, 0, 0];

    // Create fields array with value 100
    let original_value = 66;
    let fields = [original_value, 0, 0, 0, 0, 0, 0, 0];
    println("Fields before encryption:");
    println(fields);

    // Encrypt the fields
    let encrypted_fields = enc::encrypt(fields, key, iv);
    println("Encrypted field [0]");
    println(encrypted_fields[0]);
    // Decrypt the first encrypted field
    
    //let mock_encrypted_field: Field = 0x211ba0c0b6ee0f11e6894da524fe8e9919f8d5faa6fd7e4a536d4e8e17004b4d
    
    let decrypted_value = decrypt_balance(alice_signature_nonce_1, encrypted_fields[0]);
    println("Decrypted value:");
    println(decrypted_value);

    // Assert that the decrypted value matches the original
    assert(decrypted_value == original_value);
} 

