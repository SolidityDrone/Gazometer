use crate::misc::types::Bytes32;
use crate::account::MAX_PREFIXED_KEY_NIBBLE_LEN;
use crate::account_with_storage::{MAX_STORAGE_VALUE_LEN, MAX_STORAGE_LEAF_LEN};
use crate::merkle_patricia_proofs::proof::{ProofInput, verify_merkle_proof};
use crate::header::{BlockHeaderPartial, get_header};

pub fn verify_storage_values<let N: u32, let MAX_STORAGE_DEPTH_NO_LEAF: u32>(
    proof_inputs: [ProofInput<MAX_PREFIXED_KEY_NIBBLE_LEN, MAX_STORAGE_VALUE_LEN, MAX_STORAGE_DEPTH_NO_LEAF, MAX_STORAGE_LEAF_LEN>; N],
    storage_root: Bytes32
) {
    for i in 0..N {
        let proof_input = proof_inputs[i];
        verify_merkle_proof(
            proof_input.key,
            proof_input.value,
            storage_root,
            proof_input.proof
        );
    }
}

pub fn verify_storage_values_against_block<let N: u32, let MAX_STORAGE_DEPTH_NO_LEAF: u32>(
    chain_id: Field,
    block_number: u64,
    proof_inputs: [ProofInput<MAX_PREFIXED_KEY_NIBBLE_LEN, MAX_STORAGE_VALUE_LEN, MAX_STORAGE_DEPTH_NO_LEAF, MAX_STORAGE_LEAF_LEN>; N],
    storage_root: Bytes32
) {

    let header = unsafe { get_header(chain_id, block_number) };
    
    assert(header.number == block_number, "Block number mismatch in storage verification");
    
    verify_storage_values(proof_inputs, storage_root);
}
