use dep::ethereum::account_with_storage::{get_header, StorageWithinBlock};
use dep::ethereum::misc::types::{Address, Bytes32};
use dep::ethereum::account::{get_account, AccountWithinBlock, MAX_PREFIXED_KEY_NIBBLE_LEN};
use dep::ethereum::merkle_patricia_proofs::proof::{ProofInput, Key, Value, Proof, Node, Leaf, verify_merkle_proof};
use dep::ethereum::verifiers::storage::verify_storage_values;
use dep::ethereum::account_with_storage::get_account_with_storage;
use dep::hydra::bn254::{enc, dec};
use dep::keccak256::keccak256;
use dep::std::verify_proof;

// bob sign nonce n & n-1
// n-1 is hashed and check that keccak(sig(n-1))) exist in the storage of the contract
// if it does, prove state of balanceCommit exist for that key(keccak(sig(n-1)))
// use sig(n-1) to decrypt the balanceCommit of n-1 and save the value

// updated Finalbalance = receipt_balance_change + n-1 decrypted balanceCommit
// encrypt the FinalBalance with sign(n)

// output chain_id, block_number, keccak(sign(n))[commit2], encrypted_FinalBalance



fn main(
    verification_key: [Field; 128],
    proof: [Field; 456],
    public_inputs: [Field; 10], // <-- apparently too many for std:verify_proof 
    key_hash: Field,
    bob_signature_nonce_1: [u8; 65],
    bob_signature_nonce_2: [u8; 65],
    chain_id: pub Field,
    block_number: u64,
    message_nonce_1: u64,
    message_nonce_2: u64,
    pub_x_1: [u8; 32],
    pub_y_1: [u8; 32],
    pub_x_2: [u8; 32],
    pub_y_2: [u8; 32],
    contract_address: Address
) -> pub (Field, u64, Address, Bytes32, [u8; 32], Field, [u8; 32], Field, Field, Field) {

    // v this stuff isnt worth wasting my time anymore and will comment out. Imrpove docs and resources thx
    // verify_proof(verification_key, proof, public_inputs, key_hash);
    // produces: bb: /home/aztec-dev/aztec-packages/barretenberg/cpp/src/barretenberg/stdlib/primitives/bigfield/bigfield_impl.hpp:48: bb::stdlib::bigfield<bb::UltraCircuitBuilder_<bb::UltraExecutionTraceBlocks>, bb::Bn254FqParams>::bigfield(const field_t<Builder> &, const field_t<Builder> &, const bool, const size_t) [Builder = bb::UltraCircuitBuilder_<bb::UltraExecutionTraceBlocks>, T = bb::Bn254FqParams]: Assertion `(uint256_t(low_bits_in.get_value()) < (uint256_t(1) << (NUM_LIMB_BITS * 2)))' failed. Aborted (core dumped)
    
    // ---- Check nonce are valid ------ //
    let hashed_message_1 = hash_u64(message_nonce_1);
    let hashed_message_2 = hash_u64(message_nonce_2);
    

    // Create 64-byte signature by taking first 64 bytes
    let mut sig_64_1: [u8; 64] = [0; 64];
    let mut sig_64_2: [u8; 64] = [0; 64];
    for i in 0..64 {
        sig_64_1[i] = bob_signature_nonce_1[i];
        sig_64_2[i] = bob_signature_nonce_2[i];
    }

    assert(std::ecdsa_secp256k1::verify_signature(pub_x_1, pub_y_1, sig_64_1, hashed_message_1));
    assert(std::ecdsa_secp256k1::verify_signature(pub_x_2, pub_y_2, sig_64_2, hashed_message_2));

    let balance_commit_slot = 2;

    let commit_1_hash = 
        keccak256(hex_bytes_to_ascii(bob_signature_nonce_1), 132);
    let commit_2_hash = 
        keccak256(hex_bytes_to_ascii(bob_signature_nonce_2), 132);
    
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
    let iv = [0, 0, 0, 0];
    let nonce_1_derived_key = derive_key_from_signature(bob_signature_nonce_1);
    let encrypted_balance = safe_storage_to_field(commit_1_verified_storage.values[0]);
    let decrypted_1_balance_commit_balance = 
        decrypt_balance(bob_signature_nonce_1, encrypted_balance);
    // 2) add receipt_amount to the decrypted balanceCommit for n-1 
    let new_balance = decrypted_1_balance_commit_balance - public_inputs[9];
    // 3) encrypt the new balance with sign(n)
    let new_key = derive_key_from_signature(bob_signature_nonce_2);
    let balance_fields = [new_balance, 0, 0, 0, 0, 0, 0, 0];
    let encrypted_fields = enc::encrypt(balance_fields, new_key, iv);

    let encrypted_final_balance = encrypted_fields[0];
    // nullifier serve to prevent double spending of same state, we dont need to check
    // storage value for it, this pass to bob. If nullifier already exist bob's proof will be 
    // rejected in the smart contract
    let nullifier = keccak256(keccak256(hex_bytes_to_ascii(bob_signature_nonce_2), 132), 32);
    
    // return chain_id, block_number, keccak(sign(n))[commit2], encrypted_FinalBalance
    (
        chain_id,
        block_number, 
        contract_address,
        commit_1_verified_storage.block_hash, 
        nullifier, // bob nullifier
        encrypted_final_balance, // bob final balance updated
        commit_2_hash, // bob commitment
        public_inputs[6],   // alice's nullifier
        public_inputs[7], // alice's balance commitment
        public_inputs[8], // alice's committment 
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
    
    // Convert bytes to field
    for i in 0..32 {
        result = result * 256 + (bytes[i] as Field);
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
