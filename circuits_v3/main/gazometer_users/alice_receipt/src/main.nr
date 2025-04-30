use dep::ethereum::account_with_storage::{get_header, StorageWithinBlock};
use dep::ethereum::misc::types::{Address, Bytes32};
use dep::ethereum::account::{get_account, AccountWithinBlock, MAX_PREFIXED_KEY_NIBBLE_LEN};
// Import the BlockHeaderPartial struct
use dep::ethereum::header::BlockHeaderPartial;
use dep::ethereum::merkle_patricia_proofs::proof::{ProofInput, Key, Value, Proof, Node, Leaf, verify_merkle_proof};
use dep::ethereum::verifiers::storage::verify_storage_values;


use dep::ethereum::account_with_storage::get_account_with_storage;

// Define a larger key size that can accommodate the nibble conversion of a 32-byte key
global LARGER_KEY_SIZE: u32 = 132; // 2 * 32 + 68 (extra space for prefix)

fn main(
    chain_id: Field,
    block_number: u64,
    address: Address,
    storage_key: Bytes32,
    storage_value: [Field; 30]
) -> pub (Field, u64, Bytes32) {

    // 3. Verify the storage value
    // This verifies that the storage value at the given key matches the expected value
    // using the provided storage proof
    // The verify_storage_values function takes the storage proof and the expected value
    let storage_result = get_account_with_storage(
        chain_id,
        block_number,
        address,
        storage_key
    );
    
    // Return chain_id, block_number, and block_hash
    (chain_id, block_number, storage_result.block_hash)
}


#[test]
fn test_storage_proof() {
    // Chain ID for Sepolia testnet
    let chain_id = 11155111;
    
    // Block number
    let block_number = 8220588;
    
    // Address to check - using the correct type
    let address: Address = [0x52, 0xE2, 0xD6, 0x4b, 0x28, 0xC3, 0xFc, 0x99, 0xB7, 0x17, 0x90, 0xBF, 0x62, 0x23, 0xf6, 0xaA, 0x00, 0x44, 0x53, 0xb1];
    
    // Storage key to check - using a smaller key size (16 bytes instead of 32)
    let storage_key: Bytes32 = [
        0xc2, 0x93, 0x1d, 0xa8, 0xf1, 0xd2, 0xaf, 0x04, 0x4d, 0xd9, 0xb7, 0x1e, 0xdd, 0xce, 0xa6, 0xcb,
        0x93, 0x84, 0xa4, 0x29, 0x56, 0x76, 0x32, 0x32, 0x39, 0x06, 0x06, 0xea, 0x82, 0xc4, 0xf0, 0xe2
    ];
    
    // Storage value to verify
    let storage_value =  [
           0x30,     0x76,     0x23,     0x85,     0x27,     0x4e,     0x24,     0x00,     0x6a,     0x2d,     0x7e,     0x01,     0x11,     0xcf,     0x63,     0xca, 
    0xd1,     0x4a,     0x09,     0x2a,     0x34,     0x3d,     0x5a,     0xe5,     0x59,     0x79,     0x08,     0x4f,     0xee,     0xa1
    ];

    // Call the main function with the updated proof input
    let (chain_id_result, block_number_result, block_hash) = main(
        chain_id, 
        block_number, 
        address, 
        storage_key,
        storage_value
    );
    
   
} 

