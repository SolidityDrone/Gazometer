| |
|:---:|
| ![Demo image](https://github.com/user-attachments/assets/36b6cbaf-7efb-42bf-9ae4-73c130278494) |

# Gazometer

Gazometer is a privacy-first zk payment protocol that leverages Noir Lang to integrate a simple yet effective privacy mechanic.

## Overview

The technical goal of the project is to deliver a protocol that allows users to exchange value while preserving their privacy. Privacy is maintained thanks to Noir's unique features. User identities are kept safe, and balance changes between participants don't actually happen as Ether transfers, but rather as state changes in the contract. From the outside, no one is able to tell how much is being transferred or who is participating in the transaction.

Ideally, these transactions are supposed to be relayed, but can eventually be self-relayed for demonstration purposes. The relayer RPC-Server is not included in this repository.

[![Demo video](https://img.youtube.com/vi/RnEPjEJTDDg/0.jpg)](https://www.youtube.com/watch?v=RnEPjEJTDDg)

## Project Structure

```
.
├── frontend/          # Next.js frontend application
├── oracles/          # Oracle RPC server for storage proofs
├── circuits/         # Noir circuits
│   ├── main/
│   │   ├── gazometer_p2p/
│   │   │   ├── alice_receipt/    # Circuit for Alice's transfers
│   │   │   └── bob_recursive/    # Circuit for Bob's recursive proofs
│   │   └── gazometer_self/
│   │       └── self_service/     # Circuit for deposits/withdrawals
└── contracts/        # Smart contracts
```

## Setup and Running

### Prerequisites
- Node.js and Yarn
- Noir CLI
- Barretenberg CLI

### Running the Oracle Server for circuits environment
In order to run execute and tests you will need to open a terminal and run the oracle

```bash
cd oracles
yarn install
yarn oracle-server:watch-nargo
```

### Circuit Development and Testing

#### 1. Self Service Circuit (Deposits/Withdrawals)
```bash
cd circuits/main/gazometer_self/self_service

# Execute with oracle
 nargo execute --oracle-resolver=http://127.0.0.1:5555 && cp ../../../target/self_service.* ./target/

# Generate proof
bb prove -b ./target/self_service.json -w ./target/self_service.gz -o ./target --oracle_hash keccak

# Generate verification key
bb write_vk -b ./target/self_service.json -o ./target --oracle_hash keccak

# Verify proof
bb verify -k ./target/vk -p ./target/proof --oracle_hash keccak
```

#### 2. Alice's Receipt Circuit (P2P Transfers)
```bash
cd circuits/main/gazometer_p2p/alice_receipt

# Execute with oracle
 nargo execute --oracle-resolver=http://127.0.0.1:5555 && cp ../../../target/alice_receipt.* ./target/

# Generate proof (with recursive option)
bb prove -b ./target/alice_receipt.json -w ./target/alice_receipt.gz -o ./target --oracle_hash keccak --recursive
```

#### 3. Bob's Recursive Circuit (P2P Verification)
```bash
cd circuits/main/gazometer_p2p/bob_recursive

# Execute with oracle
 nargo execute --oracle-resolver=http://127.0.0.1:5555 && cp ../../../target/bob_recursive.* ./target/

# Generate proof (with recursive and honk options)
bb prove -b ./target/bob_recursive.json -w ./target/bob_recursive.gz -o ./target --oracle_hash keccak --recursive --honk_recursion 1
```

**Important Notes:**
- Always use `--oracle_hash keccak` when generating proofs for Solidity verifiers
- For P2P circuits, always include `--recursive` flag
- For Bob's circuit, add `--honk_recursion 1` for proper recursive verification
- Keep these options consistent across all related proofs to ensure successful verification. In example if you use oracle_hash keccak flag for prove, this must be used in writing vk and during verification otherwise the proof will be invalid


## Running the frontend to play with it 
You should run this in a terminal 
```bash# Start the oracle server for next environment
yarn oracle-server:watch-next
```
and open another one to run the next project:

```bash
cd frontend
yarn install

# Start the development server
yarn run dev
```
You are supposed to follow along with next section to figue out what to do, but brielfy you should follow this path to test 

Bob Wallet to initialize a position with some `Wei`, use it to deposit more or withdraw in the self service page. 
You can Initialize Alice aswell, craft a receipt and impersonate bob again to recursively prove alice's proof.
 
## How it Works

In Gazometer, users can deposit funds to become "shielded". They can either transfer privately between other participants, or withdraw/transfer to 0xAddresses. This protocol is based on ECDSA, [Hydra](https://github.com/TaceoLabs/noir-hydra), and Noir ZK proofs.

### Initialization

Alice needs to initialize her first deposit into the protocol. To do so, she needs to compute a zk proof using `self_service/main.nr`. In this circuit, Alice will privately input her signature of a message representing her nonce into the protocol. For simplicity, we just sign the nonce number.

Without Alice's private key, no one would be able to reconstruct her signature, so we use `Keccak256(Sig("0"))` to create a commit for nonce 0. Her `Sig(0)` is then used to derive a key for Hydra. This key is needed to encrypt the BalanceCommitment. The validity of the data will be guaranteed by the circuit, therefore Commit and BalanceCommit are tied together in a mapping (`bytes32 commit => bytes32 BalanceCommit`).

**DISCLAIMER:** Remember that the first transaction will, of course, leak information on the initial deposit. No other leak is likely to happen unless Alice makes careless actions.

Once the proof is ready for use, she will proceed to transfer Ether in the `Initialize()` payable function and the Verifier will check that the proof is correct, therefore the amount must match the `msg.value`. At this point, Alice has her initial commit. This step doesn't require a relayer.

### Adding Balance, Withdrawing, or Transferring to 0xAddresses

The same circuit might be used to deposit additional balance or to withdraw. Since a state for Alice's first commitment and balance exists in the contract, we can leverage Ethereum storage proof with MPT (Merkle Patricia Tries) to validate their values. To do so, I worked with [vLayer-monorepo](https://github.com/olehmisar/vlayer-monorepo/tree/main).

Here's where the magic happens: This time, Alice will provide 2 signatures representing her current nonce (N) and previous (N-1). These are private inputs and serve to reconstruct her latest commitment and the new one she is about to create. Once we construct the `Sig(N-1)` hash commitment, we can get a verified storage value in the balanceCommit slot. Once we get this balanceCommit, we can use `Sig(N-1)` to deterministically derive her past encryption key and decrypt her current balance. Each balance commitment has, in fact, a different encryption key each time.

At this point, the circuit will calculate a valid commitment for N using `Sig(N)` as the source so we can derive a new key. Once we add or subtract the amount to her current balance, we are ready to re-encrypt the new balance commitment tied to N. Therefore, we are safe to update the states and proceed to either deposit or withdraw. Withdrawal can also be used as a form of transfer towards 0xAddresses.

There shall be no link between each commit and balance since these are used privately on Alice's end. Therefore, no one should be able to reconstruct the signatures and figure out her commits. Moreover, decrypting her balance would require brute-forcing or a more direct attack, but would only leak information of a balance at a given nonce. Since each balance has its own 256-bit key, this disincentivizes history reconstruction.

### zkTransfers

Transfers between shielded users work as private invoices. Alice computes her proof in `alice_receipt/main.nr`. Alongside the private data she needs to prove her current state and validate her next commitment, she will declare an amount which ends up as a public input in the circuit.

Once her zkProof is generated and verified in Noir_JS, she will be able in the Gazometer Dapp to generate a link for Bob. She's supposed to communicate with Bob somehow, but rather than giving Bob an address or a handle, she will give him a valid proof for an intent to change state. Bob will receive the proof and compute the same steps on his behalf, with the addition of recursively proving that Alice's proof is valid. So Bob ends up with a zkProof that contains 2 Commits, 2 BalanceCommits.

What's important here is that Alice doesn't leak to Bob any information about her past commitment, nor her initial deposit address. On top of that, from the outside, the transfer happens as state changes, therefore protecting transfer amounts and direction. No Ether is effectively transferred. But now Alice and Bob have a new current nonce with coherent balance commitments.

**NOTE:** During proof computation, we always check that commitment N-1 exists in the first place when checking its value with MPT proof.

This project for me has been challenging, but scary at the same time as I didn't know anything about Noir Lang, but became more confident as I was going. The first thing I tried to figure out was how to do Ethereum storage proof. I tried a few resources I gathered from Noir Discord / Awesome repo but at first it seemed impossible.

[`vLayer-monorepo`](https://github.com/olehmisar/vlayer-monorepo/tree/main) was discouraging as it felt overwhelming. It also wasn't up to date and contained a lot of errors both in circuits but moreover in the oracle RPC. So I hacked a while and got it to work.

I made some first attempt experiments to figure out how to write the circuit and validate its usage. Once done, I started to write the first lines and slowly managed to create `alice_receipt`. I had some trouble figuring out errors initially as figuring out how MPT really works wasn't as easy as I thought. Learned a lot about the structure of Ethereum though, very formative.

Another crucial point to the first circuit I was working on was figuring out which encryption scheme could work for my need. So I discovered `Hydra` in the awesome repo, didn't have problems in that case as the repository was recently updated and documented.

**Recap:**
- Started with no experience in Noir.
- Faced challenges with Ethereum storage proofs and vLayer.
- Learned by experimenting and debugging.
- Chose Hydra for encryption after research.

---

### Frontend proving

This wasn't really straightforward. I had quite a lot of work to do with integrating the Noir oracle foreignCall. I was repeatedly having errors due to being new to the types Noir was accepting. Figuring out correct types both in oracle RPC-Server and in the frontend when executing the circuit has been tricky, but after that I was ready for Bob.

**Recap:**
- Integrating Noir oracle was challenging.
- Type mismatches caused repeated errors.
- Eventually resolved and moved on to Bob's part.

---

### Bob's turn

Once Alice's part was complete, the next step was to figure out recursion in Noir. This wasn't really straightforward even though the concept is very easy. The docs aren't precisely up to date in that case, so it required some major effort into researching around repositories.

Eventually, I figured out which version of Noir_js to use for recursion. From the quickstart I was on 0.76, but I found that other people were using aztec-bb.js 0.82.x for that purpose, so I managed to figure out how to obtain `vkAsField`, `proofAsField`.

**Recap:**
- Recursion in Noir was hard due to outdated docs.
- Required research and version management.
- Solved by switching to the right Noir_js version.

---

### Ending where I should have started

Once I was confident, I created the `self_service` circuit, which would be used for deposit/withdrawals. No big issues apart from classic type mismanagement. But it was the easy part as the circuit wasn't very different from `alice_receipt` in the first place.

**Recap:**
- Created `self_service` circuit for deposits/withdrawals.
- Fewer issues after previous experience.

---

### 
Refactoring return values.. I was returning different types such a u64, u8: 32, bytes32 and Address types ( some from vLayer lib). The problem arised when i figured out i should have returned Fields. The conversion was hard to refactor as i wasnt fully understanding why the values were uncorrect. This mostly cause Field isnt a full 256-bit value, but rather 254 and converting 32 bytes cause incostincies.. So once i figured out i had to slice the last byte off the values i had to return, create a new field that contained the last bytes and reconstruct the commit hash and block hash i needed onchain. Very tricky to figure out what wasnt going on, a good reminder to read well docs before starting to code :)

### Overall

Solo development sometimes can be overwhelming. This project monorepo contained 4 different repos and they were all interconnected. When working with zkProof, a small mismatch will break the flow and that happened many times. Many hours spent researching, testing, debugging, etc. Frankly, it was both fun and stressful, but one week later I'm definitely enriched in the zk field, which I'm new to.

**Recap:**
- Solo development was challenging but rewarding.
- Many hours spent on research and debugging.
- Gained significant zk knowledge.

---

## Future upgrades

- **Compliance Layer:** As mentioned, compliance layer is the most important part for a project of this kind. So if I ever get to keep on working on this, I would definitely focus on a good UX to comply at best.
- **Optimization, vulnerability discoveries:** I'm not a cryptographer. This project most likely contains bad practices under the hood with unconstrained functions. But this would be a critical part to address, as in the Ethereum world, optimization is not optional and carefully reviewing code and math quality to avoid unexpected vulnerabilities would be the most crucial one. Proving time is also a factor in UX and on-chain costs.
- **Interact with contracts:** One thing I had in mind initially, but was far from my time constraint, was to add the ability to directly transact within the protocol towards other contracts. The design I had in mind was to create a factory to deploy smart accounts tied to the commitments, so that we could eventually verify the proof on the main contract and then execute the public output calldata to the SA and transact from it. This could have been useful as interacting with some external protocol without withdrawing and then using EOA could be an option for users. To avoid risk in the main contract, smart accounts tied to the commitment could have been an option to do so. This might be more interesting to look into after Pectra via 7702.
- **Dapp:** Simply improving the application to have a better UX/UI.

## Disclaimer

This project was built during NoirHack as an experimental demonstration.  
**It is not production-ready and contains known (and possibly unknown) vulnerabilities.**  
The code is provided "as is", without warranty of any kind, express or implied.  
**Use at your own risk.**  
The author(s) accept no responsibility or liability for any damages, losses, or other issues arising from the use, misuse, or inability to use this code, in whole or in part.

---

*Happy hacking!*
