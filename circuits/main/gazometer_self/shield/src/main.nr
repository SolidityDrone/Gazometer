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
        decrypted_balance - amount
    };
    
    // 3. Encrypt the new balance using sig2
    let new_key = derive_key_from_signature(encrypt_signature);
    let balance_fields = [new_balance, 0, 0, 0, 0, 0, 0, 0];
    let encrypted_fields = enc::encrypt(balance_fields, new_key, iv);
    
    encrypted_fields[0]
}

fn main(
    alice_signature_nonce_1: [u8; 65],
    alice_signature_nonce_2: [u8; 65],
    chain_id: pub Field,
    block_number: u64,
    message_nonce_1: u64,
    message_nonce_2: u64,
    pub_x_1: [u8; 32],
    pub_y_1: [u8; 32],
    pub_x_2: [u8; 32],
    pub_y_2: [u8; 32],
    contract_address: Address,
    amount: pub Field,
    is_deposit: bool,  // true for deposit, false for withdrawal
) -> pub (Field, Field, Field, Field, Field, Field, Field, Field) {
    // Create 64-byte signatures
    let sig_64_1 = create_64_byte_signature(alice_signature_nonce_1);
    let sig_64_2 = create_64_byte_signature(alice_signature_nonce_2);

    // Compute hashed messages
    let hashed_message_1 = hash_u64(message_nonce_1);
    let hashed_message_2 = hash_u64(message_nonce_2);

    // Verify signatures
    assert(std::ecdsa_secp256k1::verify_signature(pub_x_1, pub_y_1, sig_64_1, hashed_message_1));
    if message_nonce_1 != 0 {
        assert(std::ecdsa_secp256k1::verify_signature(pub_x_2, pub_y_2, sig_64_2, hashed_message_2));
    }

    // Compute commitment hashes
    let commit_1_hash = keccak256(hex_bytes_to_ascii(alice_signature_nonce_1), 132);
    let commit_2_hash = keccak256(hex_bytes_to_ascii(alice_signature_nonce_2), 132);

    // Initialize variables that will be used in both branches
    let mut final_chain_id = chain_id;
    let mut final_block_number = block_number as Field;
    let mut final_contract_address = address_to_field(contract_address);
    let mut final_block_hash: Field = 0;
    let mut final_nullifier: [u8; 32] = [0; 32];
    let mut final_encrypted_balance: Field = 0;
    let mut final_commit_hash: [u8; 32] = [0; 32];
    let mut final_amount = amount;

    // Handle initial state (message_nonce_1 == 0)
    if message_nonce_1 == 0 {
        // For initial state, we only allow deposits
        assert(is_deposit, "Initial state only supports deposits");
        
        final_nullifier = keccak256(keccak256(hex_bytes_to_ascii(alice_signature_nonce_2), 132), 32);
        final_encrypted_balance = compute_final_balance(
            alice_signature_nonce_2,  // For initial state, we use sig2 for both
            alice_signature_nonce_2,  // For initial state, we use sig2 for both
            amount,
            amount,
            true  // Always add for initial deposit
        );
        final_commit_hash = commit_1_hash;
    } else {
        // Handle normal state transition (deposit or withdrawal)
        let balance_commit_slot = 2;
        let commit_1_storage_key = compute_storage_key(commit_1_hash, balance_commit_slot);
        let balance_commit_1_storage_key = compute_storage_key(commit_2_hash, balance_commit_slot);

        // Get verified storage values
        let commit_1_verified_storage = unsafe {
            get_account_with_storage(
                chain_id,
                block_number,
                contract_address,
                commit_1_storage_key
            )
        };

        // Compute final balance
        let encrypted_balance = safe_storage_to_field(commit_1_verified_storage.values[0]);
        final_encrypted_balance = compute_final_balance(
            alice_signature_nonce_1,  // Use sig1 to decrypt
            alice_signature_nonce_2,  // Use sig2 to encrypt
            encrypted_balance,
            amount,
            is_deposit  // true for deposit (add), false for withdrawal (subtract)
        );

        // Compute nullifier
        final_nullifier = keccak256(keccak256(hex_bytes_to_ascii(alice_signature_nonce_2), 132), 32);
        final_block_hash = bytes_to_field(commit_1_verified_storage.block_hash);
        final_commit_hash = commit_2_hash;
    }

    // Return final state
    (
        final_chain_id,
        final_block_number,
        final_contract_address,
        final_block_hash,
        bytes_to_field(final_nullifier),
        final_encrypted_balance,
        bytes_to_field(final_commit_hash),
        final_amount
    )
} 