// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/Gazometer.sol";

contract DeployGazometerScript is Script {
    function run() public {
        
        vm.startBroadcast();
        address selfServiceVerifier = address(0x0F254A1759346B526Bc6B052e008905221F34C17);
        address zkTransferVerifier = address(0x18D634E4D1F50dC6b3064a74b88b3b91A1E3644f);
        Gazometer gazometer = new Gazometer(
            selfServiceVerifier, // Using same verifier for send as it's not used in the contract
            zkTransferVerifier
        );

        vm.stopBroadcast();
        console.log("Gazometer deployed to:", address(gazometer));
    }
} 