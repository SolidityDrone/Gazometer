# Gazometer

Gazometer is a privacy-first zk-payment protocol that leverages Noir Lang to integrate a simple yet effective privacy mechanism.

## Overview

**Gazometer** enables users to exchange value while preserving their privacy. This is achieved through Noir's unique features, which ensure that user identities remain confidential and balance changes between participants are recorded as state changes in the contract, rather than as direct Ether transfers. As a result, external observers cannot determine transaction amounts or participants.

While transactions are ideally relayed, for demonstration purposes, self-relaying is also supported. Please note that a relayer RPC server is not included in this repository.

---

## Project Structure

- **Frontend**  
- **Oracle RPC-server**
- **Circuits**
- **Contracts**

---

## How It Works

Users can deposit funds to become "shielded." They can then transfer funds privately to other participants or withdraw/transfer to standard Ethereum addresses (`0x...`). The protocol is primarily based on ECDSA, [Hydra](https://github.com/TaceoLabs/noir-hydra), and Noir ZK proofs.

### Shielded Transfers

Transfers between shielded addresses function like private invoices. Here’s a typical user flow:

#### Initialization

- **Alice** initializes her first deposit by computing a zk-proof using `self_service/main.nr`.
- She privately inputs her signature of a message representing her nonce. For simplicity, the nonce number is signed.
- Without Alice’s private key, her signature cannot be reconstructed. A commitment is created using `Keccak256(Sig("0"))` for nonce 0.
- This signature is used to derive a key for Hydra, which encrypts the balance commitment.
- Commitments and balance commitments are mapped together, and a nullifier is added to prevent reuse.
- **Disclaimer:** The initial deposit will leak information about the starting balance, but subsequent actions remain private unless the user acts carelessly.

Once the proof is ready, Alice calls the `Initialize()` payable function, transferring Ether. The verifier checks the proof, ensuring the amount matches `msg.value`. This step does not require a relayer.

#### Adding Balance, Withdrawing, or Transferring to Ethereum Addresses

- The same circuit can be used to deposit more funds or withdraw.
- Alice’s state is stored in the contract, and Ethereum storage proofs (using Merkle Patricia Tries) validate her values. This is implemented with [vLayer-monorepo](https://github.com/olehmisar/vlayer-monorepo/tree/main).
- Alice provides two signatures (for nonce N and N-1) as private inputs to reconstruct her latest and new commitments.
- The circuit verifies the previous commitment, decrypts the current balance, and creates a new commitment and encrypted balance for the new nonce.
- States are updated, the nonce is nullified, and the user can deposit or withdraw. Withdrawals can also be used to transfer to standard Ethereum addresses.

Each commitment and balance is unlinkable, and each balance uses a unique 256-bit key, making history reconstruction infeasible for attackers.

#### zkTransfers (Shielded-to-Shielded)

- Transfers between shielded users leverage Noir’s recursive proofs for maximum privacy.
- Alice generates a proof in `alice_receipt/main.nr`, declaring the transfer amount as a public input.
- After generating and verifying her zk-proof, Alice can generate a link for Bob in the Gazometer Dapp.
- Bob receives the proof, verifies Alice’s proof recursively, and generates his own proof.
- The final zk-proof contains both users’ commitments, balance commitments, and nullifiers.
- Alice does not reveal her past commitments or initial deposit address to Bob. From the outside, only state changes are visible; no Ether is directly transferred.

**Note:** The circuit always checks that the previous commitment exists and nullifies the nonce to prevent rewriting, creating a secure chain of state commitments.

---

## Compliance

The signed nonce mechanism allows users to reconstruct their entire transaction history using their signatures. A dedicated wallet could improve the user experience. This setup also facilitates future compliance features, such as Proof of Inclusion or Proof of Non-Inclusion. Integrating zkPassport could be a valuable future addition.

---

## The Dapp

Gazometer Dapp provides all the necessary tools for users to securely compute their proofs locally. Future updates will focus on improving the user experience.

---

## Folders

- `frontend/` – User interface and proof generation
- `oracle-rpc-server/` – Oracle server for storage proofs
- `circuits/` – Noir circuits for zk-proofs
- `contracts/` – Smart contracts for the protocol

---

## Developer Story & Technical Challenges

### First Steps with Noir

This project was both challenging and rewarding, especially as I started with no prior experience in Noir Lang. My initial focus was on implementing Ethereum storage proofs, which required extensive research and experimentation. The vLayer monorepo was initially overwhelming and outdated, but after some effort, I managed to get it working.

I experimented with circuit design and validation, gradually building up the `alice_receipt` circuit. Understanding Merkle Patricia Tries and their integration with Noir was particularly educational.

### Encryption Scheme

Selecting an appropriate encryption scheme was crucial. I discovered Hydra through the Awesome Noir repo, which was well-documented and up-to-date.

### Frontend Proving

Integrating the Noir oracle and handling foreign calls in the frontend was complex, especially due to type mismatches between the oracle RPC server and the frontend. After resolving these issues, I was able to proceed with implementing Bob’s part of the protocol.

### Recursion in Noir

Implementing recursive proofs in Noir was not straightforward, as the documentation was lacking. After researching community repositories and switching to the correct version of Noir_js, I successfully implemented recursion.

### Final Steps

Once confident, I created the `self_service` circuit for deposits and withdrawals. This was relatively straightforward after the previous work.

### Reflections

Solo development can be overwhelming, especially when working with interconnected monorepos and zk-proofs, where small mismatches can break the flow. Despite the challenges, the experience was both fun and educational, and I gained significant knowledge in the zk field.

---

## Future Upgrades

- **Compliance Layer:** A robust compliance layer is essential for this type of project. Future work will focus on improving UX and compliance features.
- **Optimization & Security:** As I am not a cryptographer, the project may contain suboptimal practices. Code and math quality must be reviewed to avoid vulnerabilities. Proving time and on-chain costs are also important for UX.
- **Contract Interactions:** A future goal is to enable direct interactions with other contracts via smart accounts tied to commitments, allowing users to interact with external protocols without withdrawing funds.
- **Dapp Improvements:** Enhancing the application’s UX/UI is a priority.

---

## Disclaimer

This project was built during NoirHack as an experimental demonstration. It is **not production-ready** and contains known vulnerabilities. Use at your own risk.

---

## Acknowledgements

- [Noir Lang](https://noir-lang.org/)
- [Hydra](https://github.com/TaceoLabs/noir-hydra)
- [vLayer-monorepo](https://github.com/olehmisar/vlayer-monorepo/tree/main)
- Noir and zk community resources

---

*Happy hacking!*