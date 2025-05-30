use crate::header::get_header;
use crate::merkle_patricia_proofs::proof::{Proof, ProofInput};
use crate::misc::{option::make_option, types::{Address, Bytes32}};
use crate::serde::{Serde, TX_PROOF_INPUT_LEN_M};
use crate::verifiers::transaction::verify_tx;
use std::mem::zeroed;

global MAX_KEY_LEN: u32 = 3;
global MAX_PREFIXED_KEY_NIBBLE_LEN: u32 = 8; // (MAX_KEY_LEN + 1) * 2
global MAX_DEPTH_NO_LEAF: Field = 6;
// Create a u32 version for use in type parameters
global MAX_DEPTH_NO_LEAF_U32: u32 = 6;

global MAX_VALUE_LEN_M: Field = 1000; // Values taken from txProofConfigM in tx.ts.
global MAX_LEAF_LEN_M: Field = 1011;
// Create u32 versions for use in type parameters
global MAX_VALUE_LEN_M_U32: u32 = 1000;
global MAX_LEAF_LEN_M_U32: u32 = 1011;

global MAX_TX_ENCODED_LEN_M: Field = MAX_VALUE_LEN_M;
// Create a u32 version
global MAX_TX_ENCODED_LEN_M_U32: u32 = 1000;

// Add MAX_DATA_LEN constant
global MAX_DATA_LEN: u32 = 1024; // Maximum length of transaction data

pub type TxType = u8;

pub struct TxPartial<let MAX_DATA_LEN: u32> {
    pub nonce: u64,
    pub gas_limit: u64,
    pub to: Option<Address>,
    pub value: U128,
    pub data: BoundedVec<u8, MAX_DATA_LEN>,
    pub v: u8, // ECDSA recovery id
    pub r: Bytes32, // ECDSA signature part
    pub s: Bytes32, // ECDSA signature part
}

impl<let MAX_DATA_LEN: u32> Eq for TxPartial<MAX_DATA_LEN> {
    fn eq(self, other: Self) -> bool {
        (self.nonce == other.nonce)
            & (self.gas_limit == other.gas_limit)
            & (self.to == other.to)
            & (self.value == other.value)
            & (self.data == other.data)
            & (self.v == other.v)
            & (self.r == other.r)
            & (self.s == other.s)
    }
}

struct ForeignCallTransaction<let MAX_DATA_LEN: u32> {
    nonce: u64,
    gas_limit: u64,
    to: Address,
    to_is_some: bool,
    value_hi: u64,
    value_lo: u64,
    data: [u8; MAX_DATA_LEN],
    data_len: u32,
    v: u8, // ECDSA recovery id
    r: Bytes32, // ECDSA signature part
    s: Bytes32, // ECDSA signature part
}

impl<let MAX_DATA_LEN: u32> From<TxPartial<MAX_DATA_LEN>> for ForeignCallTransaction<MAX_DATA_LEN> {
    fn from(tx: TxPartial<MAX_DATA_LEN>) -> Self {
        let mut data = [0; MAX_DATA_LEN];

        for i in 0..MAX_DATA_LEN {
            if (i < tx.data.len) {
                data[i] = tx.data.storage[i];
            }
        }
        ForeignCallTransaction {
            nonce: tx.nonce,
            gas_limit: tx.gas_limit,
            to: tx.to.unwrap_or(std::mem::zeroed()),
            to_is_some: tx.to.is_some(),
            value_hi: tx.value.hi as u64,
            value_lo: tx.value.lo as u64,
            data,
            data_len: tx.data.len,
            v: tx.v,
            r: tx.r,
            s: tx.s,
        }
    }
}

impl<let MAX_DATA_LEN: u32> From<ForeignCallTransaction<MAX_DATA_LEN>> for TxPartial<MAX_DATA_LEN> {
    fn from(tx: ForeignCallTransaction<MAX_DATA_LEN>) -> Self {
        let data = BoundedVec { storage: tx.data, len: tx.data_len };
        TxPartial {
            nonce: tx.nonce,
            gas_limit: tx.gas_limit,
            to: make_option(tx.to, tx.to_is_some),
            value: U128::from_u64s_be(tx.value_hi as u64, tx.value_lo as u64),
            data,
            v: tx.v,
            r: tx.r,
            s: tx.s,
        }
    }
}

type ProofInputSerialized<let LEN: u32> = [Field; LEN];

pub struct TransactionWithinBlock<let MAX_DATA_LEN: u32> {
    pub transaction: TxPartial<MAX_DATA_LEN>,
    pub block_hash: Bytes32,
}

pub fn get_transaction(
    chain_id: Field,
    block_number: u64,
    tx_idx: Field,
) -> TransactionWithinBlock<MAX_DATA_LEN> {
    let (tx_type, transaction, proof_input) =
        unsafe { get_transaction_unconstrained_M(chain_id, block_number, tx_idx) };
    let header = unsafe { get_header(chain_id, block_number) };
    verify_tx(
        tx_idx,
        tx_type,
        transaction,
        proof_input,
        header.transactions_root,
    );

    TransactionWithinBlock { transaction, block_hash: header.hash }
}

#[oracle(get_transaction)]
unconstrained fn get_transaction_oracle<let MAX_DATA_LEN: u32, let PROOF_INPUT_LEN: u32>(
    _chain_id: Field,
    _block_number: u64,
    _tx_idx: Field,
) -> (TxType, ForeignCallTransaction<MAX_DATA_LEN>, ProofInputSerialized<PROOF_INPUT_LEN>) {}

pub(crate) unconstrained fn get_transaction_unconstrained_M(
    chain_id: Field,
    block_number: u64,
    tx_idx: Field,
) -> (TxType, TxPartial<MAX_DATA_LEN>, ProofInput<MAX_PREFIXED_KEY_NIBBLE_LEN, MAX_VALUE_LEN_M_U32, MAX_DEPTH_NO_LEAF_U32, MAX_LEAF_LEN_M_U32>) {
    let (tx_type, transaction, proof_input): (TxType, ForeignCallTransaction<MAX_DATA_LEN>, ProofInputSerialized<TX_PROOF_INPUT_LEN_M>) =
        unsafe { get_transaction_oracle(chain_id, block_number, tx_idx) };
    let transaction: TxPartial<MAX_DATA_LEN> = unsafe { transaction.into() };
    let proof_input = unsafe { Serde::deserialize(proof_input) };

    (tx_type, transaction, proof_input)
}
