use crate::misc::types::Bytes32;
use crate::verifiers::header::verify_header;
use crate::misc::{fragment::Fragment, types::{BYTES32_LENGTH, ADDRESS_LENGTH, Address}};
use crate::uint256::U256;
use crate::merkle_patricia_proofs::proof::{ProofInput, Proof, Node, Leaf, MAX_NODE_LEN};
use crate::rlp::types::RlpFragment;
use dep::std::mem::zeroed;

global MAX_HEADER_RLP_LEN: u32 = 708;

pub struct BlockHeaderPartial {
    pub number: u64,
    pub hash: Bytes32,
    pub state_root: Bytes32,
    pub transactions_root: Bytes32,
    pub receipts_root: Bytes32,
}

pub type BlockHeaderRlp = BoundedVec<u8, MAX_HEADER_RLP_LEN>;

pub fn get_header(chain_id: Field, block_number: u64) -> BlockHeaderPartial {
    let (block_header_partial, block_header_rlp) = unsafe { get_header_unconstrained(chain_id, block_number) };
    verify_header(chain_id, block_header_partial, block_header_rlp);
    assert(block_header_partial.number == block_number, "Block number does not match the argument");
    block_header_partial
}

#[oracle(get_header)]
unconstrained fn get_header_oracle(_chain_id: Field, _block_no: u64) -> (BlockHeaderPartial, BlockHeaderRlp) {}

unconstrained fn get_header_unconstrained(chain_id: Field, block_no: u64) -> (BlockHeaderPartial, BlockHeaderRlp) {
    unsafe { get_header_oracle(chain_id, block_no) }
}

fn alter_array(bytes: [Field; 32]) -> [u8; 32] {
    let mut result: [u8; 32] = zeroed();
    for i in 0..32 {
        result[i] = bytes[i] as u8;
    }
    result
}
