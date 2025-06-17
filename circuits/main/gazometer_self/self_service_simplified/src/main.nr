use dep::hydra::bn254::{enc, dec};
use dep::keccak256::keccak256;

// Simplified gazometer circuit without expensive storage proofs
// Uses nullifier system for double-spend prevention instead of storage proofs

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
    contract_address: [u8; 20],
    amount: pub Field,
    is_deposit: pub Field,
    receiver_address: [u8; 20],
    // New: previous encrypted balance provided by user (no storage proof needed)
    previous_encrypted_balance: Field
) -> pub (Field, Field, Field, Field, Field, Field) {
    
    // Create 64-byte signatures
    let sig_64_1 = create_64_byte_signature(user_signature_nonce_1);
    let sig_64_2 = create_64_byte_signature(user_signature_nonce_2);

    // Convert message nonce and block number from Field to u64
    let message_nonce_1_u64 = message_nonce_1 as u64;
    let message_nonce_2_u64 = message_nonce_1_u64 + 1;
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

    // Initialize variables
    let mut final_nullifier: [u8; 32] = [0; 32];
    let mut final_encrypted_balance: Field = 0;
    let mut final_commit_hash: [u8; 32] = [0; 32];

    // Handle initial state (message_nonce_1 == 0)
    if (user_signature_nonce_1 == user_signature_nonce_2) {
        // For initial state, we only allow deposits
        assert(is_deposit == 1, "Initial state only supports deposits");
        
        // Generate nullifier for the new commitment
        final_nullifier = keccak256(commit_1_hash, 32);
        
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
    } else {
        // Handle normal state transition (deposit or withdrawal)
        // Generate nullifier from the old commitment to prevent double-spend
        final_nullifier = keccak256(commit_1_hash, 32);

        // Compute final balance without storage proofs
        final_encrypted_balance = compute_final_balance_simplified(
            user_signature_nonce_1,    // Use sig1 to decrypt
            user_signature_nonce_2,    // Use sig2 to encrypt
            previous_encrypted_balance, // User provides this (verified by nullifier system)
            amount,
            is_deposit == 1  // 1 for deposit (add), 0 for withdrawal (subtract)
        );

        final_commit_hash = commit_2_hash;
    }

    // Return values (nullifier replaces block_hash for double-spend prevention)
    (
        field_from_bytes_32_trunc(final_nullifier),  // Used for double-spend prevention
        final_encrypted_balance,                     // New encrypted balance
        field_from_bytes_32_trunc(final_commit_hash), // New commitment
        address_to_field(contract_address),          // Contract address
        address_to_field(receiver_address),          // Receiver address
        block_number                                 // Block number for reference
    )
}

// Simplified balance computation without storage proofs
fn compute_final_balance_simplified(
    decrypt_signature: [u8; 65],  // Signature to decrypt with (sig1)
    encrypt_signature: [u8; 65],  // Signature to encrypt with (sig2)
    encrypted_balance: Field,     // Previous encrypted balance (user provided)
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

// Helper function to create 64-byte signature from 65-byte input
fn create_64_byte_signature(signature: [u8; 65]) -> [u8; 64] {
    let mut sig_64: [u8; 64] = [0; 64];
    for i in 0..64 {
        sig_64[i] = signature[i];
    }
    sig_64
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
    signature: [u8; 65],
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
fn address_to_field(address: [u8; 20]) -> Field {
    let mut result: Field = 0;
    
    // Convert bytes to field
    for i in 0..20 {
        result = result * 256 + (address[i] as Field);
    }
    
    result
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

#[test]
fn test_simplified_init() {
    // Same test as before but without storage proofs
    let chain_id = 11155111;
    let block_number = 8274988;
    let message_nonce_1 = 0;
    
    let contract_address: [u8; 20] = [0x69, 0xe4, 0xb3, 0x8E, 0x6c, 0x08, 0xBD, 0x64, 0x67, 0xa7, 0x03, 0xa1, 0x7C, 0xd7, 0x7A, 0xcB, 0x0B, 0xad, 0xFa, 0x66];
    let receiver_address: [u8; 20] = [0x99, 0x2B, 0xEE, 0x8f, 0x43, 0xBF, 0x20, 0x39, 0x64, 0xd3, 0x8c, 0x54, 0xFA, 0x03, 0xe6, 0x2d, 0x61, 0x61, 0x59, 0xfA];

    let user_signature_nonce_1: [u8; 65] = [
        0x13, 0x51, 0x2a, 0x51, 0x61, 0xbd, 0x83, 0x80, 0xde, 0xc4, 0x38, 0x3b, 0xab, 0x21, 0x30, 0xce,
        0x1c, 0x1b, 0xb2, 0x28, 0x95, 0x50, 0x42, 0x14, 0x72, 0x42, 0x26, 0xaf, 0x58, 0x60, 0xd5, 0xaa,
        0x61, 0x5e, 0x53, 0xae, 0x5e, 0xde, 0xab, 0xca, 0xc3, 0xa5, 0x6b, 0x87, 0xe8, 0x37, 0x62, 0x85,
        0x0c, 0x1b, 0xea, 0x5c, 0xcd, 0xde, 0xdc, 0x1a, 0x1f, 0x37, 0x77, 0xfc, 0x6d, 0xfe, 0xcd, 0x4c,
        0x1b
    ];

    let user_signature_nonce_2: [u8; 65] = user_signature_nonce_1; // Same for init

    let pub_x_1: [u8; 32] = [
        0x32, 0x5e, 0x66, 0xd2, 0x37, 0x77, 0x91, 0x44, 0x0c, 0xb7, 0xc5, 0xeb, 0xc2, 0x99, 0x2e, 0xa9,
        0xcc, 0xc4, 0xb3, 0xcd, 0x2d, 0x64, 0x8e, 0x90, 0xa9, 0xeb, 0xa7, 0x4a, 0x5a, 0xc0, 0xc8, 0xa3
    ];
    let pub_y_1: [u8; 32] = [
        0x29, 0x8b, 0x4e, 0x5f, 0xcd, 0x6e, 0x86, 0x61, 0x6c, 0x86, 0xb3, 0x07, 0x11, 0xc9, 0x89, 0xab,
        0x6c, 0xa9, 0x88, 0x92, 0x90, 0xab, 0x8a, 0x0d, 0x2d, 0x01, 0x85, 0x1e, 0xdb, 0x1f, 0xbf, 0x52
    ];

    let pub_x_2: [u8; 32] = pub_x_1;
    let pub_y_2: [u8; 32] = pub_y_1;
    
    let amount = 100;
    let is_deposit = 1;
    let previous_encrypted_balance = 0; // Not used for init
    
    let (nullifier, encrypted_balance, commit_hash, contract_address_field, receiver_address_field, block_num) = main(
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
        receiver_address,
        previous_encrypted_balance
    );

    println("---- SIMPLIFIED CIRCUIT OUTPUT ----");
    println("nullifier (for double-spend prevention):");
    println(nullifier);
    println("encrypted_balance:");
    println(encrypted_balance);
    println("commit_hash:");
    println(commit_hash);
    println("contract_address:");
    println(contract_address_field);
    println("receiver_address:");
    println(receiver_address_field);
    println("block_number:");
    println(block_num);
    println("---- END OF CIRCUIT OUTPUT ----");
} 