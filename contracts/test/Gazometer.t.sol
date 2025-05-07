// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console2} from "forge-std/Test.sol";
import {Gazometer} from "../src/Gazometer.sol";

contract GazometerTest is Test {
    Gazometer public gazometer;

    function setUp() public {
        gazometer = new Gazometer(address(this), address(this));
    }

    function testByteManipulation() public {
        // Test data
        bytes32 truncatedBlockHash = bytes32(0x0066d711ec94eb0a50c28f132ac96b607fc7205eea8fb91134174a8de217ba29);
        bytes32 truncatedBobCommitment = bytes32(0x00bb81963b3222742dd1eeb45d17ffb5b285a67bafe44b878ba6ded781a8bb88);
        bytes32 truncatedAliceCommitment = bytes32(0x00cb81963b3222742dd1eeb45d17ffb5b285a67bafe44b878ba6ded781a8bb88);
        bytes32 lastBytes = bytes32(0x0000000000000000000000000000000000000000000000000000000011223344);

        // Extract bytes from lastBytes according to the pattern:
        // 0xFF000000: blockHash last byte (0x11)
        // 0xFF0000: bobCommitment last byte (0x22)
        // 0xFF00: unused (0x33)
        // 0xFF: aliceCommitment last byte (0x44)
        uint8 blockHashLastByte = uint8((uint256(lastBytes) >> 24) & 0xFF);  // 4th byte from right
        uint8 bobCommitLastByte = uint8((uint256(lastBytes) >> 16) & 0xFF);  // 3rd byte from right
        uint8 aliceCommitLastByte = uint8(uint256(lastBytes) & 0xFF);        // rightmost byte

        // Combine truncated block hash with its last byte
        bytes32 blockHash = bytes32(
            (uint256(truncatedBlockHash) << 8) | blockHashLastByte
        );

        // Combine truncated commitments with their last bytes
        bytes32 bobCommitment = bytes32(
            (uint256(truncatedBobCommitment) << 8) | bobCommitLastByte
        );

        bytes32 aliceCommitment = bytes32(
            (uint256(truncatedAliceCommitment) << 8) | aliceCommitLastByte
        );

        console2.logBytes32(truncatedBlockHash);
        console2.logBytes32(truncatedBobCommitment);
        console2.logBytes32(truncatedAliceCommitment);
        console2.logBytes32(lastBytes);
        console2.logBytes32(blockHash);
        console2.logBytes32(bobCommitment);
        console2.logBytes32(aliceCommitment);

        // Expected values (you'll need to update these with the correct expected values)
        bytes32 expectedBlockHash = bytes32(0x66d711ec94eb0a50c28f132ac96b607fc7205eea8fb91134174a8de217ba2911);
        bytes32 expectedBobCommitment = bytes32(0xbb81963b3222742dd1eeb45d17ffb5b285a67bafe44b878ba6ded781a8bb8822);
        bytes32 expectedAliceCommitment = bytes32(0xcb81963b3222742dd1eeb45d17ffb5b285a67bafe44b878ba6ded781a8bb8844);


        assertEq(blockHash, expectedBlockHash, "Block hash reconstruction failed");
        assertEq(bobCommitment, expectedBobCommitment, "Bob commit hash reconstruction failed");
        assertEq(aliceCommitment, expectedAliceCommitment, "Alice commit hash reconstruction failed");
    }
} 

