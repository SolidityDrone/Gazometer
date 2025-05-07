export const GAZOMETER_ABI = [
    {
        "inputs": [
            {
                "internalType": "bytes",
                "name": "_proof",
                "type": "bytes"
            },
            {
                "internalType": "bytes32[]",
                "name": "_publicInputs",
                "type": "bytes32[]"
            }
        ],
        "name": "initCommit",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes",
                "name": "_proof",
                "type": "bytes"
            },
            {
                "internalType": "bytes32[]",
                "name": "_publicInputs",
                "type": "bytes32[]"
            }
        ],
        "name": "selfService",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "commitment",
                "type": "bytes32"
            },
            {
                "internalType": "bytes32",
                "name": "balanceData",
                "type": "bytes32"
            }
        ],
        "name": "setBalanceCommitment",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "nullifier",
                "type": "bytes32"
            }
        ],
        "name": "setNullifier",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_selfServiceVerifier",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_sendVerifier",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_zkTransferVerifier",
                "type": "address"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "commitment",
                "type": "bytes32"
            }
        ],
        "name": "ShieldedEth",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "nullifier",
                "type": "bytes32"
            }
        ],
        "name": "Transacted",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "nullifier",
                "type": "bytes32"
            }
        ],
        "name": "UnshieldedEth",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "bytes",
                "name": "_proof",
                "type": "bytes"
            },
            {
                "internalType": "bytes32[]",
                "name": "_publicInputs",
                "type": "bytes32[]"
            }
        ],
        "name": "zkTransfer",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "nullifier",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "innerCommitment",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "receiverInnerCommitment",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "reciverNullifier",
                "type": "bytes32"
            }
        ],
        "name": "ZkTransfer",
        "type": "event"
    },
    {
        "stateMutability": "payable",
        "type": "receive"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "commitment",
                "type": "bytes32"
            }
        ],
        "name": "balanceCommitment",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "encryptedBalance",
                "type": "bytes32"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "commitment",
                "type": "bytes32"
            }
        ],
        "name": "getBalanceCommitment",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "nullifier",
                "type": "bytes32"
            }
        ],
        "name": "getNullifier",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "name": "nullifiers",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "selfServiceVerifier",
        "outputs": [
            {
                "internalType": "contract IVerifier",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "zkTransferVerifier",
        "outputs": [
            {
                "internalType": "contract IVerifier",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const; 