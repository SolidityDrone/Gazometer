# Gazometer

Gazometer is a privacy-first zk payment protocol that leverages Noir Lang to integrate a simple yet effective privacy mechanic.

## Overview

The technical goal of the project is to deliver a protocol that allows users to exchange value while preserving their privacy. Privacy is maintained thanks to Noir's unique features. User identities are kept safe, and balance changes between participants don't actually happen as Ether transfers, but rather as state changes in the contract. From the outside, no one is able to tell how much is being transferred or who is participating in the transaction.

Ideally, these transactions are supposed to be relayed, but can eventually be self-relayed for demonstration purposes. The relayer RPC-Server is not included in this repository.

**Recap:**
- Users exchange value privately.
- Privacy is enforced by Noir's features.
- No direct Ether transfers; only contract state changes.
- Transaction details and participants remain hidden.
- Relayer support is not included in this repo.

---

## Project Structure Overview

- Frontend
- Oracle RPC-server
- Circuits
- Contracts

---

## How it works

In Gazometer, users can deposit funds to become "shielded". They can either transfer privately between other participants, or withdraw/transfer to 0xAddresses. This protocol is mostly based on ECDSA, [Hydra](https://github.com/TaceoLabs/noir-hydra), and of course Noir ZK proofs.

Transfers between shielded addresses work as a private invoice, but before we get into this, let's see what a typical user would do on their own.

**Recap:**
- Users deposit to become shielded.
- Private transfers or withdrawals are possible.
- Based on ECDSA, Hydra, and Noir ZK proofs.
- Shielded transfers work like private invoices.

---

### Initialization

Alice needs to initialize her first deposit into the protocol. To do so, she needs to compute a zk proof using `self_service/main.nr`. In this circuit, Alice will privately input her signature of a message representing her nonce into the protocol. For simplicity, we just sign the nonce number.

Without Alice's private key, no one would be able to reconstruct her signature, so we use `Keccak256(Sig("0"))` to create a commit for nonce 0. Her `Sig(0)` is then used to derive a key for Hydra. This key is needed to encrypt the BalanceCommitment. The validity of the data will be guaranteed by the circuit, therefore Commit and BalanceCommit are tied together in a mapping (`bytes32 commit => bytes32 BalanceCommit`). Other than that, to avoid reusing, we will push a nullifier.

**DISCLAIMER:** Remember that the first transaction will, of course, leak information on the initial deposit. No other leak is likely to happen unless Alice makes careless actions.

Once the proof is ready for use, she will proceed to transfer Ether in the `Initialize()` payable function and the Verifier will check that the proof is correct, therefore the amount must match the `msg.value`. At this point, Alice has her nullified initial commit. This step doesn't require a relayer.

**Recap:**
- Alice creates a zk proof for her first deposit.
- Her signature of the nonce is used to create a commitment and encryption key.
- Commitments and balance commitments are mapped together.
- A nullifier prevents reuse.
- The first deposit leaks the initial amount, but subsequent actions remain private.
- No relayer is needed for initialization.

---

### Adding Balance, Withdrawing, or Transferring to 0xAddresses

The same circuit might be used to deposit additional balance or to withdraw. Since a state for Alice's first commitment and balance exists in the contract, we can leverage Ethereum storage proof with MPT (Merkle Patricia Tries) to validate their values. To do so, I worked with [vLayer-monorepo](https://github.com/olehmisar/vlayer-monorepo/tree/main).

Here's where the magic happens: This time, Alice will provide 2 signatures representing her current nonce (N) and previous (N-1). These are private inputs and serve to reconstruct her latest commitment and the new one she is about to create. Once we construct the `Sig(N-1)` hash commitment, we can get a verified storage value in the balanceCommit slot. Once we get this balanceCommit, we can use `Sig(N-1)` to deterministically derive her past encryption key and decrypt her current balance. Each balance commitment has, in fact, a different encryption key each time. Encryption scheme is to be updated tho, for the purpose of the hackaton I rooted for that one.

At this point, the circuit will calculate a valid commitment for N using `Sig(N)` as the source so we can derive a new key. Once we add or subtract the amount to her current balance, we are ready to re-encrypt the new balance commitment tied to N. Therefore, we are safe to update the states, nullify the nonce, and proceed to either deposit or withdraw. Withdrawal can also be used as a form of transfer towards 0xAddresses.

There shall be no link between each commit and balance since these are used privately on Alice's end. Therefore, no one should be able to reconstruct the signatures and figure out her commits. Moreover, decrypting her balance would require brute-forcing or a more direct attack, but would only leak information of a balance at a given nonce. Since each balance has its own 256-bit key, this disincentivizes history reconstruction. Something that is, conversely, very easy for Alice as everything is embedded in her key. We will get there in the "About compliance" section.

**Recap:**
- Alice can deposit more or withdraw using the same circuit.
- Ethereum storage proofs validate her state.
- Two signatures (N and N-1) are used to reconstruct and update commitments.
- Each balance uses a unique encryption key.
- No link between commits; balances are private.
- Only Alice can easily reconstruct her own history.

---

### zkTransfers

So we figured out the mechanic that is used to unlink Alice's operations from her initial deposit, but we haven't spoken about transfers between two "shielded" users. How does it work? Well, we can leverage Noir's unique recursive proofs to make the transfer as private as possible.

Think about it as a private invoice. Alice computes her proof in `alice_receipt/main.nr`. Alongside the private data she needs to prove her current state and validate her next commitment, she will declare an amount which ends up as a public input in the circuit.

Once her zkProof is generated and verified in Noir_JS, she will be able in the Gazometer Dapp to generate a link for Bob. She's supposed to communicate with Bob somehow, but rather than giving Bob an address or a handle, she will give him a valid proof for an intent to change state. Bob will receive the proof and compute the same steps on his behalf, with the addition of recursively proving that Alice's proof is valid. So Bob ends up with a zkProof that contains 2 Commits, 2 BalanceCommits, and their relative nullifiers.

What's important here is that Alice doesn't leak to Bob any information about her past commitment, nor her initial deposit address. On top of that, from the outside, the transfer happens as state changes, therefore protecting transfer amounts and direction. No Ether is effectively transferred. But now Alice and Bob have a new current nonce with coherent balance commitments.

**NOTE:** During proof computation, we always check that commitment N-1 exists in the first place when checking its value with MPT proof, and nullifying the nonce will prevent rewriting a commitment, effectively creating a chain of state commitments.

**Recap:**
- Transfers between shielded users use recursive proofs.
- Alice generates a proof and shares it with Bob.
- Bob verifies Alice's proof and creates his own.
- No information about past commitments or deposit addresses is leaked.
- Transfers are only state changes; no Ether is moved.
- Each transfer creates a new nonce and balance commitment.

---

## Compliance

Since we use this signed nonce mechanism, a user can reconstruct their entire history with just their signatures. A dedicated wallet would improve UX in that case. This wasn't the main focus of the project though.

This default setup makes it easier for future upgrades for compliance features such as PoI (Proof of Inclusion) or Proof of Non-Inclusion. As I'm writing, I figured out zkPassport could be a good addition to this project, but I don't have time anymore to keep on.

**Recap:**
- Users can reconstruct their own history with signatures.
- A dedicated wallet would improve UX.
- The setup allows for future compliance features.
- zkPassport could be integrated in the future.

---

## The Dapp

Gazometer Dapp comes with all the needed tools to let users securely compute their proof on their side. It will be extended further to support a better UX.

**Recap:**
- Dapp provides tools for local proof computation.
- Future updates will focus on UX improvements.

---

## Folders

- `frontend/` – User interface and proof generation
- `oracle-rpc-server/` – Oracle server for storage proofs
- `circuits/` – Noir circuits for zk-proofs
- `contracts/` – Smart contracts for the protocol

---

## Developer Story / Technical Difficulties

### First steps into Noir

This project for me has been challenging, but scary at the same time as I didn't know anything about Noir Lang, but became more confident as I was going. The first thing I tried to figure out was how to do Ethereum storage proof. I tried a few resources I gathered from Noir Discord / Awesome repo but at first it seemed impossible.

vLayer monorepo was discouraging as it felt overwhelming. It also wasn't up to date and contained a lot of errors both in circuits but moreover in the oracle RPC. So I hacked a while and got it to work.

I made some first attempt experiments to figure out how to write the circuit and validate its usage. Once done, I started to write the first lines and slowly managed to create `alice_receipt`. I had some trouble figuring out errors initially as figuring out how MPT really works wasn't as easy as I thought. Learned a lot about the structure of Ethereum though, very formative.

Another crucial point to the first circuit I was working on was figuring out which encryption scheme could work for my need. So I discovered Hydra in the awesome repo, didn't have problems in that case as the repository was recently updated and documented.

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

**Recap:**
### Compliance and UX are top priorities for future work.
Reconstructing history is tricky, cause you need to sign multiple nonces till you get a nonce that has got no related commit, therefore the head of your tx chain. This will need to be well thinkered to reflect a better UX
### Code optimization and security review are needed.
At current state of the circuits, there are multiple unconstrained functions, and multiple bad pratices probably that could be improved by a lot. Proving in the browser takes few minutes for me, this is due to the expensiveness of proving eth states, improving this is paramount. 

### Future plans include contract interactions and Dapp improvements.
As for now, i naively stored nonce in a db, just to make a more understandable demo visualization. This could be fine since nonce only dosent leak enough to figure out your informations, but is conceptually wrong

### Add a serious relayer solution
As for now the relayer is just an embedded wallet into the backend of the Gazometer App, didnt have time to fix this all by myself, but the relayer fee could be included in the circuit and payment dispatched upon proof verification. At the time of writing I must admit I had other priorities in order to timely submit the whole thing.

### Alice and Bob transaction order could be reversed
Alice should be able to also crete a receipt that express intent to pay, not just an invoice to receive. 
This is easily doable by just change the logic in the balance calculation. But havent got time to refactor and fix. Remember I did this compeltely as solo dev and first timer ^^, but i'm aware of it 
 
### Some bad thing i did

some feature isnt fully functioning such as recursion, in future i will work to fix what's not working properly and what i misunderstood, wont pretend this project is perfect. It needs a lot of work you should treat this as an experiment and PoC 
---

## Disclaimer

This project was built during NoirHack as an experimental demonstration.  
**It is not production-ready and contains known (and possibly unknown) vulnerabilities.**  
The code is provided "as is", without warranty of any kind, express or implied.  
**Use at your own risk.**  
The author(s) accept no responsibility or liability for any damages, losses, or other issues arising from the use, misuse, or inability to use this code, in whole or in part.

---

*Happy hacking!*
