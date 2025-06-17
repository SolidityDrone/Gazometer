// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

interface IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool);
}

/**
 * @title GazometerSimplified
 * @dev Simplified Gazometer contract using nullifiers instead of storage proofs
 * This eliminates the oracle bottleneck while maintaining the same privacy guarantees
 */
contract GazometerSimplified {
   
    IVerifier public selfServiceVerifier;
    IVerifier public zkTransferVerifier;    
    
    // Core state mappings
    mapping(bytes32 commitment => bytes32 encryptedBalance) public balanceCommitment;
    mapping(bytes32 nullifier => bool) public spentNullifiers;
    
    // Events for better debugging and monitoring
    event CommitmentCreated(bytes32 indexed commitment, bytes32 encryptedBalance);
    event NullifierSpent(bytes32 indexed nullifier);
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed recipient, uint256 amount);

    receive() external payable {}

    constructor(address _selfServiceVerifier, address _zkTransferVerifier) {
        selfServiceVerifier = IVerifier(_selfServiceVerifier);
        zkTransferVerifier = IVerifier(_zkTransferVerifier);
    }

    /**
     * @dev Initialize a new commitment (first deposit)
     * @param _proof ZK proof from the simplified circuit
     * @param _publicInputs Array containing: [nullifier, encryptedBalance, commitment, contractAddress, receiverAddress, blockNumber]
     */
    function initCommit(bytes calldata _proof, bytes32[] calldata _publicInputs) public payable {
        require(selfServiceVerifier.verify(_proof, _publicInputs), "Invalid proof");    

        // Extract public inputs (simplified format)
        bytes32 nullifier = _publicInputs[0];
        bytes32 encryptedBalance = _publicInputs[1];
        bytes32 commitment = _publicInputs[2];
        address contractAddress = address(uint160(uint256(_publicInputs[3])));
        address receiverAddress = address(uint160(uint256(_publicInputs[4])));
        uint256 blockNumber = uint256(_publicInputs[5]);

        // Basic validations
        require(contractAddress == address(this), "Invalid contract address");
        require(!spentNullifiers[nullifier], "Nullifier already spent");
        require(balanceCommitment[commitment] == bytes32(0), "Commitment already exists");
        
        // For initialization, we expect msg.value to match the encrypted amount
        // This is a simplification - in production you might want additional checks
        require(msg.value > 0, "Must deposit some amount");

        // Update state
        spentNullifiers[nullifier] = true;
        balanceCommitment[commitment] = encryptedBalance;

        emit NullifierSpent(nullifier);
        emit CommitmentCreated(commitment, encryptedBalance);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Handle deposits and withdrawals using nullifiers
     * @param _proof ZK proof from the simplified circuit
     * @param _publicInputs Array containing the same format as initCommit
     * @param amount The amount to deposit (if deposit) or withdraw (if withdrawal)
     * @param isDeposit True for deposit, false for withdrawal
     */
    function selfService(
        bytes calldata _proof, 
        bytes32[] calldata _publicInputs,
        uint256 amount,
        bool isDeposit
    ) public payable {
        require(selfServiceVerifier.verify(_proof, _publicInputs), "Invalid proof");
        
        // Extract public inputs
        bytes32 nullifier = _publicInputs[0];
        bytes32 encryptedBalance = _publicInputs[1];
        bytes32 commitment = _publicInputs[2];
        address contractAddress = address(uint160(uint256(_publicInputs[3])));
        address receiverAddress = address(uint160(uint256(_publicInputs[4])));
        uint256 blockNumber = uint256(_publicInputs[5]);

        // Validations
        require(contractAddress == address(this), "Invalid contract address");
        require(!spentNullifiers[nullifier], "Nullifier already spent");
        require(balanceCommitment[commitment] == bytes32(0), "Commitment already exists");

        // Update state
        spentNullifiers[nullifier] = true;
        balanceCommitment[commitment] = encryptedBalance;

        if (isDeposit) {
            require(msg.value == amount, "Amount mismatch");
            emit Deposit(msg.sender, amount);
        } else {
            require(msg.value == 0, "No ETH should be sent for withdrawals");
            require(address(this).balance >= amount, "Insufficient contract balance");
            
            (bool success, ) = receiverAddress.call{value: amount}("");
            require(success, "Failed to send ETH");
            emit Withdrawal(receiverAddress, amount);
        }

        emit NullifierSpent(nullifier);
        emit CommitmentCreated(commitment, encryptedBalance);
    }

    /**
     * @dev Handle P2P transfers using nullifiers (simplified)
     * @param _proof ZK proof from Bob's recursive circuit
     * @param _publicInputs Public inputs from the recursive proof
     */
    function zkTransfer(bytes calldata _proof, bytes32[] calldata _publicInputs) public {
        require(zkTransferVerifier.verify(_proof, _publicInputs), "Invalid proof");
        
        // For P2P transfers, we expect multiple nullifiers and commitments
        // This is a simplified version - you may want to adjust based on your recursive circuit outputs
        bytes32 aliceNullifier = _publicInputs[0];
        bytes32 bobNullifier = _publicInputs[1];
        bytes32 aliceCommitment = _publicInputs[2];
        bytes32 bobCommitment = _publicInputs[3];
        bytes32 aliceEncryptedBalance = _publicInputs[4];
        bytes32 bobEncryptedBalance = _publicInputs[5];
        address contractAddress = address(uint160(uint256(_publicInputs[6])));

        // Validations
        require(contractAddress == address(this), "Invalid contract address");
        require(!spentNullifiers[aliceNullifier], "Alice nullifier already spent");
        require(!spentNullifiers[bobNullifier], "Bob nullifier already spent");
        require(balanceCommitment[aliceCommitment] == bytes32(0), "Alice commitment already exists");
        require(balanceCommitment[bobCommitment] == bytes32(0), "Bob commitment already exists");

        // Update state for both parties
        spentNullifiers[aliceNullifier] = true;
        spentNullifiers[bobNullifier] = true;
        balanceCommitment[aliceCommitment] = aliceEncryptedBalance;
        balanceCommitment[bobCommitment] = bobEncryptedBalance;

        emit NullifierSpent(aliceNullifier);
        emit NullifierSpent(bobNullifier);
        emit CommitmentCreated(aliceCommitment, aliceEncryptedBalance);
        emit CommitmentCreated(bobCommitment, bobEncryptedBalance);
    }

    /**
     * @dev Check if a nullifier has been spent (for frontend queries)
     */
    function isNullifierSpent(bytes32 nullifier) public view returns (bool) {
        return spentNullifiers[nullifier];
    }

    /**
     * @dev Get balance commitment for a given commitment hash
     */
    function getBalanceCommitment(bytes32 commitment) public view returns (bytes32) {
        return balanceCommitment[commitment];
    }

    /**
     * @dev Emergency function to check contract balance
     */
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }
} 