// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "./interfaces/IGazometer.sol";



interface IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool);
}

contract Gazometer is IGazometer {
   
    IVerifier public selfServiceVerifier;
    IVerifier public zkTransferVerifier;    
    mapping(bytes32 commitment => bytes32 encryptedBalance) public balanceCommitment;

    receive() external payable {}

    constructor(address _selfServiceVerifier, address _zkTransferVerifier) {
        selfServiceVerifier = IVerifier(_selfServiceVerifier);
        zkTransferVerifier = IVerifier(_zkTransferVerifier);
    }

    function initCommit(bytes calldata _proof, bytes32[] calldata _publicInputs) public payable {
        require(selfServiceVerifier.verify(_proof, _publicInputs), "SendVerifier: Invalid proof");    

        uint256 chainId = uint256(_publicInputs[0]);
        uint256 blockNumber = uint256(_publicInputs[1]);
        uint256 amount = uint256(_publicInputs[2]);
        bool isDeposit = uint256(_publicInputs[3]) != 0;

        bytes32 truncatedBlockHash = _publicInputs[4];  // 31 bytes
        bytes32 encryptedBalance = _publicInputs[5];
        bytes32 truncatedCommitment = _publicInputs[6];  // 31 bytes
        address contractAddress = address(uint160(uint256(_publicInputs[7])));
        address receiverAddress = address(uint160(uint256(_publicInputs[8])));
        bytes32 lastBytes = _publicInputs[9];

        // Extract both bytes from lastBytes
        uint8 blockHashLastByte = uint8((uint256(lastBytes) >> 8) & 0xFF);  // 0xaa
        uint8 commitLastByte = uint8(uint256(lastBytes) & 0xFF);  // 0x9c

        // Combine truncated block hash with its last byte
        bytes32 blockHash = bytes32(
            (uint256(truncatedBlockHash) << 8) | blockHashLastByte
        );

        // Combine truncated commitment with its last byte
        bytes32 commitment = bytes32(
            (uint256(truncatedCommitment) << 8) | commitLastByte
        );

        require(msg.value == amount, "SendVerifier: Amount mismatch");
        require(chainId == block.chainid, "SendVerifier: Invalid chain id");
        require(contractAddress == address(this), "SendVerifier: Invalid contract address");
        require(balanceCommitment[commitment] == bytes32(0), "Commit nullified");
        balanceCommitment[commitment] = encryptedBalance; // even tho is known here the first time
    }


    function selfService(bytes calldata _proof, bytes32[] calldata _publicInputs) public payable {
        require(selfServiceVerifier.verify(_proof, _publicInputs), "SelfServiceVerifier: Invalid proof");
        
        uint256 chainId = uint256(_publicInputs[0]);
        uint256 blockNumber = uint256(_publicInputs[1]);
        uint256 amount = uint256(_publicInputs[2]);
        bool isDeposit = uint256(_publicInputs[3]) != 0;

        bytes32 truncatedBlockHash = _publicInputs[4];  // 31 bytes
    
        bytes32 encryptedBalance = _publicInputs[5];
        bytes32 truncatedCommitment = _publicInputs[6];  // 31 bytes
        address contractAddress = address(uint160(uint256(_publicInputs[7])));
        address receiverAddress = address(uint160(uint256(_publicInputs[8])));
        bytes32 lastBytes = _publicInputs[9];

        // Extract both bytes from lastBytes
        uint8 blockHashLastByte = uint8((uint256(lastBytes) >> 8) & 0xFF);  // 0xaa
        uint8 commitLastByte = uint8(uint256(lastBytes) & 0xFF);  // 0x9c

        // Combine truncated block hash with its last byte
        bytes32 blockHash = bytes32(
            (uint256(truncatedBlockHash) << 8) | blockHashLastByte
        );

        // Combine truncated commitment with its last byte
        bytes32 commitment = bytes32(
            (uint256(truncatedCommitment) << 8) | commitLastByte
        );

        require(balanceCommitment[commitment] == bytes32(0), "Commit nullified");
        require(uint(chainId) == block.chainid, "SelfServiceVerifier: Invalid chain id");
        require(_verifyBlockHash(blockHash, blockNumber), "SelfServiceVerifier: Invalid block hash");
        balanceCommitment[commitment] = encryptedBalance;
       

        
        if (isDeposit) {
            require(msg.value == amount, "SelfServiceVerifier: Amount mismatch");
        } else {
             (bool success, ) = address(receiverAddress).call{value: amount}("");
             require(success, "Failed to send ether");
        }
    }


    function zkTransfer(bytes calldata _proof, bytes32[] calldata _publicInputs) public {
        require(zkTransferVerifier.verify(_proof, _publicInputs), "zkTransferVerifier: Invalid proof");
        uint256 chainId = uint256(_publicInputs[0]);
        
        uint256 blockNumber = uint256(_publicInputs[1]);
        address contractAddress = address(uint160(uint256(_publicInputs[2])));
        bytes32 truncatedBlockHash = _publicInputs[3];
        bytes32 bobEncryptedBalance = _publicInputs[4];
        bytes32 truncatedBobCommitment = _publicInputs[5];
        bytes32 aliceEncryptedBalance = _publicInputs[6];
        bytes32 truncatedAliceCommitment = _publicInputs[7];
        bytes32 lastBytes = _publicInputs[8];

        // Extract bytes from lastBytes according to the pattern:
        // 0xFF000000: blockHash last byte
        // 0xFF0000: bobCommitment last byte
        // 0xFF00: unused
        // 0xFF: aliceCommitment last byte
        uint8 blockHashLastByte = uint8((uint256(lastBytes) >> 24) & 0xFF);  // 4th byte from right
        uint8 bobCommitLastByte = uint8((uint256(lastBytes) >> 16) & 0xFF);  // 3rd byte from right
        uint8 aliceCommitLastByte = uint8(uint256(lastBytes) & 0xFF);        // rightmost byte

        // Combine truncated block hash with its last byte
        bytes32 blockHash = bytes32(
            (uint256(truncatedBlockHash) << 8) | blockHashLastByte
        );

        // Combine truncated commitment with its last byte
        bytes32 bobCommitment = bytes32(
            (uint256(truncatedBobCommitment) << 8) | bobCommitLastByte
        );  

        bytes32 aliceCommitment = bytes32(
            (uint256(truncatedAliceCommitment) << 8) | aliceCommitLastByte
        );  

        require(chainId == block.chainid, "SelfServiceVerifier: Invalid chain id");
        require(_verifyBlockHash(blockHash, blockNumber), "SelfServiceVerifier: Invalid block hash");
        require(contractAddress == address(this), "zkTransfer: Invalid contract address");
        require(balanceCommitment[aliceCommitment] == bytes32(0), "Alice commit is nullified");
        require(balanceCommitment[bobCommitment] == bytes32(0), "Bob commit is nullified");
        balanceCommitment[bobCommitment] = bobEncryptedBalance;
        balanceCommitment[aliceCommitment] = aliceEncryptedBalance;

        // transfer happens in state changes, due to this zk mechanic no transfer is executed in the stack 
    }

    function _verifyBlockHash(bytes32 blockHash, uint256 blockNumber) internal view returns (bool) {
        return blockHash == blockhash(blockNumber);
    }

    function getBalanceCommitment(bytes32 commitment) public view returns (bytes32) {
        return balanceCommitment[commitment];
    }   
}
