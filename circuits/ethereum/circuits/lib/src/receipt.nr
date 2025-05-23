use crate::header::get_header;
use crate::merkle_patricia_proofs::proof::{Proof, ProofInput};
use crate::misc::{
    bytes::byte_value,
    fragment::Fragment,
    option::make_option,
    types::{Address, Bytes32},
};
use crate::serde::Serde;
use crate::verifiers::{receipt::verify_receipt, tx_helpers::split::split_into_tx_type_and_rlp};
use crate::constants::{SR_MAX_DEPTH_NO_LEAF, SR_MAX_PREFIXED_KEY_NIBBLE_LEN, SR_MAX_LEAF_LEN_M, SR_MAX_VALUE_LEN_M};
use dep::std::mem::zeroed;

global BLOOM_FILTER_LEN: u32 = 256;

global MAX_KEY_LEN: u32 = 3;
global MAX_DEPTH_NO_LEAF: u32 = SR_MAX_DEPTH_NO_LEAF;
global MAX_PREFIXED_KEY_NIBBLE_LEN: u32 = SR_MAX_PREFIXED_KEY_NIBBLE_LEN;

global MAX_VALUE_LEN_M: Field = SR_MAX_VALUE_LEN_M as Field;
global MAX_LEAF_LEN_M: Field = SR_MAX_LEAF_LEN_M as Field;

global MAX_VALUE_LEN_M_U32: u32 = MAX_VALUE_LEN_M as u32;
global MAX_LEAF_LEN_M_U32: u32 = MAX_LEAF_LEN_M as u32;

global MAX_RECEIPT_ENCODED_LEN_M: Field = MAX_VALUE_LEN_M;
global MAX_RECEIPT_RLP_LEN_M: Field = MAX_RECEIPT_ENCODED_LEN_M - 1;

global MAX_RECEIPT_ENCODED_LEN_M_U32: u32 = MAX_VALUE_LEN_M_U32;
global MAX_RECEIPT_RLP_LEN_M_U32: u32 = MAX_RECEIPT_ENCODED_LEN_M_U32 - 1;

pub type TxType = u8;

pub struct TxReceiptPartial {
    pub status: Option<u1>,
    pub state_root: Option<Bytes32>,
    pub cumulative_gas_used: u32,
    pub logs_bloom: [u8; BLOOM_FILTER_LEN],
}

impl Eq for TxReceiptPartial {
    fn eq(self, other: Self) -> bool {
        (self.status == other.status)
            & (self.state_root == other.state_root)
            & (self.cumulative_gas_used == other.cumulative_gas_used)
            & (self.logs_bloom == other.logs_bloom)
    }
}

struct ForeignCallTxReceiptPartial {
    status: u1,
    status_is_some: bool,
    state_root: Bytes32,
    state_root_is_some: bool,
    cumulative_gas_used: u32,
    logs_bloom: [u8; BLOOM_FILTER_LEN],
}

impl From<ForeignCallTxReceiptPartial> for TxReceiptPartial {
    fn from(receipt: ForeignCallTxReceiptPartial) -> Self {
        TxReceiptPartial {
            status: make_option(receipt.status, receipt.status_is_some),
            state_root: make_option(receipt.state_root, receipt.state_root_is_some),
            cumulative_gas_used: receipt.cumulative_gas_used,
            logs_bloom: receipt.logs_bloom,
        }
    }
}

impl From<TxReceiptPartial> for ForeignCallTxReceiptPartial {
    fn from(receipt: TxReceiptPartial) -> Self {
        ForeignCallTxReceiptPartial {
            status: receipt.status.unwrap_or(std::mem::zeroed()),
            status_is_some: receipt.status.is_some(),
            state_root: receipt.state_root.unwrap_or(std::mem::zeroed()),
            state_root_is_some: receipt.state_root.is_some(),
            cumulative_gas_used: receipt.cumulative_gas_used,
            logs_bloom: receipt.logs_bloom,
        }
    }
}

type ProofInputSerialized<let LEN: u32> = [Field; LEN];

pub struct TxReceiptWithinBlock {
    pub receipt: TxReceiptPartial,
    pub block_hash: Bytes32,
}

pub fn get_receipt(chain_id: Field, block_number: u64, tx_idx: Field) -> TxReceiptWithinBlock {
    let (tx_type, receipt, proof_input) =
        unsafe { get_receipt_unconstrained_M(chain_id, block_number, tx_idx) };
    let header = unsafe { get_header(chain_id, block_number) };
    verify_receipt(
        block_number,
        tx_idx,
        tx_type,
        receipt,
        proof_input,
        header.receipts_root,
    );
    TxReceiptWithinBlock { receipt, block_hash: header.hash }
}

#[oracle(get_receipt)]
unconstrained fn get_receipt_oracle<let PROOF_INPUT_LEN: u32>(
    _chain_id: Field,
    _block_number: u64,
    _tx_idx: Field,
) -> (TxType, ForeignCallTxReceiptPartial, ProofInputSerialized<PROOF_INPUT_LEN>) {}

pub(crate) unconstrained fn get_receipt_unconstrained_M(
    chain_id: Field,
    block_number: u64,
    tx_idx: Field,
) -> (TxType, TxReceiptPartial, ProofInput<MAX_PREFIXED_KEY_NIBBLE_LEN, MAX_VALUE_LEN_M_U32, MAX_DEPTH_NO_LEAF, MAX_LEAF_LEN_M_U32>) {
    let (tx_type, receipt, proof_input) = unsafe { get_receipt_oracle(chain_id, block_number, tx_idx) };

    let receipt = TxReceiptPartial {
        status: make_option(receipt.status, receipt.status_is_some),
        state_root: make_option(receipt.state_root, receipt.state_root_is_some),
        cumulative_gas_used: receipt.cumulative_gas_used,
        logs_bloom: receipt.logs_bloom,
    };
    let proof_input = unsafe { Serde::deserialize(proof_input) };

    (tx_type, receipt, proof_input)
}

pub(crate) fn receipt_rlp_from_proof<let MAX_VALUE_LEN: u32, let MAX_LEAF_LEN: u32>(
    tx_type: TxType,
    receipt_proof_input: ProofInput<MAX_PREFIXED_KEY_NIBBLE_LEN, MAX_VALUE_LEN, MAX_DEPTH_NO_LEAF, MAX_LEAF_LEN>,
) -> Fragment<MAX_VALUE_LEN, u8> {
    let value = byte_value(receipt_proof_input.value);
    let encoded_receipt = Fragment::from_vec(value);

    let is_legacy = tx_type == 0;
    let (_actual_tx_type, receipt_rlp) = split_into_tx_type_and_rlp(is_legacy, encoded_receipt);

    receipt_rlp
}
