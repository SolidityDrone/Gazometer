use dep::ethereum::account_with_storage::{get_header, StorageWithinBlock};
use dep::ethereum::misc::types::{Address, Bytes32};
use dep::ethereum::account::{get_account, AccountWithinBlock, MAX_PREFIXED_KEY_NIBBLE_LEN};
use dep::ethereum::merkle_patricia_proofs::proof::{ProofInput, Key, Value, Proof, Node, Leaf, verify_merkle_proof};
use dep::ethereum::verifiers::storage::verify_storage_values;
use dep::ethereum::account_with_storage::get_account_with_storage;
use dep::hydra::bn254::{enc, dec};
use dep::keccak256::keccak256;


// user sign nonce n & n-1
// n-1 is hashed and check that keccak(sig(n-1))) exist in the storage of the contract
// if it does, prove state of balanceCommit exist for that key(keccak(sig(n-1)))
// use sig(n-1) to decrypt the balanceCommit of n-1 and save the value

// updated Finalbalance = receipt_balance_change + n-1 decrypted balanceCommit
// encrypt the FinalBalance with sign(n)

// output chain_id, block_number, keccak(sign(n))[commit2], encrypted_FinalBalance


fn main(
    user_signature_nonce_1: [u8; 65],
    user_signature_nonce_2: [u8; 65],
    chain_id: pub Field,
    block_number: pub Field,
    message_nonce_1: Field,
    pub_x_1: [u8; 32],
    pub_y_1: [u8; 32],
    pub_x_2: [u8; 32],
    pub_y_2: [u8; 32],
    contract_address: Address,
    amount: pub Field,
    is_deposit: pub Field,
    receiver_address: Address
) -> pub (Field, Field, Field, Field, Field, Field) {
    // Create 64-byte signatures
    let sig_64_1 = create_64_byte_signature(user_signature_nonce_1);
    let sig_64_2 = create_64_byte_signature(user_signature_nonce_2);

    // Convert message nonce and block number from Field to u64
    let message_nonce_1_u64 = message_nonce_1 as u64;
    let message_nonce_2_u64 = message_nonce_1_u64 + 1;
    let block_number_u64 = block_number as u64;
    let hashed_message_1 = hash_u64(message_nonce_1_u64);
    let hashed_message_2 = hash_u64(message_nonce_2_u64);

    // Verify signatures
    assert(std::ecdsa_secp256k1::verify_signature(pub_x_1, pub_y_1, sig_64_1, hashed_message_1));
    if message_nonce_1_u64 != 0 {
        assert(std::ecdsa_secp256k1::verify_signature(pub_x_2, pub_y_2, sig_64_2, hashed_message_2));
    }

    // Compute commitment hashes
    let commit_1_hash = keccak256(hex_bytes_to_ascii(user_signature_nonce_1), 132);
    let commit_2_hash = keccak256(hex_bytes_to_ascii(user_signature_nonce_2), 132);

    // Initialize variables that will be used in both branches
    let mut final_block_hash: Field = 0;
    let mut final_nullifier: [u8; 32] = [0; 32];
    let mut final_encrypted_balance: Field = 0;
    let mut final_commit_hash: [u8; 32] = [0; 32];
    let mut last_bytes: Field = 0;  // New field to store the last bytes

    // Handle initial state (message_nonce_1 == 0)
    if (user_signature_nonce_1 ==  user_signature_nonce_2){
        // For initial state, we only allow deposits
        assert(is_deposit == 1, "Initial state only supports deposits");
        
        final_nullifier = keccak256(keccak256(hex_bytes_to_ascii(user_signature_nonce_2), 132), 32);
        
        // For initial state, just encrypt the amount using sig1
        let key = derive_key_from_signature(user_signature_nonce_1);
        let iv = [
            message_nonce_1 as Field, 
            bytes_to_field(pub_x_1), 
            bytes_to_field(pub_y_1), 
            0
        ];  
        let balance_fields = [amount, 0, 0, 0, 0, 0, 0, 0];
        let encrypted_fields = enc::encrypt(balance_fields, key, iv);
        final_encrypted_balance = encrypted_fields[0];
        
        final_commit_hash = commit_1_hash;
        
        // Extract last bytes before truncation
        let block_hash_last_byte = 0 as Field;  // Use 0x00 for block hash in initial state
        let commit_hash_last_byte = commit_1_hash[31] as Field;
        last_bytes = (block_hash_last_byte * 256) + commit_hash_last_byte;
    } else {
        // Handle normal state transition (deposit or withdrawal)
        let balance_commit_slot = 2;
        let commit_1_storage_key = compute_storage_key(commit_1_hash, balance_commit_slot);
        let balance_commit_1_storage_key = compute_storage_key(commit_2_hash, balance_commit_slot);

        // Get verified storage values
        let commit_1_verified_storage = unsafe {
            get_account_with_storage(
                chain_id,
                block_number_u64,
                contract_address,
                commit_1_storage_key
            )
        };

        // Compute final balance
        let encrypted_balance = safe_storage_to_field(commit_1_verified_storage.values[0]);
        final_encrypted_balance = compute_final_balance(
            user_signature_nonce_1,  // Use sig1 to decrypt
            user_signature_nonce_2,  // Use sig2 to encrypt
            encrypted_balance,
            amount,
            is_deposit == 1  // 1 for deposit (add), 0 for withdrawal (subtract)
        );


        final_block_hash = field_from_bytes_32_trunc(commit_1_verified_storage.block_hash);
        final_commit_hash = commit_2_hash;
        
        // Extract last bytes before truncation
        let block_hash_last_byte = commit_1_verified_storage.block_hash[31] as Field;
        let commit_hash_last_byte = commit_2_hash[31] as Field;
        last_bytes = (block_hash_last_byte * 256) + commit_hash_last_byte;
    }

    // Return values in order matching _publicInputs array
    (
        final_block_hash,        // _publicInputs[4]
        final_encrypted_balance, // _publicInputs[6]
        field_from_bytes_32_trunc(final_commit_hash),  // _publicInputs[7]
        address_to_field(contract_address),  // _publicInputs[8]
        address_to_field(receiver_address),   // _publicInputs[9]
        last_bytes  // New field containing the last bytes
    )
}


// Helper function to create 64-byte signature from 65-byte input
fn create_64_byte_signature(signature: [u8; 65]) -> [u8; 64] {
    let mut sig_64: [u8; 64] = [0; 64];
    for i in 0..64 {
        sig_64[i] = signature[i];
    }
    sig_64
}

// Helper function to compute storage key
fn compute_storage_key(commit_hash: [u8; 32], balance_commit_slot: u8) -> [u8; 32] {
    let mut key_and_slot: [u8; 64] = [0; 64];
    for i in 0..32 {
        key_and_slot[i] = commit_hash[i];
    }
    key_and_slot[63] = balance_commit_slot;
    keccak256(key_and_slot, 64)
}

// Helper function to compute final balance
fn compute_final_balance(
    decrypt_signature: [u8; 65],  // Signature to decrypt with (sig1)
    encrypt_signature: [u8; 65],  // Signature to encrypt with (sig2)
    encrypted_balance: Field,
    amount: Field,
    is_addition: bool
) -> Field {
    let iv = [0, 0, 0, 0];

    // 1. Decrypt the balance using sig1
    let decrypted_balance = decrypt_balance(decrypt_signature, encrypted_balance);

    // 2. Apply amount operation (add or subtract)
    let new_balance = if is_addition {
        decrypted_balance + amount
    } else {
        // For withdrawals, ensure we have enough balance
        let balance_u64 = decrypted_balance as u64;
        let amount_u64 = amount as u64;
        assert(balance_u64 >= amount_u64, "Insufficient balance for withdrawal");
        decrypted_balance - amount
    };
 
    // 3. Encrypt the new balance using sig2
    let new_key = derive_key_from_signature(encrypt_signature);
    let balance_fields = [new_balance, 0, 0, 0, 0, 0, 0, 0];
    let encrypted_fields = enc::encrypt(balance_fields, new_key, iv);

    
    encrypted_fields[0]
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
        let high_nibble = (byte >> 4) & 0x0f;
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

// Function to safely convert storage value to field
fn safe_storage_to_field(storage_value: [u8; 32]) -> Field {
    // Convert bytes to field directly
    // Noir's field type automatically handles overflow
    bytes_to_field(storage_value)
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


#[test]
fn test_hash_u64_values() {
    // Test with 1
    let hash_1 = hash_u64(0);
    let expected_hash_1: [u8; 32] = [
        0x04, 0x48, 0x52, 0xb2, 0xa6, 0x70, 0xad, 0xe5, 0x40, 0x7e, 0x78, 0xfb, 0x28, 0x63, 0xc5, 0x1d,
        0xe9, 0xfc, 0xb9, 0x65, 0x42, 0xa0, 0x71, 0x86, 0xfe, 0x3a, 0xed, 0xa6, 0xbb, 0x8a, 0x11, 0x6d
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
    let block_number = 8274988 ;
    
    // Message nonces
    let message_nonce_1 = 0;
    
    // contract_address to check - using the correct type
    let contract_address: Address = [0x69, 0xe4, 0xb3, 0x8E, 0x6c, 0x08, 0xBD, 0x64, 0x67, 0xa7, 0x03, 0xa1, 0x7C, 0xd7, 0x7A, 0xcB, 0x0B, 0xad, 0xFa, 0x66];
    let receiver_address: Address = [0x99, 0x2B, 0xEE, 0x8f, 0x43, 0xBF, 0x20, 0x39, 0x64, 0xd3, 0x8c, 0x54, 0xFA, 0x03, 0xe6, 0x2d, 0x61, 0x61, 0x59, 0xfA];

    // Signatures (65 bytes)
    let user_signature_nonce_1: [u8; 65] = [
        0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];

    // Debug: Print the commit hash calculation
    let hex_string = hex_bytes_to_ascii(user_signature_nonce_1);
    println("Debug - ASCII hex string length:");
    println(hex_string.len());
    println("Debug - First 20 bytes of ASCII hex string:");
    for i in 0..20 {
        print(hex_string[i]);
    }
    println("");
    let commit_hash = keccak256(hex_string, 132);
    println("Debug - Commit hash:");
    println(commit_hash);

    let user_signature_nonce_2: [u8; 65] = [
        0x07, 0x2f, 0x3e, 0x1e, 0x23, 0xa2, 0x17, 0xbd, 0xc3, 0xc4, 0x1b, 0x4c, 0x61, 0x35, 0x2b, 0xcc,
        0x78, 0xd8, 0x14, 0x0e, 0xb9, 0x81, 0x0b, 0xd3, 0xd3, 0x60, 0x37, 0xfb, 0x65, 0xc7, 0xaf, 0x40,
        0x6d, 0x4c, 0x37, 0x72, 0xb0, 0xc4, 0xd4, 0xfb, 0x29, 0x8c, 0xec, 0x36, 0xd0, 0x9d, 0x64, 0x6f,
        0xf6, 0xa2, 0x49, 0x71, 0x0e, 0x43, 0xcd, 0xf2, 0x85, 0x6e, 0x5d, 0x4e, 0xfd, 0xbf, 0x7b, 0xd3,
        0x1c
    ];

    // Public key coordinates
    let pub_x_1: [u8; 32] = [
        0x32, 0x5e, 0x66, 0xd2, 0x37, 0x77, 0x91, 0x44, 0x0c, 0xb7, 0xc5, 0xeb, 0xc2, 0x99, 0x2e, 0xa9,
        0xcc, 0xc4, 0xb3, 0xcd, 0x2d, 0x64, 0x8e, 0x90, 0xa9, 0xeb, 0xa7, 0x4a, 0x5a, 0xc0, 0xc8, 0xa3
    ];
    let pub_y_1: [u8; 32] = [
        0x29, 0x8b, 0x4e, 0x5f, 0xcd, 0x6e, 0x86, 0x61, 0x6c, 0x86, 0xb3, 0x07, 0x11, 0xc9, 0x89, 0xab,
        0x6c, 0xa9, 0x88, 0x92, 0x90, 0xab, 0x8a, 0x0d, 0x2d, 0x01, 0x85, 0x1e, 0xdb, 0x1f, 0xbf, 0x52
    ];

    // Using same public key for both signatures
    let pub_x_2: [u8; 32] = [
        0xca, 0xb1, 0x4a, 0x0b, 0xb5, 0x57, 0xdf, 0xe9, 0x0a, 0x26, 0x8d, 0xcd, 0x04, 0xf1, 0x7e, 0x2e,
        0xa8, 0xd8, 0xcc, 0xd5, 0x57, 0x71, 0xaa, 0x18, 0xec, 0x72, 0x3a, 0xf2, 0xee, 0x45, 0x92, 0xe6
    ];
    let pub_y_2: [u8; 32] = [
         0x75, 0xd4, 0x4b, 0xb8, 0xbc, 0x98, 0xdb, 0x93, 0x24, 0x0f, 0x48, 0x07, 0x7c, 0x63, 0xaa, 0x4b,
        0x29, 0xd5, 0x9a, 0xa3, 0x35, 0xcf, 0xf4, 0xb2, 0xa0, 0x88, 0x23, 0x4f, 0x69, 0xc2, 0x2e, 0xba
    ];
    
    let amount = 100;
    let is_deposit = 1;  // 1 for deposit, 0 for withdrawal
    
    let (block_hash, encrypted_balance, commit_hash, contract_address_field, receiver_address_field, last_bytes) = main(
        user_signature_nonce_1, 
        user_signature_nonce_2, 
        chain_id, 
        block_number,
        message_nonce_1,
        pub_x_1,
        pub_y_1,
        pub_x_2,
        pub_y_2,
        contract_address, 
        amount,
        is_deposit,
        receiver_address
    );

    println("---- CIRCUIT OUTPUT ----");

    println("block_hash");
    println(block_hash);
    
    println("encrypted_balance");
    println(encrypted_balance);
    println("commit_hash");
    println(commit_hash);
    println("contract_address");
    println(contract_address_field);
    println("receiver_address");
    println(receiver_address_field);
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
        0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];

    // Convert hex bytes to ASCII string representation
    let hex_string_bytes = hex_bytes_to_ascii(hex_bytes);

    println("Hash from ASCII string bytes (including '0x' prefix):");
    println(keccak256(hex_string_bytes, 132));
} 

#[test]
fn test_encryption() {
     let user_signature_nonce_1: [u8; 65] = [
        0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];

    // Derive key from signature
    let key = derive_key_from_signature(user_signature_nonce_1);
    println("Derived key:");
    println(key);

    // Create IV
    let iv = [0, 0, 0, 0];

    // Create fields array with value 100
    let original_value = 100;
    let fields = [original_value, 0, 0, 0, 0, 0, 0, 0];
    println("Fields before encryption:");
    println(fields);

    // Encrypt the fields
    let encrypted_fields = enc::encrypt(fields, key, iv);
    println("Encrypted field [0]");
    println(encrypted_fields[0]);
    // Decrypt the first encrypted field
    
    let mock_encrypted_field: Field = 0x0394e37d9de02f6842dfac3c43bfe1137f1bbd4b1ca26e02c4c71889d7373ebe;
    
    let decrypted_value = decrypt_balance(user_signature_nonce_1, mock_encrypted_field);
    println("Decrypted value:");
    println(decrypted_value);

    // Assert that the decrypted value matches the original
    assert(decrypted_value == original_value);
} 

#[test]
fn test_keccak_hex_output() {
    // Test with a simple message
    let message = "0x1234";
    let mut message_bytes: [u8; 64] = [0; 64];
    
    // Convert hex string to bytes
    message_bytes[0] = 0x12;
    message_bytes[1] = 0x34;
    
    let hash = keccak256(message_bytes, 2);
    
    println("Input message: 0x1234");
    println("Keccak hash in hex: 0x");
    for i in 0..32 {
        let byte = hash[i];
        if byte < 16 {
            print("0");
        }
        print(byte);
    }
    println("");
    
    // Test with a signature
    let signature: [u8; 65] = [
        0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];
    
    let sig_hash = keccak256(signature, 65);
    
    println("\nInput signature hash in hex: 0x");
    for i in 0..32 {
        let byte = sig_hash[i];
        if byte < 16 {
            print("0");
        }
        print(byte);
    }
    println("");
    
    // Test with hex string conversion
    let hex_string = hex_bytes_to_ascii(signature);
    let hex_hash = keccak256(hex_string, 132);
    
    println("\nInput signature as hex string hash: 0x");
    for i in 0..32 {
        let byte = hex_hash[i];
        if byte < 16 {
            print("0");
        }
        print(byte);
    }
    println("");
} 

#[test]
fn test_signature_processing() {
    let signature: [u8; 65] = [
        0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];

    // Print raw signature hash
    let raw_hash = keccak256(signature, 65);
    println("Raw signature hash:");
    println(raw_hash);

    // Print ASCII hex string version
    let hex_string = hex_bytes_to_ascii(signature);
    println("ASCII hex string (first 20 bytes):");
    for i in 0..20 {
        print(hex_string[i]);
    }
    println("...");

    // Print hash of ASCII hex string
    let ascii_hash = keccak256(hex_string, 132);
    println("Hash of ASCII hex string:");
    println(ascii_hash);
} 

#[test]
fn test_commit_hash_calculation() {
    // Use the same signature from test_init
    let signature: [u8; 65] = [
        0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];

    // Print the ASCII hex string
    let hex_string = hex_bytes_to_ascii(signature);

    println("ASCII hex string length: {}");
    println(hex_string.len());
    println("First 20 bytes of ASCII hex string:");
    for i in 0..20 {
        print(hex_string[i]);
    }
    println("");

    // Calculate and print the commit hash
    let commit_hash = keccak256(hex_string, 132);
    println("Commit hash:");
    println(commit_hash);

    // Also print the raw signature hash for comparison
    let raw_hash = keccak256(signature, 65);
    println("Raw signature hash:");
    println(raw_hash);
} 