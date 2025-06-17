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
    chain_id: pub Field,
    block_number: u64,
    message_nonce_1: u64,
    pub_x_1: [u8; 32],
    pub_y_1: [u8; 32],
    pub_x_2: [u8; 32],
    pub_y_2: [u8; 32],
    contract_address: Address,
    receipt_amount: i64
) -> pub (Field, Field, Field, Field, Field, Field, Field) {

    // ---- Check nonce are valid ------ //
    let message_nonce_2 = message_nonce_1 + 1;
    let hashed_message_1 = hash_u64(message_nonce_1);
    let hashed_message_2 = hash_u64(message_nonce_2);


    // Create 64-byte signature by taking first 64 bytes
    let mut sig_64_1: [u8; 64] = [0; 64];
    let mut sig_64_2: [u8; 64] = [0; 64];
    for i in 0..64 {
        sig_64_1[i] = alice_signature_nonce_1[i];
        sig_64_2[i] = alice_signature_nonce_2[i];
    }

    assert(std::ecdsa_secp256k1::verify_signature(pub_x_1, pub_y_1, sig_64_1, hashed_message_1));
    assert(std::ecdsa_secp256k1::verify_signature(pub_x_2, pub_y_2, sig_64_2, hashed_message_2));

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
    let commit_1_verified_storage = unsafe {get_account_with_storage(
        chain_id,
        block_number,
        contract_address,
        commit_1_storage_key
    )};
    // If key value dosent exist in mapping (commit=>balance) then the oracle will reject
    // therefore we might check mapping(commit=>bool) is true, but we can neglet it here
    // as a false commitment wont match the sig, and a non mapped key will throw error

    //------ Compose new balance -----------//
    // @Dev: Security is low, for same sig and fiferent balance an attacker
    // could figure out the length of the value, by checking the switching bytes
    // But since we use 1 commit 1 derived key we get rid of this iussue
    
    // 1) decrypt balanceCommit for n-1 
    let iv = [
        message_nonce_1 as Field, 
        bytes_to_field(pub_x_1), 
        bytes_to_field(pub_y_1), 
        0
    ];
    let nonce_1_derived_key = derive_key_from_signature(alice_signature_nonce_1);
    let encrypted_balance = safe_storage_to_field(commit_1_verified_storage.values[0]);
    let decrypted_1_balance_commit_balance = 
        decrypt_balance(alice_signature_nonce_1, encrypted_balance);
    // 2) add receipt_amount to the decrypted balanceCommit for n-1 
    let receipt_amount_field: Field = receipt_amount as Field;
    let new_balance = decrypted_1_balance_commit_balance + receipt_amount_field;
    // 3) encrypt the new balance with sign(n)
    let new_key = derive_key_from_signature(alice_signature_nonce_2);
    let balance_fields = [new_balance, 0, 0, 0, 0, 0, 0, 0];
    let encrypted_fields = enc::encrypt(balance_fields, new_key, iv);

    let encrypted_final_balance = encrypted_fields[0];
    // nullifier serve to prevent double spending of same state, we dont need to check
    // storage value for it, this pass to bob. If nullifier already exist bob's proof will be 
    // rejected in the smart contract
    
    // Extract last bytes before truncation
    let block_hash_last_byte = commit_1_verified_storage.block_hash[31] as Field;
    let commit_hash_last_byte = commit_2_hash[31] as Field;
    let last_bytes = (block_hash_last_byte * 256) + commit_hash_last_byte;

    (   
        receipt_amount_field,
        block_number as Field, 
        address_to_field(contract_address),
        field_from_bytes_32_trunc(commit_1_verified_storage.block_hash), 
        encrypted_final_balance, 
        field_from_bytes_32_trunc(commit_2_hash),
        last_bytes  
    )
}



fn field_from_bytes_32_trunc(bytes32: [u8; 32]) -> Field {
    // Convert it to a field element
    let mut v = 1;
    let mut high = 0 as Field;
    let mut low = 0 as Field;

    for i in 0..15 {
        // covers bytes 16..30 (31 is truncated and ignored)
        low = low + (bytes32[15 + 15 - i] as Field) * v;
        v = v * 256;
        // covers bytes 0..14
        high = high + (bytes32[14 - i] as Field) * v;
    }
    // covers byte 15
    low = low + (bytes32[15] as Field) * v;

    low + high * v
}


// Define a larger key size that can accommodate the nibble conversion of a 32-byte key
global LARGER_KEY_SIZE: u32 = 132; // 2 * 32 + 68 (extra space for prefix)

// Derive a deterministic key from a signature
fn derive_key_from_signature(signature: [u8; 65]) -> [Field; 4] {
    let mut key = [0; 4];
    for i in 0..4 {
        let mut value: u64 = 0;
        for j in 0..16 {
            value = (value << 4) | (signature[i * 16 + j] as u64);
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
    
    // Convert bytes to field
    for i in 0..32 {
        result = result * 256 + (bytes[i] as Field);
    }
    
    result
}

// Function to convert Address (20 bytes) to Field
fn address_to_field(address: Address) -> Field {
    let mut result: Field = 0;
    
    // Convert bytes to field
    for i in 0..20 {
        result = result * 256 + (address[i] as Field);
    }
    
    result
}


// Unconstrained function to convert u64 to ASCII bytes
unconstrained fn u64_to_ascii_bytes(value: u64) -> [u8; 20] {
    let mut result: [u8; 20] = [0; 20];
    let mut temp = value;
    let mut pos = 19;
    
    // Handle zero case
    if value == 0 {
        result[19] = 48; // '0'
    } else {
        // Convert each digit to ASCII
        while temp > 0 {
            let digit = (temp % 10) as u8;
            result[pos] = digit + 48; // Convert to ASCII
            temp = temp / 10;
            if pos > 0 {
                pos -= 1;
            }
        }
    }
    
    // Shift all digits to the right
    let mut shifted: [u8; 20] = [0; 20];
    let mut count = 0;
    for i in 0..20 {
        if result[i] != 0 {
            count += 1;
        }
    }
    
    for i in 0..count {
        shifted[20 - count + i] = result[20 - count + i];
    }
    
    shifted
}

// Function to hash a u64 value using Keccak256
fn hash_u64(value: u64) -> [u8; 32] {
    // Convert value to ASCII bytes using unconstrained function
    let digits = unsafe { u64_to_ascii_bytes(value) };
    
    // Count non-zero digits
    let mut digit_count = 0;
    for i in 0..20 {
        if digits[i] != 0 {
            digit_count += 1;
        }
    }
    
    // Copy digits to message
    let mut message: [u8; 64] = [0; 64];
    for i in 0..20 {
        if i < digit_count {
            message[i] = digits[20 - digit_count + i];
        }
    }
    
    // Hash the digits
    keccak256(message, digit_count)
}

// Function to safely convert storage value to field
fn safe_storage_to_field(storage_value: [u8; 32]) -> Field {
    // Convert bytes to field directly
    // Noir's field type automatically handles overflow
    bytes_to_field(storage_value)
}

#[test]
fn test_hash_u64_values() {
    // Test with 1
    let hash_1 = hash_u64(1);
    let expected_hash_1: [u8; 32] = [
        0xc8, 0x9e, 0xfd, 0xaa, 0x54, 0xc0, 0xf2, 0x0c, 0x7a, 0xdf, 0x61, 0x28, 0x82, 0xdf, 0x09, 0x50,
        0xf5, 0xa9, 0x51, 0x63, 0x7e, 0x03, 0x07, 0xcd, 0xcb, 0x4c, 0x67, 0x2f, 0x29, 0x8b, 0x8b, 0xc6
    ];
    assert(hash_1 == expected_hash_1);
    
    // Test with 10
    let hash_10 = hash_u64(10);
    let expected_hash_10: [u8; 32] = [
        0x1a, 0x19, 0x2f, 0xab, 0xce, 0x13, 0x98, 0x8b, 0x84, 0x99, 0x4d, 0x42, 0x96, 0xe6, 0xcd, 0xc4,
        0x18, 0xd5, 0x5e, 0x2f, 0x1d, 0x7f, 0x94, 0x21, 0x88, 0xd4, 0x04, 0x0b, 0x94, 0xfc, 0x57, 0xac
    ];
    assert(hash_10 == expected_hash_10);
    
    // Test with 100
    let hash_100 = hash_u64(100);
    let expected_hash_100: [u8; 32] = [
        0x8c, 0x18, 0x21, 0x0d, 0xf0, 0xd9, 0x51, 0x4f, 0x2d, 0x2e, 0x5d, 0x8c, 0xa7, 0xc1, 0x00, 0x97,
        0x82, 0x19, 0xee, 0x80, 0xd3, 0x96, 0x8a, 0xd8, 0x50, 0xab, 0x5e, 0xad, 0x20, 0x82, 0x87, 0xb3
    ];
    assert(hash_100 == expected_hash_100);
    
    // Print the hashes for verification
    println("Hash of 1:");
    println(hash_1);
    println("Hash of 10:");
    println(hash_10);
    println("Hash of 100:");
    println(hash_100);
}

#[test]
fn test_init() {
    // Chain ID for Sepolia testnet
    let chain_id = 11155111;
    
    // Block number
    let block_number =   8275916;
    
    // Message nonces
    let message_nonce_1 = 1;
    let message_nonce_2 = 2;
    
    // contract_address to check - using the correct type
    let contract_address: Address = [0x58, 0x2B, 0xEE, 0x8f, 0x43, 0xBF, 0x20, 0x39, 0x64, 0xd3, 0x8c, 0x54, 0xFA, 0x03, 0xe6, 0x2d, 0x61, 0x61, 0x59, 0xfA];
    
    // Signatures (65 bytes)
    let alice_signature_nonce_1: [u8; 65] = [
        0x07, 0x2f, 0x3e, 0x1e, 0x23, 0xa2, 0x17, 0xbd, 0xc3, 0xc4, 0x1b, 0x4c, 0x61, 0x35, 0x2b, 0xcc,
        0x78, 0xd8, 0x14, 0x0e, 0xb9, 0x81, 0x0b, 0xd3, 0xd3, 0x60, 0x37, 0xfb, 0x65, 0xc7, 0xaf, 0x40,
        0x6d, 0x4c, 0x37, 0x72, 0xb0, 0xc4, 0xd4, 0xfb, 0x29, 0x8c, 0xec, 0x36, 0xd0, 0x9d, 0x64, 0x6f,
        0xf6, 0xa2, 0x49, 0x71, 0x0e, 0x43, 0xcd, 0xf2, 0x85, 0x6e, 0x5d, 0x4e, 0xfd, 0xbf, 0x7b, 0xd3,
        0x1c
    ];
    let alice_signature_nonce_2: [u8; 65] = [
        0x47, 0x65, 0xf9, 0xcb, 0xeb, 0xb3, 0xff, 0x25, 0x24, 0x5f, 0xc8, 0xe3, 0x81, 0x8f, 0x36, 0xa2,
        0xf4, 0xfa, 0x09, 0xf9, 0x89, 0xd3, 0x20, 0xcd, 0xef, 0xc4, 0x65, 0xb2, 0x95, 0xd6, 0xa0, 0xaf,
        0x37, 0x73, 0x11, 0x57, 0x5a, 0xc4, 0x51, 0x99, 0xd9, 0xab, 0x0a, 0x9f, 0x58, 0x54, 0x3f, 0x12,
        0xf2, 0x5e, 0x33, 0xdc, 0xc4, 0xc7, 0xe7, 0xf0, 0x93, 0x19, 0x88, 0x68, 0x20, 0x88, 0xb6, 0xe7,
        0x1c
    ];

    // Public key coordinates
    let pub_x_1: [u8; 32] = [
        0xca, 0xb1, 0x4a, 0x0b, 0xb5, 0x57, 0xdf, 0xe9, 0x0a, 0x26, 0x8d, 0xcd, 0x04, 0xf1, 0x7e, 0x2e,
        0xa8, 0xd8, 0xcc, 0xd5, 0x57, 0x71, 0xaa, 0x18, 0xec, 0x72, 0x3a, 0xf2, 0xee, 0x45, 0x92, 0xe6
    ];
    let pub_y_1: [u8; 32] = [
        0x75, 0xd4, 0x4b, 0xb8, 0xbc, 0x98, 0xdb, 0x93, 0x24, 0x0f, 0x48, 0x07, 0x7c, 0x63, 0xaa, 0x4b,
        0x29, 0xd5, 0x9a, 0xa3, 0x35, 0xcf, 0xf4, 0xb2, 0xa0, 0x88, 0x23, 0x4f, 0x69, 0xc2, 0x2e, 0xba
    ];

    // Using same public key for both signatures
    let pub_x_2: [u8; 32] = [
        0x97, 0x0f, 0xaa, 0x1e, 0xf6, 0xfd, 0xfe, 0xdc, 0xc5, 0x21, 0x56, 0xe4, 0x88, 0x0d, 0x2a, 0x0d,
        0xce, 0x57, 0xaf, 0xfa, 0xf1, 0x99, 0xe6, 0x60, 0x8e, 0x9b, 0x23, 0xc9, 0xf0, 0x85, 0xd2, 0xd1
    ];
    let pub_y_2: [u8; 32] = [
        0x34, 0x2a, 0x1e, 0xa1, 0xd1, 0x84, 0x38, 0x92, 0x34, 0x7a, 0x8f, 0x9a, 0x0d, 0xcb, 0x09, 0x72,
        0xfc, 0xd0, 0x3f, 0xe0, 0x17, 0xd2, 0x6c, 0xb2, 0xb4, 0xcd, 0xd4, 0x63, 0xbf, 0x7b, 0x9a, 0xf2
    ];
    
    let receipt_amount = -100;
    
    let (receipt_amount, block_number, contract_address, block_hash, encrypted_balance, commit_2_hash, last_bytes) = main(
        alice_signature_nonce_1, 
        alice_signature_nonce_2, 
        chain_id, 
        block_number,
        message_nonce_1,
        pub_x_1,
        pub_y_1,
        pub_x_2,
        pub_y_2,
        contract_address, 
        receipt_amount
    );
    println("---- CIRCUIT OUTPUT ----");
    println("receipt_amount");
    println(receipt_amount);
    println("block_number");
    println(block_number);
    println("contract_address");
    println(contract_address);
    println("block_hash");
    println(block_hash);
    println("encrypted_balance");
    println(encrypted_balance);
    println("commit_2_hash");
    println(commit_2_hash);
    println("last_bytes");
    println(last_bytes);
    println("---- END OF CIRCUIT OUTPUT ----");
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
        0x07, 0x2f, 0x3e, 0x1e, 0x23, 0xa2, 0x17, 0xbd, 0xc3, 0xc4, 0x1b, 0x4c, 0x61, 0x35, 0x2b, 0xcc,
        0x78, 0xd8, 0x14, 0x0e, 0xb9, 0x81, 0x0b, 0xd3, 0xd3, 0x60, 0x37, 0xfb, 0x65, 0xc7, 0xaf, 0x40,
        0x6d, 0x4c, 0x37, 0x72, 0xb0, 0xc4, 0xd4, 0xfb, 0x29, 0x8c, 0xec, 0x36, 0xd0, 0x9d, 0x64, 0x6f,
        0xf6, 0xa2, 0x49, 0x71, 0x0e, 0x43, 0xcd, 0xf2, 0x85, 0x6e, 0x5d, 0x4e, 0xfd, 0xbf, 0x7b, 0x23,
        0x1c
    ];

    // Derive key from signature
    let key = derive_key_from_signature(alice_signature_nonce_1);
    println("Derived key:");
    println(key);

    // Create a nonce and IV
    let nonce = 11561; // Example nonce, can be generated dynamically
    let iv = [nonce, 432, 324, 14]; // Example IV construction

    // Create fields array with a dynamic receipt amount
    let receipt_amount = 100; // Example receipt amount
    let fields = [receipt_amount as Field, 0, 0, 0, 0, 0, 0, 0];
    println("Fields before encryption:");
    println(fields);

    // Encrypt the fields
    let encrypted_fields = enc::encrypt(fields, key, iv);
    println("Encrypted field [0]");
    println(encrypted_fields[0]);

    // Mock an encrypted field for decryption
    let mock_encrypt_field: Field = 0x2b82640da1997b95668f4e3718b5be7dc34dbd77f217a367f53aec0256ad151;
    
    // Wrap the mock encrypted field in an array
    let encrypted_array: [Field; 1] = [mock_encrypt_field];

    // Decrypt the first encrypted field
    let decrypted_fields = dec::decrypt(encrypted_fields, key, iv);
    let decrypted_value = decrypted_fields[0]; // Assuming the first field is the one we want
    println("Decrypted value:");
    println(decrypted_value);

    // Assert that the decrypted value matches the original
    assert(decrypted_value == (receipt_amount as Field));
} 