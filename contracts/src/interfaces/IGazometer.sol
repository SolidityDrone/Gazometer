// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IGazometer {
    // Core functions
    function initCommit(bytes calldata _proof, bytes32[] calldata _publicInputs) external payable;
    function selfService(bytes calldata _proof, bytes32[] calldata _publicInputs) external payable;
    function zkTransfer(bytes calldata _proof, bytes32[] calldata _publicInputs) external;

    // Helper functions
    function getBalanceCommitment(bytes32 commitment) external view returns (bytes32);
    function getNullifier(bytes32 nullifier) external view returns (bool);

    // Events
    event ShieldedEth(address indexed sender, bytes32 commitment);
    event UnshieldedEth(address indexed sender, bytes32 nullifier);
    event Transacted(address indexed sender, bytes32 nullifier);
    event ZkTransfer(
        address indexed sender, 
        bytes32 nullifier, 
        bytes32 innerCommitment, 
        bytes32 receiverInnerCommitment, 
        bytes32 reciverNullifier
    );
}