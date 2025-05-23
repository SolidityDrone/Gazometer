// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IGazometer {
    // Core functions
    function initCommit(bytes calldata _proof, bytes32[] calldata _publicInputs) external payable;
    function selfService(bytes calldata _proof, bytes32[] calldata _publicInputs) external payable;
    function zkTransfer(bytes calldata _proof, bytes32[] calldata _publicInputs) external;

    // Helper functions
    function getBalanceCommitment(bytes32 commitment) external view returns (bytes32);

}